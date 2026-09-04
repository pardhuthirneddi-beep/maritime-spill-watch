// maris — 3D Geospatial Intelligence Globe
// Professional maritime satellite intelligence command center
// Uses CesiumJS + Cesium ion for realistic 3D globe visualization
import { useRef, useEffect, useState, useCallback } from "react";
import * as Cesium from "cesium";
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

// Configure Cesium ion access token from environment variable
const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN as string;
if (CESIUM_TOKEN) {
  Cesium.Ion.defaultAccessToken = CESIUM_TOKEN;
}

interface IntelligenceGlobeProps {
  onBack: () => void;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────

export default function IntelligenceGlobe({ onBack }: IntelligenceGlobeProps) {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const overlaysAddedRef = useRef(false);
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
  const [viewerReady, setViewerReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

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

  // ── Check for Cesium ion token ────────────────────────────────
  const hasToken = !!CESIUM_TOKEN;

  // ── Initialize CesiumJS Viewer ────────────────────────────────
  useEffect(() => {
    if (!cesiumContainerRef.current || viewerRef.current) return;
    if (!hasToken) return;

    let destroyed = false;

    const initViewer = async () => {
      try {
        const viewer = new Cesium.Viewer(cesiumContainerRef.current!, {
          baseLayer: false,
          skyAtmosphere: new Cesium.SkyAtmosphere() as any,
          skyBox: false,
          terrain: undefined,
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          infoBox: false,
          selectionIndicator: false,
          fullscreenButton: false,
          vrButton: false,
          requestRenderMode: false,
          maximumRenderTimeChange: Infinity,
          targetFrameRate: 60,
        });

        if (destroyed) {
          viewer.destroy();
          return;
        }

        const { scene } = viewer;

        // Dark background
        scene.backgroundColor = Cesium.Color.fromCssColorString("#020508");
        scene.fog.enabled = true;
        scene.fog.density = 0.00015;
        scene.fog.screenSpaceErrorFactor = 4;

        // Atmosphere
        if (scene.skyAtmosphere) {
          scene.skyAtmosphere.show = true;
        }

        // Camera controller
        scene.screenSpaceCameraController.enableInputs = true;
        scene.screenSpaceCameraController.minimumZoomDistance = 100000;
        scene.screenSpaceCameraController.maximumZoomDistance = 20000000;

        // Globe styling
        scene.globe.enableLighting = true;

        // Add dark Carto basemap imagery
        const CARTO_API_KEY = "cb1_2u58_1_bf57649a9ebd93a4418be433";
        const darkBasemap = new Cesium.UrlTemplateImageryProvider({
          url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
          subdomains: ["a", "b", "c", "d"],
          credit: new Cesium.Credit("CartoDB", false),
          maximumLevel: 18,
        });
        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(darkBasemap);

        viewerRef.current = viewer;

        // Position camera — oblique view of the Indian Ocean / spill area
        const spillLon = incident.polygon.center[1];
        const spillLat = incident.polygon.center[0];
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(
            spillLon + 3.5,
            spillLat - 2.5,
            1800000
          ),
          orientation: {
            heading: Cesium.Math.toRadians(340),
            pitch: Cesium.Math.toRadians(-42),
            roll: 0,
          },
        });

        setViewerReady(true);
      } catch (err) {
        console.error("[MARIS] CesiumJS init failed:", err);
        setInitError(err instanceof Error ? err.message : "Failed to initialize CesiumJS");
      }
    };

    initViewer();

    return () => {
      destroyed = true;
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      overlaysAddedRef.current = false;
    };
  }, [hasToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add intelligence overlays once viewer is ready ─────────────
  useEffect(() => {
    if (!viewerReady || !viewerRef.current || overlaysAddedRef.current) return;
    overlaysAddedRef.current = true;

    const viewer = viewerRef.current;
    const centerLon = incident.polygon.center[1];
    const centerLat = incident.polygon.center[0];

    // ═══════════════════════════════════════════════════════════
    // OIL SPILL POLYGON
    // ═══════════════════════════════════════════════════════════
    const spillCoords = incident.polygon.coordinates;
    const spillPositions = spillCoords.map((c) =>
      Cesium.Cartesian3.fromDegrees(c[1], c[0], 10)
    );

    // Glow outline
    viewer.entities.add({
      id: "spill-glow",
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(spillPositions),
        material: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.08),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#fb923c").withAlpha(0.35),
        outlineWidth: 6,
        height: 10,
        extrudedHeight: 10,
      },
    });

    // Main spill polygon — amber fill
    viewer.entities.add({
      id: "spill-main",
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(spillPositions),
        material: Cesium.Color.fromCssColorString("#d4770a").withAlpha(0.30),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#fb923c").withAlpha(0.9),
        outlineWidth: 2,
        height: 15,
        extrudedHeight: 15,
      },
    });

    // Inner high-intensity region
    const innerPositions = spillCoords
      .slice(0, -1)
      .map((c) => {
        const lat = centerLat + (c[0] - centerLat) * 0.5;
        const lon = centerLon + (c[1] - centerLon) * 0.5;
        return Cesium.Cartesian3.fromDegrees(lon, lat, 16);
      });
    innerPositions.push(innerPositions[0]);

    viewer.entities.add({
      id: "spill-inner",
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(innerPositions),
        material: Cesium.Color.fromCssColorString("#92400e").withAlpha(0.4),
        outline: false,
        height: 18,
        extrudedHeight: 18,
      },
    });

    // Spill label
    viewer.entities.add({
      id: "spill-label",
      position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat + 0.22, 1200),
      label: {
        text: "OIL SPILL DETECTION",
        font: "bold 12px monospace",
        fillColor: Cesium.Color.fromCssColorString("#fb923c").withAlpha(0.95),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scale: 1,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#020508").withAlpha(0.85),
      },
    });

    // Spill detail label
    viewer.entities.add({
      id: "spill-label-detail",
      position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat + 0.15, 1200),
      label: {
        text: `Area: ${incident.polygon.areaKm2} km\u00B2 | Confidence: ${incident.confidence.score}%`,
        font: "10px monospace",
        fillColor: Cesium.Color.fromCssColorString("#c8c8c8").withAlpha(0.8),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scale: 1,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#020508").withAlpha(0.8),
      },
    });

    // ═══════════════════════════════════════════════════════════
    // DETECTION ZONE RING (15km)
    // ═══════════════════════════════════════════════════════════
    const zoneRadiusKm = 15;
    const zonePoints: Cesium.Cartesian3[] = [];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      const zLat = centerLat + (zoneRadiusKm / 111) * Math.cos(angle);
      const zLon = centerLon + (zoneRadiusKm / (111 * Math.cos((centerLat * Math.PI) / 180))) * Math.sin(angle);
      zonePoints.push(Cesium.Cartesian3.fromDegrees(zLon, zLat, 8));
    }
    viewer.entities.add({
      id: "detection-zone",
      polyline: {
        positions: zonePoints,
        width: 1,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString("#fb923c").withAlpha(0.4),
          dashLength: 16,
        }),
        clampToGround: true,
      },
    });

    // ═══════════════════════════════════════════════════════════
    // AIS VESSEL TRACKS
    // ═══════════════════════════════════════════════════════════
    DEMO_VESSELS.forEach((vessel) => {
      if (vessel.trajectory.length > 1) {
        const positions = vessel.trajectory.map((c) =>
          Cesium.Cartesian3.fromDegrees(c[1], c[0], 5)
        );
        viewer.entities.add({
          id: `track-${vessel.mmsi}`,
          polyline: {
            positions,
            width: 1.5,
            material: Cesium.Color.fromCssColorString("#3388cc").withAlpha(0.35),
            clampToGround: true,
          },
        });

        // Direction arrow at midpoint
        if (vessel.trajectory.length >= 2) {
          const midIdx = Math.floor(vessel.trajectory.length / 2);
          const mid = vessel.trajectory[midIdx];
          const prev = vessel.trajectory[midIdx - 1];
          const ang = Math.atan2(mid[1] - prev[1], mid[0] - prev[0]);
          const aLen = 0.12;
          viewer.entities.add({
            id: `track-arrow-${vessel.mmsi}`,
            polyline: {
              positions: [
                Cesium.Cartesian3.fromDegrees(mid[1], mid[0], 5),
                Cesium.Cartesian3.fromDegrees(mid[1] + aLen * Math.sin(ang - 0.4), mid[0] + aLen * Math.cos(ang - 0.4), 5),
                Cesium.Cartesian3.fromDegrees(mid[1], mid[0], 5),
                Cesium.Cartesian3.fromDegrees(mid[1] + aLen * Math.sin(ang + 0.4), mid[0] + aLen * Math.cos(ang + 0.4), 5),
              ],
              width: 1,
              material: Cesium.Color.fromCssColorString("#3388cc").withAlpha(0.5),
              clampToGround: true,
            },
          });
        }
      }
    });

    // ═══════════════════════════════════════════════════════════
    // AIS VESSELS
    // ═══════════════════════════════════════════════════════════
    DEMO_VESSELS.forEach((vessel) => {
      // Ship billboard
      viewer.entities.add({
        id: `vessel-${vessel.mmsi}`,
        name: vessel.name,
        position: Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 30),
        billboard: {
          image: createShipSvg(vessel, false),
          width: 28,
          height: 28,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scale: 1,
        },
        label: {
          text: `${vessel.name}\n${vessel.speed} kn \u2192 ${vessel.heading}\u00B0`,
          font: "bold 9px monospace",
          fillColor: Cesium.Color.fromCssColorString("#b4bec8").withAlpha(0.7),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1.5,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -22),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scale: 1,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("#020508").withAlpha(0.85),
        },
      });

      // Heading indicator line
      const hRad = ((vessel.heading - 90) * Math.PI) / 180;
      const lineLen = 0.08;
      viewer.entities.add({
        id: `vessel-heading-${vessel.mmsi}`,
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 30),
            Cesium.Cartesian3.fromDegrees(
              vessel.lon + lineLen * Math.cos(hRad),
              vessel.lat + lineLen * Math.sin(hRad),
              30
            ),
          ],
          width: 1,
          material: Cesium.Color.fromCssColorString("#55aaff").withAlpha(0.7),
        },
      });
    });

    // ═══════════════════════════════════════════════════════════
    // SATELLITE OBSERVATION
    // ═══════════════════════════════════════════════════════════
    const obs = DEMO_SATELLITE_OBSERVATION;

    // Ground track
    if (obs.groundTrack.length > 1) {
      const trackPositions = obs.groundTrack.map((c) =>
        Cesium.Cartesian3.fromDegrees(c[1], c[0], 5)
      );
      viewer.entities.add({
        id: "sat-ground-track",
        polyline: {
          positions: trackPositions,
          width: 1.5,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString("#44cc88").withAlpha(0.5),
            dashLength: 16,
          }),
          clampToGround: true,
        },
      });
    }

    // Satellite marker in orbit
    const satLon = obs.swathCenter[1] + 1.5;
    const satLat = obs.swathCenter[0] + 1.2;
    const satAlt = obs.orbitAltitude * 1000;

    viewer.entities.add({
      id: "satellite-marker",
      name: `${obs.satellite} - Pass 08921`,
      position: Cesium.Cartesian3.fromDegrees(satLon, satLat, satAlt),
      billboard: {
        image: createSatelliteSvg(),
        width: 40,
        height: 40,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `${obs.satellite}\nPASS 08921\n${new Date(obs.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()} ${new Date(obs.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC`,
        font: "bold 10px monospace",
        fillColor: Cesium.Color.fromCssColorString("#44cc88").withAlpha(0.8),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1.5,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -28),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#020508").withAlpha(0.85),
      },
    });

    // Swath footprint
    const swathHalfW = obs.swathWidth / 2 / 111000;
    const swathHalfL = obs.swathLength / 2 / 111000;
    const swathA = ((obs.orbitInclination > 90 ? 170 : 10) * Math.PI) / 180;
    const cosA = Math.cos(swathA);
    const sinA = Math.sin(swathA);
    const scLat = obs.swathCenter[0];
    const scLon = obs.swathCenter[1];
    const swathCorners = [
      [scLon - swathHalfL * sinA - swathHalfW * cosA, scLat - swathHalfL * cosA + swathHalfW * sinA],
      [scLon - swathHalfL * sinA + swathHalfW * cosA, scLat - swathHalfL * cosA - swathHalfW * sinA],
      [scLon + swathHalfL * sinA + swathHalfW * cosA, scLat + swathHalfL * cosA - swathHalfW * sinA],
      [scLon + swathHalfL * sinA - swathHalfW * cosA, scLat + swathHalfL * cosA + swathHalfW * sinA],
    ];
    const swathPositions = swathCorners.map((c) => Cesium.Cartesian3.fromDegrees(c[0], c[1], 5));
    swathPositions.push(swathPositions[0]);

    viewer.entities.add({
      id: "sat-swath",
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(swathPositions),
        material: Cesium.Color.fromCssColorString("#44cc88").withAlpha(0.04),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#44cc88").withAlpha(0.2),
        outlineWidth: 1,
        height: 5,
      },
    });

    // Connection line from satellite to spill
    viewer.entities.add({
      id: "sat-connection",
      polyline: {
        positions: [
          Cesium.Cartesian3.fromDegrees(satLon, satLat, satAlt),
          Cesium.Cartesian3.fromDegrees(scLon, scLat, 15),
        ],
        width: 1,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString("#44cc88").withAlpha(0.25),
          dashLength: 8,
        }),
      },
    });

    // ═══════════════════════════════════════════════════════════
    // DRIFT PATHS
    // ═══════════════════════════════════════════════════════════
    if (DEMO_DRIFT.forward.length > 1) {
      const fwdPositions = DEMO_DRIFT.forward.map((p) =>
        Cesium.Cartesian3.fromDegrees(p.center[1], p.center[0], 8)
      );
      viewer.entities.add({
        id: "drift-forward",
        polyline: {
          positions: fwdPositions,
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.5),
            dashLength: 16,
          }),
          clampToGround: true,
        },
      });

      // Time labels + polygons
      DEMO_DRIFT.forward.forEach((point, i) => {
        if (i === 0) return;
        viewer.entities.add({
          id: `drift-label-${i}`,
          position: Cesium.Cartesian3.fromDegrees(point.center[1], point.center[0], 100),
          label: {
            text: point.time,
            font: "8px monospace",
            fillColor: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.6 + (4 - i) * 0.08),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scale: 1,
          },
        });

        const polyPos = point.polygon.map((c) =>
          Cesium.Cartesian3.fromDegrees(c[1], c[0], 8 + i * 2)
        );
        viewer.entities.add({
          id: `drift-polygon-${i}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(polyPos),
            material: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.03 * (5 - i)),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.15 * (5 - i)),
            outlineWidth: 1,
            height: 8 + i * 2,
          },
        });
      });
    }

    if (DEMO_DRIFT.backtrack.length > 1) {
      const btPositions = DEMO_DRIFT.backtrack.map((p) =>
        Cesium.Cartesian3.fromDegrees(p.center[1], p.center[0], 8)
      );
      viewer.entities.add({
        id: "drift-backtrack",
        polyline: {
          positions: btPositions,
          width: 1.5,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString("#a78bfa").withAlpha(0.4),
            dashLength: 12,
          }),
          clampToGround: true,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // MARITIME GRID
    // ═══════════════════════════════════════════════════════════
    for (let lat = 5; lat <= 20; lat += 5) {
      const pts: Cesium.Cartesian3[] = [];
      for (let lon = 80; lon <= 95; lon += 0.5) pts.push(Cesium.Cartesian3.fromDegrees(lon, lat, 3));
      viewer.entities.add({
        id: `grid-lat-${lat}`,
        polyline: { positions: pts, width: 0.5, material: Cesium.Color.fromCssColorString("#334155").withAlpha(0.25) },
      });
    }
    for (let lon = 81; lon <= 93; lon += 3) {
      const pts: Cesium.Cartesian3[] = [];
      for (let lat = 5; lat <= 20; lat += 0.5) pts.push(Cesium.Cartesian3.fromDegrees(lon, lat, 3));
      viewer.entities.add({
        id: `grid-lon-${lon}`,
        polyline: { positions: pts, width: 0.5, material: Cesium.Color.fromCssColorString("#334155").withAlpha(0.25) },
      });
    }
  }, [viewerReady, incident]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Layer toggle visibility ────────────────────────────────────
  const setEntitiesVisible = useCallback((prefix: string, visible: boolean) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const entities = viewer.entities.values;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (entity.id && String(entity.id).startsWith(prefix)) {
        entity.show = visible;
      }
    }
  }, []);

  const isLayerVisible = useCallback((layerId: Globe3dLayerId) => {
    return layers.find((l) => l.id === layerId)?.enabled ?? false;
  }, [layers]);

  useEffect(() => {
    if (!viewerRef.current) return;
    setEntitiesVisible("vessel-", isLayerVisible("globe_vessels"));
    setEntitiesVisible("vessel-heading-", isLayerVisible("globe_vessels"));
    setEntitiesVisible("track-", isLayerVisible("globe_tracks"));
    setEntitiesVisible("track-arrow-", isLayerVisible("globe_tracks"));
    setEntitiesVisible("spill-", isLayerVisible("globe_spill"));
    setEntitiesVisible("drift-", isLayerVisible("globe_spill"));
    setEntitiesVisible("sat-", isLayerVisible("globe_satellite"));
    setEntitiesVisible("satellite-", isLayerVisible("globe_satellite"));
    setEntitiesVisible("detection-zone", isLayerVisible("globe_detection_zones"));
    setEntitiesVisible("grid-", isLayerVisible("globe_grid"));
  }, [layers, setEntitiesVisible, isLayerVisible]);

  // ── Vessel selection + camera fly ──────────────────────────────
  const handleVesselSelect = useCallback((vessel: AisVessel) => {
    setSelectedVessel(vessel);
    const viewer = viewerRef.current;
    if (!viewer) return;        // Update vessel billboards
        viewer.entities.values.forEach((entity: any) => {
          if (entity.id && String(entity.id).startsWith("vessel-") && !String(entity.id).startsWith("vessel-heading-")) {
            const mmsi = String(entity.id).replace("vessel-", "");
            const isSelected = mmsi === vessel.mmsi;
            if (entity.billboard) {
              entity.billboard.image = createShipSvg(
                DEMO_VESSELS.find((v) => v.mmsi === mmsi)!,
                isSelected
              );
              entity.billboard.width = isSelected ? 36 : 28;
              entity.billboard.height = isSelected ? 36 : 28;
            }
            if (entity.label) {
              entity.label.fillColor = isSelected
                ? Cesium.Color.fromCssColorString("#22d3ee").withAlpha(0.95)
                : Cesium.Color.fromCssColorString("#b4bec8").withAlpha(0.7);
            }
            if (entity.polyline) {
              entity.polyline.material = Cesium.Color.fromCssColorString(isSelected ? "#22d3ee" : "#55aaff").withAlpha(0.7);
              entity.polyline.width = isSelected ? 2 : 1;
            }
          }
          // Highlight selected vessel track
          if (entity.id && String(entity.id).startsWith("track-") && !String(entity.id).startsWith("track-arrow-")) {
            const mmsi = String(entity.id).replace("track-", "");
            const isSelected = mmsi === vessel.mmsi;
            if (entity.polyline) {
              entity.polyline.material = isSelected
                ? Cesium.Color.fromCssColorString("#22d3ee").withAlpha(0.6)
                : Cesium.Color.fromCssColorString("#3388cc").withAlpha(0.35);
              entity.polyline.width = isSelected ? 2.5 : 1.5;
            }
          }
        });

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(vessel.lon + 0.5, vessel.lat - 0.3, 600000),
      orientation: {
        heading: Cesium.Math.toRadians(350),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: 2,
    });
  }, []);

  // ── Fly to spill ────────────────────────────────────────────────
  const flyToSpill = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        incident.polygon.center[1] + 3.5,
        incident.polygon.center[0] - 2.5,
        1800000
      ),
      orientation: {
        heading: Cesium.Math.toRadians(340),
        pitch: Cesium.Math.toRadians(-42),
        roll: 0,
      },
      duration: 2,
    });
  }, [incident]);

  // ── Toggle layer ────────────────────────────────────────────────
  const toggleLayer = useCallback((id: Globe3dLayerId) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)));
  }, []);

  // ── Playback ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;
    const iv = setInterval(() => {
      setTimeStep((p) => {
        if (p >= timeSteps.length - 1) { setIsPlaying(false); return p; }
        return p + 1;
      });
    }, 1000 / playSpeed);
    return () => clearInterval(iv);
  }, [isPlaying, playSpeed, timeSteps.length]);

  // ── Missing token screen ────────────────────────────────────────
  if (!hasToken) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-center max-w-md p-8">
          <div className="flex justify-center mb-4">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10">
              <Navigation className="size-8 text-cyan-400" />
            </div>
          </div>
          <p className="text-sm font-semibold text-zinc-200 mb-2">
            Cesium ion Access Token Not Configured
          </p>
          <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
            Add <code className="text-cyan-400 bg-zinc-800 px-1.5 py-0.5 rounded">VITE_CESIUM_ION_ACCESS_TOKEN</code> to the
            Keys / API keys tab with your Cesium ion token.
          </p>
          <button onClick={onBack} className="text-[10px] text-zinc-400 hover:text-zinc-200 underline">
            &larr; Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-center max-w-md p-8">
          <p className="text-sm font-semibold text-zinc-200 mb-2">3D Globe Initialization Failed</p>
          <p className="text-[11px] text-zinc-500 mb-4 break-words">{initError}</p>
          <button onClick={onBack} className="text-[10px] text-zinc-400 hover:text-zinc-200 underline">
            &larr; Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────
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
                    <span>{v.speed} kn</span><span>&rarr; {v.heading}&deg;</span>
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
                  <div className="text-[8px] text-zinc-600">&bull;</div>
                  <span className="text-[10px] text-zinc-400 flex-1">{l.label}</span>
                  <div className={cn("w-7 h-3.5 rounded-full transition-colors relative", l.enabled ? "bg-cyan-500/30" : "bg-zinc-700/50")}>
                    <div className={cn("absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all", l.enabled ? "left-3.5 bg-cyan-400" : "left-0.5 bg-zinc-500")} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ─── CESIUM 3D GLOBE ──────────────────────────────── */}
        <main className="flex-1 relative">
          <div ref={cesiumContainerRef} className="absolute inset-0 cesium-container" />

          {/* Loading overlay */}
          {!viewerReady && !initError && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#020508]">
              <div className="text-center">
                <div className="flex justify-center mb-3">
                  <div className="size-10 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
                </div>
                <div className="text-[11px] text-zinc-300 font-medium">Initializing 3D Intelligence Globe...</div>
                <div className="text-[9px] text-zinc-600 mt-1">Loading CesiumJS + ion terrain</div>
              </div>
            </div>
          )}

          {/* Compass / nav overlay */}
          <div className="absolute bottom-20 left-6 z-10">
            <div className="flex flex-col items-center gap-0.5">
              <button className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300"><ChevronRight className="size-3 rotate-[-90deg]" /></button>
              <div className="flex gap-0.5">
                <button className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300"><ChevronRight className="size-3 rotate-[180deg]" /></button>
                <button onClick={flyToSpill} className="size-7 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300"><Crosshair className="size-3" /></button>
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
              <EvtField label="LOCATION" value={`${incident.coordinates[0].toFixed(2)}\u00B0 N, ${incident.coordinates[1].toFixed(2)}\u00B0 E`} />
              <EvtField label="AREA" value={`${incident.polygon.areaKm2} km\u00B2`} />
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
                {affectedVessels.map((v, i) => (
                  <button key={v.mmsi} onClick={() => handleVesselSelect(v)} className="w-full text-left flex items-start gap-2 hover:bg-zinc-800/30 rounded p-1 -mx-1 transition-colors">
                    <Ship className="size-3 text-zinc-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-300">{v.name}</div>
                      <div className="text-[9px] text-zinc-500">{v.speed} kn &rarr; {v.heading}&deg; &middot; {(6 + i * 2.5).toFixed(1)} nm</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Confidence Factors</h3>
              <div className="space-y-1">
                {incident.confidence.factors.slice(0, 3).map((f, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-emerald-500 text-[8px] mt-px">&bull;</span>
                    <span className="text-[9px] text-zinc-400 leading-tight">{f}</span>
                  </div>
                ))}
              </div>
            </div>

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

            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
              <div className="text-[8px] text-amber-400/70 leading-relaxed">
                Demonstration data &mdash; vessel identities, detection results, and environmental conditions are synthetic. Not derived from live satellite or AIS feeds.
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── SVG HELPERS ────────────────────────────────────────────────────

function createShipSvg(vessel: AisVessel, selected: boolean): string {
  const size = selected ? 36 : 28;
  const stroke = selected ? "#22d3ee" : "#ffffff";
  const fill = selected ? "#22d3ee" : "#55aaff";
  const bg = selected ? "#0e7490" : "#3388cc";
  const sw = selected ? "1.5" : "1";

  const headingRad = ((vessel.heading - 90) * Math.PI) / 180;
  const cx = size / 2;
  const cy = size / 2;
  const noseLen = size * 0.35;
  const wingLen = size * 0.18;
  const wingSpread = size * 0.15;

  const noseX = cx + noseLen * Math.cos(headingRad);
  const noseY = cy + noseLen * Math.sin(headingRad);
  const leftX = cx + wingLen * Math.cos(headingRad - Math.PI / 2) + wingSpread * Math.cos(headingRad);
  const leftY = cy + wingLen * Math.sin(headingRad - Math.PI / 2) + wingSpread * Math.sin(headingRad);
  const rightX = cx + wingLen * Math.cos(headingRad + Math.PI / 2) + wingSpread * Math.cos(headingRad);
  const rightY = cy + wingLen * Math.sin(headingRad + Math.PI / 2) + wingSpread * Math.sin(headingRad);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<polygon points="${noseX},${noseY} ${leftX},${leftY} ${rightX},${rightY}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="0.95"/>`
    + `<rect x="${cx - 5}" y="${cy - 3}" width="10" height="6" rx="1" fill="${bg}" stroke="${stroke}" stroke-width="${sw}"/>`
    + `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function createSatelliteSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">`
    + `<rect x="12" y="14" width="16" height="12" rx="2" fill="#1a1a2e" stroke="#44cc88" stroke-width="1.5"/>`
    + `<rect x="0" y="16" width="12" height="8" rx="1" fill="#22c55e" stroke="#44cc88" stroke-width="1" opacity="0.8"/>`
    + `<rect x="28" y="16" width="12" height="8" rx="1" fill="#22c55e" stroke="#44cc88" stroke-width="1" opacity="0.8"/>`
    + `<circle cx="20" cy="20" r="3" fill="#44cc88" opacity="0.9"/>`
    + `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ─── HELPER COMPONENTS ──────────────────────────────────────────────

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
