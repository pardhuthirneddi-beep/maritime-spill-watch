// maris — Full-screen interactive 2D chart (Leaflet).
//
// Design: "night nautical chart". Bathymetric base (Esri World Ocean Base)
// inverted to a dark chart so depth contours and coastlines stay legible,
// with a CARTO dark layer underneath as automatic fallback. Analysis
// overlays (slick, drift, vessels) are the only saturated elements.
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
  VesselAttribution,
} from "@/data/types";

// Night-chart signal palette (mirrors index.css tokens)
const C = {
  suspect: "#fbbf24", // amber — rank-1 probable source candidate
  candidate: "#22d3ee", // sonar cyan — top-3 ranked candidates
  traffic: "#64748b", // slate — background AIS traffic
  slick: "#f59e0b",
  slickCore: "#fbbf24",
  driftFwd: "#f59e0b",
  driftBack: "#a78bfa",
  wind: "#7dd3fc",
  current: "#34d399",
  grid: "rgba(148, 193, 231, 0.09)",
  perimeter: "rgba(251, 191, 36, 0.30)",
  text: "#d7e3ec",
  muted: "#8ba3b5",
};

interface MapViewProps {
  incident: OilSpillIncident | null;
  vessels: AisVessel[];
  layers: MapLayer[];
  selectedVessel: AisVessel | null;
  driftResult: OilDriftResult | null;
  hyperspectral: HyperspectralResult | null;
  environmental: EnvironmentalConditions;
  attributions?: VesselAttribution[];
  onVesselSelect: (vessel: AisVessel) => void;
}

/** Role of a vessel in the attribution ranking — drives symbology. */
function vesselRole(
  mmsi: string,
  attributions: VesselAttribution[] | undefined,
  selectedMmsi: string | null,
): "suspect" | "candidate" | "traffic" {
  if (!attributions?.length) return mmsi === selectedMmsi ? "candidate" : "traffic";
  if (attributions[0].vesselId === mmsi) return "suspect";
  const rank = attributions.find((a) => a.vesselId === mmsi)?.rank ?? 99;
  return rank <= 3 || mmsi === selectedMmsi ? "candidate" : "traffic";
}

/** Heading-rotated ship glyph. Triangle points along course-over-ground. */
function vesselIcon(color: string, heading: number, size: number, pulse: boolean): L.DivIcon {
  const ring = pulse
    ? `<span class="maris-ping" style="position:absolute;inset:-5px;border-radius:50%;border:1.5px solid ${color};"></span>`
    : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${size}px;height:${size}px;cursor:pointer;">
      ${ring}
      <svg width="${size}" height="${size}" viewBox="0 0 24 24"
        style="transform:rotate(${heading}deg);filter:drop-shadow(0 0 ${Math.round(size / 3)}px ${color}88);display:block;">
        <path d="M12 2.5 L19.5 21 L12 16.8 L4.5 21 Z"
          fill="${color}" stroke="rgba(4,10,16,0.85)" stroke-width="1.1"/>
      </svg>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Spill center beacon (ping ring gated off when zoomed far out). */
function spillIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:18px;height:18px;">
      <span class="maris-ping" style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${C.slickCore};"></span>
      <span style="position:absolute;inset:4px;border-radius:50%;background:${C.slickCore};box-shadow:0 0 12px ${C.slickCore};display:block;"></span>
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/** Probable-origin crosshair (data-derived from the drift backtrack). */
function originIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:24px;height:24px;">
      <span style="position:absolute;left:50%;top:0;width:1px;height:100%;background:${C.driftBack};"></span>
      <span style="position:absolute;top:50%;left:0;height:1px;width:100%;background:${C.driftBack};"></span>
      <span style="position:absolute;inset:5px;border-radius:50%;border:1.5px solid ${C.driftBack};"></span>
      <span style="position:absolute;inset:10px;border-radius:50%;background:${C.driftBack};box-shadow:0 0 8px ${C.driftBack};"></span>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function timeLabel(text: string, color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:0.04em;color:${color};background:rgba(7,13,22,0.82);border:1px solid rgba(148,193,231,0.18);padding:1px 5px;border-radius:3px;white-space:nowrap;">${text}</div>`,
    iconSize: [64, 14],
    iconAnchor: [32, 7],
  });
}

/** Graticule step (degrees) appropriate to the current zoom. */
function gridStep(z: number): number {
  if (z >= 15) return 0.02;
  if (z >= 13) return 0.05;
  if (z >= 11) return 0.25;
  if (z >= 9) return 0.5;
  return 2;
}

export default function MapView({
  incident,
  vessels,
  layers,
  selectedVessel,
  driftResult,
  hyperspectral,
  environmental,
  attributions,
  onVesselSelect,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    chart: L.LayerGroup;
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
      center: [12.05, 86.97],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    // Fallback dark base (also the "sea" when tiles fail) — no labels, no clutter.
    L.tileLayer("https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "maris-fallback",
    }).addTo(map);

    // Bathymetric chart base, inverted to dark: depth contours + coastlines
    // stay legible on the night palette. maxNativeZoom 13 → Leaflet upscales.
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        maxNativeZoom: 13,
        className: "maris-ocean",
        attribution: "Esri, GEBCO, NOAA",
      }
    ).addTo(map);

    // Chart reference overlay (ocean names / boundaries), subtle.
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        maxNativeZoom: 13,
        className: "maris-ocean-ref",
        opacity: 0.55,
      }
    ).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

    // Coordinate readout
    const CoordControl = L.Control.extend({
      onAdd: () => {
        const div = L.DomUtil.create("div", "maris-coord");
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

    // Graticule redrawn on view change; ping rings hidden when zoomed far out.
    const chart = L.layerGroup().addTo(map);
    const drawGraticule = () => {
      chart.clearLayers();
      const b = map.getBounds().pad(0.15);
      const step = gridStep(map.getZoom());
      const style: L.PolylineOptions = {
        color: C.grid,
        weight: 0.7,
        interactive: false,
      };
      for (let lat = Math.ceil(b.getSouth() / step) * step; lat <= b.getNorth(); lat += step) {
        L.polyline(
          [[lat, b.getWest()], [lat, b.getEast()]] as L.LatLngTuple[],
          style
        ).addTo(chart);
      }
      for (let lon = Math.ceil(b.getWest() / step) * step; lon <= b.getEast(); lon += step) {
        L.polyline(
          [[b.getSouth(), lon], [b.getNorth(), lon]] as L.LatLngTuple[],
          style
        ).addTo(chart);
      }
    };
    const syncZoomClass = () => {
      mapRef.current?.classList.toggle("maris-z-far", map.getZoom() < 11);
    };
    drawGraticule();
    syncZoomClass();
    map.on("moveend zoomend", drawGraticule);
    map.on("zoomend", syncZoomClass);

    // Layer groups
    layersRef.current = {
      chart,
      spill: L.layerGroup().addTo(map),
      vessels: L.layerGroup().addTo(map),
      tracks: L.layerGroup().addTo(map),
      drift: L.layerGroup().addTo(map),
      environmental: L.layerGroup().addTo(map),
      thickness: L.layerGroup().addTo(map),
    };

    mapInstance.current = map;

    return () => {
      map.off("moveend zoomend", drawGraticule);
      map.off("zoomend", syncZoomClass);
      map.remove();
      mapInstance.current = null;
      layersRef.current = null;
    };
  }, []);

  // Layer toggle helper
  const toggleLayer = useCallback((id: string, enabled: boolean) => {
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
  }, []);

  // Sync layers
  useEffect(() => {
    layers.forEach((l) => toggleLayer(l.id, l.enabled));
  }, [layers, toggleLayer]);

  // Spill: layered oil-film depth + boundary + beacon + investigation perimeter
  useEffect(() => {
    if (!layersRef.current || !incident) return;
    const g = layersRef.current.spill;
    g.clearLayers();

    const latlngs = incident.polygon.coordinates.map(
      (c) => [c[0], c[1]] as L.LatLngTuple
    );

    // Oil-film depth: three stacked fills read as a sheen thickening inward.
    L.polygon(latlngs, { stroke: false, fillColor: C.slick, fillOpacity: 0.05 }).addTo(g);
    L.polygon(latlngs, { stroke: false, fillColor: C.slick, fillOpacity: 0.09 }).addTo(g);
    L.polygon(latlngs, {
      color: C.slick,
      weight: 1.6,
      fillColor: C.slickCore,
      fillOpacity: 0.13,
      dashArray: "6 3",
    }).addTo(g);

    // Investigation perimeter ring — chart furniture that anchors the scene.
    const c = incident.polygon.center;
    const ringKm = Math.max(6, incident.polygon.lengthKm * 1.2);
    L.circle([c[0], c[1]], {
      radius: ringKm * 1000,
      color: C.perimeter,
      weight: 1,
      dashArray: "2 6",
      fill: false,
      interactive: false,
    }).addTo(g);
    L.marker([c[0] + ringKm / 111, c[1]], {
      interactive: false,
      icon: L.divIcon({
        className: "",
        html: `<div style="font-family:ui-monospace,Menlo,monospace;font-size:8px;letter-spacing:0.18em;color:${C.perimeter};white-space:nowrap;transform:translateX(-50%);">INVESTIGATION PERIMETER</div>`,
        iconSize: [160, 10],
        iconAnchor: [80, 5],
      }),
    }).addTo(g);

    // Center beacon
    L.marker([c[0], c[1]], { icon: spillIcon() })
      .bindPopup(
        `<div style="font-family:system-ui;font-size:12px;min-width:180px;">
          <strong style="color:${C.slickCore};letter-spacing:0.05em;">POSSIBLE OIL SLICK</strong>
          <div style="margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#c3d3e0;line-height:1.65;">
            <span style="color:${C.muted};">AREA&nbsp;&nbsp;&nbsp;</span>${incident.polygon.areaKm2} km²<br/>
            <span style="color:${C.muted};">LENGTH&nbsp;</span>${incident.polygon.lengthKm} km<br/>
            <span style="color:${C.muted};">CONF&nbsp;&nbsp;&nbsp;</span>${incident.confidence.score}%<br/>
            <span style="color:${C.muted};">DETECT&nbsp;</span>${new Date(incident.detectedAt).toLocaleString()}
          </div>
        </div>`,
        { className: "maris-popup" }
      )
      .addTo(g);

    if (mapInstance.current) {
      mapInstance.current.fitBounds(L.latLngBounds(latlngs).pad(0.35));
    }
  }, [incident]);

  // Vessels — role-based glyphs
  useEffect(() => {
    if (!layersRef.current) return;
    const g = layersRef.current.vessels;
    g.clearLayers();

    vessels.forEach((v) => {
      const role = vesselRole(v.mmsi, attributions, selectedVessel?.mmsi ?? null);
      const color =
        role === "suspect" ? C.suspect : role === "candidate" ? C.candidate : C.traffic;
      const size = role === "suspect" ? 22 : role === "candidate" ? 17 : 13;

      const marker = L.marker([v.lat, v.lon], {
        icon: vesselIcon(color, v.heading, size, role === "suspect"),
      });

      marker.bindPopup(
        `<div style="font-family:system-ui;font-size:11px;min-width:170px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:2px;background:${color};display:inline-block;"></span>
            <strong style="color:${C.text};">${v.name}</strong>
          </div>
          <div style="color:${C.muted};margin-top:2px;">${v.vesselType}</div>
          <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#c3d3e0;margin-top:6px;line-height:1.65;">
            MMSI ${v.mmsi}<br/>SOG ${v.speed} kn&nbsp;&nbsp;HDG ${v.heading}°
          </div>
          <a href="#" onclick="window.__selectVessel&&window.__selectVessel('${v.mmsi}');return false;"
             style="color:${C.candidate};font-size:10px;margin-top:6px;display:inline-block;">View details →</a>
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
  }, [vessels, selectedVessel, attributions, onVesselSelect]);

  // Vessel tracks
  useEffect(() => {
    if (!layersRef.current) return;
    const g = layersRef.current.tracks;
    g.clearLayers();

    vessels.forEach((v) => {
      const role = vesselRole(v.mmsi, attributions, selectedVessel?.mmsi ?? null);
      const color =
        role === "suspect" ? C.suspect : role === "candidate" ? C.candidate : C.traffic;
      const weight = role === "suspect" ? 2.4 : role === "candidate" ? 1.6 : 1;
      const opacity = role === "traffic" ? 0.35 : 0.8;

      const latlngs = v.trajectory.map((c) => [c[0], c[1]] as L.LatLngTuple);
      if (latlngs.length > 1) {
        L.polyline(latlngs, {
          color,
          weight,
          opacity,
          dashArray: role === "traffic" ? "3 5" : undefined,
        }).addTo(g);

        const mid = Math.floor(latlngs.length / 2);
        L.marker(latlngs[mid], {
          interactive: false,
          icon: L.divIcon({
            className: "",
            html: `<div style="color:${color};font-size:10px;line-height:1;transform:rotate(${v.heading - 90}deg);opacity:${role === "traffic" ? 0.5 : 0.9};">➤</div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          }),
        }).addTo(g);
      }
    });
  }, [vessels, selectedVessel, attributions]);

  // Drift: forward ribbons, backtrack, probable origin (oldest hindcast fix)
  useEffect(() => {
    if (!layersRef.current || !driftResult) return;
    const g = layersRef.current.drift;
    g.clearLayers();

    const fwdEnabled = layers.find((l) => l.id === "driftForward" && l.enabled);
    const btEnabled = layers.find((l) => l.id === "driftBacktrack" && l.enabled);

    if (fwdEnabled) {
      driftResult.forward.forEach((point, i) => {
        const latlngs = point.polygon.map((c) => [c[0], c[1]] as L.LatLngTuple);
        const t = 1 - i / Math.max(1, driftResult.forward.length);
        L.polygon(latlngs, {
          color: C.driftFwd,
          weight: 1,
          fillColor: C.driftFwd,
          fillOpacity: 0.05 + t * 0.13,
          dashArray: "3 3",
        }).addTo(g);
        if (i > 0) {
          L.marker(point.center as L.LatLngTuple, {
            interactive: false,
            icon: timeLabel(point.time, C.driftFwd),
          }).addTo(g);
        }
      });
    }

    if (btEnabled) {
      driftResult.backtrack.forEach((point, i) => {
        if (i === 0) return;
        const latlngs = point.polygon.map((c) => [c[0], c[1]] as L.LatLngTuple);
        const t = 1 - i / Math.max(1, driftResult.backtrack.length);
        L.polygon(latlngs, {
          color: C.driftBack,
          weight: 1,
          fillColor: C.driftBack,
          fillOpacity: 0.05 + t * 0.11,
          dashArray: "3 3",
        }).addTo(g);
        L.marker(point.center as L.LatLngTuple, {
          interactive: false,
          icon: timeLabel(point.time, C.driftBack),
        }).addTo(g);
      });

      // Probable origin = oldest backtrack position (derived, not invented).
      const oldest = driftResult.backtrack[driftResult.backtrack.length - 1];
      if (oldest) {
        L.marker(oldest.center as L.LatLngTuple, { icon: originIcon() })
          .bindTooltip(
            `<strong style="color:${C.driftBack};">PROBABLE ORIGIN</strong><br/><span style="color:${C.muted};">${oldest.time} — drift backtrack</span>`,
            { className: "maris-tooltip", direction: "top", offset: [0, -12] }
          )
          .addTo(g);
      }
    }
  }, [driftResult, layers]);

  // Environmental vectors
  useEffect(() => {
    if (!layersRef.current) return;
    const g = layersRef.current.environmental;
    g.clearLayers();

    const windEnabled = layers.find((l) => l.id === "wind" && l.enabled);
    const currentEnabled = layers.find((l) => l.id === "currents" && l.enabled);
    if ((!windEnabled && !currentEnabled) || !incident) return;

    const cx = incident.polygon.center[0];
    const cy = incident.polygon.center[1];
    const gridSize = 0.03;

    const drawVector = (lat: number, lon: number, dirDeg: number, len: number, color: string) => {
      const a = (dirDeg * Math.PI) / 180;
      const endLat = lat + len * Math.cos(a);
      const endLon = lon + len * Math.sin(a);
      L.polyline([[lat, lon], [endLat, endLon]] as L.LatLngTuple[], {
        color,
        weight: 1.2,
        opacity: 0.45,
        interactive: false,
      }).addTo(g);
      L.circleMarker([endLat, endLon], {
        radius: 1.6,
        color,
        weight: 0,
        fillColor: color,
        fillOpacity: 0.8,
        interactive: false,
      }).addTo(g);
    };

    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        const lat = cx + i * gridSize;
        const lon = cy + j * gridSize;
        if (windEnabled) drawVector(lat, lon, environmental.windDirection, 0.008, C.wind);
        if (currentEnabled) drawVector(lat, lon, environmental.currentDirection, 0.01, C.current);
      }
    }
  }, [environmental, layers, incident]);

  // Hyperspectral thickness zones
  useEffect(() => {
    if (!layersRef.current || !hyperspectral || !incident) return;
    const g = layersRef.current.thickness;
    g.clearLayers();

    const thickEnabled = layers.find((l) => l.id === "thickness" && l.enabled);
    if (!thickEnabled) return;

    const cx = incident.polygon.center[0];
    const cy = incident.polygon.center[1];

    hyperspectral.thicknessClasses.forEach((tc, i) => {
      const offset = (i - 1.5) * 0.004;
      const radius = 0.008 + i * 0.002;
      L.circle([cx + offset, cy + offset * 0.5], {
        radius: radius * 111000,
        color: tc.color,
        fillColor: tc.color,
        fillOpacity: 0.26,
        weight: 1,
        dashArray: "2 2",
      })
        .bindPopup(
          `<div style="font-family:system-ui;font-size:11px;">
            <strong style="color:${C.text};">${tc.label}</strong><br/>
            <span style="color:${C.muted};">Range</span> ${tc.range}<br/>
            <span style="color:${C.muted};">Coverage</span> ${tc.percentage}%
          </div>`,
          { className: "maris-popup" }
        )
        .addTo(g);
    });
  }, [hyperspectral, layers, incident]);

  return (
    <div
      ref={mapRef}
      className="maris-map absolute inset-0 z-0"
      style={{ background: "#050b12" }}
    />
  );
}
