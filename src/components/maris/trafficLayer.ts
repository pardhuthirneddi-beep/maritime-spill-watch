// MARIS — batched 3D traffic layer for the DEMO AIS simulation.
//
// Renders the simulated fleet through Cesium's batched primitive
// collections (one BillboardCollection each for symbols/brackets/labels,
// one PolylineCollection for trails). Per-frame work is O(visible vessels):
// pooled primitives are repositioned — never destroyed/recreated — so the
// scene stays smooth with hundreds of vessels.
//
// The layer consumes normalized vessel state (SimVessel + positionAt) and
// is deliberately decoupled from the demo provider: a future live AIS
// provider can feed the same render path without touching symbols,
// brackets, MMSI labels, selection or trails.

import * as Cesium from "cesium";
import {
  getFleet,
  positionAt,
  trailPoints,
  type SimVessel,
} from "@/components/maris/trafficSim";
import {
  classifyVessel,
  getVesselSymbol,
  resolveHeadingDeg,
} from "@/components/maris/vesselSymbols";
import {
  bracketScale,
  getBracketSprite,
} from "@/components/maris/trackingOverlays";

// ─── LOD WINDOWS (meters, camera-to-vessel distance) ─────────────────

const SHOW_SYMBOL_BELOW = Number.POSITIVE_INFINITY; // symbols: always (cheap)
const SHOW_BRACKET_BELOW = 6_000_000; // brackets fade beyond regional view
const SHOW_LABEL_BELOW = 1_200_000; // MMSI: regional + close
const TRAIL_LENGTH_MS = 20 * 60_000; // recent-path window
const TRAIL_STEPS = 6;

const LABEL_CELL = 14; // collision-avoidance tile size (1/14° cells)

interface TrafficHandles {
  symbols: Cesium.BillboardCollection;
  brackets: Cesium.BillboardCollection;
  labels: Cesium.LabelCollection;
  trails: Cesium.PolylineCollection;
  /** Per-fleet-vessel primitive slots. */
  slots: {
    symbol: Cesium.Billboard;
    bracket: Cesium.Billboard;
    label: Cesium.Label;
    trail: Cesium.Polyline;
  }[];
  /** Last rendered lat/lon per vessel (trail dedup). */
  lastTrail: [number, number][];
}

let handles: TrafficHandles | null = null;

/** Lane offset counter per label cell (collision avoidance). */
const laneUse = new Map<string, number>();

/** Which MMSI is selected (external state, set by the host view). */
let selectedMmsi: string | null = null;
/** Whether the investigation candidate (rank-1 attribution) is marked. */
let candidateMmsi: string | null = null;

export function setTrafficSelection(mmsi: string | null, candidate: string | null): void {
  selectedMmsi = mmsi;
  candidateMmsi = candidate;
}

function symbolState(v: SimVessel): "SELECTED" | "CANDIDATE" | "NORMAL" {
  if (v.mmsi === selectedMmsi) return "SELECTED";
  if (v.mmsi === candidateMmsi) return "CANDIDATE";
  return "NORMAL";
}

/**
 * Create the traffic layer's primitive pools and fleet slots.
 * Call once after viewer creation. Idempotent.
 */
export function createTrafficLayer(scene: Cesium.Scene): void {
  if (handles) return;
  const fleet = getFleet();

  // Translucent blending: sprite alphas (state tints, label backdrops)
  // must blend — opaque would render everything at full brightness.
  const symbols = new Cesium.BillboardCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT });
  const brackets = new Cesium.BillboardCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT });
  const labels = new Cesium.LabelCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT });
  const trails = new Cesium.PolylineCollection();

  scene.primitives.add(symbols);
  scene.primitives.add(brackets);
  scene.primitives.add(labels);
  scene.primitives.add(trails);

  const slots = fleet.map((v) => {
    const cls = classifyVessel(v.vesselType);
    return {
      symbol: symbols.add({
        image: getVesselSymbol(cls, "NORMAL"),
        scale: 0.3,
        alignedAxis: Cesium.Cartesian3.UNIT_Z,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        position: Cesium.Cartesian3.ZERO,
        show: false,
      }),
      bracket: brackets.add({
        image: getBracketSprite("NORMAL"),
        scale: bracketScale("NORMAL") * 0.75,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        position: Cesium.Cartesian3.ZERO,
        show: false,
      }),
      label: labels.add({
        text: `MMSI ${v.mmsi}`,
        font: "600 9px 'JetBrains Mono', monospace",
        fillColor: Cesium.Color.fromCssColorString("#7da2b8"),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#050a12").withAlpha(0.72),
        backgroundPadding: new Cesium.Cartesian2(5, 2),
        pixelOffset: new Cesium.Cartesian2(34, -14),
        position: Cesium.Cartesian3.ZERO,
        show: false,
      }),
      trail: trails.add({
        positions: [Cesium.Cartesian3.ZERO, Cesium.Cartesian3.ZERO],
        width: 1,
        show: false,
      }),
    };
  });

  handles = {
    symbols,
    brackets,
    labels,
    trails,
    slots,
    lastTrail: fleet.map(() => [0, 0]),
  };
}

/** Remove the traffic layer (viewer teardown). */
export function destroyTrafficLayer(scene: Cesium.Scene): void {
  if (!handles) return;
  scene.primitives.remove(handles.symbols);
  scene.primitives.remove(handles.brackets);
  scene.primitives.remove(handles.labels);
  scene.primitives.remove(handles.trails);
  handles = null;
}

const scratchCarto = new Cesium.Cartographic();
const scratchPos = new Cesium.Cartesian3();

function toCartesian(lat: number, lon: number, height: number, out: Cesium.Cartesian3): Cesium.Cartesian3 {
  scratchCarto.longitude = Cesium.Math.toRadians(lon);
  scratchCarto.latitude = Cesium.Math.toRadians(lat);
  scratchCarto.height = height;
  return Cesium.Ellipsoid.WGS84.cartographicToCartesian(scratchCarto, out);
}

/**
 * Per-frame update: reposition all pooled primitives from the sim clock.
 * O(fleet) with tiny constants — safe at 60 fps for hundreds of vessels.
 * Vessel positions are analytic functions of simMs, so movement is smooth
 * with zero teleporting; trails are sampled from the same clock.
 */
export function updateTrafficLayer(
  scene: Cesium.Scene,
  simMs: number,
  epochMs: number,
): void {
  if (!handles) return;
  const fleet = getFleet();
  const camera = scene.camera;
  const camPosCarto = camera.positionCartographic;
  const camLat = Cesium.Math.toDegrees(camPosCarto.latitude);
  const camLon = Cesium.Math.toDegrees(camPosCarto.longitude);
  const camHeight = camPosCarto.height;

  // Rough camera-to-vessel range without sqrt-heavy math: chord via lat/lon.
  const rangeCache = new Map<string, number>();

  // Deterministic label lanes are rebuilt each frame from the same data.
  laneUse.clear();

  for (let i = 0; i < fleet.length; i++) {
    const v = fleet[i];
    const slot = handles.slots[i];
    const p = positionAt(v, simMs, epochMs);

    // LOD: approximate ground range from camera (equirectangular — plenty
    // accurate for visibility gates).
    const dLat = (p.lat - camLat) * 111_320;
    const dLon =
      (p.lon - camLon) * 111_320 * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
    const range = Math.sqrt(dLat * dLat + dLon * dLon);

    const sel = v.mmsi === selectedMmsi;
    const cand = v.mmsi === candidateMmsi;
    const accent = sel ? "#22d3ee" : cand ? "#a78bfa" : "#7da2b8";

    // ── SYMBOL ──────────────────────────────────────────────────────
    const showSymbol = range < SHOW_SYMBOL_BELOW;
    slot.symbol.show = showSymbol;
    if (showSymbol) {
      toCartesian(p.lat, p.lon, 80, scratchPos);
      slot.symbol.position = Cesium.Cartesian3.clone(scratchPos, slot.symbol.position);
      const headingDeg = resolveHeadingDeg(p.headingDeg, undefined);
      slot.symbol.rotation = Cesium.Math.toRadians(-headingDeg);
      slot.symbol.scale = sel ? 0.44 : 0.3;
      slot.symbol.image = getVesselSymbol(
        classifyVessel(v.vesselType),
        symbolState(v),
      ) as unknown as string;
    }

    // ── BRACKETS ────────────────────────────────────────────────────
    const state = symbolState(v);
    const showBracket = range < SHOW_BRACKET_BELOW;
    slot.bracket.show = showBracket;
    if (showBracket) {
      slot.bracket.position = Cesium.Cartesian3.clone(scratchPos, slot.bracket.position);
      slot.bracket.image = getBracketSprite(state) as unknown as string;
      slot.bracket.scale = bracketScale(state) * (sel ? 0.9 : 0.75);
    }

    // ── MMSI LABEL (collision-avoided lane) ────────────────────────
    const showLabel = range < SHOW_LABEL_BELOW;
    slot.label.show = showLabel;
    if (showLabel) {
      slot.label.position = Cesium.Cartesian3.clone(scratchPos, slot.label.position);
      const cell = `${Math.round(p.lat * LABEL_CELL)}:${Math.round(p.lon * LABEL_CELL)}`;
      const lane = laneUse.get(cell) ?? 0;
      laneUse.set(cell, lane + 1);
      slot.label.pixelOffset = new Cesium.Cartesian2(36 + lane * 11, -16);
      slot.label.fillColor = Cesium.Color.fromCssColorString(accent);
    }

    // ── RECENT TRAIL (limited window, deduped when static) ─────────
    const showTrail = showSymbol; // trails ride the symbol LOD gate
    slot.trail.show = showTrail;
    if (showTrail) {
      const pts = trailPoints(v, simMs, epochMs, TRAIL_LENGTH_MS, TRAIL_STEPS);
      const positions: Cesium.Cartesian3[] = [];
      for (const [lat, lon] of pts) {
        positions.push(
          toCartesian(lat, lon, 40, new Cesium.Cartesian3()),
        );
      }
      slot.trail.positions = positions;
      slot.trail.width = sel ? 1.8 : 0.8;
      const mat = Cesium.Color.fromCssColorString(accent);
      slot.trail.material = Cesium.Material.fromType("Color", {
        color: sel ? mat.withAlpha(0.7) : mat.withAlpha(0.28),
      });
    }
  }

  // Keep the camera reference alive for potential future spatial queries.
  void rangeCache;
}
