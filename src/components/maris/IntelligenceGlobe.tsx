// maris — 3D Geospatial Intelligence Globe
// Maritime command center visualization using Three.js
import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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
import { generateEarthTexture } from "@/components/maris/earthTexture";
import type {
  AisVessel,
  Globe3dLayer,
  Globe3dLayerId,
} from "@/data/types";

// ─── CONSTANTS ──────────────────────────────────────────────────────

const GLOBE_RADIUS = 5;
const ATMOSPHERE_RADIUS = 5.12;
const EARTH_CENTER = new THREE.Vector3(0, 0, 0);

// Layer entity group names for visibility control
const LAYER_GROUP_NAMES: Record<Globe3dLayerId, string> = {
  globe_vessels: "vessels",
  globe_tracks: "tracks",
  globe_spill: "spill",
  globe_satellite: "satellite",
  globe_boundaries: "grid",
  globe_grid: "grid",
  globe_detection_zones: "spill",
};

interface IntelligenceGlobeProps {
  onBack: () => void;
}

// ─── GEO-TO-3D CONVERSION ───────────────────────────────────────────

function latLonToVec3(lat: number, lon: number, radius = GLOBE_RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────

export default function IntelligenceGlobe({ onBack }: IntelligenceGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const groupMapRef = useRef<Map<string, THREE.Group>>(new Map());
  const animFrameRef = useRef<number>(0);
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

  // ── Initialize Three.js scene ─────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    // WebGL check
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("webgl2");
    if (!gl) return;

    const container = containerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020508);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    // Position camera to look at Bay of Bengal region (India / Sri Lanka area)
    const initTarget = latLonToVec3(12.0471, 86.9718, 0);
    const initCam = latLonToVec3(8, 90, GLOBE_RADIUS * 2.2);
    camera.position.copy(initCam);
    camera.lookAt(initTarget);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.8;
    controls.minDistance = GLOBE_RADIUS * 1.15;
    controls.maxDistance = GLOBE_RADIUS * 6;
    controls.target.copy(initTarget);
    controls.enablePan = false;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x334466, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.set(10, 8, 5);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x446688, 0.3);
    fillLight.position.set(-5, -2, -3);
    scene.add(fillLight);

    // ── Earth globe ──────────────────────────────────────────────
    const earthTextureCanvas = generateEarthTexture(2048, 1024);
    const earthTexture = new THREE.CanvasTexture(earthTextureCanvas);
    earthTexture.wrapS = THREE.RepeatWrapping;
    earthTexture.wrapT = THREE.ClampToEdgeWrapping;

    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 128, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      map: earthTexture,
      specular: new THREE.Color(0x111822),
      shininess: 15,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earthMesh);

    // ── Atmosphere glow ──────────────────────────────────────────
    const atmosphereGeo = new THREE.SphereGeometry(ATMOSPHERE_RADIUS, 64, 32);
    const atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 viewDir = normalize(-vPosition);
          float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
          float intensity = pow(rim, 3.0) * 0.6;
          gl_FragColor = vec4(0.2, 0.5, 0.8, intensity);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    scene.add(atmosphereMesh);

    // ── Star field background ────────────────────────────────────
    const starsGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(3000);
    for (let i = 0; i < 3000; i++) {
      starPositions[i] = (Math.random() - 0.5) * 200;
    }
    starsGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0x667799, size: 0.08, transparent: true, opacity: 0.5 });
    scene.add(new THREE.Points(starsGeo, starsMat));

    // ── Layer groups ─────────────────────────────────────────────
    const groupMap = new Map<string, THREE.Group>();
    const groupNames = ["vessels", "tracks", "spill", "satellite", "grid"];
    groupNames.forEach((name) => {
      const g = new THREE.Group();
      g.name = name;
      scene.add(g);
      groupMap.set(name, g);
    });
    groupMapRef.current = groupMap;

    // ── OIL SPILL POLYGON ────────────────────────────────────────
    const spillGroup = groupMap.get("spill")!;
    const spillCoords = incident.polygon.coordinates;

    // Spill polygon fill
    const spillVerts: THREE.Vector3[] = spillCoords.map((c) => latLonToVec3(c[0], c[1], GLOBE_RADIUS + 0.005));
    const spillShape = new THREE.BufferGeometry();
    // Fan triangulation from centroid
    const centroid = new THREE.Vector3();
    spillVerts.forEach((v) => centroid.add(v));
    centroid.divideScalar(spillVerts.length);
    const spillTriangles: number[] = [];
    for (let i = 0; i < spillVerts.length - 1; i++) {
      centroid.toArray(spillTriangles, spillTriangles.length);
      spillVerts[i].toArray(spillTriangles, spillTriangles.length);
      spillVerts[i + 1].toArray(spillTriangles, spillTriangles.length);
    }
    spillShape.setAttribute("position", new THREE.Float32BufferAttribute(spillTriangles, 3));
    spillShape.computeVertexNormals();
    const spillMat = new THREE.MeshBasicMaterial({
      color: 0xd4770a,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    spillGroup.add(new THREE.Mesh(spillShape, spillMat));

    // Spill outline
    const outlinePoints = spillCoords.map((c) => latLonToVec3(c[0], c[1], GLOBE_RADIUS + 0.008));
    const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xfb923c, linewidth: 2, transparent: true, opacity: 0.9 });
    spillGroup.add(new THREE.LineLoop(outlineGeo, outlineMat));

    // Spill center marker
    const centerPos = latLonToVec3(incident.polygon.center[0], incident.polygon.center[1], GLOBE_RADIUS + 0.015);
    const markerGeo = new THREE.SphereGeometry(0.025, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xfb923c });
    const markerMesh = new THREE.Mesh(markerGeo, markerMat);
    markerMesh.position.copy(centerPos);
    spillGroup.add(markerMesh);

    // Detection zone ring (15km radius)
    const zoneRingPoints: THREE.Vector3[] = [];
    const zoneRadiusDeg = 15 / 111; // ~15km in degrees
    const centerLat = incident.polygon.center[0];
    const centerLon = incident.polygon.center[1];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      const rLat = centerLat + zoneRadiusDeg * Math.cos(angle);
      const rLon = centerLon + zoneRadiusDeg * Math.sin(angle);
      zoneRingPoints.push(latLonToVec3(rLat, rLon, GLOBE_RADIUS + 0.003));
    }
    const zoneRingGeo = new THREE.BufferGeometry().setFromPoints(zoneRingPoints);
    const zoneRingMat = new THREE.LineBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.2 });
    spillGroup.add(new THREE.LineLoop(zoneRingGeo, zoneRingMat));

    // ── AIS VESSELS ──────────────────────────────────────────────
    const vesselGroup = groupMap.get("vessels")!;
    const trackGroup = groupMap.get("tracks")!;

    DEMO_VESSELS.forEach((vessel) => {
      const vPos = latLonToVec3(vessel.lat, vessel.lon, GLOBE_RADIUS + 0.01);

      // Vessel marker - a small ship-shaped marker using a cone for heading
      const vesselMarker = new THREE.Group();
      vesselMarker.name = `vessel-${vessel.mmsi}`;

      // Ship body (sphere)
      const bodyGeo = new THREE.SphereGeometry(0.02, 12, 12);
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0x55aaff });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      vesselMarker.add(bodyMesh);

      // Heading indicator (small line)
      const headingRad = (vessel.heading * Math.PI) / 180;
      const headingLen = 0.06;
      // Convert heading to3D direction on globe surface
      const headingDir = new THREE.Vector3();
      const tangentUp = vPos.clone().normalize();
      // Approximate local tangent plane
      const northDir = latLonToVec3(vessel.lat + 0.01, vessel.lon, GLOBE_RADIUS + 0.01).sub(vPos).normalize();
      const eastDir = new THREE.Vector3().crossVectors(tangentUp, northDir).normalize();
      headingDir
        .addScaledVector(northDir, Math.cos(headingRad))
        .addScaledVector(eastDir, Math.sin(headingRad))
        .normalize();
      const headingEnd = vPos.clone().add(headingDir.multiplyScalar(headingLen));
      const headingGeo = new THREE.BufferGeometry().setFromPoints([vPos.clone().add(tangentUp.clone().multiplyScalar(0.005)), headingEnd]);
      const headingMat = new THREE.LineBasicMaterial({ color: 0x55aaff, transparent: true, opacity: 0.7 });
      vesselMarker.add(new THREE.Line(headingGeo, headingMat));

      vesselMarker.position.copy(vPos);
      vesselGroup.add(vesselMarker);

      // Vessel track
      if (vessel.trajectory.length > 1) {
        const trackPoints = vessel.trajectory.map((c) => latLonToVec3(c[0], c[1], GLOBE_RADIUS + 0.003));
        const trackGeo = new THREE.BufferGeometry().setFromPoints(trackPoints);
        const trackMat = new THREE.LineBasicMaterial({ color: 0x3388cc, transparent: true, opacity: 0.4 });
        trackGroup.add(new THREE.Line(trackGeo, trackMat));

        // Track direction arrow at midpoint
        if (vessel.trajectory.length >= 3) {
          const midIdx = Math.floor(vessel.trajectory.length / 2);
          const prevIdx = Math.max(0, midIdx - 1);
          const midPos = latLonToVec3(vessel.trajectory[midIdx][0], vessel.trajectory[midIdx][1], GLOBE_RADIUS + 0.006);
          const arrowGeo = new THREE.ConeGeometry(0.008, 0.02, 6);
          const arrowMat = new THREE.MeshBasicMaterial({ color: 0x3388cc, transparent: true, opacity: 0.6 });
          const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
          arrowMesh.position.copy(midPos);
          // Orient arrow based on trajectory direction
          const dir = new THREE.Vector3()
            .subVectors(
              latLonToVec3(vessel.trajectory[midIdx][0], vessel.trajectory[midIdx][1], GLOBE_RADIUS + 0.003),
              latLonToVec3(vessel.trajectory[prevIdx][0], vessel.trajectory[prevIdx][1], GLOBE_RADIUS + 0.003)
            )
            .normalize();
          arrowMesh.lookAt(midPos.clone().add(dir));
          arrowMesh.rotateX(Math.PI / 2);
          trackGroup.add(arrowMesh);
        }
      }
    });

    // ── SATELLITE OBSERVATION ────────────────────────────────────
    const satGroup = groupMap.get("satellite")!;
    const obs = DEMO_SATELLITE_OBSERVATION;

    // Ground track
    if (obs.groundTrack.length > 1) {
      const trackPoints = obs.groundTrack.map((c) => latLonToVec3(c[0], c[1], GLOBE_RADIUS + 0.002));
      const trackGeo = new THREE.BufferGeometry().setFromPoints(trackPoints);
      // Dashed line via line segments
      const trackMat = new THREE.LineDashedMaterial({
        color: 0x44cc88,
        dashSize: 0.05,
        gapSize: 0.03,
        transparent: true,
        opacity: 0.6,
      });
      const trackLine = new THREE.Line(trackGeo, trackMat);
      trackLine.computeLineDistances();
      satGroup.add(trackLine);
    }

    // Satellite position marker
    const satPos = latLonToVec3(obs.swathCenter[0], obs.swathCenter[1], GLOBE_RADIUS + 0.5);
    const satGeo = new THREE.OctahedronGeometry(0.03, 0);
    const satMat = new THREE.MeshBasicMaterial({ color: 0x44cc88 });
    const satMesh = new THREE.Mesh(satGeo, satMat);
    satMesh.position.copy(satPos);
    satGroup.add(satMesh);

    // Sat-to-ground line
    const groundPos = latLonToVec3(obs.swathCenter[0], obs.swathCenter[1], GLOBE_RADIUS + 0.005);
    const satLineGeo = new THREE.BufferGeometry().setFromPoints([satPos, groundPos]);
    const satLineMat = new THREE.LineDashedMaterial({
      color: 0x44cc88,
      dashSize: 0.04,
      gapSize: 0.02,
      transparent: true,
      opacity: 0.3,
    });
    const satLine = new THREE.Line(satLineGeo, satLineMat);
    satLine.computeLineDistances();
    satGroup.add(satLine);

    // Swath footprint (rectangle on ocean)
    const swathHalfWidth = obs.swathWidth / 2 / 111000;
    const swathHalfLength = obs.swathLength / 2 / 111000;
    const swathAngle = (obs.orbitInclination > 90 ? 170 : 10) * (Math.PI / 180);
    const cosA = Math.cos(swathAngle);
    const sinA = Math.sin(swathAngle);
    const scLat = obs.swathCenter[0];
    const scLon = obs.swathCenter[1];

    const swathCorners = [
      [scLat - swathHalfLength * cosA + swathHalfWidth * sinA, scLon - swathHalfLength * sinA - swathHalfWidth * cosA],
      [scLat - swathHalfLength * cosA - swathHalfWidth * sinA, scLon - swathHalfLength * sinA + swathHalfWidth * cosA],
      [scLat + swathHalfLength * cosA - swathHalfWidth * sinA, scLon + swathHalfLength * sinA + swathHalfWidth * cosA],
      [scLat + swathHalfLength * cosA + swathHalfWidth * sinA, scLon + swathHalfLength * sinA - swathHalfWidth * cosA],
    ];

    const swathVerts: THREE.Vector3[] = swathCorners.map((c) => latLonToVec3(c[0], c[1], GLOBE_RADIUS + 0.004));
    const swathTriVerts: number[] = [];
    const swathCentroid = new THREE.Vector3();
    swathVerts.forEach((v) => swathCentroid.add(v));
    swathCentroid.divideScalar(swathVerts.length);
    for (let i = 0; i < swathVerts.length; i++) {
      const next = (i + 1) % swathVerts.length;
      swathCentroid.toArray(swathTriVerts, swathTriVerts.length);
      swathVerts[i].toArray(swathTriVerts, swathTriVerts.length);
      swathVerts[next].toArray(swathTriVerts, swathTriVerts.length);
    }
    const swathGeo = new THREE.BufferGeometry();
    swathGeo.setAttribute("position", new THREE.Float32BufferAttribute(swathTriVerts, 3));
    swathGeo.computeVertexNormals();
    const swathMat = new THREE.MeshBasicMaterial({
      color: 0x44cc88,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    satGroup.add(new THREE.Mesh(swathGeo, swathMat));

    // Swath outline
    const swathOutlinePoints = [...swathVerts, swathVerts[0]];
    const swathOutlineGeo = new THREE.BufferGeometry().setFromPoints(swathOutlinePoints);
    const swathOutlineMat = new THREE.LineBasicMaterial({ color: 0x44cc88, transparent: true, opacity: 0.25 });
    satGroup.add(new THREE.Line(swathOutlineGeo, swathOutlineMat));

    // ── DRIFT PATHS ─────────────────────────────────────────────
    if (DEMO_DRIFT.forward.length > 1) {
      const driftPoints = DEMO_DRIFT.forward.map((p) => latLonToVec3(p.center[0], p.center[1], GLOBE_RADIUS + 0.006));
      const driftGeo = new THREE.BufferGeometry().setFromPoints(driftPoints);
      const driftMat = new THREE.LineDashedMaterial({
        color: 0xf97316,
        dashSize: 0.04,
        gapSize: 0.02,
        transparent: true,
        opacity: 0.5,
      });
      const driftLine = new THREE.Line(driftGeo, driftMat);
      driftLine.computeLineDistances();
      spillGroup.add(driftLine);
    }

    if (DEMO_DRIFT.backtrack.length > 1) {
      const btPoints = DEMO_DRIFT.backtrack.map((p) => latLonToVec3(p.center[0], p.center[1], GLOBE_RADIUS + 0.006));
      const btGeo = new THREE.BufferGeometry().setFromPoints(btPoints);
      const btMat = new THREE.LineDashedMaterial({
        color: 0xa78bfa,
        dashSize: 0.03,
        gapSize: 0.02,
        transparent: true,
        opacity: 0.4,
      });
      const btLine = new THREE.Line(btGeo, btMat);
      btLine.computeLineDistances();
      spillGroup.add(btLine);
    }

    // ── GRID LINES ───────────────────────────────────────────────
    const gridGroup = groupMap.get("grid")!;
    // Latitude lines
    for (let lat = 0; lat <= 20; lat += 5) {
      const pts: THREE.Vector3[] = [];
      for (let lon = 80; lon <= 95; lon += 0.5) {
        pts.push(latLonToVec3(lat, lon, GLOBE_RADIUS + 0.001));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.25 });
      gridGroup.add(new THREE.Line(geo, mat));
    }
    // Longitude lines
    for (let lon = 80; lon <= 95; lon += 3) {
      const pts: THREE.Vector3[] = [];
      for (let lat = 0; lat <= 20; lat += 0.5) {
        pts.push(latLonToVec3(lat, lon, GLOBE_RADIUS + 0.001));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.25 });
      gridGroup.add(new THREE.Line(geo, mat));
    }

    // Store refs
    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;
    controlsRef.current = controls;

    // ── Animation loop ───────────────────────────────────────────
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();

      // Slowly rotate markers to keep them visible
      vesselGroup.children.forEach((child) => {
        if (child instanceof THREE.Group) {
          child.lookAt(camera.position);
        }
      });
      markerMesh.lookAt(camera.position);
      satMesh.lookAt(camera.position);

      renderer.render(scene, camera);
    };
    animate();

    // ── Resize handler ───────────────────────────────────────────
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  // ── Layer visibility toggle ────────────────────────────────────
  useEffect(() => {
    const groupMap = groupMapRef.current;
    layers.forEach((layer) => {
      const groupName = LAYER_GROUP_NAMES[layer.id];
      const group = groupMap.get(groupName);
      if (group) {
        group.visible = layer.enabled;
      }
    });
  }, [layers]);

  // ── Handle vessel selection ─────────────────────────────────────
  const handleVesselSelect = useCallback((vessel: AisVessel) => {
    setSelectedVessel(vessel);

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    // Fly to vessel
    const vesselPos = latLonToVec3(vessel.lat, vessel.lon, GLOBE_RADIUS * 1.5);
    const vesselTarget = latLonToVec3(vessel.lat, vessel.lon, 0);

    // Smooth camera animation
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const duration = 1500;
    const startTime = Date.now();

    const animateCamera = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      camera.position.lerpVectors(startPos, vesselPos, ease);
      controls.target.lerpVectors(startTarget, vesselTarget, ease);

      if (t < 1) requestAnimationFrame(animateCamera);
    };
    animateCamera();
  }, []);

  // ── Fly to spill ──────────────────────────────────────────────
  const flyToSpill = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const spillPos = latLonToVec3(incident.polygon.center[0], incident.polygon.center[1], GLOBE_RADIUS * 1.8);
    const spillTarget = latLonToVec3(incident.polygon.center[0], incident.polygon.center[1], 0);

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const duration = 1500;
    const startTime = Date.now();

    const animateCamera = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      camera.position.lerpVectors(startPos, spillPos, ease);
      controls.target.lerpVectors(startTarget, spillTarget, ease);

      if (t < 1) requestAnimationFrame(animateCamera);
    };
    animateCamera();
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

        {/* ─── THREE.JS GLOBE ──────────────────────────────────── */}
        <main className="flex-1 relative">
          <div ref={containerRef} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />

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
