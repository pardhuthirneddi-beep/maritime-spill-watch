// MARIS — 3D Intelligence view (CesiumJS)
// A spatial investigation environment built on the same shared demo data as
// SAR + 2D map. Adapted from the God's Eye View architecture (Cesium globe,
// entity visualization, click-to-focus camera, layer management) but purpose-
// built for oil-spill source attribution.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Droplets,
  Layers3,
  Loader2,
  LocateFixed,
  MapPin,
  Pause,
  Play,
  Radar,
  RotateCcw,
  Route,
  Satellite,
  Scan,
  Ship,
  Target,
  Waves,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AisVessel,
  EnvironmentalConditions,
  OilDriftResult,
  OilSpillIncident,
  VesselAttribution,
} from "@/data/types";
import type {
  Globe3dLayer,
  Globe3dLayerId,
  SceneSelection,
} from "@/data/globe3dTypes";
import {
  EVIDENCE_EVENTS,
  INVESTIGATION_AREA_CENTER,
  buildReplayFrame,
  computeCorrelation,
  investigationAreaPolygon,
  replayEndMs,
  replayStartMs,
} from "@/data/temporalReplay";

// ─── CESIUM SETUP ────────────────────────────────────────────────────
// Static assets (Workers/Assets/Widgets) are copied into the served build by
// vite-plugin-static-copy (see vite.config.ts) — served locally from /cesium/.
// No ion token: we use Esri World Imagery via a public ArcGIS REST endpoint
// plus analytic terrain — zero paid APIs required.

import * as Cesium from "cesium";
import "cesium/Source/Widgets/widgets.css";
import { createMarisImageryProvider } from "@/components/maris/globeImageryFallback";
import { disposeStarfield, installStarfield } from "@/components/maris/starfield";
import {
  classifyVessel,
  getVesselSymbol,
  resolveHeadingDeg,
  type VesselSymbolState,
} from "@/components/maris/vesselSymbols";
import {
  bracketScale,
  buildContactLabel,
  getBracketSprite,
} from "@/components/maris/trackingOverlays";
import {
  createTrafficLayer,
  destroyTrafficLayer,
  setTrafficSelection,
  updateTrafficLayer,
} from "@/components/maris/trafficLayer";
import { EPOCH_MS, getFleet, positionAt, prepareFleet } from "@/components/maris/trafficSim";
import { trafficMmsiFromPick } from "@/components/maris/trafficLayer";

if (!("cesiumBaseUrlSet" in window)) {
  (window as unknown as Record<string, unknown>).cesiumBaseUrlSet = true;
  (window as unknown as Record<string, unknown>).CESIUM_BASE_URL = "/cesium/";
}
Cesium.Ion.defaultAccessToken = "";

// ─── STYLING CONSTANTS ───────────────────────────────────────────────

const COLOR_BG = Cesium.Color.fromCssColorString("#050a12");
const COLOR_SPILL = Cesium.Color.fromCssColorString("#fb923c");
const COLOR_CORRIDOR = Cesium.Color.fromCssColorString("#a78bfa").withAlpha(0.8);
const COLOR_VESSEL_SEL = Cesium.Color.fromCssColorString("#22d3ee");
const COLOR_TRACK = Cesium.Color.fromCssColorString("#60a5fa").withAlpha(0.55);
const COLOR_TRACK_SEL = Cesium.Color.fromCssColorString("#22d3ee");
const COLOR_SAR = Cesium.Color.fromCssColorString("#e2e8f0").withAlpha(0.22);

// ─── WORKSTATION CHROME ──────────────────────────────────────────────
// Shared panel treatment: hairline border, near-opaque dark surface, subtle
// elevation. Keeps UI restrained so the Earth stays the hero.

const PANEL =
  "rounded-md border border-white/10 bg-[#070d16]/90 shadow-lg shadow-black/40 backdrop-blur-sm";
const PANEL_HEADER =
  "flex items-center gap-2 border-b border-white/10 px-3 py-2";
const PANEL_TITLE =
  "text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-400";
const SECTION_LABEL =
  "text-[8px] font-semibold uppercase tracking-[0.18em] text-zinc-500";

/** Layer instrument definitions — icon + accent per intelligence layer. */
const LAYER_DEFS: {
  id: Globe3dLayerId;
  label: string;
  icon: typeof Ship;
  accent: string;
}[] = [
  { id: "globe_traffic", label: "Demo AIS Traffic", icon: Radar, accent: "text-sky-300" },
  { id: "globe_vessels", label: "Vessels", icon: Ship, accent: "text-sky-300" },
  { id: "globe_tracks", label: "Vessel Tracks", icon: Route, accent: "text-sky-300/70" },
  { id: "globe_spill", label: "Oil Spill", icon: Droplets, accent: "text-orange-400" },
  { id: "globe_satellite", label: "SAR Swath", icon: Satellite, accent: "text-slate-300" },
  { id: "globe_boundaries", label: "Investigation Area", icon: Scan, accent: "text-sky-300/70" },
  { id: "globe_grid", label: "Evidence Markers", icon: MapPin, accent: "text-amber-300" },
  { id: "globe_detection_zones", label: "Drift Forecast", icon: Waves, accent: "text-orange-300/80" },
  { id: "globe_correlation", label: "Source Connection", icon: Waypoints, accent: "text-violet-300" },
];

/** Evidence category → accent (marker, label and timeline tick share it). */
const EVENT_COLOR: Record<string, string> = {
  vessel: "#fbbf24",
  detection: "#7dd3fc",
  analysis: "#a78bfa",
};

const SPEEDS = [1, 3, 10] as const;

// ─── TYPES ───────────────────────────────────────────────────────────

interface Globe3DViewProps {
  incident: OilSpillIncident | null;
  vessels: AisVessel[];
  attributions: VesselAttribution[];
  driftResult: OilDriftResult | null;
  environmental: EnvironmentalConditions;
  layers: Globe3dLayer[];
  onLayerToggle: (id: string) => void;
  selectedVesselMmsi: string | null;
  onVesselSelect: (mmsi: string | null) => void;
  onBackTo2d: () => void;
}

/** Tag an entity so the click handler can identify what was picked. */
function tagEntity(
  entity: Cesium.Entity,
  kind: "spill" | "vessel" | "event",
  id: string,
) {
  (entity as unknown as { marisKind: string; marisId: string }).marisKind = kind;
  (entity as unknown as { marisKind: string; marisId: string }).marisId = id;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────

export default function Globe3DView({
  incident,
  vessels,
  attributions,
  driftResult,
  layers,
  onLayerToggle,
  selectedVesselMmsi,
  onVesselSelect,
  onBackTo2d,
}: Globe3DViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  // Persistent data sources so each effect can rebuild its own entities
  // without wiping entities owned by other effects.
  const staticDsRef = useRef<Cesium.CustomDataSource | null>(null);
  const dynamicDsRef = useRef<Cesium.CustomDataSource | null>(null);
  const areaDsRef = useRef<Cesium.CustomDataSource | null>(null);
  const onSelectRef = useRef(onVesselSelect);
  onSelectRef.current = onVesselSelect;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SceneSelection>(null);
  const [replayMs, setReplayMs] = useState<number | null>(null);
  // Replay running state — the clock itself always runs (traffic must keep
  // moving); `playing` only marks whether the replay playhead is advancing
  // through the evidence window for the timeline UI.
  const [playing, setPlaying] = useState(false);
  const [replayState, setReplayState] = useState<number | null>(null);
  // Centralized simulation clock: 1× = real-time (1 sim-ms per real-ms).
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  // Clock UI mirror (5 Hz flush from the rAF loop below); null until the
  // first flush — resolved to the replay-window end for initial render.
  const [simMsState, setSimMs] = useState<number | null>(null);


  const startMs = useMemo(() => replayStartMs(vessels), [vessels]);
  const endMs = useMemo(() => replayEndMs(vessels), [vessels]);
  const simMs = simMsState ?? endMs;
  // Evidence replay frame: the frame follows the live clock, so evidence
  // appears per its timestamps as the replay progresses.
  const frame = useMemo(
    () => buildReplayFrame(vessels, EVIDENCE_EVENTS, simMs),
    [vessels, simMs],
  );

  const isLayerOn = useCallback(
    (id: string) => layers.find((l) => l.id === id)?.enabled ?? false,
    [layers],
  );

  // ── VIEWER INIT (once) ─────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewerRef.current) return;

    // Hidden sink for Cesium's credit/attribution DOM — keeps it out of
    // the visible globe UI (attribution still preserved offscreen).
    const creditSink = document.createElement("div");
    creditSink.style.display = "none";
    container.appendChild(creditSink);

    let viewer: Cesium.Viewer;
    try {
      viewer = new Cesium.Viewer(container, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        requestRenderMode: false,
        creditContainer: creditSink,
        baseLayer: Cesium.ImageryLayer.fromProviderAsync(
          Cesium.TileMapServiceImageryProvider.fromUrl(
            Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
          ),
        ),
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      });

      // Esri satellite imagery replaces the default NaturalEarth fallback.
      // Wrapped with the ocean-aware fallback so close-zoom over open water
      // synthesizes real ancestor tiles instead of Esri's "Map data not
      // available" placeholder (see globeImageryFallback.ts).
      viewer.imageryLayers.addImageryProvider(createMarisImageryProvider());

      // Scene character: elevated oblique look, no atmosphere bloom.
      viewer.scene.globe.enableLighting = false;
      // Deep-space environment: Cesium's bundled Tycho star catalog cubemap
      // (real astronomical data, served locally from /cesium/) plus a
      // deterministic procedural point starfield at ~2× Moon distance.
      // Earth and all intelligence layers render in front naturally.
      viewer.scene.skyBox = new Cesium.SkyBox({
        sources: {
          positiveX: Cesium.buildModuleUrl("Assets/Textures/SkyBox/tycho2t3_80_px.jpg"),
          negativeX: Cesium.buildModuleUrl("Assets/Textures/SkyBox/tycho2t3_80_mx.jpg"),
          positiveY: Cesium.buildModuleUrl("Assets/Textures/SkyBox/tycho2t3_80_py.jpg"),
          negativeY: Cesium.buildModuleUrl("Assets/Textures/SkyBox/tycho2t3_80_my.jpg"),
          positiveZ: Cesium.buildModuleUrl("Assets/Textures/SkyBox/tycho2t3_80_pz.jpg"),
          negativeZ: Cesium.buildModuleUrl("Assets/Textures/SkyBox/tycho2t3_80_mz.jpg"),
        },
        show: true,
      });
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
      viewer.scene.backgroundColor = COLOR_BG;
      installStarfield(viewer.scene);
      viewer.scene.screenSpaceCameraController.enableTilt = true;
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 400;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 25_000_000;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cesium failed to initialise");
      return;
    }

    viewerRef.current = viewer;

    // Deliberate z-order (bottom → top): area → drift → tracks → spill →
    // evidence → vessels/selection. Each effect owns exactly one source so
    // rebuilds never disturb siblings.
    const dsDefs = [
      "maris-area",
      "maris-drift",
      "maris-tracks",
      "maris-spill",
      "maris-evidence",
      "maris-dynamic",
    ] as const;
    const created: Cesium.CustomDataSource[] = [];
    for (const name of dsDefs) {
      const ds = new Cesium.CustomDataSource(name);
      viewer.dataSources.add(ds);
      created.push(ds);
    }
    staticDsRef.current = created[3]; // spill
    areaDsRef.current = created[0]; // area + drift (beneath spill)
    dynamicDsRef.current = created[5];

    // Click picking
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(movement.position);

      // Demo-AIS traffic billboards are primitives — resolve via pick map.
      const trafficMmsi = trafficMmsiFromPick(picked);
      if (trafficMmsi) {
        setSelection({ kind: "vessel", mmsi: trafficMmsi });
        onSelectRef.current(trafficMmsi);
        return;
      }

      if (Cesium.defined(picked) && picked.id instanceof Cesium.Entity) {
        const entity = picked.id as Cesium.Entity & { marisKind?: string; marisId?: string };
        if (entity.marisKind === "vessel") {
          setSelection({ kind: "vessel", mmsi: entity.marisId! });
          onSelectRef.current(entity.marisId!);
        } else if (entity.marisKind === "spill") {
          setSelection({ kind: "spill" });
        } else if (entity.marisKind === "event") {
          setSelection({ kind: "event", eventId: entity.marisId! });
        } else {
          setSelection(null);
          onSelectRef.current(null);
        }
      } else {
        setSelection(null);
        onSelectRef.current(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    setReady(true);

    return () => {
      handler.destroy();
      disposeStarfield(viewer.scene);
      viewer.destroy();
      viewerRef.current = null;
      staticDsRef.current = null;
      dynamicDsRef.current = null;
      areaDsRef.current = null;
      setReady(false);
    };
  }, []);

  // ── INITIAL CAMERA + FOCUS INVESTIGATION ──────────────────────────
  const focusInvestigation = useCallback(
    (duration = 1.6) => {
      const viewer = viewerRef.current;
      if (!viewer || !incident) return;

      const areaPositions = investigationAreaPolygon().map(
        ([lat, lon]) => Cesium.Cartesian3.fromDegrees(lon, lat),
      );
      const bb = Cesium.BoundingSphere.fromPoints(areaPositions);
      viewer.camera.flyToBoundingSphere(bb, {
        duration,
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(-30),
          Cesium.Math.toRadians(-32),
          bb.radius * 3.4,
        ),
      });
    },
    [incident],
  );

  useEffect(() => {
    if (ready && incident) focusInvestigation(2.4);
  }, [ready, incident, focusInvestigation]);

  // ── STATIC SCENE A: INVESTIGATION AREA + DRIFT ZONES (restrained) ──
  // Rendered beneath the spill: thin boundary, low-opacity fill. Must never
  // dominate the geographic context.
  useEffect(() => {
    const ds = areaDsRef.current;
    if (!ds || !incident || !ready) return;
    ds.entities.removeAll();

    if (isLayerOn("globe_boundaries")) {
      ds.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            investigationAreaPolygon().map(([lat, lon]) =>
              Cesium.Cartesian3.fromDegrees(lon, lat),
            ),
          ),
          // Restrained geospatial boundary: barely-there fill, crisp edge.
          material: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.03),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.45),
          outlineWidth: 1,
          height: 0,
        },
      });
      // Corner-free center tick — subtle, not a label.
      const [acLat, acLon] = INVESTIGATION_AREA_CENTER;
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(acLon, acLat, 10),
        point: {
          pixelSize: 3,
          color: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.5),
          outlineColor: Cesium.Color.TRANSPARENT,
          disableDepthTestDistance: 0,
        },
      });
    }

    if (isLayerOn("globe_detection_zones") && driftResult) {
      for (const p of driftResult.forward) {
        ds.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
              p.polygon.map(([lat, lon]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
            ),
            material: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.03),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.3),
            outlineWidth: 1,
            height: 0,
          },
        });
      }
      for (const p of driftResult.backtrack) {
        ds.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
              p.polygon.map(([lat, lon]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
            ),
            material: Cesium.Color.fromCssColorString("#a78bfa").withAlpha(0.03),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString("#a78bfa").withAlpha(0.3),
            outlineWidth: 1,
            height: 0,
          },
        });
      }
    }
  }, [ready, incident, driftResult, layers, isLayerOn]);

  // ── STATIC SCENE B: SPILL + SAR SWATH (hero intelligence layer) ────
  useEffect(() => {
    const ds = staticDsRef.current;
    if (!ds || !incident || !ready) return;
    ds.entities.removeAll();

    // Primary slick polygon — irregular geometry from the shared SAR data.
    if (isLayerOn("globe_spill")) {
      const slick = ds.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            incident.polygon.coordinates.map(([lat, lon]) =>
              Cesium.Cartesian3.fromDegrees(lon, lat),
            ),
          ),
          // Possible slick: subtle fill + thin boundary, flat on the surface.
          material: Cesium.Color.fromCssColorString("#ea580c").withAlpha(0.14),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#fb923c").withAlpha(0.85),
          outlineWidth: 1.2,
          height: 0,
        },
        position: Cesium.Cartesian3.fromDegrees(
          incident.polygon.center[1],
          incident.polygon.center[0],
          200,
        ),
        label: {
          text: `OS-${incident.incidentNumber} · CONF ${incident.confidence.score}%`,
          font: "10px 'JetBrains Mono', monospace",
          fillColor: Cesium.Color.fromCssColorString("#fdba74"),
          showBackground: true,
          backgroundColor: COLOR_BG.withAlpha(0.88),
          backgroundPadding: new Cesium.Cartesian2(6, 3),
          pixelOffset: new Cesium.Cartesian2(0, -22),
          style: Cesium.LabelStyle.FILL,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4_000_000),
        },
      });
      tagEntity(slick, "spill", incident.id);

      // Intensity core — thickness variation, tiered by zoom so the scene
      // reads as a slick (not a blob) at overview distance.
      const [cx, cy] = incident.polygon.center;
      const zones: { rKm: number; color: Cesium.Color; maxDist: number }[] = [
        { rKm: 0.55, color: Cesium.Color.fromCssColorString("#7c2d12").withAlpha(0.5), maxDist: 1_200_000 },
        { rKm: 1.3, color: Cesium.Color.fromCssColorString("#9a3412").withAlpha(0.3), maxDist: 2_500_000 },
        { rKm: 2.4, color: Cesium.Color.fromCssColorString("#c2410c").withAlpha(0.16), maxDist: 5_000_000 },
      ];
      for (const z of zones) {
        const pts: Cesium.Cartesian3[] = [];
        for (let i = 0; i < 40; i++) {
          const brg = (i / 40) * Math.PI * 2;
          const jitter = 1 + 0.25 * Math.sin(brg * 3 + cx) * Math.cos(brg * 2 - cy);
          const lat = cx + ((z.rKm * jitter) / 111) * Math.cos(brg);
          const lon =
            cy +
            ((z.rKm * jitter) / (111 * Math.cos((cx * Math.PI) / 180))) * Math.sin(brg);
          pts.push(Cesium.Cartesian3.fromDegrees(lon, lat));
        }
        ds.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(pts),
            material: z.color,
            outline: false,
            height: 2,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, z.maxDist),
          },
        });
      }
    }

    if (isLayerOn("globe_satellite") && incident.detectionMode === "sar") {
      // SAR footprint — elongated strip through the scene (descending pass).
      const swath: [number, number][] = [
        [12.25, 87.12],
        [12.1, 87.06],
        [11.9, 86.88],
        [11.85, 86.78],
        [11.9, 86.75],
        [12.1, 86.85],
        [12.28, 87.05],
        [12.25, 87.12],
      ];
      ds.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            swath.map(([lat, lon]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
          ),
          material: COLOR_SAR,
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#e2e8f0").withAlpha(0.5),
          outlineWidth: 1,
          height: 0,
        },
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(87.12, 12.25, 693_000),
            Cesium.Cartesian3.fromDegrees(86.78, 11.85, 693_000),
          ],
          width: 1,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString("#e2e8f0").withAlpha(0.5),
          }),
        },
      });
    }

  }, [ready, incident, layers, isLayerOn]);

  // ── DYNAMIC SCENE: TRACKS + VESSELS + CORRELATION + EVIDENCE ──────
  useEffect(() => {
    const ds = dynamicDsRef.current;
    if (!ds || !incident || !ready) return;
    ds.entities.removeAll();

    if (isLayerOn("globe_tracks")) {
      for (const v of vessels) {
        const sel = selectedVesselMmsi === v.mmsi;
        const positions = v.trajectory.map(([lat, lon]) =>
          Cesium.Cartesian3.fromDegrees(lon, lat),
        );
        ds.entities.add({
          polyline: {
            positions,
            width: sel ? 2.4 : 1.1,
            material: sel
              ? COLOR_TRACK_SEL
              : new Cesium.PolylineDashMaterialProperty({ color: COLOR_TRACK }),
            clampToGround: true,
          },
        });
      }
    }

    if (isLayerOn("globe_vessels")) {
      // Label collision avoidance: contacts sharing the same tile cell get
      // progressively right-shifted labels (deterministic, no jitter).
      const laneUse = new Map<string, number>();

      for (const v of vessels) {
        const pos = frame.positions[v.mmsi];
        if (!pos) continue;
        const sel = selectedVesselMmsi === v.mmsi;

        // Vessel state from the EXISTING systems only:
        //  - selected → click selection
        //  - candidate → rank-1 attribution record (no invented candidates)
        //  - everyone else → NORMAL traffic
        const attr = attributions.find((a) => a.vesselId === v.mmsi);
        const state: VesselSymbolState = sel
          ? "SELECTED"
          : attr && attr.rank === 1
            ? "CANDIDATE"
            : "NORMAL";
        const cls = classifyVessel(v.vesselType);
        const headingDeg = resolveHeadingDeg(pos.headingDeg, v.heading);

        // ═─ SHIP SYMBOL (top-down silhouette, heading-rotated) ─────────
        const vesselEnt = ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 80),
          billboard: {
            image: getVesselSymbol(cls, state),
            // 64px sprite → ~24px at regional zoom; selected slightly clearer.
            scale: sel ? 0.44 : 0.36,
            // Top-down silhouette: rotation around the view (Z) axis so the
            // bow points along the vessel's course over ground.
            rotation: Cesium.Math.toRadians(-headingDeg),
            alignedAxis: Cesium.Cartesian3.UNIT_Z,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        tagEntity(vesselEnt, "vessel", v.mmsi);

        // ═─ ACQUISITION BRACKETS — every tracked contact, all states ───
        // Four separated corner arms centered on the symbol (no heavy
        // rectangle). Emphasis scales with state; position follows the
        // vessel through the shared position — never the camera.
        ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 80),
          billboard: {
            image: getBracketSprite(state),
            scale: bracketScale(state) * (sel ? 1.15 : 1),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });

        // ═─ MMSI-FIRST TRACKING LABEL ──────────────────────────────────
        // Technical contact label: MMSI primary, name secondary. Shows at
        // regional zoom so the global view never becomes a wall of text.
        const cell = `${Math.round(pos.lat * 12)}:${Math.round(pos.lon * 12)}`;
        const lane = (laneUse.get(cell) ?? 0);
        laneUse.set(cell, lane + 1);

        const contact = buildContactLabel(v.mmsi, v.name, state);
        // Primary line — MMSI, state-accented, bold. Always first.
        const evEnt = ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 80),
          label: {
            text: contact.primary,
            font: "600 9px 'JetBrains Mono', monospace",
            fillColor: Cesium.Color.fromCssColorString(contact.primaryColor),
            showBackground: true,
            backgroundColor: COLOR_BG.withAlpha(0.78),
            backgroundPadding: new Cesium.Cartesian2(6, 3),
            // Beside the brackets; per-cell lane offset separates contacts.
            pixelOffset: new Cesium.Cartesian2(36 + lane * 12, -16),
            // Whole-contact visibility window — regional + close.
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1_200_000),
          },
        });
        tagEntity(evEnt, "vessel", v.mmsi);

        // Secondary line — vessel name, smaller, beneath the MMSI.
        if (contact.secondary) {
          ds.entities.add({
            position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 80),
            label: {
              text: contact.secondary,
              font: "8px 'JetBrains Mono', monospace",
              fillColor: Cesium.Color.fromCssColorString("#8fa3b8"),
              showBackground: true,
              backgroundColor: COLOR_BG.withAlpha(0.6),
              backgroundPadding: new Cesium.Cartesian2(6, 2),
              pixelOffset: new Cesium.Cartesian2(36 + lane * 12, -5),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 550_000),
            },
          });
        }

        // Course leader line — from the bow along the course over ground.
        // Reinforces heading for the selected vessel only (clarity);
        // unselected traffic stays clean.
        if (sel) {
          const headingRad = Cesium.Math.toRadians(headingDeg);
          const distDeg = 0.012;
          const tipLat = pos.lat + distDeg * Math.cos(headingRad);
          const tipLon = pos.lon + distDeg * Math.sin(headingRad);
          ds.entities.add({
            polyline: {
              positions: [
                Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 80),
                Cesium.Cartesian3.fromDegrees(tipLon, tipLat, 80),
              ],
              width: 1.2,
              material: COLOR_VESSEL_SEL,
            },
          });
        }
      }
    }

    // Correlation overlay for the selected candidate vessel
    if (isLayerOn("globe_correlation") && selectedVesselMmsi) {
      const v = vessels.find((vv) => vv.mmsi === selectedVesselMmsi);
      const attr = attributions.find((a) => a.vesselId === selectedVesselMmsi);
      if (v && attr) {
        const origin =
          driftResult?.backtrack?.[driftResult.backtrack.length - 1]?.center ??
          incident.polygon.center;
        ds.entities.add({
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(v.lon, v.lat, 60),
              Cesium.Cartesian3.fromDegrees(origin[1], origin[0], 60),
            ],
            width: 2,
            material: new Cesium.PolylineArrowMaterialProperty(COLOR_CORRIDOR),
          },
        });
        ds.entities.add({
          polyline: {
            positions: v.trajectory.map(([lat, lon]) =>
              Cesium.Cartesian3.fromDegrees(lon, lat, 40),
            ),
            width: 4,
            material: Cesium.Color.fromCssColorString("#a78bfa"),
            clampToGround: false,
          },
        });
      }
    }

    if (isLayerOn("globe_grid")) {
      // Annotation discipline: events clustered in space get vertically
      // stacked callouts (no random scatter); labels only appear at close
      // zoom; the most recent event in the sim clock is emphasized.
      const ordered = [...frame.visibleEvents].sort(
        (a, b) => Date.parse(a.time) - Date.parse(b.time),
      );
      // Cluster events within ~1.3 km of the previous one.
      let slot = 0;
      let prev: { lat: number; lon: number } | null = null;
      for (const ev of ordered) {
        const nearPrev =
          prev &&
          Math.abs(ev.lat - prev.lat) < 0.012 &&
          Math.abs(ev.lon - prev.lon) < 0.012;
        slot = nearPrev ? (slot + 1) % 5 : 0;
        prev = ev;

        const accent = Cesium.Color.fromCssColorString(EVENT_COLOR[ev.category] ?? "#fbbf24");
        const isLatest = ev.id === ordered[ordered.length - 1]?.id;
        const isFresh =
          replayMs !== null && Date.parse(ev.time) >= replayMs - 3 * 60_000;

        const evEnt = ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat, 300),
          point: {
            pixelSize: isLatest ? 7 : 5,
            color: accent.withAlpha(isFresh || isLatest ? 1 : 0.8),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.55),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `${ev.time.slice(11, 16)}Z  ${ev.label}`,
            font: "9px 'JetBrains Mono', monospace",
            fillColor: isLatest
              ? accent
              : accent.withAlpha(0.85),
            showBackground: true,
            backgroundColor: COLOR_BG.withAlpha(0.85),
            backgroundPadding: new Cesium.Cartesian2(5, 2),
            // Stacked lanes above the point — deterministic, collision-free.
            pixelOffset: new Cesium.Cartesian2(0, -(14 + slot * 18)),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 350_000),
          },
        });
        tagEntity(evEnt, "event", ev.id);
      }
    }
  }, [
    ready,
    incident,
    vessels,
    frame,
    replayMs,
    selectedVesselMmsi,
    layers,
    isLayerOn,
    attributions,
    driftResult,
  ]);

  // ── SIMULATION CLOCK (centralized) ─────────────────────────────────
  // requestAnimationFrame advances a ref-based sim clock at N× real time
  // (1× = real-time), flushed to React state at 5 Hz. The SAME clock drives
  // the incident replay AND the demo-AIS traffic simulation (no second
  // clock). When playback reaches the end of the recorded demo window the
  // clock keeps advancing — traffic keeps moving continuously. The clock
  // STARTS AT THE REPLAY WINDOW START and LOOPS the replay: when it passes
  // the window end it wraps back to the start, so the timeline plays like
  // a continuous replay. It runs from mount — the demo-AIS fleet reads it
  // every preRender frame, so vessels travel without the user pressing
  // the replay Play button (that button only marks replay UI state).
  const simMsRef = useRef<number>(startMs);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let t = simMsRef.current;
    let lastFlush = 0;
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      t += dt * speed;
      // Loop the replay: past the window end, wrap to the window start.
      if (t > endMs + 60_000) t = startMs;
      simMsRef.current = t;
      // 5 Hz UI flush — the renderer reads the ref per frame, no re-render.
      if (now - lastFlush >= 200) {
        lastFlush = now;
        setSimMs(t);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [speed, startMs, endMs]);

  // Replay seeking (play button / evidence ticks / reset) sets the SAME
  // clock — never a second time source. Seeking moves the clock; the rAF
  // loop keeps advancing from the new instant.
  const seekClock = useCallback((ms: number) => {
    simMsRef.current = ms;
    setSimMs(ms);
    setReplayState(ms);
  }, []);

  // ── DEMO AIS TRAFFIC (per-frame, outside React) ────────────────────
  // Drives the batched traffic layer directly from the SAME sim clock via
  // a pre-render listener — smooth per-frame movement with zero React
  // re-renders. Selection/candidate state is pushed in (see effect below).
  const trafficOnRef = useRef(true);
  trafficOnRef.current = isLayerOn("globe_traffic");

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready) return;
    let cancelled = false;
    let removeListener: (() => void) | null = null;
    // The fleet is built AFTER the land/water mask loads, so every route
    // is validated water-safe before any vessel is rendered.
    void prepareFleet().then(() => {
      if (cancelled || viewer.isDestroyed()) return;
      createTrafficLayer(viewer.scene);
      setTrafficSelection(
        selectedVesselMmsi,
        attributions.find((a) => a.rank === 1)?.vesselId ?? null,
      );
      removeListener = viewer.scene.preRender.addEventListener(() => {
        // Guard: the effect that destroys the viewer unmounts before this
        // one, so the scene may already be gone during teardown.
        if (!trafficOnRef.current || viewer.isDestroyed()) return;
        updateTrafficLayer(viewer.scene, simMsRef.current, EPOCH_MS);
      });
    });

    return () => {
      cancelled = true;
      removeListener?.();
      // Only dispose primitives while the viewer is still alive — calling
      // scene accessors on a destroyed viewer throws.
      if (!viewer.isDestroyed()) destroyTrafficLayer(viewer.scene);
    };
    // Selection changes are pushed via setTrafficSelection below (no
    // teardown of the 536 pooled primitives on every click).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Selection/candidate updates flow into the traffic layer without
  // rebuilding its primitive pools.
  useEffect(() => {
    setTrafficSelection(
      selectedVesselMmsi,
      attributions.find((a) => a.rank === 1)?.vesselId ?? null,
    );
  }, [selectedVesselMmsi, attributions]);

  // ── SELECTION FOCUS ────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !selection || !incident) return;

    if (selection.kind === "spill") {
      const bb = Cesium.BoundingSphere.fromPoints(
        incident.polygon.coordinates.map(([lat, lon]) =>
          Cesium.Cartesian3.fromDegrees(lon, lat),
        ),
      );
      viewer.camera.flyToBoundingSphere(bb, {
        duration: 1.4,
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(-20),
          Cesium.Math.toRadians(-28),
          bb.radius * 4,
        ),
      });
    } else if (selection.kind === "vessel") {
      // Simulated-traffic contacts aren't in the replay frame — resolve
      // their live position from the demo provider instead.
      const simVessel = getFleet().find((sv) => sv.mmsi === selection.mmsi);
      if (simVessel) {
        const p = positionAt(simVessel, simMsRef.current, EPOCH_MS);
        viewer.camera.flyToBoundingSphere(
          new Cesium.BoundingSphere(
            Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0),
            4_000,
          ),
          {
            duration: 1.4,
            offset: new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(p.headingDeg - 160),
              Cesium.Math.toRadians(-24),
              5_500,
            ),
          },
        );
        return;
      }
      const v = vessels.find((vv) => vv.mmsi === selection.mmsi);
      if (v) {
        const pos = frame.positions[v.mmsi];
        viewer.camera.flyToBoundingSphere(
          new Cesium.BoundingSphere(
            Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 0),
            4_000,
          ),
          {
            duration: 1.4,
            offset: new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(pos.headingDeg - 160),
              Cesium.Math.toRadians(-24),
              5_500,
            ),
          },
        );
      }
    }
  }, [selection, incident, vessels, frame]);

  // ── HANDLERS ───────────────────────────────────────────────────────
  const handleReset = () => {
    setSelection(null);
    onVesselSelect(null);
    setPlaying(false);
    setReplayState(null);
    seekClock(startMs); // replay back to the window start
    viewerRef.current?.camera.flyHome(1.6);
  };

  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString("en-GB", { hour12: false, timeZone: "UTC" }) + " UTC";

  const clockMs = simMs; // the one simulation clock everyone reads

  const selCorrelation = useMemo(() => {
    if (!selectedVesselMmsi || !incident) return null;
    const v = vessels.find((vv) => vv.mmsi === selectedVesselMmsi);
    const attr = attributions.find((a) => a.vesselId === selectedVesselMmsi);
    if (!v || !attr) return null;
    return computeCorrelation(v, incident.polygon.center, attr.overallScore);
  }, [selectedVesselMmsi, incident, vessels, attributions]);

  // ── RENDER ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#050a12]">
        <div className="max-w-md text-center">
          <Target className="mx-auto mb-3 size-8 text-red-400" />
          <h3 className="text-sm font-semibold text-zinc-200">3D engine failed to load</h3>
          <p className="mt-1 text-[11px] text-zinc-500">{error}</p>
          <button
            onClick={onBackTo2d}
            className="mt-4 rounded border border-sky-200/10 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-300 hover:border-zinc-700"
          >
            Return to 2D Map
          </button>
        </div>
      </div>
    );
  }

  const selectedVessel = vessels.find((v) => v.mmsi === selectedVesselMmsi) ?? null;

  // Assessment-panel evidence factors — derived from the selected vessel's
  // sim-frame geometry and the existing attribution record (no new data).
  const selAttr = attributions.find((a) => a.vesselId === selectedVesselMmsi) ?? null;
  const selFramePos = selectedVesselMmsi ? frame.positions[selectedVesselMmsi] : null;
  const driftDelta = useMemo(() => {
    if (!selFramePos || !selectedVessel) return null;
    // Lane reference = the vessel's own AIS course (from the shared demo
    // data); deviation of live heading vs that course shows anomalous turn.
    return Math.abs(
      ((selFramePos.headingDeg - selectedVessel.course + 540) % 360) - 180,
    );
  }, [selFramePos, selectedVessel]);

  return (
    <div className="absolute inset-0 z-0 bg-[#050a12]">
      {/* Cesium container */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading veil */}
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#050a12]">
          <Loader2 className="size-6 animate-spin text-sky-300" />
          <p className="mt-3 text-[11px] text-zinc-500">Initialising 3D Intelligence…</p>
        </div>
      )}

      {/* Left rail — intelligence layers (control instrument) */}
      <div className="absolute left-3 top-3 z-20 w-52">
        <div className={PANEL}>
          <div className={PANEL_HEADER}>
            <Layers3 className="size-3 text-zinc-500" />
            <span className={PANEL_TITLE}>Intelligence Layers</span>
          </div>
          <div className="px-1 py-1">
            {LAYER_DEFS.map((def) => {
              const l = layers.find((x) => x.id === def.id);
              if (!l) return null;
              const Icon = def.icon;
              return (
                <button
                  key={l.id}
                  onClick={() => onLayerToggle(l.id)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded px-2 py-[5px] text-left transition-colors",
                    l.enabled ? "hover:bg-white/5" : "hover:bg-white/[0.03]",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0 transition-colors",
                      l.enabled ? def.accent : "text-zinc-700",
                    )}
                  />
                  <span
                    className={cn(
                      "flex-1 truncate text-[10px] tracking-wide transition-colors",
                      l.enabled ? "text-zinc-200" : "text-zinc-600",
                    )}
                  >
                    {def.label}
                  </span>
                  {/* Compact visibility lamp — replaces checkbox look */}
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full transition-all",
                      l.enabled
                        ? "bg-sky-300/90 shadow-[0_0_4px_rgba(125,211,252,0.6)]"
                        : "bg-zinc-800",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right-bottom camera controls */}
      <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-1.5">
        <button
          onClick={() => focusInvestigation()}
          className={cn(
            PANEL,
            "flex cursor-pointer items-center gap-1.5 border-amber-300/25 px-2.5 py-1.5 text-[10px] font-medium text-amber-300/90 hover:border-amber-300/40 hover:bg-amber-300/10",
          )}
          title="Frame spill + vessels + area"
        >
          <LocateFixed className="size-3.5" /> FOCUS INVESTIGATION
        </button>
        <button
          onClick={handleReset}
          className={cn(
            PANEL,
            "flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-zinc-400 hover:text-zinc-200",
          )}
        >
          <RotateCcw className="size-3" /> Reset View
        </button>
      </div>

      {/* Investigation timeline — event-anchored, simulation-driven */}
      <div className="absolute bottom-3 left-1/2 z-20 w-[560px] max-w-[62vw] -translate-x-1/2">
        <div className={PANEL}>
          <div className="flex items-center justify-between px-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  // Replay control: play from the window start (or from the
                  // current position when resuming mid-window). The clock is
                  // always running underneath — this toggles replay playback.
                  if (!playing && clockMs >= endMs) seekClock(startMs);
                  setPlaying((p) => !p);
                }}
                className={cn(
                  "flex size-6 cursor-pointer items-center justify-center rounded border transition-colors",
                  playing
                    ? "border-sky-300/40 bg-sky-300/15 text-sky-200"
                    : "border-white/15 text-zinc-300 hover:border-white/30 hover:text-zinc-100",
                )}
                aria-label={playing ? "Pause simulation" : "Run simulation"}
              >
                {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
              </button>
              <div>
                <div className={SECTION_LABEL}>Simulation clock</div>
                <div className="font-mono text-[11px] tabular-nums text-zinc-100">
                  {fmtTime(clockMs)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[9px] transition-colors",
                    speed === s
                      ? "bg-sky-300/15 text-sky-200 ring-1 ring-sky-300/40"
                      : "text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          {/* Event-anchored track: ticks mark real evidence timestamps from
              the shared data; the playhead moves on the simulation clock. */}
          <div className="px-3 pb-2 pt-1">
            <div className="relative h-8">
              <div className="absolute inset-x-0 top-3.5 h-px bg-white/15" />
              {EVIDENCE_EVENTS.map((ev) => {
                const t = Date.parse(ev.time);
                const frac = (t - startMs) / Math.max(1, endMs - startMs);
                if (frac < 0 || frac > 1) return null;
                const passed = t <= clockMs;
                const accent = EVENT_COLOR[ev.category] ?? "#fbbf24";
                return (
                  <button
                    key={ev.id}
                    title={`${ev.time.slice(11, 19)}Z — ${ev.label}`}
                    onClick={() => seekClock(t)}
                    className="group absolute top-2 -translate-x-1/2 cursor-pointer"
                    style={{ left: `${frac * 100}%` }}
                  >
                    <span
                      className="block size-1.5 rounded-full ring-2 ring-[#070d16] transition-transform group-hover:scale-150"
                      style={{
                        background: passed ? accent : "#3f3f46",
                        boxShadow: passed ? `0 0 5px ${accent}66` : undefined,
                      }}
                    />
                    <span
                      className={cn(
                        "mt-0.5 block whitespace-nowrap font-mono text-[7px] tracking-tight transition-colors",
                        passed ? "text-zinc-400" : "text-zinc-700",
                      )}
                    >
                      {ev.time.slice(11, 16)}
                    </span>
                  </button>
                );
              })}
              {/* Playhead */}
              <div
                className="pointer-events-none absolute top-2 h-5 w-px bg-sky-300/90 shadow-[0_0_6px_rgba(125,211,252,0.5)]"
                style={{
                  left: `${Math.min(100, Math.max(0, ((clockMs - startMs) / Math.max(1, endMs - startMs)) * 100))}%`,
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 px-3 py-1.5 text-[8px]">
            <span className="font-mono text-zinc-500">{fmtTime(startMs)}</span>
            <span className="uppercase tracking-[0.15em] text-zinc-600">
              {frame.visibleEvents.length} of {EVIDENCE_EVENTS.length} observations
            </span>
            <span className="font-mono text-zinc-500">{fmtTime(endMs)}</span>
          </div>
        </div>
      </div>

      {/* Selection HUD — spill or event summary (panel has detail) */}
      {selection?.kind === "spill" && incident && (
        <div className={cn(PANEL, "absolute left-1/2 top-3 z-20 -translate-x-1/2 px-3 py-1.5")}>
          <div className="flex items-center gap-2 text-[10px]">
            <Target className="size-3.5 text-orange-400" />
            <span className="font-semibold text-zinc-100">{incident.label}</span>
            <span className="font-mono text-orange-400">{incident.confidence.score}%</span>
            <span className="text-zinc-500">· {incident.polygon.areaKm2} km²</span>
          </div>
        </div>
      )}
      {selection?.kind === "event" && (
        <div
          className={cn(
            PANEL,
            "absolute left-1/2 top-3 z-20 max-w-md -translate-x-1/2 px-3 py-2 text-[10px] leading-relaxed text-amber-200/90",
          )}
        >
          {EVIDENCE_EVENTS.find((e) => e.id === selection.eventId)?.detail}
        </div>
      )}

      {/* Right — source assessment panel (analyst instrument) */}
      {selCorrelation && selectedVessel && (
        <div className="absolute right-3 top-3 z-20 w-60">
          <div className={PANEL}>
            <div className={PANEL_HEADER}>
              <Radar className="size-3 text-violet-300" />
              <span className={PANEL_TITLE}>Potential Source</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[12px] font-semibold tracking-wide text-zinc-100">
                {selectedVessel.name}
              </div>
              <div className={cn(SECTION_LABEL, "mt-0.5")}>Candidate vessel</div>

              {/* Source likelihood */}
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <span className={SECTION_LABEL}>Source likelihood</span>
                  <span className="font-mono text-[11px] text-violet-300">
                    {selCorrelation.score}%
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-violet-400/70"
                    style={{ width: `${Math.min(100, selCorrelation.score)}%` }}
                  />
                </div>
              </div>

              {/* Evidence factors */}
              <div className="mt-3">
                <div className={SECTION_LABEL}>Evidence</div>
                <ul className="mt-1 space-y-1">
                  {[
                    ["Spatial correlation", `${selCorrelation.distanceKm.toFixed(1)} km`],
                    ["Temporal correlation", `${selCorrelation.hoursBeforeDetection.toFixed(1)} h prior`],
                    ["Trajectory compatibility", selCorrelation.trackIntersectsArea ? "COMPATIBLE" : "NO"],
                    ["Drift compatibility", selAttr ? `${selAttr.overallScore}%` : "—"],
                    ["Heading relationship", driftDelta !== null ? `Δ ${Math.round(driftDelta)}° from lane` : "—"],
                  ].map(([label, value]) => (
                    <li key={label} className="flex items-center justify-between text-[9px]">
                      <span className="flex items-center gap-1.5 text-zinc-400">
                        <span className="size-1 rounded-full bg-zinc-600" />
                        {label}
                      </span>
                      <span className="font-mono text-zinc-200">{value}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Status — honest, probabilistic language */}
              <div className="mt-3 border-t border-white/10 pt-2">
                <div className={SECTION_LABEL}>Status</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-amber-300" />
                  <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-amber-200/90">
                    Investigation indicator
                  </span>
                </div>
                <div className="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-zinc-500">
                  Requires validation
                </div>
              </div>

              <p className="mt-2 text-[8px] leading-relaxed text-zinc-600">
                Correlation is probabilistic and does not establish causation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Data-provenance badge — technically honest */}
      <div className={cn(PANEL, "absolute bottom-3 left-3 z-20 flex items-center gap-1.5 px-2 py-1")}>
        <span
          className={cn(
            "size-1.5 rounded-full",
            playing ? "animate-pulse bg-sky-300" : "bg-amber-300/80",
          )}
        />
        <span className="text-[8px] font-semibold uppercase tracking-[0.15em] text-amber-300/80">
          Demo AIS
        </span>
        <span className="h-2.5 w-px bg-white/15" />
        <span className="text-[8px] uppercase tracking-[0.12em] text-zinc-500">
          Simulated real-time
        </span>
        <span className="h-2.5 w-px bg-white/15" />
        <span className="text-[8px] uppercase tracking-[0.12em] text-zinc-500">
          Last update{" "}
          <span className="font-mono text-zinc-300">{fmtTime(clockMs)}</span>
        </span>
      </div>
    </div>
  );
}
