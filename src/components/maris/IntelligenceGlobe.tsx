// maris — 3D Geospatial Intelligence Globe
// Maritime command center visualization using Leaflet with dark basemap
import { useRef, useEffect, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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

const CARTO_API_KEY = "cb1_2u58_1_bf57649a9ebd93a4418be433";

// ── SVG marker helpers ─────────────────────────────────────────────

function vesselSvg(color: string, heading: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <g transform="rotate(${heading}, 14, 14)">
      <circle cx="14" cy="14" r="6" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="1.5"/>
      <polygon points="14,4 11,10 17,10" fill="${color}" fill-opacity="0.7"/>
    </g>
  </svg>`;
}

function selectedVesselSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
    <circle cx="18" cy="18" r="14" fill="none" stroke="#22d3ee" stroke-width="2" stroke-dasharray="4,3" opacity="0.8">
      <animateTransform attributeName="transform" type="rotate" from="0 18 18" to="360 18 18" dur="4s" repeatCount="indefinite"/>
    </circle>
    <circle cx="18" cy="18" r="7" fill="#22d3ee" fill-opacity="0.9" stroke="#fff" stroke-width="2"/>
    <polygon points="18,6 15,12 21,12" fill="#22d3ee" fill-opacity="0.7"/>
  </svg>`;
}

interface IntelligenceGlobeProps {
  onBack: () => void;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────

export default function IntelligenceGlobe({ onBack }: IntelligenceGlobeProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupsRef = useRef<Map<string, L.LayerGroup>>(new Map());
  const [selectedVessel, setSelectedVessel] = useState<AisVessel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [vesselFilter, setVesselFilter] = useState<"all" | "near">("all");
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

  // ── Layer name to group mapping ────────────────────────────────
  const layerGroupMap: Record<Globe3dLayerId, string> = {
    globe_vessels: "vessels",
    globe_tracks: "tracks",
    globe_spill: "spill",
    globe_satellite: "satellite",
    globe_boundaries: "grid",
    globe_grid: "grid",
    globe_detection_zones: "spill",
  };

  // ── Initialize Leaflet map ─────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [incident.polygon.center[0], incident.polygon.center[1]],
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    });

    // Dark Carto basemap
    L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
      {
        subdomains: "abcd",
        maxZoom: 18,
      }
    ).addTo(map);

    // Create layer groups
    const groupNames = ["vessels", "tracks", "spill", "satellite", "grid"];
    const groupMap = new Map<string, L.LayerGroup>();
    groupNames.forEach((name) => {
      const lg = L.layerGroup().addTo(map);
      groupMap.set(name, lg);
    });
    layerGroupsRef.current = groupMap;

    // ── OIL SPILL ────────────────────────────────────────────────
    const spillGroup = groupMap.get("spill")!;

    // Spill polygon fill
    const spillCoords: L.LatLngExpression[] = incident.polygon.coordinates.map((c) => [c[0], c[1]]);
    L.polygon(spillCoords, {
      color: "#fb923c",
      weight: 2,
      opacity: 0.9,
      fillColor: "#d4770a",
      fillOpacity: 0.25,
    }).addTo(spillGroup);

    // Glow outline
    L.polygon(spillCoords, {
      color: "#f97316",
      weight: 6,
      opacity: 0.12,
      fillColor: "transparent",
    }).addTo(spillGroup);

    // Spill center marker
    L.circleMarker([incident.polygon.center[0], incident.polygon.center[1]], {
      radius: 6,
      color: "#fb923c",
      fillColor: "#fb923c",
      fillOpacity: 0.9,
      weight: 2,
    })
      .addTo(spillGroup)
      .bindTooltip(
        `<div style="font-family:monospace;font-size:11px;line-height:1.4">
          <strong>OIL SPILL DETECTION</strong><br/>
          Area: ${incident.polygon.areaKm2} km²<br/>
          Length: ${incident.polygon.lengthKm} km<br/>
          Confidence: ${incident.confidence.score}%
        </div>`,
        { permanent: true, direction: "top", offset: [0, -12], className: "maris-tooltip" }
      );

    // Detection zone ring (15km)
    L.circle([incident.polygon.center[0], incident.polygon.center[1]], {
      radius: 15000,
      color: "#fb923c",
      weight: 1,
      opacity: 0.25,
      fillColor: "#fb923c",
      fillOpacity: 0.04,
      dashArray: "5,5",
    }).addTo(spillGroup);

    // ── DRIFT PATHS ─────────────────────────────────────────────
    // Forward drift
    if (DEMO_DRIFT.forward.length > 1) {
      const fwdPoints: L.LatLngExpression[] = DEMO_DRIFT.forward.map((p) => [p.center[0], p.center[1]]);
      L.polyline(fwdPoints, {
        color: "#f97316",
        weight: 2,
        opacity: 0.5,
        dashArray: "8,6",
      }).addTo(spillGroup);
    }

    // Backtrack
    if (DEMO_DRIFT.backtrack.length > 1) {
      const btPoints: L.LatLngExpression[] = DEMO_DRIFT.backtrack.map((p) => [p.center[0], p.center[1]]);
      L.polyline(btPoints, {
        color: "#a78bfa",
        weight: 2,
        opacity: 0.4,
        dashArray: "6,6",
      }).addTo(spillGroup);
    }

    // ── AIS VESSELS ──────────────────────────────────────────────
    const vesselGroup = groupMap.get("vessels")!;
    const trackGroup = groupMap.get("tracks")!;

    DEMO_VESSELS.forEach((vessel) => {
      const icon = L.divIcon({
        html: vesselSvg("#55aaff", vessel.heading),
        className: "",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([vessel.lat, vessel.lon], { icon })
        .addTo(vesselGroup)
        .bindTooltip(
          `<div style="font-family:monospace;font-size:10px;line-height:1.4">
            <strong>${vessel.name}</strong><br/>
            MMSI: ${vessel.mmsi}<br/>
            ${vessel.vesselType}<br/>
            Speed: ${vessel.speed} kn<br/>
            Heading: ${vessel.heading}°<br/>
            Dest: ${vessel.destination}
          </div>`,
          { className: "maris-tooltip", direction: "top", offset: [0, -16] }
        );

      marker.on("click", () => handleVesselSelect(vessel));

      // Vessel track
      if (vessel.trajectory.length > 1) {
        const trackPoints: L.LatLngExpression[] = vessel.trajectory.map((c) => [c[0], c[1]]);
        L.polyline(trackPoints, {
          color: "#3388cc",
          weight: 2,
          opacity: 0.45,
        }).addTo(trackGroup);

        // Track direction arrow at midpoint
        if (vessel.trajectory.length >= 3) {
          const midIdx = Math.floor(vessel.trajectory.length / 2);
          const prevIdx = Math.max(0, midIdx - 1);
          const angle =
            (Math.atan2(
              vessel.trajectory[midIdx][1] - vessel.trajectory[prevIdx][1],
              vessel.trajectory[midIdx][0] - vessel.trajectory[prevIdx][0]
            ) *
              180) /
            Math.PI;
          L.marker([vessel.trajectory[midIdx][0], vessel.trajectory[midIdx][1]], {
            icon: L.divIcon({
              html: `<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid #3388cc;transform:rotate(${-angle + 90}deg);opacity:0.6"></div>`,
              className: "",
              iconSize: [10, 10],
              iconAnchor: [5, 5],
            }),
          }).addTo(trackGroup);
        }
      }
    });

    // ── SATELLITE OBSERVATION ────────────────────────────────────
    const satGroup = groupMap.get("satellite")!;
    const obs = DEMO_SATELLITE_OBSERVATION;

    // Ground track
    if (obs.groundTrack.length > 1) {
      const trackPts: L.LatLngExpression[] = obs.groundTrack.map((c) => [c[0], c[1]]);
      L.polyline(trackPts, {
        color: "#44cc88",
        weight: 2,
        opacity: 0.6,
        dashArray: "6,4",
      }).addTo(satGroup);
    }

    // Satellite marker
    const satIcon = L.divIcon({
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <polygon points="12,2 8,10 16,10" fill="#44cc88" stroke="#fff" stroke-width="1"/>
        <circle cx="12" cy="12" r="3" fill="#44cc88" stroke="#fff" stroke-width="1"/>
        <line x1="12" y1="15" x2="12" y2="22" stroke="#44cc88" stroke-width="1" stroke-dasharray="2,2"/>
      </svg>`,
      className: "",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    L.marker([obs.swathCenter[0], obs.swathCenter[1]], { icon: satIcon })
      .addTo(satGroup)
      .bindTooltip(
        `<div style="font-family:monospace;font-size:10px;line-height:1.4">
          <strong>${obs.satellite}</strong><br/>
          Pass: ${new Date(obs.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC<br/>
          Altitude: ${obs.orbitAltitude} km<br/>
          Swath: ${obs.swathWidth} km
        </div>`,
        { className: "maris-tooltip" }
      );

    // Swath footprint
    const swathHalfWidth = obs.swathWidth / 2 / 111000;
    const swathHalfLength = obs.swathLength / 2 / 111000;
    const swathAngle = ((obs.orbitInclination > 90 ? 170 : 10) * Math.PI) / 180;
    const cosA = Math.cos(swathAngle);
    const sinA = Math.sin(swathAngle);
    const scLat = obs.swathCenter[0];
    const scLon = obs.swathCenter[1];

    const swathCorners: L.LatLngExpression[] = [
      [scLat - swathHalfLength * cosA + swathHalfWidth * sinA, scLon - swathHalfLength * sinA - swathHalfWidth * cosA],
      [scLat - swathHalfLength * cosA - swathHalfWidth * sinA, scLon - swathHalfLength * sinA + swathHalfWidth * cosA],
      [scLat + swathHalfLength * cosA - swathHalfWidth * sinA, scLon + swathHalfLength * sinA + swathHalfWidth * cosA],
      [scLat + swathHalfLength * cosA + swathHalfWidth * sinA, scLon + swathHalfLength * sinA - swathHalfWidth * cosA],
    ];

    L.polygon(swathCorners, {
      color: "#44cc88",
      weight: 1,
      opacity: 0.3,
      fillColor: "#44cc88",
      fillOpacity: 0.06,
      dashArray: "4,4",
    }).addTo(satGroup);

    // Ground-to-sat line
    L.polyline(
      [
        [obs.swathCenter[0], obs.swathCenter[1]],
        [obs.swathCenter[0], obs.swathCenter[1]],
      ],
      { color: "#44cc88", weight: 1, opacity: 0.3, dashArray: "3,3" }
    ).addTo(satGroup);

    // ── GRID LINES ───────────────────────────────────────────────
    const gridGroup = groupMap.get("grid")!;

    for (let lat = 5; lat <= 20; lat += 5) {
      const pts: L.LatLngExpression[] = [];
      for (let lon = 80; lon <= 95; lon += 0.5) pts.push([lat, lon]);
      L.polyline(pts, { color: "#334155", weight: 0.5, opacity: 0.3 }).addTo(gridGroup);
    }
    for (let lon = 80; lon <= 95; lon += 3) {
      const pts: L.LatLngExpression[] = [];
      for (let lat = 5; lat <= 20; lat += 0.5) pts.push([lat, lon]);
      L.polyline(pts, { color: "#334155", weight: 0.5, opacity: 0.3 }).addTo(gridGroup);
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // ── Layer visibility toggle ────────────────────────────────────
  useEffect(() => {
    const groupMap = layerGroupsRef.current;
    layers.forEach((layer) => {
      const groupName = layerGroupMap[layer.id];
      const group = groupMap.get(groupName);
      if (!group) return;
      if (layer.enabled) {
        if (!mapInstanceRef.current?.hasLayer(group)) {
          mapInstanceRef.current?.addLayer(group);
        }
      } else {
        if (mapInstanceRef.current?.hasLayer(group)) {
          mapInstanceRef.current?.removeLayer(group);
        }
      }
    });
  }, [layers]);

  // ── Handle vessel selection ─────────────────────────────────────
  const handleVesselSelect = useCallback(
    (vessel: AisVessel) => {
      setSelectedVessel(vessel);
      const map = mapInstanceRef.current;
      if (!map) return;

      map.flyTo([vessel.lat, vessel.lon], 13, { duration: 1.5 });
    },
    []
  );

  // ── Fly to spill ──────────────────────────────────────────────
  const flyToSpill = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo([incident.polygon.center[0], incident.polygon.center[1]], 11, { duration: 1.5 });
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
              {([["all", `ALL ${DEMO_VESSELS.length}`], ["near", "NEAR SPILL"]] as const).map(([k, l]) => (
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

        {/* ─── MAP ──────────────────────────────────────────── */}
        <main className="flex-1 relative">
          <div ref={mapRef} className="absolute inset-0 z-0" style={{ width: "100%", height: "100%" }} />

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
              <EvtField label="LENGTH" value={`${incident.polygon.lengthKm} km`} />
              <EvtField label="CONFIDENCE" value={`${incident.confidence.score}%`} color="text-cyan-400" />
              <EvtField label="SOURCE" value="Sentinel-1A (SAR)" />
              <EvtField label="WATER DEPTH" value={`${incident.waterDepth} m`} />
              <EvtField label="SEA STATE" value={incident.seaState} />
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
                  <button key={v.mmsi} onClick={() => handleVesselSelect(v)} className="w-full text-left flex items-start gap-2 hover:bg-zinc-800/30 rounded p-1 -mx-1 transition-colors">
                    <Ship className="size-3 text-zinc-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-300">{v.name}</div>
                      <div className="text-[9px] text-zinc-500">{v.speed} kn › {v.heading}° · {(6 + i * 2.5).toFixed(1)} nm</div>
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
