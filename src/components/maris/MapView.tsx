// maris — Full-screen interactive 2D chart (Leaflet).
//
// Design: "navy bathymetric chart". Esri World Ocean Base tiles are the
// primary base (blue-gradient bathymetry, legible coastlines) pulled toward
// the command-center navy with a CSS filter. A CARTO dark layer sits
// underneath as automatic fallback if Esri tiles fail to load, so the chart
// is never white or blank. Analysis overlays (slick, drift, vessels) are the
// only saturated elements.
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

// CARTO basemap key (user-provided). Must be passed as `key=` — that is the
// parameter CARTO's raster endpoint actually honours (`api_key=` is ignored
// and serves the "API key required" watermark tile).
const CARTO_KEY = "cb1_3m6s_1_d1388429c63b760b35a7f30f";

// Night-chart signal palette (mirrors index.css tokens)
const C = {
  suspect: "#fbbf24", // amber — rank-1 probable source candidate
  candidate: "#22d3ee", // sonar cyan — top-3 ranked candidates
  traffic: "#64748b", // slate — background AIS traffic
  slick: "#f59e0b",
  slickCore: "#fbbf24",
  driftFwd: "#f59e0b",
  driftBack: "#c4b5fd",
  wind: "#7dd3fc",
  current: "#34d399",
  impact: "#f87171",
  grid: "rgba(148, 193, 231, 0.09)",
  perimeter: "rgba(251, 191, 36, 0.30)",
  text: "#d7e3ec",
  muted: "#8ba3b5",
};

// Oil-thickness ramp — sheen (light) → emulsion (dark). These hues stay
// legible on both the navy bathymetric base and the dark fallback.
const THICKNESS_RAMP: Record<string, string> = {
  "Thin Sheen": "#7dd3fc",
  "Moderate": "#38bdf8",
  "Thick": "#0ea5e9",
  "Very Thick": "#0369a1",
};

/** Catmull-Rom spline through lat/lon points → dense smooth polyline.
 *  Turns sparse AIS/drift waypoints into realistic curved ocean paths. */
function splineThrough(points: [number, number][], samplesPerSeg = 14): [number, number][] {
  const pts = points.filter(
    (p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]
  );
  if (pts.length < 2) return pts;
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2*p0[0] - 5*p1[0] + 4*p2[0] - p3[0]) * t2 + (-p0[0] + 3*p1[0] - 3*p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2*p0[1] - 5*p1[1] + 4*p2[1] - p3[1]) * t2 + (-p0[1] + 3*p1[1] - 3*p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Bearing in degrees from point a to point b (0 = north). */
function bearingDeg(a: [number, number], b: [number, number]): number {
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((b[0] * Math.PI) / 180);
  const x =
    Math.cos((a[0] * Math.PI) / 180) * Math.sin((b[0] * Math.PI) / 180) -
    Math.sin((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Rotated arrowhead glyph placed along a drift path — animated drift direction. */
function driftArrow(latlng: [number, number], heading: number, color: string): L.Marker {
  return L.marker(latlng, {
    interactive: false,
    icon: L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;display:flex;align-items:center;justify-content:center;transform:rotate(${heading}deg);">
        <svg width="14" height="14" viewBox="0 0 24 24" class="maris-flow">
          <path d="M12 3 L19 19 L12 15 L5 19 Z" fill="${color}" stroke="rgba(4,10,16,0.6)" stroke-width="1"/>
        </svg>
      </div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    }),
  });
}

/** Optical (true-colour satellite) layer: stylised swath overlay drawn as an
 *  SVG data-URI image — scan-line texture + false-colour tint band along the
 *  pass. Pure data URI, no assets, no network. */
function opticalSwathOverlay(
  center: [number, number],
  halfWidthDeg: number,
  halfHeightDeg: number,
): L.ImageOverlay {
  const W = 800, H = 1200;
  const scan = Array.from({ length: 48 }, (_, i) => {
    const y = (i / 48) * H;
    return `<rect x="0" y="${y.toFixed(0)}" width="${W}" height="1" fill="rgba(120,180,150,0.05)"/>`;
  }).join("");
  const tint = Array.from({ length: 6 }, (_, i) => {
    const w = (W / 6) * (i + 1);
    return `<rect x="0" y="0" width="${w.toFixed(0)}" height="${H}" fill="rgba(45,212,191,${(0.015 + i * 0.006).toFixed(3)})"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(16,42,58,0.35)"/>
      <stop offset="0.5" stop-color="rgba(10,30,44,0.15)"/>
      <stop offset="1" stop-color="rgba(16,42,58,0.35)"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    ${tint}${scan}
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="rgba(94,234,212,0.35)" stroke-width="2" stroke-dasharray="10 6"/>
  </svg>`;
  return L.imageOverlay(
    `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    [
      [center[0] + halfHeightDeg, center[1] - halfWidthDeg],
      [center[0] - halfHeightDeg, center[1] + halfWidthDeg],
    ] as L.LatLngBoundsLiteral,
    { interactive: false, opacity: 1 }
  );
}

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
    impact: L.LayerGroup;
    optical: L.LayerGroup;
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

    // Satellite-textured base — Esri World Imagery (keyless): real
    // green/brown land textures and deep-blue ocean. Darkened toward navy
    // via CSS so analytical overlays stay dominant, with the CARTO dark
    // layer underneath as automatic fallback if Esri tiles fail.
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        className: "maris-ocean",
        attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
      }
    ).addTo(map);

    // Muted place-name overlay for spatial reference.
    L.tileLayer(
      `https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png?key=${CARTO_KEY}`,
      {
        maxZoom: 19,
        className: "maris-labels",
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
      impact: L.layerGroup().addTo(map),
      optical: L.layerGroup().addTo(map),
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
      impactZone: layersRef.current.impact,
      optical: layersRef.current.optical,
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

  // Vessel tracks — spline-smoothed so sparse AIS waypoints read as real
  // ocean paths instead of straight pin-to-pin lines.
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

      const raw = v.trajectory.map((c) => [c[0], c[1]] as [number, number]);
      const latlngs = splineThrough(raw, 12).map(
        (p) => [p[0], p[1]] as L.LatLngTuple
      );
      if (latlngs.length > 1) {
        L.polyline(latlngs, {
          color,
          weight,
          opacity,
          dashArray: role === "traffic" ? "3 5" : undefined,
          lineCap: "round",
        }).addTo(g);

        // Course arrowhead at the leading edge of the track.
        const tip = latlngs[latlngs.length - 1];
        const prev = latlngs[Math.max(0, latlngs.length - 5)];
        const hdg = bearingDeg([prev[0], prev[1]], [tip[0], tip[1]]);
        L.marker(tip, {
          interactive: false,
          icon: L.divIcon({
            className: "",
            html: `<div style="color:${color};font-size:11px;line-height:1;transform:rotate(${hdg - 90}deg);opacity:${role === "traffic" ? 0.5 : 0.9};">➤</div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          }),
        }).addTo(g);
      }
    });
  }, [vessels, selectedVessel, attributions]);

  // Drift: curved forecast/backtrack flow lines + uncertainty envelopes +
  // animated direction arrows + probable-origin fix (oldest hindcast point).
  useEffect(() => {
    if (!layersRef.current || !driftResult) return;
    const g = layersRef.current.drift;
    g.clearLayers();

    const fwdEnabled = layers.find((l) => l.id === "driftForward" && l.enabled);
    const btEnabled = layers.find((l) => l.id === "driftBacktrack" && l.enabled);

    const uncertaintyEnvelope = (
      centers: [number, number][],
      color: string,
      maxKm: number
    ) => {
      if (centers.length < 2) return;
      const north: L.LatLngTuple[] = [];
      const south: L.LatLngTuple[] = [];
      centers.forEach((c, i) => {
        const spread =
          ((maxKm * ((i + 1) / centers.length)) / 111) * 0.5; // grows with time
        north.push([c[0] + spread, c[1]]);
        south.push([c[0] - spread, c[1]]);
      });
      L.polygon([...north, ...south.reverse()], {
        stroke: false,
        fillColor: color,
        fillOpacity: 0.05,
        interactive: false,
      }).addTo(g);
    };

    if (fwdEnabled) {
      const centers = driftResult.forward.map(
        (p) => [p.center[0], p.center[1]] as [number, number]
      );
      const curve = splineThrough(centers, 24).map(
        (p) => [p[0], p[1]] as L.LatLngTuple
      );

      // Uncertainty envelope widening downstream.
      uncertaintyEnvelope(centers, C.driftFwd, 9);

      // Ribbons around each hindcast fix (drift-model confidence zones).
      driftResult.forward.forEach((point, i) => {
        if (i === 0) return;
        const latlngs = point.polygon.map((c) => [c[0], c[1]] as L.LatLngTuple);
        L.polygon(latlngs, {
          color: C.driftFwd,
          weight: 0.8,
          fillColor: C.driftFwd,
          fillOpacity: 0.04 + (1 - i / driftResult.forward.length) * 0.08,
          dashArray: "2 4",
          interactive: false,
        }).addTo(g);
      });

      // Main curved flow line — dashed forecast, glowing amber.
      L.polyline(curve, {
        color: C.driftFwd,
        weight: 3,
        opacity: 0.9,
        dashArray: "1 8",
        lineCap: "round",
      }).addTo(g);
      L.polyline(curve, {
        color: C.driftFwd,
        weight: 10,
        opacity: 0.08,
        lineCap: "round",
        interactive: false,
      }).addTo(g);

      // Animated direction arrows along the path + time stamps at fixes.
      for (let k = 1; k < curve.length - 2; k += 22) {
        driftArrow(
          [curve[k][0], curve[k][1]],
          bearingDeg([curve[k][0], curve[k][1]], [curve[k + 1][0], curve[k + 1][1]]),
          C.driftFwd
        ).addTo(g);
      }
      driftResult.forward.forEach((point, i) => {
        if (i > 0) {
          L.marker(point.center as L.LatLngTuple, {
            interactive: false,
            icon: timeLabel(point.time, C.driftFwd),
          }).addTo(g);
        }
      });
    }

    if (btEnabled) {
      const centers = driftResult.backtrack.map(
        (p) => [p.center[0], p.center[1]] as [number, number]
      );
      const curve = splineThrough(centers, 24).map(
        (p) => [p[0], p[1]] as L.LatLngTuple
      );

      uncertaintyEnvelope(centers, C.driftBack, 5);

      driftResult.backtrack.forEach((point, i) => {
        if (i === 0) return;
        const latlngs = point.polygon.map((c) => [c[0], c[1]] as L.LatLngTuple);
        L.polygon(latlngs, {
          color: C.driftBack,
          weight: 0.8,
          fillColor: C.driftBack,
          fillOpacity: 0.04 + (1 - i / driftResult.backtrack.length) * 0.07,
          dashArray: "2 4",
          interactive: false,
        }).addTo(g);
        L.marker(point.center as L.LatLngTuple, {
          interactive: false,
          icon: timeLabel(point.time, C.driftBack),
        }).addTo(g);
      });

      // Curved backtrack line — solid, brighter violet.
      L.polyline(curve, {
        color: C.driftBack,
        weight: 3,
        opacity: 0.95,
        lineCap: "round",
      }).addTo(g);
      L.polyline(curve, {
        color: C.driftBack,
        weight: 10,
        opacity: 0.1,
        lineCap: "round",
        interactive: false,
      }).addTo(g);
      for (let k = 1; k < curve.length - 2; k += 18) {
        driftArrow(
          [curve[k][0], curve[k][1]],
          bearingDeg([curve[k][0], curve[k][1]], [curve[k + 1][0], curve[k + 1][1]]),
          C.driftBack
        ).addTo(g);
      }

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

  // Environmental layers — flowing streamfield. Curved streamlines traced
  // through a smooth vector field (coherent curl, no grid of dead arrows),
  // with animated chevron particles showing direction of flow.
  useEffect(() => {
    if (!layersRef.current) return;
    const g = layersRef.current.environmental;
    g.clearLayers();

    const windEnabled = layers.find((l) => l.id === "wind" && l.enabled);
    const currentEnabled = layers.find((l) => l.id === "currents" && l.enabled);
    if ((!windEnabled && !currentEnabled) || !incident) return;

    const cx = incident.polygon.center[0];
    const cy = incident.polygon.center[1];
    const R = 0.14; // field extent in degrees (~15 km radius)

    // Vector field: dominant direction + sinusoidal curl across space.
    // strength ∈ [0.36, 1] modulates opacity/particle spacing (speed proxy).
    const field = (
      lat: number,
      lon: number,
      dirDeg: number,
      curl: number,
      wave: number
    ): { dir: number; strength: number } => {
      const u = (lon - cy) / R; // -1..1 across the field
      const v = (lat - cx) / R;
      const dir = dirDeg + curl * Math.sin(u * Math.PI + v * 0.6);
      const strength = 0.68 + 0.32 * Math.sin(u * 1.7 + v * 1.3 + wave);
      return { dir, strength };
    };

    // Trace one streamline from a seed through the field: straight backward
    // half to the field edge, then forward-integrated with local bending.
    const trace = (
      seed: [number, number],
      dirDeg: number,
      curl: number,
      wave: number,
      steps: number
    ): [number, number][] => {
      const pts: [number, number][] = [];
      let [lat, lon] = seed;
      const a0 = (field(lat, lon, dirDeg, curl, wave).dir * Math.PI) / 180;
      for (let s = steps / 2; s > 0; s--) {
        pts.unshift([
          lat - (s / steps) * R * 0.5 * Math.cos(a0),
          lon - (s / steps) * R * 0.5 * Math.sin(a0) / Math.cos((lat * Math.PI) / 180),
        ]);
      }
      pts.push([lat, lon]);
      for (let s = 1; s <= steps / 2; s++) {
        const { dir } = field(lat, lon, dirDeg, curl, wave);
        const a = (dir * Math.PI) / 180;
        lat += (R * 0.0625) * Math.cos(a);
        lon += ((R * 0.0625) * Math.sin(a)) / Math.cos((lat * Math.PI) / 180);
        pts.push([lat, lon]);
      }
      return splineThrough(pts, 6);
    };

    // Animated chevron particle riding a streamline.
    const streamParticle = (
      pt: [number, number],
      dirDeg: number,
      color: string,
      delayMs: number
    ): L.Marker =>
      L.marker(pt, {
        interactive: false,
        icon: L.divIcon({
          className: "",
          html: `<div style="width:9px;height:9px;display:flex;align-items:center;justify-content:center;transform:rotate(${dirDeg}deg);">
            <svg width="9" height="9" viewBox="0 0 24 24" class="maris-flow" style="animation-delay:${delayMs}ms">
              <path d="M6 4 L18 12 L6 20" fill="none" stroke="${color}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>`,
          iconSize: [9, 9],
          iconAnchor: [4.5, 4.5],
        }),
      });

    const drawStream = (
      enabled: boolean,
      dirDeg: number,
      speedKn: number,
      color: string,
      curl: number,
      wave: number,
      seeds: [number, number][],
      weight: number,
      isWind: boolean
    ) => {
      if (!enabled) return;
      seeds.forEach((seed, si) => {
        const line = trace(seed, dirDeg, curl, wave, 26);
        const meanStrength =
          line.reduce((acc, p) => acc + field(p[0], p[1], dirDeg, curl, wave).strength, 0) /
          Math.max(1, line.length);
        L.polyline(
          line.map((p) => [p[0], p[1]] as L.LatLngTuple),
          {
            color,
            weight,
            opacity: 0.18 + meanStrength * 0.4,
            lineCap: "round",
            interactive: false,
          }
        ).addTo(g);
        // Particles spaced along the line; shimmer staggered per stream.
        for (let k = 4; k < line.length - 2; k += 7) {
          const { dir, strength } = field(line[k][0], line[k][1], dirDeg, curl, wave);
          streamParticle(
            [line[k][0], line[k][1]],
            dir,
            color,
            si * 140 + Math.round((1 - strength) * 500)
          ).addTo(g);
        }
      });
      // Instrument chip with the real demo readings.
      const chipAt: [number, number] = [cx + R * (isWind ? 0.98 : 1.12), cy];
      L.marker(chipAt, {
        interactive: false,
        icon: L.divIcon({
          className: "",
          html: `<div style="font-family:ui-monospace,Menlo,monospace;font-size:8.5px;letter-spacing:0.14em;color:${color};background:rgba(7,13,22,0.82);border:1px solid ${color}44;padding:2px 7px;border-radius:3px;white-space:nowrap;">
            ${isWind ? "WIND" : "SURFACE CURRENT"} ${speedKn} kn → ${isWind ? environmental.windDirectionLabel : environmental.currentDirectionLabel}
          </div>`,
          iconSize: [170, 16],
          iconAnchor: [85, 8],
        }),
      }).addTo(g);
    };

    const currentSeeds: [number, number][] = [];
    const windSeeds: [number, number][] = [];
    for (let i = -2; i <= 2; i++) {
      // Staggered offsets so streams fan across the area rather than grid.
      currentSeeds.push([cx + i * R * 0.42 + R * 0.06, cy - R + i * R * 0.04]);
      windSeeds.push([cx + i * R * 0.5 - R * 0.04, cy - R * 1.08 + i * R * 0.03]);
    }

    drawStream(
      !!currentEnabled,
      environmental.currentDirection,
      environmental.currentSpeed,
      C.current,
      26, // curl amplitude — coherent arcs
      0.8,
      currentSeeds,
      1.8,
      false
    );
    drawStream(
      !!windEnabled,
      environmental.windDirection,
      environmental.windSpeed,
      C.wind,
      40, // wavier pattern
      2.1,
      windSeeds,
      1.3,
      true
    );
  }, [environmental, layers, incident]);

  // Hyperspectral thickness zones — concentric oil-thickness bands centred on
  // the slick axis (thickest at the core, sheen at the rim), with an
  // ocean-legible ramp instead of the invisible slate greys.
  useEffect(() => {
    if (!layersRef.current || !hyperspectral || !incident) return;
    const g = layersRef.current.thickness;
    g.clearLayers();

    const thickEnabled = layers.find((l) => l.id === "thickness" && l.enabled);
    if (!thickEnabled) return;

    const cx = incident.polygon.center[0];
    const cy = incident.polygon.center[1];
    const classes = hyperspectral.thicknessClasses;

    // Draw outermost (sheen) first so darker/thicker cores stack on top.
    const ordered = [...classes].reverse();
    ordered.forEach((tc, idx) => {
      const i = classes.length - 1 - idx; // original index (0 = thin sheen)
      const color = THICKNESS_RAMP[tc.label] ?? tc.color;
      const radiusKm = Math.max(2.2, incident.polygon.lengthKm * 0.22) * (1 - i * 0.18);
      L.circle([cx, cy], {
        radius: radiusKm * 1000,
        color,
        weight: 1.2,
        opacity: 0.75,
        fillColor: color,
        fillOpacity: 0.16 + (classes.length - 1 - i) * 0.07,
        dashArray: i === 0 ? "3 4" : undefined,
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

  // Optical layer — stylised true-colour acquisition footprint (SVG data-URI,
  // no assets, no network) centred on the incident.
  useEffect(() => {
    if (!layersRef.current) return;
    const g = layersRef.current.optical;
    g.clearLayers();

    const optEnabled = layers.find((l) => l.id === "optical" && l.enabled);
    if (!optEnabled || !incident) return;

    const c = incident.polygon.center;
    const halfW = 0.055; // ~6 km half-swath
    const halfH = 0.22; // ~24 km along-track footprint
    opticalSwathOverlay(c, halfW, halfH).addTo(g);

    // Pass track centreline + label
    L.polyline(
      [
        [c[0] + halfH, c[1]],
        [c[0] - halfH, c[1]],
      ] as L.LatLngTuple[],
      {
        color: "rgba(94,234,212,0.4)",
        weight: 1,
        dashArray: "6 6",
        interactive: false,
      }
    ).addTo(g);
    L.marker([c[0] + halfH * 0.62, c[1]], {
      interactive: false,
      icon: L.divIcon({
        className: "",
        html: `<div style="font-family:ui-monospace,Menlo,monospace;font-size:8px;letter-spacing:0.16em;color:rgba(153,246,228,0.85);background:rgba(7,13,22,0.8);border:1px solid rgba(94,234,212,0.3);padding:1px 6px;border-radius:3px;white-space:nowrap;">OPTICAL — SENTINEL-2</div>`,
        iconSize: [150, 14],
        iconAnchor: [75, 7],
      }),
    }).addTo(g);
  }, [layers, incident]);

  // Impact zone — 24h forecast reach: concentric shoreline-risk rings around
  // the spill centroid with a directional impact lobe along the drift axis.
  useEffect(() => {
    if (!layersRef.current || !incident) return;
    const g = layersRef.current.impact;
    g.clearLayers();

    const impEnabled = layers.find((l) => l.id === "impactZone" && l.enabled);
    if (!impEnabled) return;

    const c = incident.polygon.center as [number, number];

    // Base impact ring (48h drift reach cap ~45 km from forecast data).
    L.circle(c, {
      radius: 20000,
      color: C.impact,
      weight: 1.2,
      opacity: 0.55,
      fillColor: C.impact,
      fillOpacity: 0.04,
      dashArray: "4 6",
      interactive: false,
    }).addTo(g);
    L.circle(c, {
      radius: 36000,
      color: C.impact,
      weight: 1,
      opacity: 0.35,
      fillColor: C.impact,
      fillOpacity: 0.02,
      dashArray: "4 8",
      interactive: false,
    }).addTo(g);

    // Directional impact lobe along the observed drift axis (uses the actual
    // drift-result bearing when available — derived, not invented).
    const fwd = driftResult?.forward ?? [];
    const driftBearing =
      fwd.length > 1
        ? bearingDeg(
            [fwd[0].center[0], fwd[0].center[1]],
            [fwd[fwd.length - 1].center[0], fwd[fwd.length - 1].center[1]]
          )
        : 245; // fall back to the spill geometry axis from incident data

    const lobeKm = 42;
    const lobeLat = c[0] + (lobeKm / 111) * Math.cos((driftBearing * Math.PI) / 180);
    const lobeLon =
      c[1] +
      (lobeKm / (111 * Math.cos((c[0] * Math.PI) / 180))) *
        Math.sin((driftBearing * Math.PI) / 180);
    L.circle([lobeLat, lobeLon], {
      radius: 14000,
      color: C.impact,
      weight: 1.4,
      opacity: 0.6,
      fillColor: C.impact,
      fillOpacity: 0.07,
      className: "maris-impact-pulse",
      interactive: false,
    }).addTo(g);

    // Impact labels
    L.marker(c, {
      interactive: false,
      icon: L.divIcon({
        className: "",
        html: `<div style="font-family:ui-monospace,Menlo,monospace;font-size:8px;letter-spacing:0.16em;color:${C.impact};white-space:nowrap;transform:translateX(-50%);">IMPACT ZONE — 20 KM</div>`,
        iconSize: [140, 10],
        iconAnchor: [70, 5],
      }),
    }).addTo(g);
  }, [incident, driftResult, layers]);

  return (
    <div
      ref={mapRef}
      className="maris-map absolute inset-0 z-0"
      style={{ background: "#0a1a28" }}
    />
  );
}
