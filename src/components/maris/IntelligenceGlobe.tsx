// maris — 3D Geospatial Intelligence Globe
// Professional maritime satellite intelligence command center
// Uses CesiumJS loaded via CDN to avoid bundler issues with large packages

import { useRef, useEffect, useState, useCallback } from "react";
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

// Cesium Ion access token from environment variable
const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN || "";

// Check if Cesium is already loaded
declare global {
  interface Window {
    Cesium: any;
  }
}

function loadCesium(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Cesium) {
      resolve();
      return;
    }

    // Check if script tag already exists
    const existing = document.getElementById("cesium-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Cesium load failed")));
      return;
    }

    // Add Cesium CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/Widgets/widgets.css";
    document.head.appendChild(link);

    // Add Cesium JS
    const script = document.createElement("script");
    script.id = "cesium-script";
    script.src = "https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/Cesium.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load CesiumJS from CDN"));
    document.head.appendChild(script);
  });
}

interface IntelligenceGlobeProps {
  onBack: () => void;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────

export default function IntelligenceGlobe({ onBack }: IntelligenceGlobeProps) {
  const viewContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const registryRef = useRef<Record<string, any[]>>({});
  const [selectedVessel, setSelectedVessel] = useState<AisVessel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  // Register a Cesium entity under a 3D layer id so layer toggles work
  const registerEntity = useCallback((layerId: string, entity: any) => {
    if (!entity) return;
    if (!registryRef.current[layerId]) registryRef.current[layerId] = [];
    registryRef.current[layerId].push(entity);
  }, []);

  // ── Initialize Cesium Viewer ─────────────────────────────────
  useEffect(() => {
    if (!viewContainerRef.current || viewerRef.current) return;

    let cancelled = false;

    const init = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        await loadCesium();

        if (cancelled || !viewContainerRef.current) return;

        const Cesium = window.Cesium;

        // Set access token
        if (CESIUM_ION_TOKEN) {
          Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
        }

        const viewer = new Cesium.Viewer(viewContainerRef.current, {
          // Use dark basemap
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          selectionIndicator: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          vrButton: false,
          // 3D globe
          sceneMode: Cesium.SceneMode.SCENE3D,
          // Use Cesium Ion world terrain if token available
          terrain: CESIUM_ION_TOKEN
            ? Cesium.Terrain.fromWorldTerrain({ requestWaterMask: true })
            : undefined,
          // Base layer
          baseLayer: true,
          // Sky at atmosphere
          skyAtmosphere: true,
          skyBox: true,
          // Dark style
          requestRenderMode: false,
          targetFrameRate: 60,
        });

        if (cancelled) {
          viewer.destroy();
          return;
        }

        // Enable lighting for realistic look
        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.depthTestAgainstTerrain = false;

        // Set atmosphere
        viewer.scene.skyAtmosphere.show = true;

        // Smooth zoom
        viewer.camera.flyHome(0);

        // Position camera to match reference: low-oblique perspective on the Bay of Bengal
        const centerLon = incident.polygon.center[1]; // ~87
        const centerLat = incident.polygon.center[0]; // ~12

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(
            centerLon + 3,
            centerLat - 2,
            3500000 // altitude in meters
          ),
          orientation: {
            heading: Cesium.Math.toRadians(350),
            pitch: Cesium.Math.toRadians(-40),
            roll: 0,
          },
        });

        // Add intelligence layers
        addOilSpillPolygon(Cesium, viewer);
        addVessels(Cesium, viewer);
        addVesselTracks(Cesium, viewer);
        addSatellitePass(Cesium, viewer);
        addMaritimeGrid(Cesium, viewer);
        addDriftPaths(Cesium, viewer);

        viewerRef.current = viewer;
        setIsLoading(false);
      } catch (err: any) {
        console.error("[MARIS] Cesium init failed:", err);
        if (!cancelled) {
          setLoadError(err.message || "Failed to initialize 3D viewer");
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch {}
        viewerRef.current = null;
      }
    };
  }, []);

  // ── Add Oil Spill Polygon ────────────────────────────────────
  const addOilSpillPolygon = useCallback(
    (Cesium: any, viewer: any) => {
      const coords = incident.polygon.coordinates;

      // Convert [lat, lon] to Cesium positions
      const positions = coords.map((c: number[]) =>
        Cesium.Cartesian3.fromDegrees(c[1], c[0])
      );

      // Glow polygon (wider, translucent)
      const glowPolygon = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: new Cesium.Color(0.96, 0.45, 0.09, 0.15),
          outline: true,
          outlineColor: new Cesium.Color(0.96, 0.45, 0.09, 0.4),
          outlineWidth: 4,
          height: 1,
        },
      });
      registerEntity("globe_spill", glowPolygon);

      // Main spill polygon
      const spillPolygon = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: new Cesium.Color(0.83, 0.47, 0.04, 0.35),
          outline: true,
          outlineColor: new Cesium.Color(0.96, 0.45, 0.09, 0.9),
          outlineWidth: 2,
          height: 2,
        },
      });
      registerEntity("globe_spill", spillPolygon);

      // Center marker
      const centerLon = incident.polygon.center[1];
      const centerLat = incident.polygon.center[0];

      const centerPoint = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 100),
        point: {
          pixelSize: 8,
          color: new Cesium.Color(0.96, 0.45, 0.09, 0.8),
          outlineColor: new Cesium.Color(1, 1, 1, 0.6),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      registerEntity("globe_spill", centerPoint);

      // Spill label
      const labelEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat + 0.15),
        label: {
          text: "OIL SPILL DETECTION",
          font: "12px monospace",
          fillColor: Cesium.Color.fromCssColorString("#fb923c").withAlpha(0.9),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -15),
          showBackground: true,
          backgroundColor: new Cesium.Color(0.02, 0.02, 0.03, 0.85),
        },
      });
      registerEntity("globe_spill", labelEntity);

      // Spill detail label
      const detailLabel = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat + 0.08),
        label: {
          text: `Area: ${incident.polygon.areaKm2} km² | Confidence: ${incident.confidence.score}%`,
          font: "10px monospace",
          fillColor: Cesium.Color.fromCssColorString("#a0a0a0").withAlpha(0.9),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          showBackground: true,
          backgroundColor: new Cesium.Color(0.02, 0.02, 0.03, 0.85),
        },
      });
      registerEntity("globe_spill", detailLabel);
    },
    [incident, registerEntity]
  );

  // ── Add Vessels ──────────────────────────────────────────────
  const addVessels = useCallback(
    (Cesium: any, viewer: any) => {
      DEMO_VESSELS.forEach((vessel) => {
        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 50),
          billboard: {
            image: createShipCanvas(vessel, false),
            width: 28,
            height: 28,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: `${vessel.name}  ${vessel.speed}kn → ${vessel.heading}°`,
            font: "10px monospace",
            fillColor: Cesium.Color.fromCssColorString("#b4bec8").withAlpha(0.8),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -18),
            showBackground: true,
            backgroundColor: new Cesium.Color(0.02, 0.02, 0.03, 0.85),
          },
        });
        registerEntity("globe_vessels", entity);
      });
    },
    [registerEntity]
  );

  // ── Add Vessel Tracks ────────────────────────────────────────
  const addVesselTracks = useCallback(
    (Cesium: any, viewer: any) => {
      DEMO_VESSELS.forEach((vessel) => {
        if (vessel.trajectory.length > 1) {
          const positions = vessel.trajectory.map((c: number[]) =>
            Cesium.Cartesian3.fromDegrees(c[1], c[0], 5)
          );

          const polyline = viewer.entities.add({
            polyline: {
              positions,
              width: 1.5,
              material: new Cesium.Color(0.2, 0.53, 0.8, 0.4),
              clampToGround: true,
            },
          });
          registerEntity("globe_tracks", polyline);
        }
      });
    },
    [registerEntity]
  );

  // ── Add Satellite Pass ───────────────────────────────────────
  const addSatellitePass = useCallback(
    (Cesium: any, viewer: any) => {
      const obs = DEMO_SATELLITE_OBSERVATION;

      // Ground track
      if (obs.groundTrack.length > 1) {
        const positions = obs.groundTrack.map((c: number[]) =>
          Cesium.Cartesian3.fromDegrees(c[1], c[0], 100)
        );

        const track = viewer.entities.add({
          polyline: {
            positions,
            width: 1.5,
            material: new Cesium.PolylineDashMaterialProperty({
              color: new Cesium.Color(0.27, 0.8, 0.53, 0.5),
              dashLength: 10,
            }),
            clampToGround: false,
            height: 100,
          },
        });
        registerEntity("globe_satellite", track);
      }

      // Satellite position marker
      const satEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          obs.swathCenter[1] + 1.5,
          obs.swathCenter[0] + 1.2,
          obs.orbitAltitude * 1000
        ),
        label: {
          text: `${obs.satellite}\nPASS 08921`,
          font: "11px monospace",
          fillColor: Cesium.Color.fromCssColorString("#44cc88").withAlpha(0.9),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          showBackground: true,
          backgroundColor: new Cesium.Color(0.02, 0.02, 0.03, 0.85),
          lineHeight: 16,
        },
      });
      registerEntity("globe_satellite", satEntity);

      // Swath footprint
      const swathHalfWidth = obs.swathWidth / 2 / 111000;
      const swathHalfLength = obs.swathLength / 2 / 111000;
      const swathAngle = ((obs.orbitInclination > 90 ? 170 : 10) * Math.PI) / 180;
      const cosA = Math.cos(swathAngle);
      const sinA = Math.sin(swathAngle);
      const scLat = obs.swathCenter[0];
      const scLon = obs.swathCenter[1];

      const corners = [
        [scLon - swathHalfLength * sinA - swathHalfWidth * cosA, scLat - swathHalfLength * cosA + swathHalfWidth * sinA],
        [scLon - swathHalfLength * sinA + swathHalfWidth * cosA, scLat - swathHalfLength * cosA - swathHalfWidth * sinA],
        [scLon + swathHalfLength * sinA + swathHalfWidth * cosA, scLat + swathHalfLength * cosA - swathHalfWidth * sinA],
        [scLon + swathHalfLength * sinA - swathHalfWidth * cosA, scLat + swathHalfLength * cosA + swathHalfWidth * sinA],
      ];

      const swath = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            corners.map((c) => Cesium.Cartesian3.fromDegrees(c[0], c[1]))
          ),
          material: new Cesium.Color(0.27, 0.8, 0.53, 0.06),
          outline: true,
          outlineColor: new Cesium.Color(0.27, 0.8, 0.53, 0.25),
          outlineWidth: 1,
          height: 50,
        },
      });
      registerEntity("globe_satellite", swath);
    },
    [registerEntity]
  );

  // ── Add Maritime Grid ────────────────────────────────────────
  const addMaritimeGrid = useCallback(
    (Cesium: any, viewer: any) => {
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
      gridLines.forEach((pts) => {
        const positions = pts.map((p) => Cesium.Cartesian3.fromDegrees(p[0], p[1], 10));
        const line = viewer.entities.add({
          polyline: {
            positions,
            width: 0.5,
            material: new Cesium.Color(0.32, 0.4, 0.53, 0.25),
            clampToGround: false,
            height: 10,
          },
        });
        registerEntity("globe_grid", line);
      });
    },
    [registerEntity]
  );

  // ── Add Drift Paths (forward + backtrack) ────────────────────
  const addDriftPaths = useCallback(
    (Cesium: any, viewer: any) => {
      // Forward drift path
      if (DEMO_DRIFT.forward.length > 1) {
        const positions = DEMO_DRIFT.forward.map((p) =>
          Cesium.Cartesian3.fromDegrees(p.center[1], p.center[0], 20)
        );
        const fwd = viewer.entities.add({
          polyline: {
            positions,
            width: 2,
            material: new Cesium.PolylineDashMaterialProperty({
              color: new Cesium.Color(0.98, 0.45, 0.09, 0.6),
              dashLength: 12,
            }),
            clampToGround: false,
            height: 20,
          },
        });
        registerEntity("globe_spill", fwd);

        // Time labels on forward drift points
        DEMO_DRIFT.forward.forEach((point, i) => {
          if (i === 0) return;
          const lbl = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(point.center[1], point.center[0], 30),
            label: {
              text: point.time,
              font: "9px monospace",
              fillColor: new Cesium.Color(0.98, 0.45, 0.09, 0.6),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, 10),
              showBackground: true,
              backgroundColor: new Cesium.Color(0.02, 0.02, 0.03, 0.7),
            },
          });
          registerEntity("globe_spill", lbl);
        });
      }

      // Backtrack drift path
      if (DEMO_DRIFT.backtrack.length > 1) {
        const positions = DEMO_DRIFT.backtrack.map((p) =>
          Cesium.Cartesian3.fromDegrees(p.center[1], p.center[0], 20)
        );
        const bt = viewer.entities.add({
          polyline: {
            positions,
            width: 1.5,
            material: new Cesium.PolylineDashMaterialProperty({
              color: new Cesium.Color(0.65, 0.55, 0.98, 0.45),
              dashLength: 8,
            }),
            clampToGround: false,
            height: 20,
          },
        });
        registerEntity("globe_spill", bt);
      }
    },
    [registerEntity]
  );

  // ── Create ship canvas icon ──────────────────────────────────
  const createShipCanvas = (vessel: AisVessel, selected: boolean): HTMLCanvasElement => {
    const size = selected ? 36 : 28;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const fill = selected ? "#22d3ee" : "#55aaff";
    const stroke = selected ? "#22d3ee" : "#ffffff";
    const heading = vessel.heading;

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((heading * Math.PI) / 180);

    // Ship hull triangle
    ctx.beginPath();
    ctx.moveTo(0, -size / 2.5);
    ctx.lineTo(-size / 5, size / 5);
    ctx.lineTo(size / 5, size / 5);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.stroke();

    // Bridge rect
    ctx.fillStyle = selected ? "#0e7490" : "#3388cc";
    ctx.fillRect(-size / 8, size / 8, size / 4, size / 6);
    ctx.strokeRect(-size / 8, size / 8, size / 4, size / 6);

    ctx.restore();

    return canvas;
  };

  // ── Fly to spill ──────────────────────────────────────────────
  const flyToSpill = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const Cesium = window.Cesium;
    const centerLon = incident.polygon.center[1];
    const centerLat = incident.polygon.center[0];

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centerLon + 3, centerLat - 2, 3500000),
      orientation: {
        heading: Cesium.Math.toRadians(350),
        pitch: Cesium.Math.toRadians(-40),
        roll: 0,
      },
      duration: 2,
    });
  }, [incident]);

  // ── Handle vessel selection ──────────────────────────────────
  const handleVesselSelect = useCallback(
    (vessel: AisVessel) => {
      setSelectedVessel(vessel);
      const viewer = viewerRef.current;
      if (!viewer) return;

      const Cesium = window.Cesium;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(vessel.lon + 1.5, vessel.lat - 1, 800000),
        orientation: {
          heading: Cesium.Math.toRadians(350),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 2,
      });
    },
    []
  );

  // ── Toggle layer ──────────────────────────────────────────────
  const toggleLayer = useCallback((id: Globe3dLayerId) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l))
    );
  }, []);

  // ── Sync entity visibility with layer toggles ────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const enabled = (id: Globe3dLayerId) =>
      layers.find((l) => l.id === id)?.enabled ?? true;
    Object.entries(registryRef.current).forEach(([layerId, entities]) => {
      const isOn = enabled(layerId as Globe3dLayerId);
      entities.forEach((e) => {
        if (e && typeof e.show === "boolean") e.show = isOn;
      });
    });
  }, [layers]);

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
  }, [isPlaying, playSpeed]);

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
              <div className="text-[11px] font-bold tracking-wider text-zinc-100 uppercase">
                maris
              </div>
              <div className="text-[7px] text-zinc-500 uppercase tracking-wider leading-none">
                Maritime Intelligence
              </div>
            </div>
          </div>
          <div className="h-6 w-px bg-zinc-800" />
          <StatusMetric
            label="UTC TIME"
            value={
              new Date()
                .toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
                .toUpperCase() +
              "  " +
              new Date().toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            }
          />
          <StatusMetric label="ACTIVE VESSELS" value={`${DEMO_VESSELS.length}`} />
          <StatusMetric label="DETECTIONS" value="3" />
          <StatusMetric label="SATELLITE" value="SENTINEL-1A" />
          <StatusMetric
            label="WIND"
            value={`${DEMO_ENVIRONMENTAL.windSpeed} kn ${DEMO_ENVIRONMENTAL.windDirectionLabel}`}
          />
          <StatusMetric label="SEA STATE" value="MODERATE" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-[9px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="size-3" /> Back
          </button>
          <div className="rounded bg-cyan-500/15 border border-cyan-500/30 px-3 py-1.5">
            <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider">
              3D Intelligence
            </span>
          </div>
          <div className="rounded border border-zinc-700 bg-zinc-800/50 px-2 py-1.5">
            <span className="text-[7px] font-semibold text-amber-400/70 uppercase tracking-wider">
              Demo Data
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT PANEL ────────────────────────────────────── */}
        <aside className="w-56 border-r border-zinc-800/50 bg-[#060a10]/95 flex flex-col overflow-hidden z-20">
          <div className="px-3 py-2.5 border-b border-zinc-800/50">
            <h2 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
              Vessels
            </h2>
          </div>
          <div className="px-3 py-2 border-b border-zinc-800/50">
            <div className="flex items-center gap-1.5 rounded border border-zinc-700/50 bg-zinc-800/30 px-2 py-1">
              <Search className="size-3 text-zinc-500" />
              <input
                type="text"
                placeholder="Search vessel or MMSI"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-[10px] text-zinc-300 placeholder-zinc-600 outline-none"
              />
              <Filter className="size-3 text-zinc-600" />
            </div>
          </div>
          <div className="px-3 py-1.5 border-b border-zinc-800/50">
            <span className="text-[8px] px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-medium">
              ALL {DEMO_VESSELS.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredVessels.map((v) => {
              const attr = DEMO_ATTRIBUTIONS.find((a) => a.vesselId === v.mmsi);
              const sel = selectedVessel?.mmsi === v.mmsi;
              return (
                <button
                  key={v.mmsi}
                  onClick={() => handleVesselSelect(v)}
                  className={cn(
                    "w-full text-left px-3 py-2 border-b border-zinc-800/30 transition-colors",
                    sel ? "bg-cyan-500/8" : "hover:bg-zinc-800/30"
                  )}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-semibold text-zinc-200">
                      {v.name}
                    </span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                      ACTIVE
                    </span>
                  </div>
                  <div className="text-[8px] text-zinc-500 font-mono mb-0.5">
                    MMSI {v.mmsi}
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-zinc-400">
                    <span>{v.speed} kn</span>
                    <span>→ {v.heading}°</span>
                  </div>
                  {attr && (
                    <div className="mt-1 text-[8px] font-bold text-orange-400">
                      Source: {attr.overallScore}/100
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-zinc-800/50">
            <button
              onClick={flyToSpill}
              className="w-full text-center text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors py-1"
            >
              VIEW SPILL LOCATION
            </button>
          </div>
          <div className="px-3 py-2.5 border-t border-zinc-800/50">
            <h3 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers className="size-3" />
              Layers
            </h3>
            <div className="space-y-1">
              {layers.map((l) => (
                <button
                  key={l.id}
                  onClick={() => toggleLayer(l.id)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <div className="text-[8px] text-zinc-600">✦</div>
                  <span className="text-[10px] text-zinc-400 flex-1">{l.label}</span>
                  <div
                    className={cn(
                      "w-7 h-3.5 rounded-full transition-colors relative",
                      l.enabled ? "bg-cyan-500/30" : "bg-zinc-700/50"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all",
                        l.enabled ? "left-3.5 bg-cyan-400" : "left-0.5 bg-zinc-500"
                      )}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ─── CESIUM 3D VIEWER ─────────────────────────────── */}
        <main className="flex-1 relative">
          <div
            ref={viewContainerRef}
            className="absolute inset-0"
            style={{ width: "100%", height: "100%" }}
          />

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#020508]">
              <div className="text-center">
                <div className="flex justify-center mb-3">
                  <div className="size-10 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
                </div>
                <div className="text-[11px] text-zinc-300 font-medium mb-1">
                  Initializing 3D Intelligence View...
                </div>
                <div className="text-[9px] text-zinc-600">
                  Loading CesiumJS geospatial engine
                </div>
              </div>
            </div>
          )}

          {/* Error overlay */}
          {loadError && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#020508]">
              <div className="text-center max-w-md p-6">
                <div className="text-red-400 text-[11px] font-medium mb-2">
                  3D Viewer Failed to Load
                </div>
                <div className="text-[9px] text-zinc-500 mb-4">{loadError}</div>
                <div className="text-[9px] text-zinc-600 mb-4">
                  {!CESIUM_ION_TOKEN
                    ? "VITE_CESIUM_ION_ACCESS_TOKEN not set. Add it to your environment variables."
                    : "Check your network connection and Cesium Ion token."}
                </div>
                <button
                  onClick={onBack}
                  className="text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  ← Back to Dashboard
                </button>
              </div>
            </div>
          )}

          {/* Compass / nav buttons */}
          <div className="absolute bottom-20 left-6 z-10">
            <div className="flex flex-col items-center gap-0.5">
              <button className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300">
                <ChevronRight className="size-3 rotate-[-90deg]" />
              </button>
              <div className="flex gap-0.5">
                <button className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300">
                  <ChevronRight className="size-3 rotate-[180deg]" />
                </button>
                <button className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300">
                  <Crosshair className="size-3" />
                </button>
                <button className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300">
                  <ChevronRight className="size-3" />
                </button>
              </div>
              <button className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300">
                <ChevronRight className="size-3 rotate-90" />
              </button>
            </div>
          </div>

          {/* ─── BOTTOM TIMELINE ─────────────────────────────── */}
          <div className="absolute bottom-0 left-0 right-0 z-20">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-[#060a10]/95 border-t border-zinc-800/50 backdrop-blur-sm">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <button
                onClick={() => setPlaySpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
                className="text-[9px] text-zinc-500 hover:text-zinc-300 font-mono min-w-[20px]"
              >
                {playSpeed}x
              </button>
              <div className="h-4 w-px bg-zinc-800" />
              <div className="flex-1 flex items-center gap-2">
                <span className="text-[8px] font-mono text-zinc-600">08:45</span>
                <div className="flex-1 relative">
                  <div className="h-0.5 bg-zinc-800 rounded-full w-full" />
                  <div
                    className="absolute top-0 h-0.5 bg-cyan-500/50 rounded-full"
                    style={{
                      width: `${(timeStep / (timeSteps.length - 1)) * 100}%`,
                    }}
                  />
                  <div className="flex justify-between mt-1">
                    {["09:00", "09:15", "09:30", "09:45", "10:00", "10:15"].map(
                      (t) => (
                        <span key={t} className="text-[7px] font-mono text-zinc-700">
                          {t}
                        </span>
                      )
                    )}
                  </div>
                  <div
                    className="absolute -top-1.5 w-3 h-3 rounded-full bg-cyan-400 border-2 border-[#060a10] cursor-pointer"
                    style={{
                      left: `calc(${(timeStep / (timeSteps.length - 1)) * 100}% - 6px)`,
                    }}
                  />
                </div>
                <span className="text-[8px] font-mono text-zinc-600">10:15</span>
              </div>
              <div className="h-4 w-px bg-zinc-800" />
              <span className="text-[10px] font-mono text-zinc-300 font-semibold">
                {timeSteps[timeStep]}
              </span>
              <div className="h-4 w-px bg-zinc-800" />
              <div className="flex items-center gap-0.5">
                {(["now", "3h", "6h", "12h", "24h"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={cn(
                      "text-[8px] px-2 py-0.5 rounded font-medium transition-colors",
                      timeRange === r
                        ? "bg-cyan-500/15 text-cyan-400"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>

        {/* ─── RIGHT PANEL ──────────────────────────────────── */}
        <aside className="w-72 border-l border-zinc-800/50 bg-[#060a10]/95 flex flex-col overflow-y-auto z-20">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800/50">
            <h2 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
              Detection Event
            </h2>
            <button onClick={onBack} className="text-zinc-600 hover:text-zinc-300">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="p-3 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-zinc-100">
                {incident.incidentNumber}
              </span>
              <span className="text-[7px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-bold uppercase">
                High Confidence
              </span>
            </div>
            <div className="space-y-2.5">
              <EvtField
                label="DETECTED"
                value={
                  new Date(incident.detectedAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  }) + " UTC"
                }
              />
              <EvtField
                label="LOCATION"
                value={`${incident.coordinates[0].toFixed(2)}° N, ${incident.coordinates[1].toFixed(2)}° E`}
              />
              <EvtField label="AREA" value={`${incident.polygon.areaKm2} km²`} />
              <EvtField
                label="CONFIDENCE"
                value={`${incident.confidence.score}%`}
                color="text-cyan-400"
              />
              <EvtField label="SOURCE" value="Sentinel-1A (SAR)" />
            </div>

            {/* Event Timeline */}
            <div>
              <h3 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                Event Timeline
              </h3>
              <div className="space-y-1.5">
                {eventTimeline.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div
                      className="mt-1 w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: ev.color + "60",
                        border: `1px solid ${ev.color}`,
                      }}
                    />
                    <div>
                      <span className="text-[9px] font-mono text-zinc-400">
                        {ev.time}
                      </span>
                      <span className="text-[9px] text-zinc-500 ml-2">{ev.event}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Affected Vessels */}
            <div>
              <h3 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                Affected Vessels
              </h3>
              <div className="space-y-2">
                {affectedVessels.map((v, i) => (
                  <button
                    key={v.mmsi}
                    onClick={() => handleVesselSelect(v)}
                    className="w-full text-left flex items-start gap-2 hover:bg-zinc-800/30 rounded p-1 -mx-1 transition-colors"
                  >
                    <Ship className="size-3 text-zinc-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-300">
                        {v.name}
                      </div>
                      <div className="text-[9px] text-zinc-500">
                        {v.speed} kn → {v.heading}° · {(6 + i * 2.5).toFixed(1)} nm
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Confidence Factors */}
            <div>
              <h3 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                Confidence Factors
              </h3>
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
                <h3 className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider mb-1.5">
                  Probable Source
                </h3>
                <div className="text-[11px] font-semibold text-zinc-200">
                  {DEMO_ATTRIBUTIONS[0].vesselName}
                </div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-[16px] font-bold text-cyan-400">
                    {DEMO_ATTRIBUTIONS[0].overallScore}
                  </span>
                  <span className="text-[9px] text-zinc-500">/100 confidence</span>
                </div>
                <div className="mt-1.5 space-y-0.5">
                  {DEMO_ATTRIBUTIONS[0].reasons.slice(0, 3).map((r, i) => (
                    <div key={i} className="text-[8px] text-zinc-500">
                      {r}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="w-full rounded border border-zinc-700 bg-zinc-800/30 py-2 text-[10px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors uppercase tracking-wider">
              View Full Report
            </button>

            {/* Demo disclaimer */}
            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
              <div className="text-[8px] text-amber-400/70 leading-relaxed">
                Demonstration data — vessel identities, detection results, and
                environmental conditions are synthetic. Not derived from live
                satellite or AIS feeds.
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── HELPERS ────────────────────────────────────────────────────────

function StatusMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[7px] text-zinc-600 uppercase tracking-wider leading-none mb-0.5">
        {label}
      </div>
      <div className="text-[10px] font-semibold text-zinc-200 font-mono leading-none">
        {value}
      </div>
    </div>
  );
}

function EvtField({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <div className="text-[7px] text-zinc-600 uppercase tracking-wider leading-none mb-0.5">
        {label}
      </div>
      <div
        className={cn("text-[10px] font-mono text-zinc-300", color)}
      >
        {value}
      </div>
    </div>
  );
}
