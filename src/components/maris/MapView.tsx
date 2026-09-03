// maris — Full-screen interactive map using Leaflet
import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type {
  OilSpillIncident,
  AisVessel,
  MapLayer,
  OilDriftResult,
  HyperspectralResult,
  EnvironmentalConditions,
} from "@/data/types";

const CARTO_API_KEY = "cb1_2u58_1_bf57649a9ebd93a4418be433";

interface MapViewProps {
  incident: OilSpillIncident | null;
  vessels: AisVessel[];
  layers: MapLayer[];
  selectedVessel: AisVessel | null;
  driftResult: OilDriftResult | null;
  hyperspectral: HyperspectralResult | null;
  environmental: EnvironmentalConditions;
  onVesselSelect: (vessel: AisVessel) => void;
}

// Custom vessel icon using SVG marker
function vesselIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 6px ${color}80;cursor:pointer;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// Spill marker icon
function spillIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:rgba(251,146,60,0.9);border:2px solid #fb923c;box-shadow:0 0 12px rgba(251,146,60,0.6);animation:pulse 2s infinite;"></div>
    <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:0.7}}</style>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function MapView({
  incident,
  vessels,
  layers,
  selectedVessel,
  driftResult,
  hyperspectral,
  environmental,
  onVesselSelect,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    spill: L.LayerGroup;
    vessels: L.LayerGroup;
    tracks: L.LayerGroup;
    drift: L.LayerGroup;
    environmental: L.LayerGroup;
    thickness: L.LayerGroup;
  } | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [12.85, 80.24],
      zoom: 11,
      zoomControl: false,
      attributionControl: true,
    });

    // Dark tiles via Carto basemaps API
    L.tileLayer(
      `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
      {
        attribution:
          '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 19,
      }
    ).addTo(map);

    // Zoom control top-right
    L.control.zoom({ position: "topright" }).addTo(map);

    // Coordinate display
    const CoordControl = L.Control.extend({
      onAdd: function () {
        const div = L.DomUtil.create(
          "div",
          "bg-black/80 text-[10px] text-zinc-400 px-2 py-1 rounded font-mono"
        );
        div.id = "coord-display";
        div.textContent = "—";
        return div;
      },
    });
    new CoordControl({ position: "bottomleft" }).addTo(map);

    map.on("mousemove", (e) => {
      const el = document.getElementById("coord-display");
      if (el)
        el.textContent = `${e.latlng.lat.toFixed(4)}°N  ${e.latlng.lng.toFixed(4)}°E`;
    });

    // Scale bar
    L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

    // Layer groups
    layersRef.current = {
      spill: L.layerGroup().addTo(map),
      vessels: L.layerGroup().addTo(map),
      tracks: L.layerGroup().addTo(map),
      drift: L.layerGroup().addTo(map),
      environmental: L.layerGroup().addTo(map),
      thickness: L.layerGroup().addTo(map),
    };

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Layer toggle helper
  const toggleLayer = useCallback(
    (id: string, enabled: boolean) => {
      if (!layersRef.current || !mapInstance.current) return;
      const map = mapInstance.current;
      const layerMap: Record<string, L.LayerGroup> = {
        spill: layersRef.current.spill,
        vessels: layersRef.current.vessels,
        tracks: layersRef.current.tracks,
        driftForward: layersRef.current.drift,
        driftBacktrack: layersRef.current.drift,
        wind: layersRef.current.environmental,
        currents: layersRef.current.environmental,
        thickness: layersRef.current.thickness,
      };
      const layer = layerMap[id];
      if (layer) {
        if (enabled && !map.hasLayer(layer)) layer.addTo(map);
        if (!enabled && map.hasLayer(layer)) map.removeLayer(layer);
      }
    },
    []
  );

  // Sync layers
  useEffect(() => {
    layers.forEach((l) => toggleLayer(l.id, l.enabled));
  }, [layers, toggleLayer]);

  // Update spill polygon
  useEffect(() => {
    if (!layersRef.current || !incident) return;
    const g = layersRef.current.spill;
    g.clearLayers();

    // Spill polygon
    const latlngs = incident.polygon.coordinates.map(
      (c) => [c[0], c[1]] as L.LatLngTuple
    );
    L.polygon(latlngs, {
      color: "#fb923c",
      weight: 2,
      fillColor: "#ea580c",
      fillOpacity: 0.25,
      dashArray: "6 3",
    }).addTo(g);

    // Center marker
    L.marker([incident.polygon.center[0], incident.polygon.center[1]], {
      icon: spillIcon(),
    })
      .bindPopup(
        `<div style="font-family:system-ui;font-size:12px;">
          <strong style="color:#ea580c;">Possible Oil Spill</strong><br/>
          Area: ${incident.polygon.areaKm2} km²<br/>
          Length: ${incident.polygon.lengthKm} km<br/>
          Confidence: ${incident.confidence.score}%<br/>
          Detected: ${new Date(incident.detectedAt).toLocaleString()}
        </div>`,
        { className: "maris-popup" }
      )
      .addTo(g);

    // Fit map to spill
    if (mapInstance.current) {
      mapInstance.current.fitBounds(L.latLngBounds(latlngs).pad(0.3));
    }
  }, [incident]);

  // Update vessels
  useEffect(() => {
    if (!layersRef.current) return;
    const g = layersRef.current.vessels;
    g.clearLayers();

    vessels.forEach((v) => {
      const isSelected = selectedVessel?.mmsi === v.mmsi;
      const color = isSelected ? "#22d3ee" : "#60a5fa";
      const size = isSelected ? 18 : 14;

      const marker = L.marker([v.lat, v.lon], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid ${isSelected ? "#fff" : "#1e3a5f"};box-shadow:0 0 ${isSelected ? 12 : 6}px ${color}80;cursor:pointer;transition:all 0.2s;"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      });

      marker.bindPopup(
        `<div style="font-family:system-ui;font-size:11px;min-width:160px;">
          <strong>${v.name}</strong><br/>
          <span style="color:#888;">${v.vesselType}</span><br/>
          MMSI: ${v.mmsi}<br/>
          Speed: ${v.speed} kn<br/>
          Heading: ${v.heading}°<br/>
          <a href="#" onclick="window.__selectVessel&&window.__selectVessel('${v.mmsi}');return false;" style="color:#60a5fa;">View details →</a>
        </div>`,
        { className: "maris-popup" }
      );

      marker.on("click", () => onVesselSelect(v));
      marker.addTo(g);
    });

    // Global handler for popup links
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__selectVessel = (mmsi: string) => {
      const v = vessels.find((vv) => vv.mmsi === mmsi);
      if (v) onVesselSelect(v);
    };
  }, [vessels, selectedVessel, onVesselSelect]);

  // Update vessel tracks
  useEffect(() => {
    if (!layersRef.current) return;
    const g = layersRef.current.tracks;
    g.clearLayers();

    vessels.forEach((v) => {
      const isSelected = selectedVessel?.mmsi === v.mmsi;
      const color = isSelected ? "#22d3ee" : "#60a5fa80";
      const weight = isSelected ? 3 : 1.5;

      const latlngs = v.trajectory.map(
        (c) => [c[0], c[1]] as L.LatLngTuple
      );
      if (latlngs.length > 1) {
        L.polyline(latlngs, {
          color,
          weight,
          opacity: isSelected ? 0.9 : 0.5,
          dashArray: isSelected ? undefined : "4 4",
        }).addTo(g);

        // Direction arrows
        if (latlngs.length > 1) {
          const mid = Math.floor(latlngs.length / 2);
          const arrowIcon = L.divIcon({
            className: "",
            html: `<div style="color:${color};font-size:10px;transform:rotate(${
              v.heading - 90
            }deg);">▶</div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });
          L.marker(latlngs[mid], { icon: arrowIcon }).addTo(g);
        }
      }
    });
  }, [vessels, selectedVessel]);

  // Update drift visualization
  useEffect(() => {
    if (!layersRef.current || !driftResult) return;
    const g = layersRef.current.drift;
    g.clearLayers();

    // Forward drift
    const fwdEnabled = layers.find(
      (l) => l.id === "driftForward" && l.enabled
    );
    if (fwdEnabled) {
      driftResult.forward.forEach((point, i) => {
        const latlngs = point.polygon.map(
          (c) => [c[0], c[1]] as L.LatLngTuple
        );
        L.polygon(latlngs, {
          color: "#f97316",
          weight: 1,
          fillColor: "#f97316",
          fillOpacity: 0.08 + (1 - i / driftResult.forward.length) * 0.15,
          dashArray: "3 3",
        }).addTo(g);

        // Time label
        if (i > 0) {
          L.marker(point.center as L.LatLngTuple, {
            icon: L.divIcon({
              className: "",
              html: `<div style="font-size:9px;color:#f97316;background:rgba(0,0,0,0.7);padding:1px 4px;border-radius:2px;white-space:nowrap;">${point.time}</div>`,
              iconSize: [60, 12],
              iconAnchor: [30, 6],
            }),
          }).addTo(g);
        }
      });
    }

    // Backtrack
    const btEnabled = layers.find(
      (l) => l.id === "driftBacktrack" && l.enabled
    );
    if (btEnabled) {
      driftResult.backtrack.forEach((point, i) => {
        if (i === 0) return;
        const latlngs = point.polygon.map(
          (c) => [c[0], c[1]] as L.LatLngTuple
        );
        L.polygon(latlngs, {
          color: "#a78bfa",
          weight: 1,
          fillColor: "#a78bfa",
          fillOpacity: 0.08 + (1 - i / driftResult.backtrack.length) * 0.12,
          dashArray: "3 3",
        }).addTo(g);

        L.marker(point.center as L.LatLngTuple, {
          icon: L.divIcon({
            className: "",
            html: `<div style="font-size:9px;color:#a78bfa;background:rgba(0,0,0,0.7);padding:1px 4px;border-radius:2px;white-space:nowrap;">${point.time}</div>`,
            iconSize: [60, 12],
            iconAnchor: [30, 6],
          }),
        }).addTo(g);
      });
    }
  }, [driftResult, layers]);

  // Update environmental vectors
  useEffect(() => {
    if (!layersRef.current) return;
    const g = layersRef.current.environmental;
    g.clearLayers();

    const windEnabled = layers.find((l) => l.id === "wind" && l.enabled);
    const currentEnabled = layers.find(
      (l) => l.id === "currents" && l.enabled
    );

    if (!windEnabled && !currentEnabled) return;

    if (!incident) return;

    // Add vectors around spill center
    const cx = incident.polygon.center[0];
    const cy = incident.polygon.center[1];
    const gridSize = 0.03;

    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        const lat = cx + i * gridSize;
        const lon = cy + j * gridSize;

        if (windEnabled) {
          const wLen = 0.008;
          const wAngle = (environmental.windDirection * Math.PI) / 180;
          const endLat = lat + wLen * Math.cos(wAngle);
          const endLon = lon + wLen * Math.sin(wAngle);
          L.polyline(
            [
              [lat, lon] as L.LatLngTuple,
              [endLat, endLon] as L.LatLngTuple,
            ],
            { color: "#38bdf8", weight: 1, opacity: 0.5 }
          ).addTo(g);
          // Arrow head
          L.circleMarker([endLat, endLon], {
            radius: 1.5,
            color: "#38bdf8",
            fillOpacity: 0.7,
          }).addTo(g);
        }

        if (currentEnabled) {
          const cLen = 0.01;
          const cAngle = (environmental.currentDirection * Math.PI) / 180;
          const endLat = lat + cLen * Math.cos(cAngle);
          const endLon = lon + cLen * Math.sin(cAngle);
          L.polyline(
            [
              [lat, lon] as L.LatLngTuple,
              [endLat, endLon] as L.LatLngTuple,
            ],
            { color: "#4ade80", weight: 1, opacity: 0.5 }
          ).addTo(g);
          L.circleMarker([endLat, endLon], {
            radius: 1.5,
            color: "#4ade80",
            fillOpacity: 0.7,
          }).addTo(g);
        }
      }
    }
  }, [environmental, layers, incident]);

  // Thickness overlay
  useEffect(() => {
    if (!layersRef.current || !hyperspectral || !incident) return;
    const g = layersRef.current.thickness;
    g.clearLayers();

    const thickEnabled = layers.find(
      (l) => l.id === "thickness" && l.enabled
    );
    if (!thickEnabled) return;

    // Add thickness zones within spill polygon
    const cx = incident.polygon.center[0];
    const cy = incident.polygon.center[1];

    hyperspectral.thicknessClasses.forEach((tc, i) => {
      const offset = (i - 1.5) * 0.004;
      const radius = 0.008 + i * 0.002;
      L.circle([cx + offset, cy + offset * 0.5], {
        radius: radius * 111000,
        color: tc.color,
        fillColor: tc.color,
        fillOpacity: 0.3,
        weight: 1,
        dashArray: "2 2",
      })
        .bindPopup(
          `<div style="font-family:system-ui;font-size:11px;">
            <strong>${tc.label}</strong><br/>
            Range: ${tc.range}<br/>
            Coverage: ${tc.percentage}%
          </div>`,
          { className: "maris-popup" }
        )
        .addTo(g);
    });
  }, [hyperspectral, layers, incident]);

  return (
    <div
      ref={mapRef}
      className="absolute inset-0 z-0"
      style={{ background: "#0a0a0a" }}
    />
  );
}
