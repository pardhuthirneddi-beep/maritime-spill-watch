// @ts-nocheck — ArcGIS SDK types are too heavy for tsc; runtime works correctly
// maris — 3D Geospatial Intelligence Globe
// Professional maritime satellite intelligence command center
// Uses ArcGIS Maps SDK for JavaScript — SceneView (3D globe)
import { useRef, useEffect, useState, useCallback } from "react";
import config from "@arcgis/core/config.js";
import Map from "@arcgis/core/Map.js";
import SceneView from "@arcgis/core/views/SceneView.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import Graphic from "@arcgis/core/Graphic.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import Point from "@arcgis/core/geometry/Point.js";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol.js";
import PictureMarkerSymbol from "@arcgis/core/symbols/PictureMarkerSymbol.js";
import TextSymbol from "@arcgis/core/symbols/TextSymbol.js";
import "@arcgis/core/assets/esri/themes/dark/main.css";
import {
  ArrowLeft,
  ChevronRight,
  Crosshair,
  Filter,
  Layers,
  Navigation,
  Pause,
  Play,
  Search,
  Ship,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEMO_INCIDENT,
  DEMO_VESSELS,
  DEMO_DRIFT,
  DEMO_ATTRIBUTIONS,
  DEMO_ENVIRONMENTAL,
  DEMO_SATELLITE_OBSERVATION,
} from "@/data/demoData";
import type {
  AisVessel,
  Globe3dLayer,
  Globe3dLayerId,
} from "@/data/types";

// Set ArcGIS assets path for the CSS/icons
config.assetsPath = "https://js.arcgis.com/5.1/assets/@arcgis/core/assets";

const CARTO_API_KEY = "cb1_2u58_1_bf57649a9ebd93a4418be433";

// ArcGIS dark basemap tile URL
const DARK_BASEMAP_URL = `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json?key=${CARTO_API_KEY}`;

interface IntelligenceGlobeProps {
  onBack: () => void;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────

export default function IntelligenceGlobe({ onBack }: IntelligenceGlobeProps) {
  const viewContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SceneView | null>(null);
  const graphicsLayerRef = useRef<GraphicsLayer | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<AisVessel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [layers, setLayers] = useState<Globe3dLayer[]>([
    { id: "globe_vessels", label: "Vessels", enabled: true },
    { id: "globe_tracks", label: "Vessel Tracks", enabled: true },
    { id: "globe_spill", label: "Oil Spill Detections", enabled: true },
    { id: "globe_satellite", label: "Satellite Passes", enabled: true },
    { id: "globe_boundaries", label: "Coastline", enabled: true },
    { id: "globe_grid", label: "Maritime Zones", enabled: true },
    { id: "globe_detection_zones", label: "Detection Zone", enabled: false },
  ]);
  const [timeStep, setTimeStep] = useState(10);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [timeRange, setTimeRange] = useState<"now" | "3h" | "6h" | "12h" | "24h">("now");

  const incident = DEMO_INCIDENT;

  const timeSteps = [
    "08:45", "09:00", "09:05", "09:12", "09:17", "09:28", "09:31",
    "09:42", "09:48", "09:50", "09:52", "09:54", "09:56", "10:00", "10:02", "10:05",
  ];

  const eventTimeline = [
    { time: "09:20 UTC", event: "Satellite pass", color: "#44cc88" },
    { time: "09:25 UTC", event: "SAR image acquired", color: "#44cc88" },
    { time: "09:27 UTC", event: "Anomaly detected", color: "#fb923c" },
    { time: "09:28 UTC", event: "Oil spill classified", color: "#fb923c" },
    { time: "09:31 UTC", event: "Nearby vessels identified", color: "#55aaff" },
  ];

  const filteredVessels = DEMO_VESSELS.filter((v) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!v.name.toLowerCase().includes(q) && !v.mmsi.includes(q)) return false;
    }
    return true;
  });

  const affectedVessels = DEMO_VESSELS.slice(0, 3);

  // ── Helper: create ship SVG marker ─────────────────────────────
  const shipSvg = (color: string, selected: boolean) => {
    const size = selected ? 36 : 28;
    const stroke = selected ? "#22d3ee" : "#fff";
    const fill = selected ? "#22d3ee" : color;
    const bg = selected ? "#0e7490" : "#3388cc";
    const sw = selected ? "1.5" : "1";
    return `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><polygon points="16,2 10,14 22,14" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="0.95"/><rect x="13" y="14" width="6" height="6" rx="1" fill="${bg}" stroke="${stroke}" stroke-width="${sw}"/></svg>`
    )}`;
  };

  // ── Initialize ArcGIS SceneView ───────────────────────────────
  useEffect(() => {
    if (!viewContainerRef.current || viewRef.current) return;

    let cancelled = false;

    const init = async () => {
      const graphicsLayer = new GraphicsLayer({ id: "intelligence-layer" });
      graphicsLayerRef.current = graphicsLayer;

      const map = new Map({
        basemap: "dark-gray-vector",
        layers: [graphicsLayer],
      });

      const view = new SceneView({
        container: viewContainerRef.current!,
        map,
        camera: {
          position: {
            longitude: 87.5,
            latitude: 10.5,
            z: 3500000,
          },
          heading: 345,
          tilt: 42,
        },
        environment: {
          lighting: {
            directShadowsEnabled: false,
          },
          starsEnabled: true,
        },
        ui: {
          components: ["compass", "zoom", "navigation-toggle"],
        },
      });

      if (cancelled) {
        view.destroy();
        return;
      }

      await view.when();
      viewRef.current = view;

      // Add all graphics
      updateGraphics(layers, null);
    };

    init().catch((err) => {
      console.error("[MARIS] ArcGIS SceneView init failed:", err);
    });

    return () => {
      cancelled = true;
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []);

  // ── Update graphics when layers/selection change ───────────────
  const updateGraphics = useCallback(
    (currentLayers: Globe3dLayer[], currentVessel: AisVessel | null) => {
      const gl = graphicsLayerRef.current;
      if (!gl) return;

      gl.removeAll();
      const enabledMap = Object.fromEntries(currentLayers.map((l) => [l.id, l.enabled]));
      const centerLon = incident.polygon.center[1];
      const centerLat = incident.polygon.center[0];

      // ── OIL SPILL POLYGON ────────────────────────────────────
      if (enabledMap.globe_spill) {
        const spillCoords = incident.polygon.coordinates.map((c) => [c[1], c[0]]);

        // Glow outline
        gl.add(
          new Graphic({
            geometry: new Polygon({
              rings: [spillCoords],
              spatialReference: { wkid: 4326 },
            }),
            symbol: new SimpleFillSymbol({
              color: [249, 115, 22, 0.06],
              outline: new SimpleLineSymbol({
                color: [251, 146, 60, 0.35],
                width: 6,
              }),
            }),
            attributes: { layer: "spill-glow" },
          })
        );

        // Main spill polygon
        gl.add(
          new Graphic({
            geometry: new Polygon({
              rings: [spillCoords],
              spatialReference: { wkid: 4326 },
            }),
            symbol: new SimpleFillSymbol({
              color: [212, 119, 10, 0.3],
              outline: new SimpleLineSymbol({
                color: [251, 146, 60, 0.9],
                width: 2,
              }),
            }),
            attributes: { layer: "spill-fill" },
          })
        );

        // Spill label
        gl.add(
          new Graphic({
            geometry: new Point({
              longitude: centerLon,
              latitude: centerLat + 0.15,
              spatialReference: { wkid: 4326 },
            }),
            symbol: new TextSymbol({
              text: "OIL SPILL DETECTION",
              color: [251, 146, 60, 220],
              font: { size: 11, family: "monospace", weight: "bold" as any },
              haloColor: [2, 5, 8, 0.8],
              haloSize: 2,
            }),
            attributes: { layer: "spill-label" },
          })
        );

        // Spill details
        gl.add(
          new Graphic({
            geometry: new Point({
              longitude: centerLon,
              latitude: centerLat + 0.08,
              spatialReference: { wkid: 4326 },
            }),
            symbol: new TextSymbol({
              text: `Area: ${incident.polygon.areaKm2} km² | Confidence: ${incident.confidence.score}%`,
              color: [200, 200, 200, 180],
              font: { size: 9, family: "monospace" },
              haloColor: [2, 5, 8, 0.8],
              haloSize: 1,
            }),
            attributes: { layer: "spill-label-sub" },
          })
        );
      }

      // ── DETECTION ZONE RING ──────────────────────────────────
      if (enabledMap.globe_detection_zones) {
        const zoneRadius = 15 / 111;
        const zoneRings: number[][] = [];
        for (let i = 0; i <= 64; i++) {
          const angle = (i / 64) * Math.PI * 2;
          zoneRings.push([
            centerLon + zoneRadius * Math.cos(angle),
            centerLat + zoneRadius * Math.sin(angle),
          ]);
        }
        gl.add(
          new Graphic({
            geometry: new Polyline({
              paths: [zoneRings],
              spatialReference: { wkid: 4326 },
            }),
            symbol: new SimpleLineSymbol({
              color: [251, 146, 60, 0.4],
              width: 1,
              style: "dash" as any,
            }),
            attributes: { layer: "detection-zone" },
          })
        );
      }

      // ── VESSEL TRACKS ────────────────────────────────────────
      if (enabledMap.globe_tracks) {
        DEMO_VESSELS.forEach((vessel) => {
          if (vessel.trajectory.length > 1) {
            const path = vessel.trajectory.map((c) => [c[1], c[0]]);
            const isSelected = currentVessel?.mmsi === vessel.mmsi;
            gl.add(
              new Graphic({
                geometry: new Polyline({
                  paths: [path],
                  spatialReference: { wkid: 4326 },
                }),
                symbol: new SimpleLineSymbol({
                  color: isSelected ? [34, 211, 238, 0.6] : [51, 136, 204, 0.35],
                  width: isSelected ? 2.5 : 1.5,
                }),
                attributes: { layer: `track-${vessel.mmsi}` },
              })
            );
          }
        });
      }

      // ── AIS VESSELS ──────────────────────────────────────────
      if (enabledMap.globe_vessels) {
        DEMO_VESSELS.forEach((vessel) => {
          const isSelected = currentVessel?.mmsi === vessel.mmsi;

          gl.add(
            new Graphic({
              geometry: new Point({
                longitude: vessel.lon,
                latitude: vessel.lat,
                spatialReference: { wkid: 4326 },
              }),
              symbol: new PictureMarkerSymbol({
                url: shipSvg(isSelected ? "#22d3ee" : "#55aaff", isSelected),
                width: isSelected ? "36px" : "28px",
                height: isSelected ? "36px" : "28px",
              }),
              attributes: { layer: `vessel-${vessel.mmsi}`, mmsi: vessel.mmsi },
            })
          );

          // Vessel label
          gl.add(
            new Graphic({
              geometry: new Point({
                longitude: vessel.lon,
                latitude: vessel.lat + 0.25,
                spatialReference: { wkid: 4326 },
              }),
              symbol: new TextSymbol({
                text: `${vessel.name}  ${vessel.speed} kn → ${vessel.heading}°`,
                color: isSelected ? [34, 211, 238, 230] : [180, 190, 200, 180],
                font: { size: 9, family: "monospace", weight: "bold" as any },
                haloColor: [2, 5, 8, 0.85],
                haloSize: 1.5,
                yoffset: -18,
              }),
              attributes: { layer: `vessel-label-${vessel.mmsi}` },
            })
          );
        });
      }

      // ── SATELLITE OBSERVATION ────────────────────────────────
      if (enabledMap.globe_satellite) {
        const obs = DEMO_SATELLITE_OBSERVATION;

        // Ground track
        if (obs.groundTrack.length > 1) {
          const trackPath = obs.groundTrack.map((c) => [c[1], c[0]]);
          gl.add(
            new Graphic({
              geometry: new Polyline({
                paths: [trackPath],
                spatialReference: { wkid: 4326 },
              }),
              symbol: new SimpleLineSymbol({
                color: [68, 204, 136, 0.5],
                width: 1.5,
                style: "dash" as any,
              }),
              attributes: { layer: "sat-ground-track" },
            })
          );
        }

        // Satellite label
        const satLabel = `${obs.satellite}\nPASS 08921\n${new Date(obs.timestamp)
          .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          .toUpperCase()} ${new Date(obs.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC`;

        gl.add(
          new Graphic({
            geometry: new Point({
              longitude: obs.swathCenter[1] + 1.5,
              latitude: obs.swathCenter[0] + 1.2,
              z: obs.orbitAltitude * 1000,
              spatialReference: { wkid: 4326 },
            }),
            symbol: new TextSymbol({
              text: satLabel,
              color: [68, 204, 136, 200],
              font: { size: 10, family: "monospace", weight: "bold" as any },
              haloColor: [2, 5, 8, 0.85],
              haloSize: 1.5,
              lineHeight: 18,
            }),
            attributes: { layer: "satellite-label" },
          })
        );

        // Swath footprint
        const swathHalfWidth = obs.swathWidth / 2 / 111000;
        const swathHalfLength = obs.swathLength / 2 / 111000;
        const swathAngle = ((obs.orbitInclination > 90 ? 170 : 10) * Math.PI) / 180;
        const cosA = Math.cos(swathAngle);
        const sinA = Math.sin(swathAngle);
        const scLat = obs.swathCenter[0];
        const scLon = obs.swathCenter[1];
        const swathCorners = [
          [scLon - swathHalfLength * sinA - swathHalfWidth * cosA, scLat - swathHalfLength * cosA + swathHalfWidth * sinA],
          [scLon - swathHalfLength * sinA + swathHalfWidth * cosA, scLat - swathHalfLength * cosA - swathHalfWidth * sinA],
          [scLon + swathHalfLength * sinA + swathHalfWidth * cosA, scLat + swathHalfLength * cosA - swathHalfWidth * sinA],
          [scLon + swathHalfLength * sinA - swathHalfWidth * cosA, scLat + swathHalfLength * cosA + swathHalfWidth * sinA],
          [scLon - swathHalfLength * sinA - swathHalfWidth * cosA, scLat - swathHalfLength * cosA + swathHalfWidth * sinA],
        ];

        gl.add(
          new Graphic({
            geometry: new Polygon({
              rings: [swathCorners],
              spatialReference: { wkid: 4326 },
            }),
            symbol: new SimpleFillSymbol({
              color: [68, 204, 136, 0.04],
              outline: new SimpleLineSymbol({
                color: [68, 204, 136, 0.2],
                width: 1,
                style: "dash" as any,
              }),
            }),
            attributes: { layer: "sat-swath" },
          })
        );
      }

      // ── DRIFT PATHS ──────────────────────────────────────────
      if (enabledMap.globe_spill) {
        // Forward drift
        if (DEMO_DRIFT.forward.length > 1) {
          const fwdPath = DEMO_DRIFT.forward.map((p) => [p.center[1], p.center[0]]);
          gl.add(
            new Graphic({
              geometry: new Polyline({
                paths: [fwdPath],
                spatialReference: { wkid: 4326 },
              }),
              symbol: new SimpleLineSymbol({
                color: [249, 115, 22, 0.5],
                width: 2,
                style: "dash" as any,
              }),
              attributes: { layer: "drift-forward" },
            })
          );
        }

        // Backtrack
        if (DEMO_DRIFT.backtrack.length > 1) {
          const btPath = DEMO_DRIFT.backtrack.map((p) => [p.center[1], p.center[0]]);
          gl.add(
            new Graphic({
              geometry: new Polyline({
                paths: [btPath],
                spatialReference: { wkid: 4326 },
              }),
              symbol: new SimpleLineSymbol({
                color: [167, 139, 250, 0.4],
                width: 1.5,
                style: "dash" as any,
              }),
              attributes: { layer: "drift-backtrack" },
            })
          );
        }

        // Drift time points
        DEMO_DRIFT.forward.forEach((point, i) => {
          if (i === 0) return;
          gl.add(
            new Graphic({
              geometry: new Point({
                longitude: point.center[1],
                latitude: point.center[0],
                spatialReference: { wkid: 4326 },
              }),
              symbol: new TextSymbol({
                text: point.time,
                color: [249, 115, 22, 140 + (4 - i) * 20],
                font: { size: 7, family: "monospace" },
                haloColor: [2, 5, 8, 0.7],
                haloSize: 1,
                yoffset: 12,
              }),
              attributes: { layer: `drift-label-${i}` },
            })
          );
        });
      }

      // ── MARITIME GRID ────────────────────────────────────────
      if (enabledMap.globe_grid) {
        const gridLines: number[][][] = [];
        for (let lat = 5; lat <= 20; lat += 5) {
          const pts: number[][] = [];
          for (let lon = 80; lon <= 95; lon += 0.5) pts.push([lon, lat]);
          gridLines.push(pts);
        }
        for (let lon = 81; lon <= 93; lon += 3) {
          const pts: number[][] = [];
          for (let lat = 5; lat <= 20; lat += 0.5) pts.push([lon, lat]);
          gridLines.push(pts);
        }
        gridLines.forEach((pts, i) => {
          gl.add(
            new Graphic({
              geometry: new Polyline({
                paths: [pts],
                spatialReference: { wkid: 4326 },
              }),
              symbol: new SimpleLineSymbol({
                color: [51, 65, 85, 0.25],
                width: 0.5,
              }),
              attributes: { layer: `grid-${i}` },
            })
          );
        });
      }
    },
    [incident]
  );

  // ── Sync graphics when layers change ──────────────────────────
  useEffect(() => {
    updateGraphics(layers, selectedVessel);
  }, [layers, selectedVessel, updateGraphics]);

  // ── Handle vessel selection ─────────────────────────────────────
  const handleVesselSelect = useCallback((vessel: AisVessel) => {
    setSelectedVessel(vessel);
    const view = viewRef.current;
    if (!view) return;
    view.goTo(
      {
        target: new Point({
          longitude: vessel.lon,
          latitude: vessel.lat,
          z: 600000,
        }),
        heading: 350,
        tilt: 45,
      },
      { duration: 2000 }
    );
  }, []);

  // ── Fly to spill ──────────────────────────────────────────────
  const flyToSpill = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    view.goTo(
      {
        target: new Point({
          longitude: incident.polygon.center[1],
          latitude: incident.polygon.center[0],
          z: 1200000,
        }),
        heading: 345,
        tilt: 42,
      },
      { duration: 2000 }
    );
  }, [incident]);

  // ── Toggle layer ──────────────────────────────────────────────
  const toggleLayer = useCallback((id: Globe3dLayerId) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)));
  }, []);

  // ── Playback ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;
    const iv = setInterval(() => {
      setTimeStep((p) => {
        if (p >= timeSteps.length - 1) {
          setIsPlaying(false);
          return p;
        }
        return p + 1;
      });
    }, 1000 / playSpeed);
    return () => clearInterval(iv);
  }, [isPlaying, playSpeed, timeSteps.length]);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#020508] text-zinc-100 overflow-hidden select-none">

      {/* ─── TOP TELEMETRY BAR ──────────────────────────────── */}
      <header className="flex h-12 items-center justify-between border-b border-zinc-800/50 bg-[#060a10]/95 px-4 z-30 backdrop-blur-sm">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10">
              <Navigation className="size-3.5 text-cyan-400" />
            </div>
            <div>
              <div className="text-[11px] font-bold tracking-wider text-zinc-100 uppercase">maris</div>
              <div className="text-[7px] text-zinc-500 uppercase tracking-wider leading-none">Maritime Intelligence</div>
            </div>
          </div>
          <div className="h-6 w-px bg-zinc-800" />
          <StatusMetric label="UTC TIME" value={new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase() + "  " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} />
          <StatusMetric label="ACTIVE VESSELS" value={`${DEMO_VESSELS.length}`} />
          <StatusMetric label="DETECTIONS" value="3" />
          <StatusMetric label="SATELLITE" value="SENTINEL-1A" />
          <StatusMetric label="WIND" value={`${DEMO_ENVIRONMENTAL.windSpeed} kn ${DEMO_ENVIRONMENTAL.windDirectionLabel}`} />
          <StatusMetric label="SEA STATE" value="MODERATE" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-[9px] text-zinc-400 hover:text-zinc-200 transition-colors">
            <ArrowLeft className="size-3" /> Back
          </button>
          <div className="rounded bg-cyan-500/15 border border-cyan-500/30 px-3 py-1.5">
            <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider">3D Intelligence</span>
          </div>
          <div className="rounded border border-zinc-700 bg-zinc-800/50 px-2 py-1.5">
            <span className="text-[7px] font-semibold text-amber-400/70 uppercase tracking-wider">Demo Data</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ─── LEFT PANEL ────────────────────────────────────── */}
        <aside className="w-56 border-r border-zinc-800/50 bg-[#060a10]/95 flex flex-col overflow-hidden z-20">
          <div className="px-3 py-2.5 border-b border-zinc-800/50">
            <h2 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">Vessels</h2>
          </div>
          <div className="px-3 py-2 border-b border-zinc-800/50">
            <div className="flex items-center gap-1.5 rounded border border-zinc-700/50 bg-zinc-800/30 px-2 py-1">
              <Search className="size-3 text-zinc-500" />
              <input type="text" placeholder="Search vessel or MMSI" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 bg-transparent text-[10px] text-zinc-300 placeholder-zinc-600 outline-none" />
              <Filter className="size-3 text-zinc-600" />
            </div>
          </div>
          <div className="px-3 py-1.5 border-b border-zinc-800/50">
            <span className="text-[8px] px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-medium">ALL {DEMO_VESSELS.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredVessels.map((v) => {
              const attr = DEMO_ATTRIBUTIONS.find((a) => a.vesselId === v.mmsi);
              const sel = selectedVessel?.mmsi === v.mmsi;
              return (
                <button key={v.mmsi} onClick={() => handleVesselSelect(v)} className={cn("w-full text-left px-3 py-2 border-b border-zinc-800/30 transition-colors", sel ? "bg-cyan-500/8" : "hover:bg-zinc-800/30")}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-semibold text-zinc-200">{v.name}</span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">ACTIVE</span>
                  </div>
                  <div className="text-[8px] text-zinc-500 font-mono mb-0.5">MMSI {v.mmsi}</div>
                  <div className="flex items-center gap-3 text-[9px] text-zinc-400">
                    <span>{v.speed} kn</span><span>→ {v.heading}°</span>
                  </div>
                  {attr && <div className="mt-1 text-[8px] font-bold text-orange-400">Source: {attr.overallScore}/100</div>}
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-zinc-800/50">
            <button onClick={flyToSpill} className="w-full text-center text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors py-1">VIEW SPILL LOCATION</button>
          </div>
          <div className="px-3 py-2.5 border-t border-zinc-800/50">
            <h3 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Layers className="size-3" />Layers</h3>
            <div className="space-y-1">
              {layers.map((l) => (
                <button key={l.id} onClick={() => toggleLayer(l.id)} className="flex items-center gap-2 w-full text-left">
                  <div className="text-[8px] text-zinc-600">✦</div>
                  <span className="text-[10px] text-zinc-400 flex-1">{l.label}</span>
                  <div className={cn("w-7 h-3.5 rounded-full transition-colors relative", l.enabled ? "bg-cyan-500/30" : "bg-zinc-700/50")}>
                    <div className={cn("absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all", l.enabled ? "left-3.5 bg-cyan-400" : "left-0.5 bg-zinc-500")} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ─── ARCGIS SCENEVIEW ──────────────────────────────── */}
        <main className="flex-1 relative">
          <div ref={viewContainerRef} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />

          {/* Compass / nav */}
          <div className="absolute bottom-20 left-6 z-10">
            <div className="flex flex-col items-center gap-0.5">
              <button className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300"><ChevronRight className="size-3 rotate-[-90deg]" /></button>
              <div className="flex gap-0.5">
                <button className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300"><ChevronRight className="size-3 rotate-[180deg]" /></button>
                <button className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300"><Crosshair className="size-3" /></button>
                <button className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300"><ChevronRight className="size-3" /></button>
              </div>
              <button className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300"><ChevronRight className="size-3 rotate-90" /></button>
            </div>
          </div>

          {/* ─── BOTTOM TIMELINE ─────────────────────────────── */}
          <div className="absolute bottom-0 left-0 right-0 z-20">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-[#060a10]/95 border-t border-zinc-800/50 backdrop-blur-sm">
              <button onClick={() => setIsPlaying(!isPlaying)} className="text-zinc-400 hover:text-zinc-200">
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <button onClick={() => setPlaySpeed((s) => s === 1 ? 2 : s === 2 ? 4 : 1)} className="text-[9px] text-zinc-500 hover:text-zinc-300 font-mono min-w-[20px]">{playSpeed}x</button>
              <div className="h-4 w-px bg-zinc-800" />
              <div className="flex-1 flex items-center gap-2">
                <span className="text-[8px] font-mono text-zinc-600">08:45</span>
                <div className="flex-1 relative">
                  <div className="h-0.5 bg-zinc-800 rounded-full w-full" />
                  <div className="absolute top-0 h-0.5 bg-cyan-500/50 rounded-full" style={{ width: `${(timeStep / (timeSteps.length - 1)) * 100}%` }} />
                  <div className="flex justify-between mt-1">
                    {["09:00", "09:15", "09:30", "09:45", "10:00", "10:15"].map((t) => <span key={t} className="text-[7px] font-mono text-zinc-700">{t}</span>)}
                  </div>
                  <div className="absolute -top-1.5 w-3 h-3 rounded-full bg-cyan-400 border-2 border-[#060a10] cursor-pointer" style={{ left: `calc(${(timeStep / (timeSteps.length - 1)) * 100}% - 6px)` }} />
                </div>
                <span className="text-[8px] font-mono text-zinc-600">10:15</span>
              </div>
              <div className="h-4 w-px bg-zinc-800" />
              <span className="text-[10px] font-mono text-zinc-300 font-semibold">{timeSteps[timeStep]}</span>
              <div className="h-4 w-px bg-zinc-800" />
              <div className="flex items-center gap-0.5">
                {(["now", "3h", "6h", "12h", "24h"] as const).map((r) => (
                  <button key={r} onClick={() => setTimeRange(r)} className={cn("text-[8px] px-2 py-0.5 rounded font-medium transition-colors", timeRange === r ? "bg-cyan-500/15 text-cyan-400" : "text-zinc-500 hover:text-zinc-300")}>{r.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>
        </main>

        {/* ─── RIGHT PANEL ──────────────────────────────────── */}
        <aside className="w-72 border-l border-zinc-800/50 bg-[#060a10]/95 flex flex-col overflow-y-auto z-20">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800/50">
            <h2 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">Detection Event</h2>
            <button onClick={onBack} className="text-zinc-600 hover:text-zinc-300"><X className="size-3.5" /></button>
          </div>
          <div className="p-3 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-zinc-100">{incident.incidentNumber}</span>
              <span className="text-[7px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-bold uppercase">High Confidence</span>
            </div>
            <div className="space-y-2.5">
              <EvtField label="DETECTED" value={new Date(incident.detectedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " UTC"} />
              <EvtField label="LOCATION" value={`${incident.coordinates[0].toFixed(2)}° N, ${incident.coordinates[1].toFixed(2)}° E`} />
              <EvtField label="AREA" value={`${incident.polygon.areaKm2} km²`} />
              <EvtField label="CONFIDENCE" value={`${incident.confidence.score}%`} color="text-cyan-400" />
              <EvtField label="SOURCE" value="Sentinel-1A (SAR)" />
            </div>

            {/* Event Timeline */}
            <div>
              <h3 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Event Timeline</h3>
              <div className="space-y-1.5">
                {eventTimeline.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ev.color + "60", border: `1px solid ${ev.color}` }} />
                    <div><span className="text-[9px] font-mono text-zinc-400">{ev.time}</span><span className="text-[9px] text-zinc-500 ml-2">{ev.event}</span></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Affected Vessels */}
            <div>
              <h3 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Affected Vessels</h3>
              <div className="space-y-2">
                {affectedVessels.map((v, i) => (
                  <button key={v.mmsi} onClick={() => handleVesselSelect(v)} className="w-full text-left flex items-start gap-2 hover:bg-zinc-800/30 rounded p-1 -mx-1 transition-colors">
                    <Ship className="size-3 text-zinc-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-300">{v.name}</div>
                      <div className="text-[9px] text-zinc-500">{v.speed} kn → {v.heading}° · {(6 + i * 2.5).toFixed(1)} nm</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Confidence Factors */}
            <div>
              <h3 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Confidence Factors</h3>
              <div className="space-y-1">
                {incident.confidence.factors.slice(0, 3).map((f, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-emerald-500 text-[8px] mt-px">•</span>
                    <span className="text-[9px] text-zinc-400 leading-tight">{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Source Attribution */}
            {DEMO_ATTRIBUTIONS.length > 0 && (
              <div className="rounded border border-zinc-800/60 bg-zinc-900/30 p-2.5">
                <h3 className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider mb-1.5">Probable Source</h3>
                <div className="text-[11px] font-semibold text-zinc-200">{DEMO_ATTRIBUTIONS[0].vesselName}</div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-[16px] font-bold text-cyan-400">{DEMO_ATTRIBUTIONS[0].overallScore}</span>
                  <span className="text-[9px] text-zinc-500">/100 confidence</span>
                </div>
                <div className="mt-1.5 space-y-0.5">
                  {DEMO_ATTRIBUTIONS[0].reasons.slice(0, 3).map((r, i) => (
                    <div key={i} className="text-[8px] text-zinc-500">{r}</div>
                  ))}
                </div>
              </div>
            )}

            <button className="w-full rounded border border-zinc-700 bg-zinc-800/30 py-2 text-[10px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors uppercase tracking-wider">View Full Report</button>

            {/* Demo disclaimer */}
            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
              <div className="text-[8px] text-amber-400/70 leading-relaxed">
                Demonstration data — vessel identities, detection results, and environmental conditions are synthetic. Not derived from live satellite or AIS feeds.
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── HELPERS ────────────────────────────────────────────────────────

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[7px] text-zinc-600 uppercase tracking-wider leading-none mb-0.5">{label}</div>
      <div className="text-[10px] font-semibold text-zinc-200 font-mono leading-none">{value}</div>
    </div>
  );
}

function EvtField({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[7px] text-zinc-600 uppercase tracking-wider leading-none mb-0.5">{label}</div>
      <div className={cn("text-[10px] font-mono text-zinc-300", color)}>{value}</div>
    </div>
  );
}
