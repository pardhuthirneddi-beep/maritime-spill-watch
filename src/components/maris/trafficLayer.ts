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
const SHOW_TRAIL_BELOW = 900_000; // trails only when close (perf + clarity)

/** Shared label offsets — lanes 0..7, then clamped (no per-frame alloc). */
const LABEL_OFFSETS = [
  new Cesium.Cartesian2(36, -16),
  new Cesium.Cartesian2(47, -16),
  new Cesium.Cartesian2(58, -16),
  new Cesium.Cartesian2(69, -16),
  new Cesium.Cartesian2(80, -16),
  new Cesium.Cartesian2(91, -16),
  new Cesium.Cartesian2(102, -16),
  new Cesium.Cartesian2(113, -16),
];
/** Shared label colors — indexed instead of fromCssColorString per frame. */
const LABEL_COLORS = [
  Cesium.Color.fromCssColorString("#22d3ee"), // selected
  Cesium.Color.fromCssColorString("#7da2b8"), // traffic
];
/** Shared trail materials — built once, never per frame. */
const trailMaterials: Cesium.Material[] = [];

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
    /** Cache keys — avoid re-uploading identical sprite textures. */
    symbolImageKey: string;
    bracketImageKey: string;
  }[];
  /** Last rendered lat/lon per vessel (trail dedup). */
  lastTrail: [number, number][];
}

let handles: TrafficHandles | null = null;

/** Billboard → MMSI map for click picking (billboards are primitives, not
 *  entities, so the host view needs this lookup). */
const pickMap = new Map<Cesium.Billboard, string>();

/** Resolve a scene.pick result to a simulated vessel MMSI (or null). */
export function trafficMmsiFromPick(picked: unknown): string | null {
  const p = picked as { primitive?: unknown } | undefined;
  if (!p?.primitive) return null;
  return pickMap.get(p.primitive as Cesium.Billboard) ?? null;
}

/** Lane offset counter per label cell (collision avoidance). */
const laneUse = new Map<number, number>();
/** Reusable trail position buffer + pre-allocated Cartesian vectors. */
const trailScratch: Cesium.Cartesian3[] = [];
const trailVecs: Cesium.Cartesian3[] = Array.from(
  { length: 8 },
  () => new Cesium.Cartesian3(),
);

/** Which MMSI is selected (external state, set by the host view). */
let selectedMmsi: string | null = null;
/** Whether the investigation candidate (rank-1 attribution) is marked. */
let candidateMmsi: string | null = null;
/** Last DEV debug-log sim timestamp (throttle). */
let debugLastMs: number | null = null;

export function setTrafficSelection(mmsi: string | null, candidate: string | null): void {
  selectedMmsi = mmsi;
  candidateMmsi = candidate;
}

function vesselState(mmsi: string): "SELECTED" | "CANDIDATE" | "NORMAL" {
  if (mmsi === selectedMmsi) return "SELECTED";
  if (mmsi === candidateMmsi) return "CANDIDATE";
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

  // One-time material construction for trails (selected / normal).
  if (trailMaterials.length === 0) {
    trailMaterials.push(
      Cesium.Material.fromType("Color", {
        color: Cesium.Color.fromCssColorString("#22d3ee").withAlpha(0.7),
      }),
      Cesium.Material.fromType("Color", {
        color: Cesium.Color.fromCssColorString("#7da2b8").withAlpha(0.28),
      }),
    );
  }

  const slots = fleet.map((v) => {
    const cls = classifyVessel(v.vesselType);
    const symImageKey = `${v.vesselType}:NORMAL`;
    return {
      symbolImageKey: symImageKey,
      bracketImageKey: "NORMAL",
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

  // Register the symbol billboards for picking (MMSI lookup).
  slots.forEach((slot, i) => pickMap.set(slot.symbol, fleet[i].mmsi));
}

/** Remove the traffic layer (viewer teardown). Always clears module state
 * so a later mount rebuilds cleanly — even when the owning viewer was
 * already destroyed (React cleanup order can destroy the viewer before
 * this runs; the primitives are then already gone with its context). */
export function destroyTrafficLayer(scene: Cesium.Scene): void {
  if (handles) {
    try {
      scene.primitives.remove(handles.symbols);
      scene.primitives.remove(handles.brackets);
      scene.primitives.remove(handles.labels);
      scene.primitives.remove(handles.trails);
    } catch (err) {
      // Owner context already torn down mid-frame — primitives are gone.
      console.warn("[MARIS] traffic layer teardown after viewer destroy:", err);
    }
  }
  handles = null;
  pickMap.clear();
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

  // DEV-only movement verification (§13): log one vessel's clock/position
  // every ~5 s so AIS progression (T0→T1, A→B→C) is observable in the
  // console. Stripped from production builds.
  if (import.meta.env.DEV && fleet.length > 5) {
    const dbg = fleet[5];
    if (simMs - (debugLastMs ?? simMs) >= 5000 || debugLastMs === null) {
      debugLastMs = simMs;
      const dp = positionAt(dbg, simMs, epochMs);
      // eslint-disable-next-line no-console
      console.log(
        `[MARIS AIS] sim=${new Date(simMs).toISOString()} mmsi=${dbg.mmsi} ` +
          `lat=${dp.lat.toFixed(5)} lon=${dp.lon.toFixed(5)} hdg=${dp.headingDeg.toFixed(1)}`,
      );
    }
  }
  const camera = scene.camera;
  const camPosCarto = camera.positionCartographic;
  const camLat = Cesium.Math.toDegrees(camPosCarto.latitude);
  const camLon = Cesium.Math.toDegrees(camPosCarto.longitude);

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
    const state = sel ? "SELECTED" : cand ? "CANDIDATE" : "NORMAL";

    // ── SYMBOL ──────────────────────────────────────────────────────
    slot.symbol.show = true;
    toCartesian(p.lat, p.lon, 80, scratchPos);
    // FRESH instance every assignment — cloning INTO the existing position
    // mutates it in place, so Cesium's dirty check (reference compare) never
    // fires and the billboard's GPU position never updates (frozen symbol).
    slot.symbol.position = Cesium.Cartesian3.clone(scratchPos);
    slot.symbol.rotation = Cesium.Math.toRadians(-p.headingDeg);
    slot.symbol.scale = sel ? 0.44 : 0.3;
    // Only touch billboard.image when the sprite actually changes — Cesium
    // re-uploads the texture otherwise (expensive at 536 vessels/frame).
    const desiredImage = `${v.vesselType}:${state}`;
    if (slot.symbolImageKey !== desiredImage) {
      slot.symbolImageKey = desiredImage;
      slot.symbol.image = getVesselSymbol(
        classifyVessel(v.vesselType),
        state,
      ) as unknown as string;
    }

    // ── BRACKETS ────────────────────────────────────────────────────
    const showBracket = range < SHOW_BRACKET_BELOW;
    slot.bracket.show = showBracket;
    if (showBracket) {
      // Distinct instance — sharing the symbol's reference means neither
      // billboard would dirty correctly on the next frame's assignment.
      slot.bracket.position = Cesium.Cartesian3.clone(slot.symbol.position);
      const desiredBracket = state;
      if (slot.bracketImageKey !== desiredBracket) {
        slot.bracketImageKey = desiredBracket;
        slot.bracket.image = getBracketSprite(state) as unknown as string;
      }
      slot.bracket.scale = bracketScale(state) * (sel ? 0.9 : 0.75);
    }

    // ── MMSI LABEL (collision-avoided lane) ────────────────────────
    const showLabel = range < SHOW_LABEL_BELOW;
    slot.label.show = showLabel;
    if (showLabel) {
      // Distinct instance — see symbol note above.
      slot.label.position = Cesium.Cartesian3.clone(slot.symbol.position);
      // Numeric cell key (no string allocation per vessel per frame).
      const cell =
        Math.round(p.lat * LABEL_CELL) * 4096 +
        Math.round(p.lon * LABEL_CELL);
      const lane = laneUse.get(cell) ?? 0;
      laneUse.set(cell, lane + 1);
      // Shared offset objects — no per-frame Cartesian2 allocation.
      const off = LABEL_OFFSETS[Math.min(lane, LABEL_OFFSETS.length - 1)];
      slot.label.pixelOffset = off;
      slot.label.fillColor = LABEL_COLORS[sel ? 0 : 1];
    }

    // ── RECENT TRAIL (limited window, near-camera only) ────────────
    const showTrail = range < SHOW_TRAIL_BELOW;
    slot.trail.show = showTrail;
    if (showTrail) {
      trailScratch.length = 0;
      for (let s = TRAIL_STEPS; s >= 0; s--) {
        const t = simMs - s * (TRAIL_LENGTH_MS / TRAIL_STEPS);
        const tp = positionAt(v, t, epochMs);
        // Fresh Cartesian3 per point — reused vectors would alias points
        // across the array and across vessels (all trails would collapse).
        trailScratch.push(Cesium.Cartesian3.clone(toCartesian(tp.lat, tp.lon, 40, trailVecs[s])));
      }
      slot.trail.positions = trailScratch.slice();
      slot.trail.width = sel ? 1.8 : 0.8;
      // Shared materials — never Material.fromType per frame.
      slot.trail.material = trailMaterials[sel ? 1 : 0];
    }
  }
}
