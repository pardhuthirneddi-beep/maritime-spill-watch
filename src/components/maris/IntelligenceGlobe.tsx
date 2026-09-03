// maris — 3D Geospatial Intelligence Globe
// Maritime command center visualization using CesiumJS
import { useRef, useEffect, useState, useCallback } from "react";
import * as Cesium from "cesium";
import {
  ArrowLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Filter,
  Layers,
  Navigation,
  Pause,
  Play,
  Radar,
  Search,
  Ship,
  Target,
  Wind,
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

// Set Cesium Ion token (free tier works without token for basic imagery)
// @ts-expect-error - Cesium global setup
window.CESIUM_BASE_URL = "/static/cesium/";

interface IntelligenceGlobeProps {
  onBack: () => void;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────

export default function IntelligenceGlobe({ onBack }: IntelligenceGlobeProps) {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<AisVessel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [vesselFilter, setVesselFilter] = useState<"all" | "near" | "watch">("all");
  const [layers, setLayers] = useState<Globe3dLayer[]>([
    { id: "globe_vessels", label: "Vessels", enabled: true },
    { id: "globe_tracks", label: "Vessel Tracks", enabled: true },
    { id: "globe_spill", label: "Oil Spill Detections", enabled: true },
    { id: "globe_satellite", label: "Satellite Passes", enabled: true },
    { id: "globe_boundaries", label: "Coastline", enabled: true },
    { id: "globe_grid", label: "Maritime Zones", enabled: false },
    { id: "globe_detection_zones", label: "Detection Zone", enabled: true },
  ]);
  const [timeStep, setTimeStep] = useState(5);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [timeRange, setTimeRange] = useState<"now" | "3h" | "6h" | "12h" | "24h">("now");

  const incident = DEMO_INCIDENT;

  const timeSteps = ["08:45", "09:00", "09:05", "09:12", "09:17", "09:28", "09:31", "09:42", "09:48", "09:50", "09:52", "09:54", "09:56", "10:00", "10:02", "10:05"];

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
    if (vesselFilter === "near") {
      const d = Math.sqrt((v.lat - incident.polygon.center[0]) ** 2 + (v.lon - incident.polygon.center[1]) ** 2);
      return d < 0.05;
    }
    return true;
  });

  // Initialize Cesium viewer
  useEffect(() => {
    if (!cesiumContainerRef.current || viewerRef.current) return;

    // Set base URL for Cesium assets
    // @ts-expect-error - Cesium global
    window.CESIUM_BASE_URL = "/static/cesium/";

    const viewer = new Cesium.Viewer(cesiumContainerRef.current, {
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
      infoBox: false,
      shadows: false,
      shouldAnimate: true,
    });

    // Replace default imagery with OSM
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        subdomains: ["a", "b", "c"],
        maximumLevel: 18,
      })
    );

    // Darken the globe for maritime theme
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#020508");
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0a1628");

    // Enable atmosphere
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;

    // Enable fog for depth
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.0002;

    // Smooth camera controls
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(87.0, 12.0, 2500000),
      orientation: {
        heading: Cesium.Math.toRadians(10),
        pitch: Cesium.Math.toRadians(-35),
        roll: 0,
      },
      duration: 2,
    });

    viewerRef.current = viewer;

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // Add entities when viewer is ready
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const entities = viewer.entities;

    // ── OIL SPILL POLYGON ────────────────────────────────────────
    const spillPositions = incident.polygon.coordinates.map((c) =>
      Cesium.Cartesian3.fromDegrees(c[1], c[0])
    );

    entities.add({
      id: "spill-polygon",
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(spillPositions),
        material: Cesium.Color.fromCssColorString("#d4770a").withAlpha(0.3),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#fb923c"),
        outlineWidth: 2,
        height: 10,
      },
    });

    // Spill center marker
    entities.add({
      id: "spill-center",
      position: Cesium.Cartesian3.fromDegrees(incident.polygon.center[1], incident.polygon.center[0], 500),
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString("#fb923c"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: `OIL SPILL DETECTION\nArea: ${incident.polygon.areaKm2} km²\nConfidence: ${incident.confidence.score}%`,
        font: "13px monospace",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#0a0b10").withAlpha(0.8),
      },
    });

    // ── AIS VESSELS ──────────────────────────────────────────────
    DEMO_VESSELS.forEach((vessel) => {
      // Vessel marker
      entities.add({
        id: `vessel-${vessel.mmsi}`,
        position: Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 100),
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString("#55aaff"),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      label: {
        text: vessel.name,
        font: "11px monospace",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -15),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#0a0b10").withAlpha(0.7),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      });

      // Vessel track
      if (vessel.trajectory.length > 1) {
        const trackPositions = vessel.trajectory.map((c) =>
          Cesium.Cartesian3.fromDegrees(c[1], c[0])
        );

        entities.add({
          id: `track-${vessel.mmsi}`,
          polyline: {
            positions: trackPositions,
            width: 2,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.1,
              color: Cesium.Color.fromCssColorString("#3388cc").withAlpha(0.6),
            }),
          },
        });
      }
    });

    // ── SATELLITE OBSERVATION ────────────────────────────────────
    const obs = DEMO_SATELLITE_OBSERVATION;

    // Ground track
    if (obs.groundTrack.length > 1) {
      const trackPositions = obs.groundTrack.map((c) =>
        Cesium.Cartesian3.fromDegrees(c[1], c[0])
      );

      entities.add({
        id: "satellite-track",
        polyline: {
          positions: trackPositions,
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString("#44cc88"),
            dashLength: 16,
          }),
        },
      });
    }

    // Satellite position
    entities.add({
      id: "satellite",
      position: Cesium.Cartesian3.fromDegrees(
        obs.swathCenter[1],
        obs.swathCenter[0],
        obs.orbitAltitude * 1000
      ),
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString("#44cc88"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: `${obs.satellite}\nPass: ${new Date(obs.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC`,
        font: "11px monospace",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#0a0b10").withAlpha(0.7),
      },
    });

    // ── DRIFT PATH ───────────────────────────────────────────────
    if (DEMO_DRIFT.forward.length > 1) {
      const driftPositions = DEMO_DRIFT.forward.map((p) =>
        Cesium.Cartesian3.fromDegrees(p.center[1], p.center[0])
      );

      entities.add({
        id: "drift-forward",
        polyline: {
          positions: driftPositions,
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.6),
            dashLength: 16,
          }),
        },
      });
    }

  }, []);

  // Handle vessel selection
  const handleVesselSelect = useCallback((vessel: AisVessel) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    setSelectedVessel(vessel);

    // Fly to vessel
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 800000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: 1.5,
    });

    // Highlight vessel
    const entity = viewer.entities.getById(`vessel-${vessel.mmsi}`);
    if (entity && entity.point) {
      entity.point.color = new Cesium.ConstantProperty(Cesium.Color.fromCssColorString("#22d3ee"));
      entity.point.outlineColor = new Cesium.ConstantProperty(Cesium.Color.WHITE);
      entity.point.outlineWidth = new Cesium.ConstantProperty(3);
    }
  }, []);

  // Fly to spill
  const flyToSpill = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        incident.polygon.center[1],
        incident.polygon.center[0],
        1500000
      ),
      orientation: {
        heading: Cesium.Math.toRadians(10),
        pitch: Cesium.Math.toRadians(-35),
        roll: 0,
      },
      duration: 1.5,
    });
  }, [incident]);

  // Toggle layer visibility
  const toggleLayer = useCallback((id: Globe3dLayerId) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)));
  }, []);

  // Playback
  useEffect(() => {
    if (!isPlaying) return;
    const iv = setInterval(() => {
      setTimeStep((p) => { if (p >= timeSteps.length - 1) { setIsPlaying(false); return p; } return p + 1; });
    }, 1000 / playSpeed);
    return () => clearInterval(iv);
  }, [isPlaying, playSpeed, timeSteps.length]);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#020508] text-zinc-100 overflow-hidden select-none">

      {/* ─── TOP BAR ──────────────────────────────────────────── */}
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
        <aside className="flex h-full z-20">
          <div className="w-10 flex flex-col items-center gap-1 py-2 border-r border-zinc-800/50 bg-[#060a10]/95">
            {[Search, Ship, Layers, Target, Radar, Compass, Wind].map((Icon, i) => (
              <button key={i} className={cn("flex size-7 items-center justify-center rounded transition-colors", i === 1 ? "bg-cyan-500/15 text-cyan-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800")}>
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>

          <div className="w-56 border-r border-zinc-800/50 bg-[#060a10]/95 flex flex-col overflow-hidden">
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
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800/50">
              {([["all", `ALL ${DEMO_VESSELS.length}`], ["near", "NEAR SPILL 6"], ["watch", "WATCHLIST 2"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setVesselFilter(k)} className={cn("text-[8px] px-2 py-0.5 rounded transition-colors", vesselFilter === k ? "bg-cyan-500/15 text-cyan-400" : "text-zinc-500 hover:text-zinc-300")}>{l}</button>
              ))}
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
                      <span>{v.speed} kn</span><span>› {v.heading}°</span>
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
          </div>
        </aside>

        {/* ─── CESIUM GLOBE ──────────────────────────────────── */}
        <main className="flex-1 relative">
          <div ref={cesiumContainerRef} className="absolute inset-0 cesium-viewer" />

          {/* Compass nav */}
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
            <div>
              <h3 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Affected Vessels</h3>
              <div className="space-y-2">
                {DEMO_VESSELS.slice(0, 3).map((v, i) => (
                  <div key={v.mmsi} className="flex items-start gap-2">
                    <Ship className="size-3 text-zinc-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-300">{v.name}</div>
                      <div className="text-[9px] text-zinc-500">{v.speed} kn › {v.heading}° · {(6 + i * 2.5).toFixed(1)} nm</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button className="w-full rounded border border-zinc-700 bg-zinc-800/30 py-2 text-[10px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors uppercase tracking-wider">View Full Report</button>
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
