// maris — 3D Geospatial Intelligence Globe
// Maritime command center visualization using Three.js
import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
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
} from "@/data/demoData";
import type {
  AisVessel,
  LatLon,
  Globe3dLayer,
  Globe3dLayerId,
} from "@/data/types";

interface IntelligenceGlobeProps {
  onBack: () => void;
}

// ─── GEO UTILITIES ──────────────────────────────────────────────────

function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// ─── GLOBE SCENE ────────────────────────────────────────────────────

function createScene(container: HTMLDivElement) {
  const w = container.clientWidth;
  const h = container.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020508);

  const camera = new THREE.PerspectiveCamera(50, w / h, 1, 4000);
  // Position: half-globe view from above-right, looking at Indian Ocean
  camera.position.set(120, 160, 260);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  container.appendChild(renderer.domElement);

  const R = 100; // globe radius

  // ── OCEAN SPHERE ────────────────────────────────────────────────
  // Much brighter ocean with visible blue
  const oceanGeom = new THREE.SphereGeometry(R, 128, 128);
  const oceanMat = new THREE.MeshPhongMaterial({
    color: 0x0c2d4a,       // Visible dark blue
    emissive: 0x061828,    // Subtle self-illumination
    specular: 0x3399cc,    // Blue specular highlight
    shininess: 40,
  });
  const ocean = new THREE.Mesh(oceanGeom, oceanMat);
  scene.add(ocean);

  // ── WIREFRAME GRID ON OCEAN ─────────────────────────────────────
  const wireMat = new THREE.LineBasicMaterial({ color: 0x1a4466, transparent: true, opacity: 0.25 });
  for (let lat = -80; lat <= 80; lat += 10) {
    const pts: THREE.Vector3[] = [];
    for (let lon = 0; lon <= 360; lon += 3) pts.push(latLonToVec3(lat, lon, R + 0.15));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }
  for (let lon = 0; lon < 360; lon += 10) {
    const pts: THREE.Vector3[] = [];
    for (let lat = -90; lat <= 90; lat += 3) pts.push(latLonToVec3(lat, lon, R + 0.15));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }

  // ── ATMOSPHERE GLOW (multiple layers for glassy edge) ───────────
  // Inner atmosphere
  const atmos1 = new THREE.Mesh(
    new THREE.SphereGeometry(R + 0.8, 128, 128),
    new THREE.MeshBasicMaterial({ color: 0x2277bb, transparent: true, opacity: 0.12, side: THREE.BackSide })
  );
  scene.add(atmos1);

  // Mid atmosphere
  const atmos2 = new THREE.Mesh(
    new THREE.SphereGeometry(R + 3, 128, 128),
    new THREE.MeshBasicMaterial({ color: 0x1166aa, transparent: true, opacity: 0.08, side: THREE.BackSide })
  );
  scene.add(atmos2);

  // Outer glow — the key "glassy edge" effect
  const atmos3 = new THREE.Mesh(
    new THREE.SphereGeometry(R + 8, 64, 64),
    new THREE.MeshBasicMaterial({ color: 0x0a4488, transparent: true, opacity: 0.06, side: THREE.BackSide })
  );
  scene.add(atmos3);

  // Rim glow — bright edge highlight
  const rimGeom = new THREE.SphereGeometry(R + 1.2, 128, 128);
  const rimMat = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x3399dd) },
      viewVector: { value: new THREE.Vector3(120, 160, 260).normalize() },
    },
    vertexShader: `
      uniform vec3 viewVector;
      varying float intensity;
      void main() {
        vec3 vNormal = normalize(normalMatrix * normal);
        vec3 vNormel = normalize(normalMatrix * viewVector);
        intensity = pow(0.7 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      varying float intensity;
      void main() {
        vec3 glow = glowColor * intensity;
        gl_FragColor = vec4(glow, intensity * 0.6);
      }
    `,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
  });
  const rim = new THREE.Mesh(rimGeom, rimMat);
  scene.add(rim);

  // ── LIGHTING ────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0x334466, 1.2);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xeeeeff, 1.8);
  sun.position.set(200, 200, 150);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x4488bb, 0.6);
  fill.position.set(-150, 50, -100);
  scene.add(fill);

  const rimLight = new THREE.DirectionalLight(0x66aadd, 0.8);
  rimLight.position.set(0, -100, 200);
  scene.add(rimLight);

  // Point light for specular highlight on ocean
  const specLight = new THREE.PointLight(0x88ccee, 1.5, 400);
  specLight.position.set(150, 180, 200);
  scene.add(specLight);

  return { scene, camera, renderer, R };
}

// ─── CONTINENTS (filled polygons on globe) ──────────────────────────

function createContinents(R: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "boundaries";

  // Land material — lighter, visible
  const landMat = new THREE.MeshBasicMaterial({
    color: 0x1a3344,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });

  const coastLineMat = new THREE.LineBasicMaterial({
    color: 0x3a8abb,
    transparent: true,
    opacity: 0.8,
  });

  // Helper: create filled polygon from lat/lon outline
  function addLand(shape: LatLon[], name?: string) {
    const vecs = shape.map((c) => latLonToVec3(c[0], c[1], R + 0.3));
    const center = vecs.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(vecs.length);
    center.normalize().multiplyScalar(R + 0.25);

    const verts: number[] = [];
    for (let i = 0; i < vecs.length; i++) {
      const next = vecs[(i + 1) % vecs.length];
      verts.push(center.x, center.y, center.z, vecs[i].x, vecs[i].y, vecs[i].z, next.x, next.y, next.z);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    group.add(new THREE.Mesh(geom, landMat));

    // Coast outline
    const outlinePts = [...vecs, vecs[0]];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outlinePts), coastLineMat));

    // Label
    if (name && shape.length > 2) {
      const mid = shape[Math.floor(shape.length / 2)];
      const labelPos = latLonToVec3(mid[0], mid[1], R + 2);
      // We'll use HTML labels instead
    }
  }

  // ── INDIA (detailed outline) ────────────────────────────────────
  const india: LatLon[] = [
    [35.0, 77.0], [34.0, 77.5], [33.0, 79.0], [31.0, 80.5],
    [30.0, 81.0], [28.0, 84.0], [27.0, 84.5], [26.0, 85.0],
    [25.5, 86.5], [25.0, 88.0], [24.0, 88.8], [23.0, 88.5],
    [22.0, 88.0], [21.5, 87.5], [20.5, 87.0], [19.5, 86.0],
    [18.5, 85.0], [17.5, 83.5], [16.5, 82.5], [15.5, 81.0],
    [14.5, 80.5], [13.5, 80.3], [12.5, 80.0], [11.5, 79.8],
    [10.5, 79.8], [9.5, 79.5], [8.5, 77.5], [8.0, 77.0],
    [9.0, 76.5], [10.0, 76.2], [11.0, 75.8], [12.0, 75.0],
    [13.0, 74.8], [14.0, 74.5], [15.0, 74.0], [16.0, 73.5],
    [17.0, 74.0], [18.0, 73.5], [19.0, 73.0], [20.0, 72.5],
    [21.0, 71.5], [21.5, 70.0], [22.5, 69.0], [23.5, 68.5],
    [24.5, 68.0], [25.5, 67.5], [27.0, 68.0], [28.0, 69.5],
    [29.0, 71.0], [30.0, 72.0], [31.0, 73.5], [32.0, 75.0],
    [33.0, 75.5], [34.0, 76.0], [35.0, 77.0],
  ];
  addLand(india, "India");

  // ── SRI LANKA ───────────────────────────────────────────────────
  const sriLanka: LatLon[] = [
    [10.0, 80.0], [9.5, 80.2], [8.5, 81.0], [7.5, 81.5],
    [6.5, 80.5], [6.0, 80.2], [6.5, 79.8], [7.5, 79.5],
    [8.5, 79.8], [9.5, 79.8], [10.0, 80.0],
  ];
  addLand(sriLanka, "Sri Lanka");

  // ── PAKISTAN ────────────────────────────────────────────────────
  const pakistan: LatLon[] = [
    [35.0, 77.0], [36.0, 76.0], [37.0, 75.0], [36.5, 73.5],
    [35.5, 72.0], [34.0, 71.5], [32.5, 71.0], [31.0, 70.5],
    [30.0, 70.0], [28.5, 69.0], [27.0, 68.0], [25.5, 67.5],
    [24.5, 66.5], [25.0, 62.0], [26.0, 63.0], [27.0, 63.5],
    [28.0, 64.0], [29.0, 65.0], [30.0, 66.5], [31.0, 68.0],
    [32.0, 69.0], [33.0, 70.5], [34.0, 72.5], [35.0, 77.0],
  ];
  addLand(pakistan, "Pakistan");

  // ── ARABIAN PENINSULA ───────────────────────────────────────────
  const arabia: LatLon[] = [
    [30.0, 48.0], [29.0, 48.0], [27.5, 49.5], [26.5, 50.0],
    [25.0, 50.5], [24.0, 51.5], [23.5, 53.0], [23.0, 54.0],
    [22.0, 55.0], [21.5, 56.0], [20.0, 57.5], [18.5, 57.0],
    [17.0, 56.5], [16.5, 54.0], [16.0, 52.5], [15.5, 51.5],
    [14.5, 49.0], [13.5, 46.5], [13.0, 45.0], [14.0, 43.0],
    [15.0, 42.5], [16.5, 42.5], [18.0, 40.5], [20.0, 39.5],
    [22.0, 39.5], [24.0, 38.5], [26.0, 39.0], [28.0, 39.5],
    [29.0, 40.5], [30.0, 42.0], [31.0, 44.0], [31.5, 46.0],
    [30.5, 47.0], [30.0, 48.0],
  ];
  addLand(arabia, "Arabia");

  // ── AFRICA (horn + east) ────────────────────────────────────────
  const africa: LatLon[] = [
    [12.5, 44.0], [11.5, 43.0], [11.0, 42.0], [10.5, 41.5],
    [9.0, 42.0], [7.0, 44.0], [5.0, 45.5], [4.0, 46.0],
    [2.0, 45.0], [0.0, 42.0], [-2.0, 41.0], [-5.0, 40.0],
    [-8.0, 39.0], [-10.0, 40.0], [-12.0, 42.0], [-15.0, 40.5],
    [-18.0, 37.0], [-20.0, 35.0], [-25.0, 33.0], [-28.0, 31.0],
    [-30.0, 30.0], [-33.0, 27.0], [-34.0, 26.0],
  ];
  addLand(africa, "Africa");

  // ── IRAN ────────────────────────────────────────────────────────
  const iran: LatLon[] = [
    [37.5, 54.0], [37.0, 56.0], [36.0, 57.0], [35.0, 58.5],
    [34.0, 59.5], [32.5, 60.0], [31.0, 61.5], [29.5, 60.5],
    [28.0, 59.0], [26.5, 57.5], [25.5, 57.0], [25.0, 56.0],
    [25.5, 55.5], [26.5, 54.5], [27.5, 53.0], [28.5, 51.0],
    [30.0, 50.0], [31.5, 48.5], [33.0, 47.0], [34.5, 46.0],
    [35.5, 46.5], [36.5, 48.0], [37.5, 49.5], [38.5, 48.5],
    [39.0, 45.0], [38.0, 44.0], [37.5, 44.5], [37.0, 46.0],
    [37.5, 48.0], [37.5, 54.0],
  ];
  addLand(iran, "Iran");

  // ── CENTRAL ASIA LANDMASS ───────────────────────────────────────
  const centralAsia: LatLon[] = [
    [40.0, 50.0], [42.0, 52.0], [44.0, 54.0], [45.0, 56.0],
    [46.0, 58.0], [47.0, 60.0], [48.0, 62.0], [47.0, 64.0],
    [45.0, 66.0], [43.0, 68.0], [42.0, 70.0], [41.0, 72.0],
    [40.0, 74.0], [38.0, 76.0], [37.0, 78.0], [35.0, 77.0],
    [34.0, 76.0], [33.0, 75.5], [32.0, 75.0], [31.0, 73.5],
    [30.0, 72.0], [30.5, 71.0], [31.0, 70.0], [32.0, 69.0],
    [33.0, 68.0], [34.0, 66.0], [35.0, 64.0], [36.0, 62.0],
    [37.0, 60.0], [38.0, 58.0], [39.0, 56.0], [39.5, 53.0],
    [40.0, 50.0],
  ];
  addLand(centralAsia, "Central Asia");

  return group;
}

// ─── LABELS (HTML overlay) ──────────────────────────────────────────

function createTextLabel(text: string, lat: number, lon: number, R: number, color = "#4a8ab5"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "transparent";
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = "bold 22px monospace";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, 128, 38);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.8 });
  const sprite = new THREE.Sprite(mat);
  const pos = latLonToVec3(lat, lon, R + 3);
  sprite.position.copy(pos);
  sprite.scale.set(20, 5, 1);
  return sprite;
}

// ─── VESSEL MARKERS ─────────────────────────────────────────────────

function createVessel(v: AisVessel, R: number, selected: boolean): THREE.Group {
  const g = new THREE.Group();
  const pos = latLonToVec3(v.lat, v.lon, R + 0.5);

  // Ship body — diamond shape
  const shape = new THREE.Shape();
  shape.moveTo(0, -1.5);
  shape.lineTo(0.8, 0);
  shape.lineTo(0, 1.5);
  shape.lineTo(-0.8, 0);
  shape.closePath();

  const extrudeSettings = { depth: 0.3, bevelEnabled: false };
  const bodyGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const bodyMat = new THREE.MeshBasicMaterial({
    color: selected ? 0x22d3ee : 0x55aaff,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.rotation.x = -Math.PI / 2;
  body.rotation.z = -((v.heading * Math.PI) / 180);
  g.add(body);

  // Glow sphere
  const glowGeom = new THREE.SphereGeometry(selected ? 2.0 : 1.0, 8, 8);
  const glowMat = new THREE.MeshBasicMaterial({
    color: selected ? 0x22d3ee : 0x55aaff,
    transparent: true,
    opacity: selected ? 0.4 : 0.2,
  });
  g.add(new THREE.Mesh(glowGeom, glowMat));

  // Vertical line
  const pillarH = selected ? 5 : 2.5;
  const pillarPts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, pillarH, 0)];
  g.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pillarPts),
    new THREE.LineBasicMaterial({ color: selected ? 0x22d3ee : 0x55aaff, transparent: true, opacity: 0.5 })
  ));

  // Selection ring
  if (selected) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 3.5, 24),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    ring.position.y = pillarH;
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
  }

  g.position.copy(pos);
  return g;
}

// ─── VESSEL TRACKS ──────────────────────────────────────────────────

function createTrack(v: AisVessel, R: number, selected: boolean): THREE.Line {
  const pts = v.trajectory.map((c) => latLonToVec3(c[0], c[1], R + 0.4));
  if (pts.length < 2) return new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({
      color: selected ? 0x22d3ee : 0x3388cc,
      transparent: true,
      opacity: selected ? 0.8 : 0.4,
    })
  );
}

// ─── SPILL POLYGON ──────────────────────────────────────────────────

function createSpill(incident: typeof DEMO_INCIDENT, R: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "spill";

  const pts = incident.polygon.coordinates.map((c) => latLonToVec3(c[0], c[1], R + 0.6));

  // Boundary
  g.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]),
    new THREE.LineBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 1.0 })
  ));

  // Fill
  const center = latLonToVec3(incident.polygon.center[0], incident.polygon.center[1], R + 0.5);
  const verts: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    verts.push(center.x, center.y, center.z, pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
  }
  const fillGeom = new THREE.BufferGeometry();
  fillGeom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.add(new THREE.Mesh(fillGeom, new THREE.MeshBasicMaterial({
    color: 0xd4770a, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
  })));

  // Center beacon
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xfb923c })
  );
  beacon.position.copy(center);
  g.add(beacon);

  // Vertical line
  g.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      latLonToVec3(incident.polygon.center[0], incident.polygon.center[1], R),
      latLonToVec3(incident.polygon.center[0], incident.polygon.center[1], R + 7),
    ]),
    new THREE.LineBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.6 })
  ));

  return g;
}

// ─── SATELLITE ──────────────────────────────────────────────────────

function createSatellite(R: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "satellite";

  // Ground track
  const trackPts: THREE.Vector3[] = [];
  for (let lat = 20; lat >= 6; lat -= 0.5) {
    trackPts.push(latLonToVec3(lat, 86 + (20 - lat) * 0.2, R + 0.6));
  }
  const trackLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(trackPts),
    new THREE.LineDashedMaterial({ color: 0x44cc88, transparent: true, opacity: 0.6, dashSize: 2, gapSize: 1 })
  );
  trackLine.computeLineDistances();
  g.add(trackLine);

  // Satellite body
  const satPos = latLonToVec3(16, 86.4, R + 16);
  const sat = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.8, 0),
    new THREE.MeshBasicMaterial({ color: 0x44cc88 })
  );
  sat.position.copy(satPos);
  g.add(sat);

  // Solar panels (two flat boxes)
  const panelGeom = new THREE.BoxGeometry(4, 0.2, 1.5);
  const panelMat = new THREE.MeshBasicMaterial({ color: 0x2288aa });
  const panel1 = new THREE.Mesh(panelGeom, panelMat);
  panel1.position.copy(satPos).add(new THREE.Vector3(-3, 0, 0));
  g.add(panel1);
  const panel2 = new THREE.Mesh(panelGeom, panelMat);
  panel2.position.copy(satPos).add(new THREE.Vector3(3, 0, 0));
  g.add(panel2);

  // Observation cone
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(20, 16, 4, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x44cc88, transparent: true, opacity: 0.04, side: THREE.DoubleSide })
  );
  cone.position.copy(satPos);
  cone.lookAt(new THREE.Vector3(0, 0, 0));
  g.add(cone);

  return g;
}

// ─── DRIFT ──────────────────────────────────────────────────────────

function createDrift(R: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "drift";

  const fwdPts = DEMO_DRIFT.forward.map((p) => latLonToVec3(p.center[0], p.center[1], R + 0.4));
  if (fwdPts.length > 1) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(fwdPts),
      new THREE.LineDashedMaterial({ color: 0xf97316, transparent: true, opacity: 0.4, dashSize: 1.5, gapSize: 1 })
    );
    line.computeLineDistances();
    g.add(line);
  }

  return g;
}

// ─── DETECTION ZONE ─────────────────────────────────────────────────

function createDetectionZone(incident: typeof DEMO_INCIDENT, R: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "detectionZone";
  const center = latLonToVec3(incident.polygon.center[0], incident.polygon.center[1], R + 0.4);

  [7, 12].forEach((radius, i) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius, radius + 0.4, 48),
      new THREE.MeshBasicMaterial({
        color: 0xfb923c,
        transparent: true,
        opacity: i === 0 ? 0.3 : 0.1,
        side: THREE.DoubleSide,
      })
    );
    ring.position.copy(center);
    ring.lookAt(new THREE.Vector3(0, 0, 0));
    g.add(ring);
  });

  return g;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────

export default function IntelligenceGlobe({ onBack }: IntelligenceGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    R: number;
  } | null>(null);
  const animFrameRef = useRef<number>(0);
  const mouseRef = useRef({ isDragging: false, lastX: 0, lastY: 0 });
  const rotRef = useRef({ x: 0.35, y: -1.0 });

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

  // Initialize Three.js
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scene, camera, renderer, R } = createScene(container);
    sceneRef.current = { scene, camera, renderer, R };

    // Add continents
    scene.add(createContinents(R));

    // Add labels
    const labels = [
      ["Mumbai", 19.0, 73.0],
      ["Karachi", 24.8, 67.0],
      ["Salalah", 17.0, 54.0],
      ["Mangaluru", 12.9, 74.9],
      ["Colombo", 6.9, 79.8],
    ] as const;
    labels.forEach(([name, lat, lon]) => scene.add(createTextLabel(name, lat, lon, R, "#4a8ab5")));

    // Region labels (larger, dimmer)
    scene.add(createTextLabel("ARABIAN SEA", 15, 66, R, "#1a4466"));
    scene.add(createTextLabel("BAY OF BENGAL", 14, 88, R, "#1a4466"));
    scene.add(createTextLabel("INDIAN OCEAN", 0, 75, R, "#1a4466"));

    // Vessels
    const vGroup = new THREE.Group();
    vGroup.name = "vessels";
    DEMO_VESSELS.forEach((v) => vGroup.add(createVessel(v, R, false)));
    scene.add(vGroup);

    const tGroup = new THREE.Group();
    tGroup.name = "tracks";
    DEMO_VESSELS.forEach((v) => tGroup.add(createTrack(v, R, false)));
    scene.add(tGroup);

    scene.add(createSpill(incident, R));
    scene.add(createSatellite(R));
    scene.add(createDrift(R));
    scene.add(createDetectionZone(incident, R));

    // Mouse orbit
    const onDown = (e: MouseEvent) => { mouseRef.current = { isDragging: true, lastX: e.clientX, lastY: e.clientY }; };
    const onMove = (e: MouseEvent) => {
      if (!mouseRef.current.isDragging) return;
      rotRef.current.y += (e.clientX - mouseRef.current.lastX) * 0.005;
      rotRef.current.x = Math.max(-0.8, Math.min(0.8, rotRef.current.x + (e.clientY - mouseRef.current.lastY) * 0.005));
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
    };
    const onUp = () => { mouseRef.current.isDragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = camera.position.clone().normalize();
      const d = camera.position.length();
      camera.position.copy(dir.multiplyScalar(Math.max(180, Math.min(500, d + e.deltaY * 0.5))));
    };

    container.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    let t = 0;
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      t += 0.003;

      const r = camera.position.length();
      camera.position.x += (r * Math.cos(rotRef.current.x) * Math.sin(rotRef.current.y) - camera.position.x) * 0.06;
      camera.position.y += (r * Math.sin(rotRef.current.x) - camera.position.y) * 0.06;
      camera.position.z += (r * Math.cos(rotRef.current.x) * Math.cos(rotRef.current.y) - camera.position.z) * 0.06;
      camera.lookAt(0, 0, 0);

      // Animate satellite
      const sat = scene.getObjectByName("satellite");
      if (sat) sat.children.forEach((c) => { if (c instanceof THREE.Mesh && c.geometry.type === "OctahedronGeometry") c.rotation.y = t * 3; });

      // Pulse detection zone
      const dz = scene.getObjectByName("detectionZone");
      if (dz && dz.children[0] instanceof THREE.Mesh) {
        const s = 1 + Math.sin(t * 3) * 0.08;
        dz.children[0].scale.set(s, s, 1);
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
      container.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      container.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  // Layer toggle
  useEffect(() => {
    if (!sceneRef.current) return;
    const { scene } = sceneRef.current;
    const map: Record<string, string> = {
      globe_vessels: "vessels", globe_tracks: "tracks", globe_spill: "spill",
      globe_satellite: "satellite", globe_boundaries: "boundaries",
      globe_detection_zones: "detectionZone",
    };
    layers.forEach((l) => { const n = map[l.id]; if (n) { const o = scene.getObjectByName(n); if (o) o.visible = l.enabled; } });
  }, [layers]);

  // Playback
  useEffect(() => {
    if (!isPlaying) return;
    const iv = setInterval(() => {
      setTimeStep((p) => { if (p >= timeSteps.length - 1) { setIsPlaying(false); return p; } return p + 1; });
    }, 1000 / playSpeed);
    return () => clearInterval(iv);
  }, [isPlaying, playSpeed, timeSteps.length]);

  const toggleLayer = useCallback((id: Globe3dLayerId) => {
    setLayers((p) => p.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)));
  }, []);

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
                  <button key={v.mmsi} onClick={() => setSelectedVessel(sel ? null : v)} className={cn("w-full text-left px-3 py-2 border-b border-zinc-800/30 transition-colors", sel ? "bg-cyan-500/8" : "hover:bg-zinc-800/30")}>
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
              <button className="w-full text-center text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors py-1">VIEW ALL VESSELS</button>
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

        {/* ─── 3D GLOBE ─────────────────────────────────────── */}
        <main className="flex-1 relative">
          <div ref={containerRef} className="absolute inset-0" />

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
            <div className="mt-1 flex flex-col items-center gap-0.5">
              <button className="size-6 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300 text-[10px]">+</button>
              <button className="size-6 rounded border border-zinc-700/50 bg-[#060a10]/80 flex items-center justify-center text-zinc-500 hover:text-zinc-300 text-[10px]">−</button>
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
            <button className="w-full rounded border border-zinc-700 bg-zinc-800/30 py-2 text-[10px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors uppercase tracking-wider">View Full Report</button>
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
