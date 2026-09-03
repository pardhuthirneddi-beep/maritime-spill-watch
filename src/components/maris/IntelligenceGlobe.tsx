// maris — 3D Geospatial Intelligence Globe
// Maritime command center visualization using Three.js
import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Crosshair,
  Eye,
  EyeOff,
  Filter,
  Layers,
  Navigation,
  Pause,
  Play,
  Radar,
  RotateCcw,
  Search,
  Ship,
  SkipBack,
  SkipForward,
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
  DEMO_TIMELINE,
} from "@/data/demoData";
import type {
  AisVessel,
  OilSpillIncident,
  LatLon,
  Globe3dLayer,
  Globe3dLayerId,
} from "@/data/types";

interface IntelligenceGlobeProps {
  onBack: () => void;
}

// ─── GEO UTILITIES ──────────────────────────────────────────────────

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// ─── GLOBE SCENE BUILDER ────────────────────────────────────────────

function createGlobeScene(container: HTMLDivElement) {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020508);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
  camera.position.set(0, 80, 320);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const globeRadius = 100;

  // Globe — dark ocean
  const globeGeom = new THREE.SphereGeometry(globeRadius, 96, 96);
  const globeMat = new THREE.MeshPhongMaterial({
    color: 0x071520,
    emissive: 0x030a12,
    specular: 0x0a1a2e,
    shininess: 20,
  });
  const globe = new THREE.Mesh(globeGeom, globeMat);
  scene.add(globe);

  // Subtle wireframe
  const wireGeom = new THREE.SphereGeometry(globeRadius + 0.2, 64, 64);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x0e2a44,
    wireframe: true,
    transparent: true,
    opacity: 0.06,
  });
  scene.add(new THREE.Mesh(wireGeom, wireMat));

  // Latitude grid lines
  const gridGroup = new THREE.Group();
  gridGroup.name = "grid";
  const latMat = new THREE.LineBasicMaterial({ color: 0x1a3a5c, transparent: true, opacity: 0.18 });
  const lonMat = new THREE.LineBasicMaterial({ color: 0x1a3a5c, transparent: true, opacity: 0.12 });

  for (let lat = -80; lat <= 80; lat += 10) {
    const pts: THREE.Vector3[] = [];
    for (let lon = 0; lon <= 360; lon += 2) {
      pts.push(latLonToVector3(lat, lon, globeRadius + 0.4));
    }
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), latMat));
  }
  for (let lon = 0; lon < 360; lon += 10) {
    const pts: THREE.Vector3[] = [];
    for (let lat = -90; lat <= 90; lat += 2) {
      pts.push(latLonToVector3(lat, lon, globeRadius + 0.4));
    }
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lonMat));
  }
  scene.add(gridGroup);

  // Atmosphere
  const atmosGeom = new THREE.SphereGeometry(globeRadius + 1.5, 96, 96);
  const atmosMat = new THREE.MeshBasicMaterial({
    color: 0x1a4a7a,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(atmosGeom, atmosMat));

  // Outer atmosphere glow
  const glowGeom = new THREE.SphereGeometry(globeRadius + 6, 64, 64);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x0d3060,
    transparent: true,
    opacity: 0.05,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(glowGeom, glowMat));

  // Lighting — dramatic
  const ambientLight = new THREE.AmbientLight(0x1a2a44, 0.5);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xccddff, 1.0);
  sunLight.position.set(200, 150, 100);
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight(0x2266aa, 0.4);
  rimLight.position.set(-200, -50, -200);
  scene.add(rimLight);

  return { scene, camera, renderer, globe, globeRadius };
}

// ─── CONTINENT/COASTLINE HELPERS ────────────────────────────────────

function createCoastlines(globeRadius: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "boundaries";

  const coastMat = new THREE.LineBasicMaterial({
    color: 0x2a5a8a,
    transparent: true,
    opacity: 0.55,
    linewidth: 1,
  });

  // India east coast
  const indiaEast: LatLon[] = [
    [23.5, 88.8], [22.0, 88.0], [21.0, 87.5], [20.0, 87.0],
    [19.0, 85.5], [18.0, 84.5], [17.0, 83.5], [16.0, 82.0],
    [15.0, 81.0], [14.0, 80.5], [13.0, 80.3], [12.5, 80.0],
    [11.5, 79.8], [10.5, 79.8], [9.5, 79.5], [8.5, 77.5],
  ];

  // India west coast
  const indiaWest: LatLon[] = [
    [23.5, 68.5], [22.5, 69.0], [21.5, 70.0], [20.0, 72.5],
    [19.0, 73.0], [18.0, 73.5], [17.0, 74.0], [16.0, 73.5],
    [15.0, 74.0], [14.0, 74.5], [13.0, 74.8], [12.0, 75.0],
    [11.0, 75.8], [10.0, 76.2], [9.0, 76.5], [8.0, 77.5],
  ];

  // Pakistan coast
  const pakistan: LatLon[] = [
    [25.0, 67.0], [24.5, 67.5], [24.0, 68.0], [23.5, 68.5],
  ];

  // Sri Lanka
  const sriLanka: LatLon[] = [
    [10.0, 80.0], [9.5, 80.0], [8.0, 80.5], [7.0, 80.0],
    [6.0, 80.2], [6.5, 79.8], [7.5, 79.5], [8.5, 79.8],
    [9.5, 79.8], [10.0, 80.0],
  ];

  // Arabian Peninsula
  const arabia: LatLon[] = [
    [25.0, 56.5], [24.0, 55.0], [23.5, 55.5], [22.0, 56.0],
    [20.0, 57.5], [17.5, 56.5], [16.0, 53.0], [15.0, 51.0],
    [13.0, 45.0], [12.5, 44.0],
  ];

  // Africa (horn)
  const africa: LatLon[] = [
    [12.0, 51.0], [11.0, 49.0], [10.0, 45.0], [5.0, 45.0],
  ];

  const coastlines = [indiaEast, indiaWest, pakistan, sriLanka, arabia, africa];

  coastlines.forEach((coast) => {
    const pts = coast.map((c) => latLonToVector3(c[0], c[1], globeRadius + 0.6));
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    group.add(new THREE.Line(geom, coastMat));
  });

  // Land fill (approximate for India)
  const fillGeom = new THREE.BufferGeometry();
  const fillVerts: number[] = [];

  // Simple India triangle fill
  const indiaOutline = [...indiaEast, ...indiaWest.reverse()];
  const indiaCenter = latLonToVector3(20.5, 78.0, globeRadius + 0.3);

  for (let i = 0; i < indiaOutline.length - 1; i++) {
    const p1 = latLonToVector3(indiaOutline[i][0], indiaOutline[i][1], globeRadius + 0.3);
    const p2 = latLonToVector3(indiaOutline[i + 1][0], indiaOutline[i + 1][1], globeRadius + 0.3);
    fillVerts.push(
      indiaCenter.x, indiaCenter.y, indiaCenter.z,
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z
    );
  }

  fillGeom.setAttribute("position", new THREE.Float32BufferAttribute(fillVerts, 3));
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0x0e1f2e,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(fillGeom, fillMat));

  return group;
}

// ─── VESSEL MARKERS ─────────────────────────────────────────────────

function createVesselMarker(
  vessel: AisVessel,
  globeRadius: number,
  isSelected: boolean
): THREE.Group {
  const group = new THREE.Group();
  const pos = latLonToVector3(vessel.lat, vessel.lon, globeRadius + 0.5);

  // Ship body (elongated diamond)
  const bodyGeom = new THREE.BufferGeometry();
  const bodyVerts = new Float32Array([
    0, 0, -1.2,  // bow
    -0.6, 0, 0,   // port
    0, 0, 1.2,    // stern
    0.6, 0, 0,    // starboard
  ]);
  const bodyIdx = [0, 1, 2, 0, 2, 3];
  bodyGeom.setAttribute("position", new THREE.BufferAttribute(bodyVerts, 3));
  bodyGeom.setIndex(bodyIdx);
  bodyGeom.computeVertexNormals();

  const bodyMat = new THREE.MeshBasicMaterial({
    color: isSelected ? 0x22d3ee : 0x4a9eff,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.rotation.x = -Math.PI / 2;
  body.rotation.z = -((vessel.heading * Math.PI) / 180);
  group.add(body);

  // Glow
  const glowGeom = new THREE.SphereGeometry(isSelected ? 2.0 : 1.2, 8, 8);
  const glowMat = new THREE.MeshBasicMaterial({
    color: isSelected ? 0x22d3ee : 0x4a9eff,
    transparent: true,
    opacity: isSelected ? 0.3 : 0.15,
  });
  group.add(new THREE.Mesh(glowGeom, glowMat));

  // Vertical pillar
  const pillarH = isSelected ? 4 : 2;
  const pillarPts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, pillarH, 0),
  ];
  const pillarGeom = new THREE.BufferGeometry().setFromPoints(pillarPts);
  const pillarMat = new THREE.LineBasicMaterial({
    color: isSelected ? 0x22d3ee : 0x4a9eff,
    transparent: true,
    opacity: 0.4,
  });
  group.add(new THREE.Line(pillarGeom, pillarMat));

  // Selection ring
  if (isSelected) {
    const ringGeom = new THREE.RingGeometry(3, 3.5, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.y = pillarH;
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
  }

  group.position.copy(pos);
  group.userData = { vessel, type: "vessel" };
  return group;
}

// ─── VESSEL TRACKS ──────────────────────────────────────────────────

function createVesselTrack(
  vessel: AisVessel,
  globeRadius: number,
  isSelected: boolean
): THREE.Line {
  const pts = vessel.trajectory.map((p) =>
    latLonToVector3(p[0], p[1], globeRadius + 0.5)
  );
  if (pts.length < 2) return new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());

  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: isSelected ? 0x22d3ee : 0x3388cc,
    transparent: true,
    opacity: isSelected ? 0.8 : 0.35,
  });
  return new THREE.Line(geom, mat);
}

// ─── SPILL POLYGON ──────────────────────────────────────────────────

function createSpillPolygon(incident: OilSpillIncident, globeRadius: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "spill";

  const polyPts = incident.polygon.coordinates.map((c) =>
    latLonToVector3(c[0], c[1], globeRadius + 0.7)
  );

  // Boundary line
  const lineGeom = new THREE.BufferGeometry().setFromPoints([...polyPts, polyPts[0]]);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.9 });
  group.add(new THREE.Line(lineGeom, lineMat));

  // Fill
  const center = latLonToVector3(incident.polygon.center[0], incident.polygon.center[1], globeRadius + 0.6);
  const verts: number[] = [];
  for (let i = 0; i < polyPts.length - 1; i++) {
    verts.push(center.x, center.y, center.z);
    verts.push(polyPts[i].x, polyPts[i].y, polyPts[i].z);
    verts.push(polyPts[i + 1].x, polyPts[i + 1].y, polyPts[i + 1].z);
  }
  const fillGeom = new THREE.BufferGeometry();
  fillGeom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xc2720a,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(fillGeom, fillMat));

  // Center beacon
  const beaconGeom = new THREE.SphereGeometry(1.5, 8, 8);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfb923c });
  const beacon = new THREE.Mesh(beaconGeom, beaconMat);
  beacon.position.copy(center);
  group.add(beacon);

  // Vertical line
  const vertPts = [
    latLonToVector3(incident.polygon.center[0], incident.polygon.center[1], globeRadius),
    latLonToVector3(incident.polygon.center[0], incident.polygon.center[1], globeRadius + 6),
  ];
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertPts), new THREE.LineBasicMaterial({
    color: 0xfb923c, transparent: true, opacity: 0.5,
  })));

  return group;
}

// ─── SATELLITE ──────────────────────────────────────────────────────

function createSatellitePath(globeRadius: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "satellite";

  // Ground track
  const trackPts: THREE.Vector3[] = [];
  for (let lat = 18; lat >= 8; lat -= 0.3) {
    trackPts.push(latLonToVector3(lat, 86 + (18 - lat) * 0.2, globeRadius + 0.8));
  }
  const trackGeom = new THREE.BufferGeometry().setFromPoints(trackPts);
  const trackMat = new THREE.LineDashedMaterial({
    color: 0x44cc88, transparent: true, opacity: 0.5, dashSize: 2, gapSize: 1,
  });
  const trackLine = new THREE.Line(trackGeom, trackMat);
  trackLine.computeLineDistances();
  group.add(trackLine);

  // Satellite marker
  const satPos = latLonToVector3(15.5, 86.3, globeRadius + 14);
  const satGeom = new THREE.OctahedronGeometry(1.5, 0);
  const satMat = new THREE.MeshBasicMaterial({ color: 0x44cc88 });
  const sat = new THREE.Mesh(satGeom, satMat);
  sat.position.copy(satPos);
  group.add(sat);

  // Observation cone
  const coneGeom = new THREE.ConeGeometry(18, 14, 4, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0x44cc88, transparent: true, opacity: 0.03, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(coneGeom, coneMat);
  cone.position.copy(satPos);
  cone.lookAt(new THREE.Vector3(0, 0, 0));
  group.add(cone);

  return group;
}

// ─── DRIFT PATHS ────────────────────────────────────────────────────

function createDriftPaths(globeRadius: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "drift";

  // Forward
  const fwdPts = DEMO_DRIFT.forward.map((p) =>
    latLonToVector3(p.center[0], p.center[1], globeRadius + 0.5)
  );
  if (fwdPts.length > 1) {
    const fwdGeom = new THREE.BufferGeometry().setFromPoints(fwdPts);
    const fwdMat = new THREE.LineDashedMaterial({
      color: 0xf97316, transparent: true, opacity: 0.3, dashSize: 1.5, gapSize: 1,
    });
    const fwdLine = new THREE.Line(fwdGeom, fwdMat);
    fwdLine.computeLineDistances();
    group.add(fwdLine);
  }

  return group;
}

// ─── DETECTION ZONE ─────────────────────────────────────────────────

function createDetectionZone(incident: OilSpillIncident, globeRadius: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "detectionZone";
  const center = latLonToVector3(incident.polygon.center[0], incident.polygon.center[1], globeRadius + 0.5);

  const ring1 = new THREE.Mesh(
    new THREE.RingGeometry(6, 6.4, 48),
    new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
  );
  ring1.position.copy(center);
  ring1.lookAt(new THREE.Vector3(0, 0, 0));
  group.add(ring1);

  const ring2 = new THREE.Mesh(
    new THREE.RingGeometry(10, 10.3, 48),
    new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
  );
  ring2.position.copy(center);
  ring2.lookAt(new THREE.Vector3(0, 0, 0));
  group.add(ring2);

  return group;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────

export default function IntelligenceGlobe({ onBack }: IntelligenceGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    globe: THREE.Mesh;
    globeRadius: number;
  } | null>(null);
  const animFrameRef = useRef<number>(0);
  const mouseRef = useRef({ isDragging: false, lastX: 0, lastY: 0 });
  const rotationRef = useRef({ x: 0.25, y: -1.1 });

  // UI state
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
  const [showRightPanel, setShowRightPanel] = useState(true);

  const incident = DEMO_INCIDENT;
  const topAttribution = DEMO_ATTRIBUTIONS[0];

  const timeSteps = [
    "08:45", "09:00", "09:05", "09:12", "09:17", "09:28", "09:31", "09:42", "09:48", "09:50",
    "09:52", "09:54", "09:56", "10:00", "10:02", "10:05",
  ];

  const eventTimeline = [
    { time: "09:20 UTC", event: "Satellite pass", color: "#44cc88" },
    { time: "09:25 UTC", event: "SAR image acquired", color: "#44cc88" },
    { time: "09:27 UTC", event: "Anomaly detected", color: "#fb923c" },
    { time: "09:28 UTC", event: "Oil spill classified", color: "#fb923c" },
    { time: "09:31 UTC", event: "Nearby vessels identified", color: "#4a9eff" },
  ];

  // Filtered vessels
  const filteredVessels = DEMO_VESSELS.filter((v) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!v.name.toLowerCase().includes(q) && !v.mmsi.includes(q)) return false;
    }
    if (vesselFilter === "near") {
      const dist = Math.sqrt((v.lat - incident.polygon.center[0]) ** 2 + (v.lon - incident.polygon.center[1]) ** 2);
      return dist < 0.05;
    }
    return true;
  });

  // Initialize Three.js
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scene, camera, renderer, globe, globeRadius } = createGlobeScene(container);
    sceneRef.current = { scene, camera, renderer, globe, globeRadius };

    // Add objects
    const vesselGroup = new THREE.Group();
    vesselGroup.name = "vessels";
    DEMO_VESSELS.forEach((v) => vesselGroup.add(createVesselMarker(v, globeRadius, false)));
    scene.add(vesselGroup);

    const trackGroup = new THREE.Group();
    trackGroup.name = "tracks";
    DEMO_VESSELS.forEach((v) => trackGroup.add(createVesselTrack(v, globeRadius, false)));
    scene.add(trackGroup);

    scene.add(createSpillPolygon(incident, globeRadius));
    scene.add(createSatellitePath(globeRadius));
    scene.add(createCoastlines(globeRadius));
    scene.add(createDriftPaths(globeRadius));
    scene.add(createDetectionZone(incident, globeRadius));

    // Mouse orbit
    const onMouseDown = (e: MouseEvent) => {
      mouseRef.current.isDragging = true;
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (mouseRef.current.isDragging) {
        rotationRef.current.y += (e.clientX - mouseRef.current.lastX) * 0.005;
        rotationRef.current.x = Math.max(-1.0, Math.min(1.0,
          rotationRef.current.x + (e.clientY - mouseRef.current.lastY) * 0.005
        ));
        mouseRef.current.lastX = e.clientX;
        mouseRef.current.lastY = e.clientY;
      }
    };
    const onMouseUp = () => { mouseRef.current.isDragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = camera.position.clone().normalize();
      const dist = camera.position.length();
      camera.position.copy(dir.multiplyScalar(Math.max(160, Math.min(500, dist + e.deltaY * 0.5))));
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    // Animation
    let time = 0;
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      time += 0.003;

      const radius = camera.position.length();
      camera.position.x += (radius * Math.cos(rotationRef.current.x) * Math.sin(rotationRef.current.y) - camera.position.x) * 0.06;
      camera.position.y += (radius * Math.sin(rotationRef.current.x) - camera.position.y) * 0.06;
      camera.position.z += (radius * Math.cos(rotationRef.current.x) * Math.cos(rotationRef.current.y) - camera.position.z) * 0.06;

      camera.lookAt(latLonToVector3(12, 80, 0));

      // Animate satellite
      const satGroup = scene.getObjectByName("satellite");
      if (satGroup) {
        satGroup.children.forEach((child) => {
          if (child instanceof THREE.Mesh && child.geometry.type === "OctahedronGeometry") {
            child.rotation.y = time * 3;
          }
        });
      }

      // Pulse detection zone
      const dzGroup = scene.getObjectByName("detectionZone");
      if (dzGroup && dzGroup.children[0] instanceof THREE.Mesh) {
        const s = 1 + Math.sin(time * 3) * 0.08;
        dzGroup.children[0].scale.set(s, s, 1);
      }

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  // Toggle layers
  useEffect(() => {
    if (!sceneRef.current) return;
    const { scene } = sceneRef.current;
    const nameMap: Record<string, string> = {
      globe_vessels: "vessels", globe_tracks: "tracks", globe_spill: "spill",
      globe_satellite: "satellite", globe_boundaries: "boundaries",
      globe_detection_zones: "detectionZone",
    };
    layers.forEach((l) => {
      const name = nameMap[l.id];
      if (name) {
        const obj = scene.getObjectByName(name);
        if (obj) obj.visible = l.enabled;
      }
    });
  }, [layers]);

  // Playback
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTimeStep((prev) => {
        if (prev >= timeSteps.length - 1) { setIsPlaying(false); return prev; }
        return prev + 1;
      });
    }, 1000 / playSpeed);
    return () => clearInterval(interval);
  }, [isPlaying, playSpeed, timeSteps.length]);

  const toggleLayer = useCallback((id: Globe3dLayerId) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)));
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#030508] text-zinc-100 overflow-hidden select-none">

      {/* ─── TOP STATUS BAR ─────────────────────────────────── */}
      <header className="flex h-12 items-center justify-between border-b border-zinc-800/50 bg-[#060a10]/95 px-4 z-30 backdrop-blur-sm">
        <div className="flex items-center gap-5">
          {/* Brand */}
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

          {/* Status metrics */}
          <div className="flex items-center gap-4">
            <StatusMetric label="UTC TIME" value={new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase() + "  " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} />
            <StatusMetric label="ACTIVE VESSELS" value={`${DEMO_VESSELS.length}`} />
            <StatusMetric label="DETECTIONS" value="3" />
            <StatusMetric label="SATELLITE" value="SENTINEL-1A" />
            <StatusMetric label="WIND" value={`${DEMO_ENVIRONMENTAL.windSpeed} kn ${DEMO_ENVIRONMENTAL.windDirectionLabel}`} />
            <StatusMetric label="SEA STATE" value="MODERATE" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-[9px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back
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

        {/* ─── LEFT PANEL ───────────────────────────────────── */}
        <aside className="flex h-full z-20">
          {/* Icon sidebar */}
          <div className="w-10 flex flex-col items-center gap-1 py-2 border-r border-zinc-800/50 bg-[#060a10]/95">
            {[Search, Ship, Layers, Target, Radar, Compass, Wind].map((Icon, i) => (
              <button
                key={i}
                className={cn(
                  "flex size-7 items-center justify-center rounded transition-colors",
                  i === 1 ? "bg-cyan-500/15 text-cyan-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                )}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>

          {/* Vessel panel */}
          <div className="w-56 border-r border-zinc-800/50 bg-[#060a10]/95 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-zinc-800/50">
              <h2 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">Vessels</h2>
            </div>

            {/* Search */}
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

            {/* Filter tabs */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800/50">
              {[
                { key: "all" as const, label: `ALL ${DEMO_VESSELS.length}` },
                { key: "near" as const, label: `NEAR SPILL 6` },
                { key: "watch" as const, label: `WATCHLIST 2` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setVesselFilter(tab.key)}
                  className={cn(
                    "text-[8px] px-2 py-0.5 rounded transition-colors",
                    vesselFilter === tab.key
                      ? "bg-cyan-500/15 text-cyan-400"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Vessel list */}
            <div className="flex-1 overflow-y-auto">
              {filteredVessels.map((v) => {
                const attr = DEMO_ATTRIBUTIONS.find((a) => a.vesselId === v.mmsi);
                const isSelected = selectedVessel?.mmsi === v.mmsi;
                return (
                  <button
                    key={v.mmsi}
                    onClick={() => setSelectedVessel(isSelected ? null : v)}
                    className={cn(
                      "w-full text-left px-3 py-2 border-b border-zinc-800/30 transition-colors",
                      isSelected ? "bg-cyan-500/8" : "hover:bg-zinc-800/30"
                    )}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-semibold text-zinc-200">{v.name}</span>
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">ACTIVE</span>
                    </div>
                    <div className="text-[8px] text-zinc-500 font-mono mb-0.5">MMSI {v.mmsi}</div>
                    <div className="flex items-center gap-3 text-[9px] text-zinc-400">
                      <span>{v.speed} kn</span>
                      <span>› {v.heading}°</span>
                    </div>
                    {attr && (
                      <div className="mt-1 flex items-center gap-1">
                        <div className={cn(
                          "text-[8px] font-bold",
                          attr.rank === 1 ? "text-orange-400" : "text-zinc-500"
                        )}>
                          Source: {attr.overallScore}/100
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="px-3 py-2 border-t border-zinc-800/50">
              <button className="w-full text-center text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors py-1">
                VIEW ALL VESSELS
              </button>
            </div>

            {/* Layer toggles */}
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
                    <div className={cn(
                      "w-7 h-3.5 rounded-full transition-colors relative",
                      l.enabled ? "bg-cyan-500/30" : "bg-zinc-700/50"
                    )}>
                      <div className={cn(
                        "absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all",
                        l.enabled ? "left-3.5 bg-cyan-400" : "left-0.5 bg-zinc-500"
                      )} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* ─── 3D GLOBE ────────────────────────────────────── */}
        <main className="flex-1 relative">
          <div ref={containerRef} className="absolute inset-0" />

          {/* Vessel labels floating on globe */}
          <div className="absolute inset-0 pointer-events-none z-10">
            {/* Navigation compass */}
            <div className="absolute bottom-20 left-6">
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
              <div className="mt-1 flex flex-col items-center gap-0.5">
                <button className="size-6 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300 text-[10px]">
                  +
                </button>
                <button className="size-6 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300 text-[10px]">
                  −
                </button>
              </div>
            </div>
          </div>

          {/* ─── BOTTOM TIMELINE ───────────────────────────── */}
          <div className="absolute bottom-0 left-0 right-0 z-20">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-[#060a10]/95 border-t border-zinc-800/50 backdrop-blur-sm">
              {/* Play controls */}
              <button onClick={() => setIsPlaying(!isPlaying)} className="text-zinc-400 hover:text-zinc-200">
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <button onClick={() => setPlaySpeed((s) => s === 1 ? 2 : s === 2 ? 4 : 1)} className="text-[9px] text-zinc-500 hover:text-zinc-300 font-mono min-w-[20px]">
                {playSpeed}x
              </button>

              <div className="h-4 w-px bg-zinc-800" />

              {/* Time scrubber */}
              <div className="flex-1 flex items-center gap-2">
                <span className="text-[8px] font-mono text-zinc-600">08:45</span>
                <div className="flex-1 relative">
                  <div className="h-0.5 bg-zinc-800 rounded-full w-full" />
                  <div
                    className="absolute top-0 h-0.5 bg-cyan-500/50 rounded-full"
                    style={{ width: `${(timeStep / (timeSteps.length - 1)) * 100}%` }}
                  />
                  {/* Time markers */}
                  <div className="flex justify-between mt-1">
                    {["09:00", "09:15", "09:30", "09:45", "10:00", "10:15"].map((t) => (
                      <span key={t} className="text-[7px] font-mono text-zinc-700">{t}</span>
                    ))}
                  </div>
                  {/* Current position marker */}
                  <div
                    className="absolute -top-1.5 w-3 h-3 rounded-full bg-cyan-400 border-2 border-[#060a10] cursor-pointer"
                    style={{ left: `calc(${(timeStep / (timeSteps.length - 1)) * 100}% - 6px)` }}
                  />
                </div>
                <span className="text-[8px] font-mono text-zinc-600">10:15</span>
              </div>

              <div className="h-4 w-px bg-zinc-800" />

              {/* Current time label */}
              <span className="text-[10px] font-mono text-zinc-300 font-semibold">{timeSteps[timeStep]}</span>

              <div className="h-4 w-px bg-zinc-800" />

              {/* Range buttons */}
              <div className="flex items-center gap-0.5">
                {(["now", "3h", "6h", "12h", "24h"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={cn(
                      "text-[8px] px-2 py-0.5 rounded font-medium transition-colors",
                      timeRange === r ? "bg-cyan-500/15 text-cyan-400" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>

        {/* ─── RIGHT PANEL ─────────────────────────────────── */}
        {showRightPanel && (
          <aside className="w-72 border-l border-zinc-800/50 bg-[#060a10]/95 flex flex-col overflow-y-auto z-20">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800/50">
              <h2 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">Detection Event</h2>
              <button onClick={() => setShowRightPanel(false)} className="text-zinc-600 hover:text-zinc-300">
                <X className="size-3.5" />
              </button>
            </div>

            <div className="p-3 space-y-4">
              {/* Event ID */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold text-zinc-100">{incident.incidentNumber}</span>
                  <span className="text-[7px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-bold uppercase">High Confidence</span>
                </div>
              </div>

              {/* Event Details */}
              <div className="space-y-2.5">
                <EventField label="DETECTED" value={new Date(incident.detectedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " UTC"} />
                <EventField label="LOCATION" value={`${incident.coordinates[0].toFixed(2)}° N, ${incident.coordinates[1].toFixed(2)}° E`} />
                <EventField label="AREA" value={`${incident.polygon.areaKm2} km²`} />
                <EventField label="CONFIDENCE" value={`${incident.confidence.score}%`} color="text-cyan-400" />
                <EventField label="SOURCE" value="Sentinel-1A (SAR)" />
              </div>

              {/* Timeline */}
              <div>
                <h3 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Event Timeline</h3>
                <div className="space-y-1.5">
                  {eventTimeline.map((ev, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ev.color + "60", border: `1px solid ${ev.color}` }} />
                      <div>
                        <span className="text-[9px] font-mono text-zinc-400">{ev.time}</span>
                        <span className="text-[9px] text-zinc-500 ml-2">{ev.event}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Affected Vessels */}
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

              {/* View Report button */}
              <button className="w-full rounded border border-zinc-700 bg-zinc-800/30 py-2 text-[10px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors uppercase tracking-wider">
                View Full Report
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── HELPER COMPONENTS ─────────────────────────────────────────────

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[7px] text-zinc-600 uppercase tracking-wider leading-none mb-0.5">{label}</div>
      <div className="text-[10px] font-semibold text-zinc-200 font-mono leading-none">{value}</div>
    </div>
  );
}

function EventField({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[7px] text-zinc-600 uppercase tracking-wider leading-none mb-0.5">{label}</div>
      <div className={cn("text-[10px] font-mono text-zinc-300", color)}>{value}</div>
    </div>
  );
}
