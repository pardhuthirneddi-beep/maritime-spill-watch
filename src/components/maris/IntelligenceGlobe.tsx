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
Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN as string;

interface IntelligenceGlobeProps {
  onBack: () => void;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────

export default function IntelligenceGlobe({ onBack }: IntelligenceGlobeProps) {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const entitiesRef = useRef<Map<string, Cesium.Entity>>(new Map());
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
  const [webglError, setWebglError] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

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
  useEffect(() => {
    const token = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN;
    if (!token) {
      setTokenMissing(true);
      return;
    }

    // Check WebGL availability
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) {
      setWebglError(true);
      return;
    }
  }, []);

  // ── Helper: get layer visibility ───────────────────────────────
  const isLayerVisible = useCallback(
    (layerId: Globe3dLayerId) => {
      return layers.find((l) => l.id === layerId)?.enabled ?? false;
    },
    [layers]
  );

  // ── Helper: show/hide entity by ID prefix ──────────────────────
  const setEntitiesVisible = useCallback(
    (prefix: string, visible: boolean) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const entities = viewer.entities.values;
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (entity.id && String(entity.id).startsWith(prefix)) {
          entity.show = visible;
        }
      }
    },
    []
  );

  // ── Initialize CesiumJS Viewer ────────────────────────────────
  useEffect(() => {
    if (!cesiumContainerRef.current || viewerRef.current) return;
    if (tokenMissing || webglError) return;

    let destroyed = false;

    const initViewer = () => {
      try {
        const viewer = new Cesium.Viewer(cesiumContainerRef.current!, {
          // Use Ion-default terrain
          terrain: Cesium.Terrain.fromWorldTerrain(),
          // Base imagery — dark Carto basemap
          baseLayer: false,
          skyAtmosphere: new Cesium.SkyAtmosphere(),
          skyBox: false,
          // UI controls — minimal
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
          // Performance
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
        scene.globe.depthTestAgainstTerrain = false;

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

        // Position camera to oblique view of the Indian Ocean / spill area
        const spillLon = incident.polygon.center[1];
        const spillLat = incident.polygon.center[0];
        viewer.camera.flyTo({
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
          duration: 0,
        });

        // Add all intelligence overlays
        addAllOverlays();
      } catch (err) {
        console.error("[MARIS] CesiumJS init failed:", err);
      }
    };

    initViewer();

    return () => {
      destroyed = true;
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      entitiesRef.current.clear();
    };
  }, [tokenMissing, webglError]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add all intelligence overlays to the Cesium scene ──────────
  const addAllOverlays = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const centerLon = incident.polygon.center[1];
    const centerLat = incident.polygon.center[0];

    // ── OIL SPILL POLYGON ─────────────────────────────────────
    addOilSpillPolygon(viewer);

    // ── DETECTION ZONE RING ───────────────────────────────────
    addDetectionZone(viewer, centerLon, centerLat);

    // ── AIS VESSEL TRACKS ─────────────────────────────────────
    addVesselTracks(viewer, null);

    // ── AIS VESSELS ───────────────────────────────────────────
    addVessels(viewer, null);

    // ── SATELLITE OBSERVATION ─────────────────────────────────
    addSatelliteObservation(viewer);

    // ── DRIFT PATHS ───────────────────────────────────────────
    addDriftPaths(viewer);

    // ── MARITIME GRID ─────────────────────────────────────────
    addMaritimeGrid(viewer);
  }, [incident]);

  // ── Oil Spill Polygon ──────────────────────────────────────────
  const addOilSpillPolygon = useCallback(
    (viewer: Cesium.Viewer) => {
      const coords = incident.polygon.coordinates;
      const centerLon = incident.polygon.center[1];
      const centerLat = incident.polygon.center[0];

      // Convert coordinates: [lat, lon] -> Cesium Cartesian3
      const positions = coords.map((c) =>
        Cesium.Cartesian3.fromDegrees(c[1], c[0], 10)
      );

      // Glow outline — wider, semi-transparent
      viewer.entities.add({
        id: "spill-glow",
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
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
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: Cesium.Color.fromCssColorString("#d4770a").withAlpha(0.30),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#fb923c").withAlpha(0.9),
          outlineWidth: 2,
          height: 15,
          extrudedHeight: 15,
        },
      });

      // Inner high-intensity region — darker amber
      const innerPositions = coords
        .slice(0, -1)
        .map((c) => {
          const lat = centerLat + (c[0] - centerLat) * 0.5;
          const lon = centerLon + (c[1] - centerLon) * 0.5;
          return Cesium.Cartesian3.fromDegrees(lon, lat, 16);
        });
      innerPositions.push(innerPositions[0]); // close polygon

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

      // Spill label — title
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

      // Spill label — details
      viewer.entities.add({
        id: "spill-label-detail",
        position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat + 0.15, 1200),
        label: {
          text: `Area: ${incident.polygon.areaKm2} km² | Confidence: ${incident.confidence.score}%`,
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
    },
    [incident]
  );

  // ── Detection Zone Ring ─────────────────────────────────────────
  const addDetectionZone = useCallback(
    (viewer: Cesium.Viewer, centerLon: number, centerLat: number) => {
      const zoneRadiusKm = 15;
      const points: Cesium.Cartesian3[] = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        const lat = centerLat + ((zoneRadiusKm / 111) * Math.cos(angle));
        const lon = centerLon + ((zoneRadiusKm / (111 * Math.cos((centerLat * Math.PI) / 180))) * Math.sin(angle));
        points.push(Cesium.Cartesian3.fromDegrees(lon, lat, 8));
      }

      viewer.entities.add({
        id: "detection-zone",
        polyline: {
          positions: points,
          width: 1,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString("#fb923c").withAlpha(0.4),
            dashLength: 16,
          }),
          clampToGround: true,
        },
      });
    },
    []
  );

  // ── AIS Vessel Tracks ──────────────────────────────────────────
  const addVesselTracks = useCallback(
    (viewer: Cesium.Viewer, currentVessel: AisVessel | null) => {
      DEMO_VESSELS.forEach((vessel) => {
        if (vessel.trajectory.length > 1) {
          const isSelected = currentVessel?.mmsi === vessel.mmsi;
          const positions = vessel.trajectory.map((c) =>
            Cesium.Cartesian3.fromDegrees(c[1], c[0], 5)
          );

          viewer.entities.add({
            id: `track-${vessel.mmsi}`,
            polyline: {
              positions,
              width: isSelected ? 2.5 : 1.5,
              material: isSelected
                ? Cesium.Color.fromCssColorString("#22d3ee").withAlpha(0.6)
                : Cesium.Color.fromCssColorString("#3388cc").withAlpha(0.35),
              clampToGround: true,
            },
          });

          // Direction arrow at midpoint
          if (vessel.trajectory.length >= 2) {
            const midIdx = Math.floor(vessel.trajectory.length / 2);
            const mid = vessel.trajectory[midIdx];
            const prev = vessel.trajectory[midIdx - 1];
            const angle = Math.atan2(mid[1] - prev[1], mid[0] - prev[0]);
            const arrowLen = 0.12;

            viewer.entities.add({
              id: `track-arrow-${vessel.mmsi}`,
              polyline: {
                positions: [
                  Cesium.Cartesian3.fromDegrees(mid[1], mid[0], 5),
                  Cesium.Cartesian3.fromDegrees(
                    mid[1] + arrowLen * Math.sin(angle - 0.4),
                    mid[0] + arrowLen * Math.cos(angle - 0.4),
                    5
                  ),
                  Cesium.Cartesian3.fromDegrees(mid[1], mid[0], 5),
                  Cesium.Cartesian3.fromDegrees(
                    mid[1] + arrowLen * Math.sin(angle + 0.4),
                    mid[0] + arrowLen * Math.cos(angle + 0.4),
                    5
                  ),
                ],
                width: 1,
                material: Cesium.Color.fromCssColorString(
                  isSelected ? "#22d3ee" : "#3388cc"
                ).withAlpha(0.5),
                clampToGround: true,
              },
            });
          }
        }
      });
    },
    []
  );

  // ── AIS Vessels ────────────────────────────────────────────────
  const addVessels = useCallback(
    (viewer: Cesium.Viewer, currentVessel: AisVessel | null) => {
      DEMO_VESSELS.forEach((vessel) => {
        const isSelected = currentVessel?.mmsi === vessel.mmsi;

        // Ship marker (billboard)
        viewer.entities.add({
          id: `vessel-${vessel.mmsi}`,
          name: vessel.name,
          position: Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 30),
          billboard: {
            image: createShipSvg(vessel, isSelected),
            width: isSelected ? 36 : 28,
            height: isSelected ? 36 : 28,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scale: 1,
          },
          label: {
            text: `${vessel.name}\n${vessel.speed} kn → ${vessel.heading}°`,
            font: "bold 9px monospace",
            fillColor: isSelected
              ? Cesium.Color.fromCssColorString("#22d3ee").withAlpha(0.95)
              : Cesium.Color.fromCssColorString("#b4be c8").withAlpha(0.7),
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
        const headingRad = ((vessel.heading - 90) * Math.PI) / 180;
        const lineLen = 0.08;
        viewer.entities.add({
          id: `vessel-heading-${vessel.mmsi}`,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 30),
              Cesium.Cartesian3.fromDegrees(
                vessel.lon + lineLen * Math.cos(headingRad),
                vessel.lat + lineLen * Math.sin(headingRad),
                30
              ),
            ],
            width: isSelected ? 2 : 1,
            material: Cesium.Color.fromCssColorString(
              isSelected ? "#22d3ee" : "#55aaff"
            ).withAlpha(0.7),
          },
        });
      });
    },
    []
  );

  // ── Satellite Observation ───────────────────────────────────────
  const addSatelliteObservation = useCallback(
    (viewer: Cesium.Viewer) => {
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

      // Satellite position marker (in orbit)
      const satLon = obs.swathCenter[1] + 1.5;
      const satLat = obs.swathCenter[0] + 1.2;
      const satAlt = obs.orbitAltitude * 1000;

      viewer.entities.add({
        id: "satellite-marker",
        name: `${obs.satellite} — Pass 08921`,
        position: Cesium.Cartesian3.fromDegrees(satLon, satLat, satAlt),
        billboard: {
          image: createSatelliteSvg(),
          width: 40,
          height: 40,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${obs.satellite}\nPASS 08921\n${new Date(obs.timestamp)
            .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            .toUpperCase()} ${new Date(obs.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC`,
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
      ];

      const swathPositions = swathCorners.map((c) =>
        Cesium.Cartesian3.fromDegrees(c[0], c[1], 5)
      );
      swathPositions.push(swathPositions[0]); // close polygon

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

      // Connection line from satellite to spill center
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
    },
    []
  );

  // ── Drift Paths ────────────────────────────────────────────────
  const addDriftPaths = useCallback(
    (viewer: Cesium.Viewer) => {
      // Forward drift
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

        // Time labels
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
        });

        // Forward polygons (semi-transparent for each time step)
        DEMO_DRIFT.forward.forEach((point, i) => {
          if (i === 0) return;
          const polyPositions = point.polygon.map((c) =>
            Cesium.Cartesian3.fromDegrees(c[1], c[0], 8 + i * 2)
          );
          viewer.entities.add({
            id: `drift-polygon-${i}`,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(polyPositions),
              material: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.03 * (5 - i)),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString("#f97316").withAlpha(0.15 * (5 - i)),
              outlineWidth: 1,
              height: 8 + i * 2,
            },
          });
        });
      }

      // Backtrack
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
    },
    []
  );

  // ── Maritime Grid ──────────────────────────────────────────────
  const addMaritimeGrid = useCallback(
    (viewer: Cesium.Viewer) => {
      const gridLines: { id: string; positions: Cesium.Cartesian3[] }[] = [];

      // Latitude lines
      for (let lat = 5; lat <= 20; lat += 5) {
        const positions: Cesium.Cartesian3[] = [];
        for (let lon = 80; lon <= 95; lon += 0.5) {
          positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, 3));
        }
        gridLines.push({ id: `grid-lat-${lat}`, positions });
      }

      // Longitude lines
      for (let lon = 81; lon <= 93; lon += 3) {
        const positions: Cesium.Cartesian3[] = [];
        for (let lat = 5; lat <= 20; lat += 0.5) {
          positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, 3));
        }
        gridLines.push({ id: `grid-lon-${lon}`, positions });
      }

      gridLines.forEach(({ id, positions }) => {
        viewer.entities.add({
          id,
          polyline: {
            positions,
            width: 0.5,
            material: Cesium.Color.fromCssColorString("#334155").withAlpha(0.25),
          },
        });
      });
    },
    []
  );

  // ── Update graphics when layers/selection change ────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Toggle entity visibility by layer
    setEntitiesVisible("vessel-", isLayerVisible("globe_vessels"));
    setEntitiesVisible("track-", isLayerVisible("globe_tracks"));
    setEntitiesVisible("spill-", isLayerVisible("globe_spill"));
    setEntitiesVisible("drift-", isLayerVisible("globe_spill"));
    setEntitiesVisible("sat-", isLayerVisible("globe_satellite"));
    setEntitiesVisible("satellite-", isLayerVisible("globe_satellite"));
    setEntitiesVisible("detection-zone", isLayerVisible("globe_detection_zones"));
    setEntitiesVisible("grid-", isLayerVisible("globe_grid"));
  }, [layers, setEntitiesVisible, isLayerVisible]);

  // ── Handle vessel selection ─────────────────────────────────────
  const handleVesselSelect = useCallback(
    (vessel: AisVessel) => {
      setSelectedVessel(vessel);
      const viewer = viewerRef.current;
      if (!viewer) return;

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          vessel.lon + 0.5,
          vessel.lat - 0.3,
          600000
        ),
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
        if (p >= timeSteps.length - 1) {
          setIsPlaying(false);
          return p;
        }
        return p + 1;
      });
    }, 1000 / playSpeed);
    return () => clearInterval(iv);
  }, [isPlaying, playSpeed, timeSteps.length]);

  // ── Error / missing token screen ────────────────────────────────
  if (tokenMissing) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-center max-w-md">
          <p className="text-sm font-semibold text-zinc-200 mb-2">
            Cesium ion Access Token Not Configured
          </p>
          <p className="text-[11px] text-zinc-500 mb-4">
            Add <code className="text-cyan-400">VITE_CESIUM_ION_ACCESS_TOKEN</code> to your{" "}
            <code className="text-cyan-400">.env.local</code> file.
          </p>
          <button
            onClick={onBack}
            className="text-[10px] text-zinc-400 hover:text-zinc-200 underline"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (webglError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-center max-w-md">
          <p className="text-sm font-semibold text-zinc-200 mb-2">WebGL Not Available</p>
          <p className="text-[11px] text-zinc-500 mb-4">
            3D Intelligence requires WebGL to render the 3D globe. Please enable WebGL or use a
            compatible browser.
          </p>
          <button
            onClick={onBack}
            className="text-[10px] text-zinc-400 hover:text-zinc-200 underline"
          >
            ← Back to Dashboard
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

        {/* ─── CESIUM 3D GLOBE ──────────────────────────────── */}
        <main className="flex-1 relative">
          <div ref={cesiumContainerRef} className="absolute inset-0 cesium-container" />

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
