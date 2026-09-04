// maris — 3D Geospatial Intelligence Globe
// Professional maritime satellite intelligence command center
// Uses MapLibre GL JS (globe projection) + deck.gl overlays
import { useRef, useEffect, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PolygonLayer, PathLayer, ScatterplotLayer, IconLayer, TextLayer } from "@deck.gl/layers";
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
  LatLon,
} from "@/data/types";

const CARTO_API_KEY = "cb1_2u58_1_bf57649a9ebd93a4418be433";

interface IntelligenceGlobeProps {
  onBack: () => void;
}

// Ship icon as SVG data URI for deck.gl
const SHIP_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="16,2 10,14 22,14" fill="#55aaff" stroke="#fff" stroke-width="1.5" opacity="0.95"/><rect x="13" y="14" width="6" height="6" rx="1" fill="#3388cc" stroke="#fff" stroke-width="1"/></svg>`
  );

const SHIP_SELECTED_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="none" stroke="#22d3ee" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/><polygon points="18,3 11,15 25,15" fill="#22d3ee" stroke="#fff" stroke-width="1.5"/><rect x="14" y="15" width="8" height="7" rx="1" fill="#0e7490" stroke="#fff" stroke-width="1"/></svg>`
  );

const SATELLITE_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><rect x="4" y="10" width="8" height="3" fill="#44cc88" opacity="0.8"/><rect x="16" y="10" width="8" height="3" fill="#44cc88" opacity="0.8"/><rect x="12" y="10" width="4" height="8" rx="1" fill="#22c55e"/><line x1="14" y1="20" x2="14" y2="26" stroke="#44cc88" stroke-width="1" stroke-dasharray="2,2" opacity="0.5"/></svg>`
  );

// ─── MAIN COMPONENT ─────────────────────────────────────────────────

export default function IntelligenceGlobe({ onBack }: IntelligenceGlobeProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
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

  // ── Build deck.gl layers ──────────────────────────────────────
  const buildDeckLayers = useCallback(() => {
    const deckLayers: unknown[] = [];
    const enabledMap = Object.fromEntries(layers.map((l) => [l.id, l.enabled]));
    const centerLon = incident.polygon.center[1];
    const centerLat = incident.polygon.center[0];

    // Oil spill polygon
    if (enabledMap.globe_spill) {
      const spillCoords = incident.polygon.coordinates.map((c) => [c[1], c[0]] as [number, number]);
      deckLayers.push(
        new PolygonLayer({
          id: "spill-glow",
          data: [{ polygon: spillCoords }],
          getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
          getFillColor: [249, 115, 22, 15],
          getLineColor: [251, 146, 60, 100],
          lineWidthMinPixels: 4,
          lineWidthMaxPixels: 8,
          pickable: false,
        }),
        new PolygonLayer({
          id: "spill-fill",
          data: [{ polygon: spillCoords }],
          getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
          getFillColor: [212, 119, 10, 55],
          getLineColor: [251, 146, 60, 200],
          lineWidthMinPixels: 2,
          lineWidthMaxPixels: 3,
          pickable: true,
        })
      );

      // Spill center label
      deckLayers.push(
        new TextLayer({
          id: "spill-label",
          data: [{ position: [centerLon, centerLat], text: "OIL SPILL DETECTION" }],
          getPosition: (d: { position: [number, number] }) => d.position,
          getText: (d: { text: string }) => d.text,
          getSize: 11,
          getColor: [251, 146, 60, 220],
          fontFamily: "monospace",
          fontWeight: "bold",
          getTextAnchor: "middle",
          getAlignmentBaseline: "bottom" as const,
          sizeUnits: "pixels" as const,
          billboard: true,
          getPixelOffset: [0, -20],
        }),
        new TextLayer({
          id: "spill-label-sub",
          data: [
            {
              position: [centerLon, centerLat],
              text: `Area: ${incident.polygon.areaKm2} km² | Confidence: ${incident.confidence.score}%`,
            },
          ],
          getPosition: (d: { position: [number, number] }) => d.position,
          getText: (d: { text: string }) => d.text,
          getSize: 9,
          getColor: [200, 200, 200, 180],
          fontFamily: "monospace",
          getTextAnchor: "middle",
          getAlignmentBaseline: "top" as const,
          sizeUnits: "pixels" as const,
          billboard: true,
          getPixelOffset: [0, 4],
        })
      );
    }

    // Detection zone ring
    if (enabledMap.globe_detection_zones) {
      const zoneRadius = 15 / 111; // ~15km in degrees
      const zonePoints: [number, number][] = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        zonePoints.push([
          centerLon + zoneRadius * Math.cos(angle),
          centerLat + zoneRadius * Math.sin(angle),
        ]);
      }
      deckLayers.push(
        new PathLayer({
          id: "detection-zone",
          data: [{ path: zonePoints }],
          getPath: (d: { path: [number, number][] }) => d.path,
          getColor: [251, 146, 60, 60],
          widthMinPixels: 1,
          widthMaxPixels: 1,
        })
      );
    }

    // Vessel tracks
    if (enabledMap.globe_tracks) {
      DEMO_VESSELS.forEach((vessel) => {
        if (vessel.trajectory.length > 1) {
          const path = vessel.trajectory.map((c) => [c[1], c[0]] as [number, number]);
          const isSelected = selectedVessel?.mmsi === vessel.mmsi;
          deckLayers.push(
            new PathLayer({
              id: `track-${vessel.mmsi}`,
              data: [{ path }],
              getPath: (d: { path: [number, number][] }) => d.path,
              getColor: isSelected ? [34, 211, 238, 160] : [51, 136, 204, 80],
              widthMinPixels: isSelected ? 2.5 : 1.5,
              widthMaxPixels: isSelected ? 3 : 2,
              widthScale: 1,
              rounded: true,
            })
          );
        }
      });
    }

    // AIS vessels
    if (enabledMap.globe_vessels) {
      const vesselData = DEMO_VESSELS.map((v) => ({
        position: [v.lon, v.lat] as [number, number],
        name: v.name,
        speed: v.speed,
        heading: v.heading,
        mmsi: v.mmsi,
        isSelected: selectedVessel?.mmsi === v.mmsi,
        icon: selectedVessel?.mmsi === v.mmsi ? SHIP_SELECTED_ICON : SHIP_ICON,
        size: selectedVessel?.mmsi === v.mmsi ? 40 : 28,
      }));

      deckLayers.push(
        new IconLayer({
          id: "vessels-icons",
          data: vesselData,
          getPosition: (d: { position: [number, number] }) => d.position,
          getIcon: (d: { icon: string }) => ({
            url: d.icon,
            width: 32,
            height: 32,
          }),
          getSize: (d: { size: number }) => d.size,
          sizeUnits: "pixels",
          pickable: true,
          onHover: () => {},
          onClick: (info: { object?: { mmsi: string } }) => {
            if (info.object) {
              const vessel = DEMO_VESSELS.find((v) => v.mmsi === info.object!.mmsi);
              if (vessel) handleVesselSelect(vessel);
            }
          },
        })
      );

      // Vessel labels
      deckLayers.push(
        new TextLayer({
          id: "vessel-labels",
          data: vesselData,
          getPosition: (d: { position: [number, number] }) => d.position,
          getText: (d: { name: string; speed: number; heading: number }) =>
            `${d.name}\n${d.speed} kn → ${d.heading}°`,
          getSize: 9,
          getColor: (d: { isSelected: boolean }) =>
            d.isSelected ? [34, 211, 238, 230] : [180, 190, 200, 180],
          fontFamily: "monospace",
          fontWeight: "bold",
          getTextAnchor: "middle",
          getAlignmentBaseline: "bottom" as const,
          sizeUnits: "pixels" as const,
          billboard: true,
          getPixelOffset: [0, -20],
          lineHeight: 1.3,
        })
      );
    }

    // Satellite observation
    if (enabledMap.globe_satellite) {
      const obs = DEMO_SATELLITE_OBSERVATION;

      // Ground track
      if (obs.groundTrack.length > 1) {
        const trackPath = obs.groundTrack.map((c) => [c[1], c[0]] as [number, number]);
        deckLayers.push(
          new PathLayer({
            id: "sat-ground-track",
            data: [{ path: trackPath }],
            getPath: (d: { path: [number, number][] }) => d.path,
            getColor: [68, 204, 136, 120],
            widthMinPixels: 1.5,
            widthMaxPixels: 2,
            dashJustified: true,
            getDashArray: [6, 4],
          })
        );
      }

      // Satellite position
      deckLayers.push(
        new IconLayer({
          id: "satellite-icon",
          data: [
            {
              position: [obs.swathCenter[1], obs.swathCenter[0]] as [number, number],
            },
          ],
          getPosition: (d: { position: [number, number] }) => d.position,
          getIcon: () => ({
            url: SATELLITE_ICON,
            width: 28,
            height: 28,
          }),
          sizeUnits: "pixels",
          getSize: 32,
          pickable: false,
        })
      );

      // Satellite label
      deckLayers.push(
        new TextLayer({
          id: "satellite-label",
          data: [
            {
              position: [obs.swathCenter[1], obs.swathCenter[0] + 0.8],
              text: `${obs.satellite}\nPASS 08921\n${new Date(obs.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()} ${new Date(obs.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC`,
            },
          ],
          getPosition: (d: { position: [number, number] }) => d.position,
          getText: (d: { text: string }) => d.text,
          getSize: 9,
          getColor: [68, 204, 136, 200],
          fontFamily: "monospace",
          fontWeight: "bold",
          getTextAnchor: "start",
          getAlignmentBaseline: "bottom" as const,
          sizeUnits: "pixels" as const,
          billboard: true,
          lineHeight: 1.4,
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
      const swathCorners: [number, number][] = [
        [scLon - swathHalfLength * sinA - swathHalfWidth * cosA, scLat - swathHalfLength * cosA + swathHalfWidth * sinA],
        [scLon - swathHalfLength * sinA + swathHalfWidth * cosA, scLat - swathHalfLength * cosA - swathHalfWidth * sinA],
        [scLon + swathHalfLength * sinA + swathHalfWidth * cosA, scLat + swathHalfLength * cosA - swathHalfWidth * sinA],
        [scLon + swathHalfLength * sinA - swathHalfWidth * cosA, scLat + swathHalfLength * cosA + swathHalfWidth * sinA],
      ];
      deckLayers.push(
        new PolygonLayer({
          id: "sat-swath",
          data: [{ polygon: swathCorners }],
          getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
          getFillColor: [68, 204, 136, 12],
          getLineColor: [68, 204, 136, 50],
          lineWidthMinPixels: 1,
          lineWidthMaxPixels: 1,
          pickable: false,
        })
      );
    }

    // Drift prediction paths
    if (enabledMap.globe_spill) {
      // Forward drift
      if (DEMO_DRIFT.forward.length > 1) {
        const fwdPath = DEMO_DRIFT.forward.map((p) => [p.center[1], p.center[0]] as [number, number]);
        deckLayers.push(
          new PathLayer({
            id: "drift-forward",
            data: [{ path: fwdPath }],
            getPath: (d: { path: [number, number][] }) => d.path,
            getColor: [249, 115, 22, 120],
            widthMinPixels: 2,
            widthMaxPixels: 2,
            dashJustified: true,
            getDashArray: [8, 6],
          })
        );
      }

      // Backtrack
      if (DEMO_DRIFT.backtrack.length > 1) {
        const btPath = DEMO_DRIFT.backtrack.map((p) => [p.center[1], p.center[0]] as [number, number]);
        deckLayers.push(
          new PathLayer({
            id: "drift-backtrack",
            data: [{ path: btPath }],
            getPath: (d: { path: [number, number][] }) => d.path,
            getColor: [167, 139, 250, 100],
            widthMinPixels: 1.5,
            widthMaxPixels: 2,
            dashJustified: true,
            getDashArray: [6, 4],
          })
        );
      }

      // Drift time labels
      DEMO_DRIFT.forward.forEach((point, i) => {
        if (i === 0) return;
        deckLayers.push(
          new ScatterplotLayer({
            id: `drift-point-${i}`,
            data: [{ position: [point.center[1], point.center[0]] }],
            getPosition: (d: { position: [number, number] }) => d.position,
            getRadius: 1500,
            getFillColor: [249, 115, 22, 40 + (4 - i) * 15],
            getLineColor: [249, 115, 22, 80],
            lineWidthMinPixels: 1,
            radiusUnits: "meters" as const,
          })
        );
      });
    }

    // Maritime grid
    if (enabledMap.globe_grid) {
      const gridLines: { path: [number, number][] }[] = [];
      for (let lat = 5; lat <= 20; lat += 5) {
        const path: [number, number][] = [];
        for (let lon = 80; lon <= 95; lon += 0.5) path.push([lon, lat]);
        gridLines.push({ path });
      }
      for (let lon = 81; lon <= 93; lon += 3) {
        const path: [number, number][] = [];
        for (let lat = 5; lat <= 20; lat += 0.5) path.push([lon, lat]);
        gridLines.push({ path });
      }
      deckLayers.push(
        new PathLayer({
          id: "maritime-grid",
          data: gridLines,
          getPath: (d: { path: [number, number][] }) => d.path,
          getColor: [51, 65, 85, 40],
          widthMinPixels: 0.5,
          widthMaxPixels: 0.5,
        })
      );
    }

    return deckLayers;
  }, [layers, selectedVessel, incident]);

  // ── Update deck overlay ───────────────────────────────────────
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setProps({ layers: buildDeckLayers() as never[] });
    }
  }, [buildDeckLayers]);

  // ── Initialize MapLibre with globe projection ─────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: [
              `https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
              `https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
              `https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
              `https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
            ],
            tileSize: 256,
            attribution: "© CARTO © OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "carto-dark-layer",
            type: "raster",
            source: "carto-dark",
            minzoom: 0,
            maxzoom: 18,
          },
        ],
        glyphs: undefined,
      },
      center: [86.97, 12.05],
      zoom: 3.8,
      pitch: 42,
      bearing: -15,

      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    // Set globe projection
    map.setProjection({ type: "globe" });

    // Add deck.gl overlay
    const deckOverlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
    });
    map.addControl(deckOverlay as unknown as maplibregl.IControl);
    overlayRef.current = deckOverlay;

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Handle vessel selection ─────────────────────────────────────
  const handleVesselSelect = useCallback((vessel: AisVessel) => {
    setSelectedVessel(vessel);
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [vessel.lon, vessel.lat],
      zoom: 7,
      pitch: 45,
      duration: 2000,
    });
  }, []);

  // ── Fly to spill ──────────────────────────────────────────────
  const flyToSpill = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [incident.polygon.center[1], incident.polygon.center[0]],
      zoom: 5.5,
      pitch: 42,
      duration: 2000,
    });
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
        <aside className="flex h-full z-20">
          <div className="w-10 flex flex-col items-center gap-1 py-2 border-r border-zinc-800/50 bg-[#060a10]/95">
            {[Search, Ship, Layers, Target, Radar, Compass, Wind].map((Icon, i) => (
              <button key={i} className={cn("flex size-7 items-center justify-center rounded transition-colors", i === 1 ? "bg-cyan-500/15 text-cyan-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800")}>
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>

          <div className="w-56 border-r border-zinc-800/50 bg-[#060a10]/95 flex flex-col overflow-hidden">
            {/* Vessel list */}
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

            {/* Layers */}
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

        {/* ─── MAPLIBRE GLOBE ────────────────────────────────── */}
        <main className="flex-1 relative">
          <div ref={mapContainerRef} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />

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
