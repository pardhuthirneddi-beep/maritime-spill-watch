// MARIS — 3D Intelligence view (CesiumJS)
// A spatial investigation environment built on the same shared demo data as
// SAR + 2D map. Adapted from the God's Eye View architecture (Cesium globe,
// entity visualization, click-to-focus camera, layer management) but purpose-
// built for oil-spill source attribution.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Eye,
  Loader2,
  LocateFixed,
  Play,
  Pause,
  RotateCcw,
  Ship,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AisVessel,
  EnvironmentalConditions,
  OilDriftResult,
  OilSpillIncident,
  VesselAttribution,
} from "@/data/types";
import type { Globe3dLayer, SceneSelection } from "@/data/globe3dTypes";
import {
  EVIDENCE_EVENTS,
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

if (!("cesiumBaseUrlSet" in window)) {
  (window as unknown as Record<string, unknown>).cesiumBaseUrlSet = true;
  (window as unknown as Record<string, unknown>).CESIUM_BASE_URL = "/cesium/";
}
Cesium.Ion.defaultAccessToken = "";

// ─── STYLING CONSTANTS ───────────────────────────────────────────────

const COLOR_BG = Cesium.Color.fromCssColorString("#050a12");
const COLOR_SPILL = Cesium.Color.fromCssColorString("#fb923c");
const COLOR_SPILL_FILL = Cesium.Color.fromCssColorString("#ea580c").withAlpha(0.28);
const COLOR_CORRIDOR = Cesium.Color.fromCssColorString("#a78bfa").withAlpha(0.8);
const COLOR_AREA = Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.5);
const COLOR_AREA_FILL = Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.04);
const COLOR_VESSEL = Cesium.Color.fromCssColorString("#60a5fa");
const COLOR_VESSEL_SEL = Cesium.Color.fromCssColorString("#22d3ee");
const COLOR_TRACK = Cesium.Color.fromCssColorString("#60a5fa").withAlpha(0.55);
const COLOR_TRACK_SEL = Cesium.Color.fromCssColorString("#22d3ee");
const COLOR_EVIDENCE = Cesium.Color.fromCssColorString("#fbbf24");
const COLOR_SAR = Cesium.Color.fromCssColorString("#e2e8f0").withAlpha(0.35);

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
  const onSelectRef = useRef(onVesselSelect);
  onSelectRef.current = onVesselSelect;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SceneSelection>(null);
  const [replayMs, setReplayMs] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60); // sim-minutes per real second

  const startMs = useMemo(() => replayStartMs(vessels), [vessels]);
  const endMs = useMemo(() => replayEndMs(vessels), [vessels]);
  const frame = useMemo(
    () => buildReplayFrame(vessels, EVIDENCE_EVENTS, replayMs ?? endMs),
    [vessels, replayMs, endMs],
  );

  const isLayerOn = useCallback(
    (id: string) => layers.find((l) => l.id === id)?.enabled ?? false,
    [layers],
  );

  // ── VIEWER INIT (once) ─────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewerRef.current) return;

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

      // Scene character: elevated oblique look, no stars, no atmosphere bloom.
      viewer.scene.globe.enableLighting = false;
      if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
      viewer.scene.backgroundColor = COLOR_BG;
      viewer.scene.screenSpaceCameraController.enableTilt = true;
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 400;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 25_000_000;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cesium failed to initialise");
      return;
    }

    viewerRef.current = viewer;

    const staticDs = new Cesium.CustomDataSource("maris-static");
    const dynamicDs = new Cesium.CustomDataSource("maris-dynamic");
    viewer.dataSources.add(staticDs);
    viewer.dataSources.add(dynamicDs);
    staticDsRef.current = staticDs;
    dynamicDsRef.current = dynamicDs;

    // Click picking
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(movement.position);
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
      viewer.destroy();
      viewerRef.current = null;
      staticDsRef.current = null;
      dynamicDsRef.current = null;
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

  // ── STATIC SCENE: SPILL + AREA + SAR SWATH + DRIFT ZONES ──────────
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
          material: COLOR_SPILL_FILL,
          outline: true,
          outlineColor: COLOR_SPILL,
          outlineWidth: 2,
          height: 0,
          extrudedHeight: 30,
        },
        position: Cesium.Cartesian3.fromDegrees(
          incident.polygon.center[1],
          incident.polygon.center[0],
          200,
        ),
        label: {
          text: `OS-${incident.incidentNumber}  ·  ${incident.confidence.score}%`,
          font: "11px 'JetBrains Mono', monospace",
          fillColor: COLOR_SPILL,
          showBackground: true,
          backgroundColor: COLOR_BG.withAlpha(0.93),
          backgroundPadding: new Cesium.Cartesian2(6, 4),
          pixelOffset: new Cesium.Cartesian2(0, -26),
          style: Cesium.LabelStyle.FILL,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4_000_000),
        },
      });
      tagEntity(slick, "spill", incident.id);

      // Intensity core — inner zones by thickness class mix.
      const [cx, cy] = incident.polygon.center;
      const zones: { rKm: number; color: Cesium.Color }[] = [
        { rKm: 0.55, color: Cesium.Color.fromCssColorString("#7c2d12").withAlpha(0.75) },
        { rKm: 1.3, color: Cesium.Color.fromCssColorString("#9a3412").withAlpha(0.5) },
        { rKm: 2.4, color: Cesium.Color.fromCssColorString("#c2410c").withAlpha(0.28) },
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
          },
        });
      }
    }

    if (isLayerOn("globe_boundaries")) {
      ds.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            investigationAreaPolygon().map(([lat, lon]) =>
              Cesium.Cartesian3.fromDegrees(lon, lat),
            ),
          ),
          material: COLOR_AREA_FILL,
          outline: true,
          outlineColor: COLOR_AREA,
          outlineWidth: 1.5,
          height: 0,
        },
      });
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

    if (isLayerOn("globe_detection_zones") && driftResult) {
      for (const p of driftResult.forward) {
        ds.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
              p.polygon.map(([lat, lon]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
            ),
            material: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.05),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.4),
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
            material: Cesium.Color.fromCssColorString("#a78bfa").withAlpha(0.05),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString("#a78bfa").withAlpha(0.4),
            outlineWidth: 1,
            height: 0,
          },
        });
      }
    }
  }, [ready, incident, driftResult, layers, isLayerOn]);

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
            width: sel ? 3 : 1.4,
            material: sel
              ? COLOR_TRACK_SEL
              : new Cesium.PolylineDashMaterialProperty({ color: COLOR_TRACK }),
            clampToGround: true,
          },
        });
      }
    }

    if (isLayerOn("globe_vessels")) {
      for (const v of vessels) {
        const pos = frame.positions[v.mmsi];
        if (!pos) continue;
        const sel = selectedVesselMmsi === v.mmsi;

        const vesselEnt = ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 80),
          point: {
            pixelSize: sel ? 15 : 9,
            color: sel ? COLOR_VESSEL_SEL : COLOR_VESSEL,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: v.name,
            font: "10px 'JetBrains Mono', monospace",
            fillColor: sel ? COLOR_VESSEL_SEL : Cesium.Color.fromCssColorString("#cbd5e1"),
            showBackground: true,
            backgroundColor: COLOR_BG.withAlpha(0.8),
            backgroundPadding: new Cesium.Cartesian2(5, 3),
            pixelOffset: new Cesium.Cartesian2(0, -18),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 900_000),
          },
        });
        tagEntity(vesselEnt, "vessel", v.mmsi);

        // Heading leader line (course vector)
        const headingRad = Cesium.Math.toRadians(pos.headingDeg);
        const distDeg = 0.012;
        const tipLat = pos.lat + distDeg * Math.cos(headingRad);
        const tipLon = pos.lon + distDeg * Math.sin(headingRad);
        ds.entities.add({
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 80),
              Cesium.Cartesian3.fromDegrees(tipLon, tipLat, 80),
            ],
            width: 1.5,
            material: sel ? COLOR_VESSEL_SEL : COLOR_VESSEL,
          },
        });
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
      for (const ev of frame.visibleEvents) {
        const evEnt = ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat, 300),
          point: {
            pixelSize: 8,
            color: COLOR_EVIDENCE,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.5),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: ev.label,
            font: "10px 'JetBrains Mono', monospace",
            fillColor: Cesium.Color.fromCssColorString("#fde68a"),
            showBackground: true,
            backgroundColor: COLOR_BG.withAlpha(0.8),
            backgroundPadding: new Cesium.Cartesian2(5, 3),
            pixelOffset: new Cesium.Cartesian2(0, -16),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 400_000),
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
    selectedVesselMmsi,
    layers,
    isLayerOn,
    attributions,
    driftResult,
  ]);

  // ── REPLAY CLOCK ───────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setReplayMs((prev) => {
        const next = (prev ?? startMs) + speed * 60_000;
        if (next >= endMs) {
          setPlaying(false);
          return endMs;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing, speed, startMs, endMs]);

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
    } else if (selection.kind === "vessel" && frame) {
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
    viewerRef.current?.camera.flyHome(1.6);
  };

  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString("en-GB", { hour12: false, timeZone: "UTC" }) + "Z";

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

      {/* Left rail — layers */}
      <div className="absolute left-3 top-3 z-20 flex w-60 flex-col gap-2">
        <div className="rounded border border-sky-200/10 bg-[#050a12]/90 p-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            <Eye className="size-3" /> Layers
          </div>
          <div className="space-y-0.5">
            {layers.map((l) => (
              <button
                key={l.id}
                onClick={() => onLayerToggle(l.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-1.5 py-1 text-[10px] transition-colors",
                  l.enabled
                    ? "text-zinc-200 hover:bg-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-900 hover:text-zinc-400",
                )}
              >
                <div
                  className={cn(
                    "flex size-3 items-center justify-center rounded-sm border",
                    l.enabled ? "border-sky-300 bg-sky-300/20" : "border-zinc-700",
                  )}
                >
                  {l.enabled && <div className="size-1.5 rounded-full bg-sky-300" />}
                </div>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right-bottom camera controls */}
      <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-1.5">
        <button
          onClick={() => focusInvestigation()}
          className="flex cursor-pointer items-center gap-1.5 rounded border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-[10px] font-medium text-amber-300 hover:bg-amber-300/20"
          title="Frame spill + vessels + area"
        >
          <LocateFixed className="size-3.5" /> FOCUS INVESTIGATION
        </button>
        <button
          onClick={handleReset}
          className="flex cursor-pointer items-center gap-1.5 rounded border border-sky-200/10 bg-[#050a12]/90 px-2.5 py-1.5 text-[10px] text-zinc-400 hover:text-zinc-200"
        >
          <RotateCcw className="size-3" /> Reset View
        </button>
      </div>

      {/* Replay timeline */}
      <div className="absolute bottom-3 left-1/2 z-20 w-[420px] max-w-[60vw] -translate-x-1/2 rounded border border-sky-200/10 bg-[#050a12]/90 p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <button
            onClick={() => {
              if (replayMs !== null && replayMs >= endMs) setReplayMs(startMs);
              setPlaying((p) => !p);
            }}
            className="cursor-pointer text-sky-300 hover:text-sky-200"
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
          <span className="font-mono text-[10px] text-zinc-300">
            {replayMs !== null ? fmtTime(replayMs) : `LIVE — ${fmtTime(endMs)}`}
          </span>
          <div className="flex items-center gap-1">
            {[30, 60, 120].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={cn(
                  "rounded px-1 text-[8px] font-mono transition-colors",
                  speed === s ? "bg-sky-300/20 text-sky-200" : "text-zinc-600 hover:text-zinc-400",
                )}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
        <input
          type="range"
          min={startMs}
          max={endMs}
          step={30_000}
          value={replayMs ?? endMs}
          onChange={(e) => setReplayMs(Number(e.target.value))}
          className="h-1 w-full accent-sky-400"
        />
        <div className="mt-1 flex items-center justify-between text-[8px] text-zinc-600">
          <span>{fmtTime(startMs)}</span>
          <span>{`${frame.visibleEvents.length} evidence events`}</span>
          <span>{fmtTime(endMs)}</span>
        </div>
      </div>

      {/* Selection HUD — spill or event summary (panel has detail) */}
      {selection?.kind === "spill" && incident && (
        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded border border-orange-500/40 bg-[#050a12]/90 px-3 py-1.5">
          <div className="flex items-center gap-2 text-[10px]">
            <Target className="size-3.5 text-orange-400" />
            <span className="font-semibold text-zinc-100">{incident.label}</span>
            <span className="font-mono text-orange-400">{incident.confidence.score}%</span>
            <span className="text-zinc-500">· {incident.polygon.areaKm2} km²</span>
          </div>
        </div>
      )}
      {selection?.kind === "event" && (
        <div className="absolute left-1/2 top-3 z-20 max-w-md -translate-x-1/2 rounded border border-amber-300/40 bg-[#050a12]/90 px-3 py-1.5 text-[10px] text-amber-200">
          {EVIDENCE_EVENTS.find((e) => e.id === selection.eventId)?.detail}
        </div>
      )}

      {/* Correlation mini-HUD */}
      {selCorrelation && selectedVessel && (
        <div className="absolute right-3 top-3 z-20 w-56 rounded border border-violet-400/30 bg-[#050a12]/90 p-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-violet-300">
            <Ship className="size-3" /> Potential source correlation
          </div>
          <div className="text-[11px] font-semibold text-zinc-100">{selectedVessel.name}</div>
          <div className="mt-1.5 space-y-0.5 text-[9px] text-zinc-400">
            <div className="flex justify-between">
              <span>Distance from spill</span>
              <span className="font-mono text-zinc-200">
                {selCorrelation.distanceKm.toFixed(1)} km
              </span>
            </div>
            <div className="flex justify-between">
              <span>Hours before detection</span>
              <span className="font-mono text-zinc-200">
                {selCorrelation.hoursBeforeDetection.toFixed(1)} h
              </span>
            </div>
            <div className="flex justify-between">
              <span>Track ∩ area</span>
              <span className="font-mono text-zinc-200">
                {selCorrelation.trackIntersectsArea ? "YES" : "NO"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Correlation</span>
              <span className="font-mono text-violet-300">{selCorrelation.score}/100</span>
            </div>
          </div>
          <p className="mt-1.5 text-[8px] leading-relaxed text-zinc-600">
            Candidate vessel — correlation does not establish causation.
          </p>
        </div>
      )}

      {/* Demo badge */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded border border-amber-300/20 bg-[#050a12]/90 px-2 py-1">
        <div className="size-1.5 rounded-full bg-amber-300" />
        <span className="text-[8px] font-semibold uppercase tracking-wider text-amber-300/80">
          Simulated data
        </span>
      </div>
    </div>
  );
}
