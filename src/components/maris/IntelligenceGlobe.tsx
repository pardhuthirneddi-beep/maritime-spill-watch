// maris — 3D Geospatial Intelligence Globe
// Futuristic maritime operations visualization using Three.js
import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  RotateCcw,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Crosshair,
  Layers,
  ChevronDown,
  ChevronRight,
  Info,
  Ship,
  Target,
  Radio,
  Compass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEMO_INCIDENT,
  DEMO_VESSELS,
  DEMO_DRIFT,
  DEMO_SATELLITE_OBSERVATION,
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
  onSelectVessel?: (vessel: AisVessel) => void;
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

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030508);

  // Camera
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
  camera.position.set(0, 0, 350);

  // Renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // Globe
  const globeRadius = 100;
  const globeGeom = new THREE.SphereGeometry(globeRadius, 64, 64);
  const globeMat = new THREE.MeshPhongMaterial({
    color: 0x0a1628,
    emissive: 0x050d18,
    specular: 0x112244,
    shininess: 15,
    transparent: true,
    opacity: 0.95,
  });
  const globe = new THREE.Mesh(globeGeom, globeMat);
  scene.add(globe);

  // Wireframe grid on globe
  const wireGeom = new THREE.SphereGeometry(globeRadius + 0.3, 48, 48);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x1a3a5c,
    wireframe: true,
    transparent: true,
    opacity: 0.15,
  });
  const wireGlobe = new THREE.Mesh(wireGeom, wireMat);
  scene.add(wireGlobe);

  // Latitude/longitude grid lines
  const gridGroup = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({
    color: 0x1e4976,
    transparent: true,
    opacity: 0.12,
  });

  // Latitude lines
  for (let lat = -80; lat <= 80; lat += 20) {
    const points: THREE.Vector3[] = [];
    for (let lon = 0; lon <= 360; lon += 3) {
      points.push(latLonToVector3(lat, lon, globeRadius + 0.5));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    gridGroup.add(new THREE.Line(geom, gridMat));
  }

  // Longitude lines
  for (let lon = 0; lon < 360; lon += 30) {
    const points: THREE.Vector3[] = [];
    for (let lat = -90; lat <= 90; lat += 3) {
      points.push(latLonToVector3(lat, lon, globeRadius + 0.5));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    gridGroup.add(new THREE.Line(geom, gridMat));
  }
  scene.add(gridGroup);

  // Atmosphere glow
  const atmosGeom = new THREE.SphereGeometry(globeRadius + 2, 64, 64);
  const atmosMat = new THREE.MeshBasicMaterial({
    color: 0x1a4a7a,
    transparent: true,
    opacity: 0.06,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(atmosGeom, atmosMat));

  // Outer glow
  const glowGeom = new THREE.SphereGeometry(globeRadius + 8, 64, 64);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x0d2847,
    transparent: true,
    opacity: 0.04,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(glowGeom, glowMat));

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x1a2a44, 0.6);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
  sunLight.position.set(200, 100, 150);
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight(0x2266aa, 0.3);
  rimLight.position.set(-200, -100, -150);
  scene.add(rimLight);

  return { scene, camera, renderer, globe, globeRadius };
}

// ─── VESSEL MARKER ──────────────────────────────────────────────────

function createVesselMarker(
  vessel: AisVessel,
  globeRadius: number,
  isSelected: boolean
): THREE.Group {
  const group = new THREE.Group();
  const pos = latLonToVector3(vessel.lat, vessel.lon, globeRadius + 0.5);

  // Vessel dot
  const dotGeom = new THREE.SphereGeometry(isSelected ? 1.5 : 1, 8, 8);
  const dotMat = new THREE.MeshBasicMaterial({
    color: isSelected ? 0x22d3ee : 0x60a5fa,
  });
  const dot = new THREE.Mesh(dotGeom, dotMat);
  group.add(dot);

  // Heading indicator
  const headingRad = ((vessel.heading - 90) * Math.PI) / 180;
  const arrowLen = 4;
  const arrowPoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(
      -arrowLen * Math.cos(headingRad),
      0,
      arrowLen * Math.sin(headingRad)
    ),
  ];
  const arrowGeom = new THREE.BufferGeometry().setFromPoints(arrowPoints);
  const arrowMat = new THREE.LineBasicMaterial({
    color: isSelected ? 0x22d3ee : 0x3b82f6,
    transparent: true,
    opacity: 0.6,
  });
  group.add(new THREE.Line(arrowGeom, arrowMat));

  // Selection ring
  if (isSelected) {
    const ringGeom = new THREE.RingGeometry(2.5, 3, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.lookAt(new THREE.Vector3(0, 0, 0));
    group.add(ring);
  }

  // Vertical pillar (elevation from surface)
  const pillarGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, isSelected ? 3 : 1.5, 0),
  ]);
  const pillarMat = new THREE.LineBasicMaterial({
    color: isSelected ? 0x22d3ee : 0x3b82f6,
    transparent: true,
    opacity: 0.3,
  });
  group.add(new THREE.Line(pillarGeom, pillarMat));

  group.position.copy(pos);
  group.userData = { vessel, type: "vessel" };

  return group;
}

// ─── VESSEL TRACK ───────────────────────────────────────────────────

function createVesselTrack(
  vessel: AisVessel,
  globeRadius: number,
  isSelected: boolean
): THREE.Line {
  const points = vessel.trajectory.map((p) =>
    latLonToVector3(p[0], p[1], globeRadius + 0.6)
  );
  if (points.length < 2) {
    return new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  }

  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: isSelected ? 0x22d3ee : 0x3b82f6,
    transparent: true,
    opacity: isSelected ? 0.7 : 0.25,
    linewidth: 1,
  });
  return new THREE.Line(geom, mat);
}

// ─── SPILL POLYGON ──────────────────────────────────────────────────

function createSpillPolygon(
  incident: OilSpillIncident,
  globeRadius: number
): THREE.Group {
  const group = new THREE.Group();

  // Polygon boundary
  const polyPoints = incident.polygon.coordinates.map((c) =>
    latLonToVector3(c[0], c[1], globeRadius + 0.8)
  );

  const polyGeom = new THREE.BufferGeometry().setFromPoints(polyPoints);
  const polyMat = new THREE.LineBasicMaterial({
    color: 0xfb923c,
    transparent: true,
    opacity: 0.8,
  });
  group.add(new THREE.Line(polyGeom, polyMat));

  // Fill polygon with triangles
  const fillGeom = new THREE.BufferGeometry();
  const center = latLonToVector3(
    incident.polygon.center[0],
    incident.polygon.center[1],
    globeRadius + 0.7
  );
  const vertices: number[] = [];
  for (let i = 0; i < polyPoints.length - 1; i++) {
    vertices.push(center.x, center.y, center.z);
    vertices.push(polyPoints[i].x, polyPoints[i].y, polyPoints[i].z);
    vertices.push(polyPoints[i + 1].x, polyPoints[i + 1].y, polyPoints[i + 1].z);
  }
  fillGeom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xea580c,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(fillGeom, fillMat));

  // Center marker
  const markerGeom = new THREE.SphereGeometry(1.2, 8, 8);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xfb923c });
  const marker = new THREE.Mesh(markerGeom, markerMat);
  marker.position.copy(center);
  group.add(marker);

  // Vertical line from surface
  const vertPoints = [
    latLonToVector3(incident.polygon.center[0], incident.polygon.center[1], globeRadius),
    latLonToVector3(incident.polygon.center[0], incident.polygon.center[1], globeRadius + 5),
  ];
  const vertGeom = new THREE.BufferGeometry().setFromPoints(vertPoints);
  const vertMat = new THREE.LineBasicMaterial({
    color: 0xfb923c,
    transparent: true,
    opacity: 0.5,
  });
  group.add(new THREE.Line(vertGeom, vertMat));

  group.userData = { type: "spill" };
  return group;
}

// ─── SATELLITE ORBIT ────────────────────────────────────────────────

function createSatellitePath(
  globeRadius: number
): THREE.Group {
  const group = new THREE.Group();

  // Ground track
  const trackPoints: THREE.Vector3[] = [];
  for (let lat = 16; lat >= 9; lat -= 0.5) {
    const lon = 86.5 + (16 - lat) * 0.25;
    trackPoints.push(latLonToVector3(lat, lon, globeRadius + 1));
  }
  const trackGeom = new THREE.BufferGeometry().setFromPoints(trackPoints);
  const trackMat = new THREE.LineDashedMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.4,
    dashSize: 1.5,
    gapSize: 1,
  });
  const trackLine = new THREE.Line(trackGeom, trackMat);
  trackLine.computeLineDistances();
  group.add(trackLine);

  // Satellite marker
  const satPos = latLonToVector3(14.5, 86.4, globeRadius + 12);
  const satGeom = new THREE.OctahedronGeometry(1.2, 0);
  const satMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
  const sat = new THREE.Mesh(satGeom, satMat);
  sat.position.copy(satPos);
  group.add(sat);

  // Satellite label line
  const labelLinePoints = [
    satPos,
    satPos.clone().add(new THREE.Vector3(0, 4, 0)),
  ];
  const labelLineGeom = new THREE.BufferGeometry().setFromPoints(labelLinePoints);
  const labelLineMat = new THREE.LineBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.3,
  });
  group.add(new THREE.Line(labelLineGeom, labelLineMat));

  // Observation cone (subtle)
  const coneGeom = new THREE.ConeGeometry(15, 12, 4, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.04,
    side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(coneGeom, coneMat);
  cone.position.copy(satPos);
  cone.lookAt(new THREE.Vector3(0, 0, 0));
  group.add(cone);

  group.userData = { type: "satellite" };
  return group;
}

// ─── DRIFT PATHS ────────────────────────────────────────────────────

function createDriftPaths(
  globeRadius: number
): THREE.Group {
  const group = new THREE.Group();

  // Forward drift
  const fwdPoints = DEMO_DRIFT.forward.map((p) =>
    latLonToVector3(p.center[0], p.center[1], globeRadius + 0.6)
  );
  if (fwdPoints.length > 1) {
    const fwdGeom = new THREE.BufferGeometry().setFromPoints(fwdPoints);
    const fwdMat = new THREE.LineDashedMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.35,
      dashSize: 1,
      gapSize: 0.8,
    });
    const fwdLine = new THREE.Line(fwdGeom, fwdMat);
    fwdLine.computeLineDistances();
    group.add(fwdLine);
  }

  // Backtrack
  const btPoints = DEMO_DRIFT.backtrack.map((p) =>
    latLonToVector3(p.center[0], p.center[1], globeRadius + 0.6)
  );
  if (btPoints.length > 1) {
    const btGeom = new THREE.BufferGeometry().setFromPoints(btPoints);
    const btMat = new THREE.LineDashedMaterial({
      color: 0xa78bfa,
      transparent: true,
      opacity: 0.35,
      dashSize: 1,
      gapSize: 0.8,
    });
    const btLine = new THREE.Line(btGeom, btMat);
    btLine.computeLineDistances();
    group.add(btLine);
  }

  group.userData = { type: "drift" };
  return group;
}

// ─── DETECTION ZONE RING ────────────────────────────────────────────

function createDetectionZone(
  incident: OilSpillIncident,
  globeRadius: number
): THREE.Group {
  const group = new THREE.Group();
  const center = latLonToVector3(
    incident.polygon.center[0],
    incident.polygon.center[1],
    globeRadius + 0.5
  );

  // Pulsing ring
  const ringGeom = new THREE.RingGeometry(5, 5.5, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfb923c,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.position.copy(center);
  ring.lookAt(new THREE.Vector3(0, 0, 0));
  group.add(ring);

  // Outer ring
  const outerGeom = new THREE.RingGeometry(8, 8.3, 48);
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xfb923c,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
  });
  const outer = new THREE.Mesh(outerGeom, outerMat);
  outer.position.copy(center);
  outer.lookAt(new THREE.Vector3(0, 0, 0));
  group.add(outer);

  group.userData = { type: "detectionZone" };
  return group;
}

// ─── COASTLINE SIMULATION ───────────────────────────────────────────
// Simplified India/Sri Lanka coastline for context

function createCoastline(globeRadius: number): THREE.Line {
  // Very simplified India east coast
  const coastPoints: LatLon[] = [
    [22.5, 88.0], [21.5, 87.5], [20.0, 87.0], [18.0, 84.5],
    [16.0, 82.0], [14.5, 80.5], [13.0, 80.3], [12.5, 80.0],
    [11.5, 79.8], [10.5, 79.8], [9.5, 79.5], [8.5, 77.5],
  ];

  const points = coastPoints.map((c) =>
    latLonToVector3(c[0], c[1], globeRadius + 0.4)
  );
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0x2a5a8a,
    transparent: true,
    opacity: 0.5,
  });
  return new THREE.Line(geom, mat);
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
  const mouseRef = useRef({ x: 0, y: 0, isDragging: false, lastX: 0, lastY: 0 });
  const rotationRef = useRef({ x: 0.3, y: -1.2 });

  const [selectedVessel, setSelectedVessel] = useState<AisVessel | null>(null);
  const [layers, setLayers] = useState<Globe3dLayer[]>([
    { id: "globe_vessels", label: "Vessels", enabled: true },
    { id: "globe_tracks", label: "Vessel Tracks", enabled: true },
    { id: "globe_spill", label: "Spill Detection", enabled: true },
    { id: "globe_satellite", label: "Satellite Path", enabled: true },
    { id: "globe_boundaries", label: "Coastlines", enabled: true },
    { id: "globe_grid", label: "Coordinate Grid", enabled: true },
    { id: "globe_detection_zones", label: "Detection Zone", enabled: true },
  ]);
  const [timeStep, setTimeStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mouseCoords, setMouseCoords] = useState("—");
  const [showLayers, setShowLayers] = useState(true);

  const timeSteps = [
    "09:05 — Satellite acquisition",
    "09:12 — Speed reduction detected",
    "09:17 — Course deviation identified",
    "09:42 — SAR imagery acquired",
    "09:48 — Possible oil slick detected",
    "09:50 — AIS correlation completed",
    "09:52 — Drift backtracking completed",
    "09:54 — Forward drift predicted",
    "09:56 — Source attribution ranked",
    "10:02 — Thickness analysis completed",
    "10:05 — Report generated",
  ];

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scene, camera, renderer, globe, globeRadius } = createGlobeScene(container);
    sceneRef.current = { scene, camera, renderer, globe, globeRadius };

    // Add all layers
    const vesselGroup = new THREE.Group();
    vesselGroup.name = "vessels";
    DEMO_VESSELS.forEach((v) => {
      vesselGroup.add(createVesselMarker(v, globeRadius, false));
    });
    scene.add(vesselGroup);

    const trackGroup = new THREE.Group();
    trackGroup.name = "tracks";
    DEMO_VESSELS.forEach((v) => {
      trackGroup.add(createVesselTrack(v, globeRadius, false));
    });
    scene.add(trackGroup);

    const spillGroup = createSpillPolygon(DEMO_INCIDENT, globeRadius);
    spillGroup.name = "spill";
    scene.add(spillGroup);

    const satGroup = createSatellitePath(globeRadius);
    satGroup.name = "satellite";
    scene.add(satGroup);

    const coastLine = createCoastline(globeRadius);
    coastLine.name = "boundaries";
    scene.add(coastLine);

    const driftGroup = createDriftPaths(globeRadius);
    driftGroup.name = "drift";
    scene.add(driftGroup);

    const detectionZone = createDetectionZone(DEMO_INCIDENT, globeRadius);
    detectionZone.name = "detectionZone";
    scene.add(detectionZone);

    // Initial camera position (looking at Bay of Bengal)
    const initialTarget = latLonToVector3(12.05, 87.0, globeRadius);
    camera.lookAt(initialTarget);

    // Mouse interaction for orbit
    const onMouseDown = (e: MouseEvent) => {
      mouseRef.current.isDragging = true;
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (mouseRef.current.isDragging) {
        const dx = e.clientX - mouseRef.current.lastX;
        const dy = e.clientY - mouseRef.current.lastY;
        rotationRef.current.y += dx * 0.005;
        rotationRef.current.x += dy * 0.005;
        rotationRef.current.x = Math.max(-1.2, Math.min(1.2, rotationRef.current.x));
        mouseRef.current.lastX = e.clientX;
        mouseRef.current.lastY = e.clientY;
      }

      // Coordinate readout
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const intersects = raycaster.intersectObject(globe);
      if (intersects.length > 0) {
        const p = intersects[0].point;
        const r = globeRadius;
        const lat = 90 - (Math.acos(p.y / r) * 180) / Math.PI;
        const lon = ((Math.atan2(p.z, -p.x) * 180) / Math.PI + 180) % 360 - 180;
        setMouseCoords(`${lat.toFixed(3)}°N  ${lon.toFixed(3)}°E`);
      }
    };
    const onMouseUp = () => { mouseRef.current.isDragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = camera.position.clone().normalize();
      const dist = camera.position.length();
      const newDist = Math.max(150, Math.min(600, dist + e.deltaY * 0.5));
      camera.position.copy(dir.multiplyScalar(newDist));
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    // Animation loop
    let time = 0;
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      time += 0.005;

      // Smooth orbit rotation
      const radius = camera.position.length();
      const targetX = radius * Math.cos(rotationRef.current.x) * Math.sin(rotationRef.current.y);
      const targetY = radius * Math.sin(rotationRef.current.x);
      const targetZ = radius * Math.cos(rotationRef.current.x) * Math.cos(rotationRef.current.y);

      camera.position.x += (targetX - camera.position.x) * 0.08;
      camera.position.y += (targetY - camera.position.y) * 0.08;
      camera.position.z += (targetZ - camera.position.z) * 0.08;

      const target = latLonToVector3(12.05, 87.0, 0);
      camera.lookAt(target);

      // Animate satellite marker
      const satGroup = scene.getObjectByName("satellite");
      if (satGroup) {
        satGroup.children.forEach((child) => {
          if (child instanceof THREE.Mesh && child.geometry.type === "OctahedronGeometry") {
            child.rotation.y = time * 2;
          }
        });
      }

      // Animate detection zone ring
      const dzGroup = scene.getObjectByName("detectionZone");
      if (dzGroup && dzGroup.children[0] instanceof THREE.Mesh) {
        const ring = dzGroup.children[0] as THREE.Mesh;
        const scale = 1 + Math.sin(time * 2) * 0.1;
        ring.scale.set(scale, scale, 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(time * 2) * 0.1;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
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
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Toggle layers
  const toggleLayer = useCallback((id: Globe3dLayerId) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l))
    );
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;
    const { scene } = sceneRef.current;

    const nameMap: Record<Globe3dLayerId, string> = {
      globe_vessels: "vessels",
      globe_tracks: "tracks",
      globe_spill: "spill",
      globe_satellite: "satellite",
      globe_boundaries: "boundaries",
      globe_grid: "", // grid is always part of globe
      globe_detection_zones: "detectionZone",
    };

    layers.forEach((l) => {
      const name = nameMap[l.id];
      if (!name) return;
      const obj = scene.getObjectByName(name);
      if (obj) obj.visible = l.enabled;
    });
  }, [layers]);

  // Time step playback
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTimeStep((prev) => {
        if (prev >= timeSteps.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);
    return () => clearInterval(interval);
  }, [isPlaying, timeSteps.length]);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#030508] text-zinc-100 overflow-hidden">
      {/* ─── TOP BAR ──────────────────────────────────────────── */}
      <header className="flex h-10 items-center justify-between border-b border-zinc-800/60 bg-[#060910] px-4 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back
          </button>
          <div className="h-4 w-px bg-zinc-800" />
          <span className="text-[10px] font-semibold tracking-[0.15em] text-zinc-300 uppercase">
            3D Intelligence
          </span>
          <div className="h-4 w-px bg-zinc-800" />
          <span className="text-[9px] font-mono text-zinc-600">
            {DEMO_INCIDENT.incidentNumber}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-0.5">
            <span className="text-[7px] font-semibold text-amber-400/70 uppercase tracking-wider">
              Demo Data
            </span>
          </div>
          <span className="text-[9px] font-mono text-zinc-600">
            {mouseCoords}
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT PANEL ──────────────────────────────────────── */}
        <aside className="w-64 border-r border-zinc-800/60 bg-[#060910] overflow-y-auto flex-shrink-0 z-10">
          {/* Vessel List */}
          <div className="p-3 border-b border-zinc-800/60">
            <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Ship className="size-3" />
              AIS Vessels
            </h3>
            <div className="space-y-1">
              {DEMO_VESSELS.map((v) => (
                <button
                  key={v.mmsi}
                  onClick={() =>
                    setSelectedVessel(selectedVessel?.mmsi === v.mmsi ? null : v)
                  }
                  className={cn(
                    "w-full text-left rounded border p-1.5 transition-colors",
                    selectedVessel?.mmsi === v.mmsi
                      ? "border-cyan-500/40 bg-cyan-500/5"
                      : "border-zinc-800/40 hover:border-zinc-700"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-200 truncate">{v.name}</span>
                    <span className="text-[8px] text-zinc-600 shrink-0">{v.speed}kn</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[8px] text-zinc-600">{v.vesselType}</span>
                    <span className="text-[8px] text-zinc-700">{v.heading}°</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Layer Controls */}
          <div className="p-3 border-b border-zinc-800/60">
            <button
              onClick={() => setShowLayers(!showLayers)}
              className="flex items-center gap-1.5 text-[9px] font-semibold text-zinc-500 uppercase tracking-wider w-full"
            >
              <Layers className="size-3" />
              Layers
              {showLayers ? (
                <ChevronDown className="size-3 ml-auto" />
              ) : (
                <ChevronRight className="size-3 ml-auto" />
              )}
            </button>
            {showLayers && (
              <div className="mt-2 space-y-0.5">
                {layers.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => toggleLayer(l.id)}
                    className="flex items-center gap-2 w-full px-1 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <div
                      className={cn(
                        "size-2.5 rounded-sm border transition-colors",
                        l.enabled
                          ? "border-cyan-500 bg-cyan-500/30"
                          : "border-zinc-600"
                      )}
                    >
                      {l.enabled && (
                        <div className="size-full flex items-center justify-center text-[7px] text-cyan-400">
                          ✓
                        </div>
                      )}
                    </div>
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Event Timeline */}
          <div className="p-3 border-b border-zinc-800/60">
            <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Radio className="size-3" />
              Event Replay
            </h3>
            <div className="space-y-0.5">
              {timeSteps.map((step, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-1.5 px-1 py-0.5 rounded transition-colors",
                    i === timeStep
                      ? "bg-cyan-500/10 text-cyan-400"
                      : i < timeStep
                        ? "text-zinc-500"
                        : "text-zinc-700"
                  )}
                >
                  <div
                    className={cn(
                      "mt-1 w-1.5 h-1.5 rounded-full shrink-0",
                      i === timeStep
                        ? "bg-cyan-400"
                        : i < timeStep
                          ? "bg-zinc-600"
                          : "bg-zinc-800"
                    )}
                  />
                  <span className="text-[9px] leading-tight">{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Demo Badge */}
          <div className="p-3">
            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
              <div className="flex items-center gap-1.5 text-[8px] text-amber-400/70">
                <Info className="size-3 shrink-0" />
                3D visualization — vessel positions, spill polygon, and satellite path are synthetic demonstration data.
              </div>
            </div>
          </div>
        </aside>

        {/* ─── 3D CANVAS ──────────────────────────────────────── */}
        <main className="flex-1 relative">
          <div ref={containerRef} className="absolute inset-0" />

          {/* Timeline controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
            <div className="flex items-center gap-2 rounded border border-zinc-800/80 bg-[#060910]/90 px-3 py-2">
              <button
                onClick={() => setTimeStep(Math.max(0, timeStep - 1))}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <SkipBack className="size-3" />
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </button>
              <button
                onClick={() => setTimeStep(Math.min(timeSteps.length - 1, timeStep + 1))}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <SkipForward className="size-3" />
              </button>
              <div className="h-4 w-px bg-zinc-800" />
              <div className="flex items-center gap-1.5">
                {timeSteps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setTimeStep(i)}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-colors",
                      i === timeStep
                        ? "bg-cyan-400"
                        : i < timeStep
                          ? "bg-zinc-600"
                          : "bg-zinc-800"
                    )}
                  />
                ))}
              </div>
              <div className="h-4 w-px bg-zinc-800" />
              <span className="text-[9px] font-mono text-zinc-500 min-w-[140px]">
                {timeSteps[timeStep]}
              </span>
            </div>
          </div>

          {/* Selected vessel info */}
          {selectedVessel && (
            <div className="absolute top-3 right-3 z-10 w-56">
              <div className="rounded border border-zinc-800/80 bg-[#060910]/90 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="size-2 rounded-full bg-cyan-400" />
                  <span className="text-[10px] font-semibold text-zinc-200">
                    {selectedVessel.name}
                  </span>
                </div>
                <div className="space-y-1">
                  <InfoRow3d label="MMSI" value={selectedVessel.mmsi} />
                  <InfoRow3d label="Type" value={selectedVessel.vesselType} />
                  <InfoRow3d label="Speed" value={`${selectedVessel.speed} kn`} />
                  <InfoRow3d label="Heading" value={`${selectedVessel.heading}°`} />
                  <InfoRow3d label="Destination" value={selectedVessel.destination} />
                  <InfoRow3d label="Flag" value={selectedVessel.flag} />
                  <InfoRow3d label="Position" value={`${selectedVessel.lat.toFixed(3)}°N, ${selectedVessel.lon.toFixed(3)}°E`} />
                </div>
              </div>
            </div>
          )}

          {/* Vessel info panel */}
          <div className="absolute top-3 left-3 z-10">
            <div className="rounded border border-zinc-800/80 bg-[#060910]/90 px-3 py-1.5 flex items-center gap-3">
              <span className="text-[9px] text-zinc-500">
                {DEMO_VESSELS.length} vessels monitored
              </span>
              <div className="h-3 w-px bg-zinc-800" />
              <span className="text-[9px] text-zinc-500">
                {DEMO_INCIDENT.polygon.areaKm2} km² spill
              </span>
              <div className="h-3 w-px bg-zinc-800" />
              <span className="text-[9px] text-orange-400">
                {DEMO_INCIDENT.confidence.score}% confidence
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="absolute bottom-14 left-3 z-10">
            <div className="rounded border border-zinc-800/80 bg-[#060910]/90 px-2 py-1.5 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-[8px] text-zinc-500">Oil Spill</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-[8px] text-zinc-500">Vessel</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-[8px] text-zinc-500">Selected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[8px] text-zinc-500">Satellite</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-px bg-orange-400" />
                <span className="text-[8px] text-zinc-500">Drift Forward</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-px bg-purple-400" />
                <span className="text-[8px] text-zinc-500">Drift Backtrack</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── HELPER ─────────────────────────────────────────────────────────

function InfoRow3d({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] text-zinc-600">{label}</span>
      <span className="text-[9px] text-zinc-400 truncate">{value}</span>
    </div>
  );
}
