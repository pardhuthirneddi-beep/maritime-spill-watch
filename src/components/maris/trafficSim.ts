// MARIS — DEMO AIS provider (simulated real-time maritime traffic).
//
// GEOGRAPHIC VALIDITY: every generated route is validated against the
// land/water mask (waterMask.ts — the bundled NaturalEarthII raster) at
// fleet-build time: waypoints must be water with a coastal tolerance AND
// every interpolated leg sample must be water. Lateral route jitter that
// lands a coastal lane inland is regenerated deterministically; the
// pre-verified corridor centerline is the final fallback. No vessel sits
// on, or routes across, land.
//
// Architecture (provider-replaceable for future live AIS):
//   AIS PROVIDER (this file, demo) → NORMALIZED VESSEL STATE → 3D ENGINE
//
// Deterministic: a fixed PRNG seed generates the same traffic population
// and the same broad pattern every session. Vessel motion is analytic —
// position along its route is a pure function of simulation time — so the
// demo is reproducible, smooth, and O(1) per vessel per update.
//
// Identity: demo MMSIs use the 97x MID-prefix block (unassigned for real
// AIS in most regions) so simulated contacts can never be mistaken for a
// live vessel. The five MARIS demo-investigation vessels keep their real
// demo MMSIs (419…) so attribution/selection/AIS analysis stay connected.

// ─── GEO UTILITIES (small, local — no new deps) ──────────────────────

import {
  ensureWaterMask,
  isWater,
  isWaterWithTolerance,
} from "@/components/maris/waterMask";

const R_EARTH = 6_371_000; // meters
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distM: number,
): [number, number] {
  const δ = distM / R_EARTH;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);
  const sinφ2 =
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * sinφ2,
    );
  return [toDeg(φ2), ((toDeg(λ2) + 540) % 360) - 180];
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(a)) / 1000;
}

// ─── DETERMINISTIC PRNG (mulberry32) ─────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── CORRIDORS (plausible global shipping lanes) ─────────────────────

export interface Corridor {
  name: string;
  /** Waypoint chain [lat, lon] following a plausible sea lane. */
  waypoints: [number, number][];
  /** Vessel count allocated to this corridor. */
  count: number;
  /** Speed range in knots (corridor character). */
  speedKn: [number, number];
}

const CORRIDORS: Corridor[] = [
  // ── INDIA PRIORITY (dense coastal traffic, as required) ───────────
  {
    name: "Gujarat–Mumbai coastal",
    waypoints: [[21.5, 68.5], [20.8, 69.2], [20.4, 70.2], [20.2, 71.2], [19.6, 72.0], [18.7, 72.5]],
    count: 46, speedKn: [8, 16],
  },
  {
    name: "Mumbai–Kochi coastal",
    waypoints: [[18.7, 72.5], [16.5, 73.0], [14.2, 74.0], [13.0, 74.3], [12.0, 74.6], [10.0, 75.3], [9.7, 75.75]],
    count: 34, speedKn: [8, 15],
  },
  {
    name: "Kochi–Colombo–Sri Lanka",
    waypoints: [[9.7, 75.75], [8.5, 76.4], [7.4, 77.7], [6.4, 78.9], [5.9, 80.0]],
    count: 28, speedKn: [9, 16],
  },
  {
    name: "Chennai–Visakhapatnam",
    waypoints: [[13.1, 80.4], [14.9, 81.2], [16.4, 82.8], [17.9, 84.3], [18.6, 84.7], [19.4, 85.9], [20.0, 86.7]],
    count: 30, speedKn: [9, 17],
  },
  {
    name: "Visakhapatnam–Odisha–Kolkata",
    waypoints: [[20.0, 86.7], [20.7, 87.4], [21.3, 88.2], [21.6, 88.9], [21.5, 89.1]],
    count: 22, speedKn: [8, 15],
  },
  {
    name: "Bay of Bengal crossing",
    waypoints: [[6.7, 82.2], [8.5, 84.5], [10.5, 87.0], [12.5, 89.5], [14.5, 91.5]],
    count: 24, speedKn: [10, 18],
  },
  {
    name: "Andaman & Nicobar approaches",
    waypoints: [[10.5, 92.5], [11.5, 93.5], [12.6, 94.2], [13.6, 95.0], [14.6, 96.0]],
    count: 16, speedKn: [9, 16],
  },
  // ── GLOBAL ARTERIES ───────────────────────────────────────────────
  {
    name: "Arabian Sea–Gulf (Hormuz)",
    waypoints: [[24.8, 58.5], [24.0, 59.5], [25.0, 57.5], [26.2, 56.4], [26.6, 55.2]],
    count: 36, speedKn: [9, 17],
  },
  {
    name: "Red Sea–Suez approaches",
    waypoints: [[12.6, 43.4], [15.0, 42.2], [18.5, 40.0], [21.5, 38.2], [24.0, 36.5]],
    count: 30, speedKn: [8, 15],
  },
  {
    name: "Malacca Strait",
    waypoints: [[5.9, 95.0], [6.0, 96.5], [5.9, 97.8], [4.8, 99.5], [3.2, 100.3], [2.2, 101.8], [1.8, 102.1], [1.6, 102.7], [1.4, 103.0]],
    count: 42, speedKn: [8, 16],
  },
  {
    name: "South China Sea–Singapore",
    waypoints: [[2.0, 104.4], [3.5, 106.5], [7.0, 109.5], [11.0, 111.5], [15.0, 113.5]],
    count: 38, speedKn: [9, 18],
  },
  {
    name: "East Asia–Shanghai",
    waypoints: [[22.3, 116.4], [24.5, 119.0], [27.5, 122.0], [30.5, 122.9], [31.4, 122.6]],
    count: 28, speedKn: [9, 17],
  },
  {
    name: "Mediterranean east–west",
    waypoints: [[31.7, 33.0], [33.8, 25.0], [35.2, 19.5], [36.2, 15.5], [37.0, 12.0], [38.0, 5.5]],
    count: 30, speedKn: [9, 17],
  },
  {
    name: "Gibraltar approaches",
    waypoints: [[36.05, -4.2], [36.1, -5.4], [36.0, -6.8], [36.5, -8.0], [37.4, -9.8], [38.5, -10.5], [40.0, -11.5]],
    count: 20, speedKn: [8, 16],
  },
  {
    name: "North Atlantic lanes",
    waypoints: [[40.5, -12.0], [45.0, -20.0], [48.5, -30.0], [50.0, -40.0], [49.5, -50.0]],
    count: 24, speedKn: [10, 19],
  },
  {
    name: "Cape of Good Hope",
    waypoints: [[-34.7, 18.4], [-35.2, 20.2], [-35.2, 22.5], [-34.8, 25.5], [-33.5, 28.0]],
    count: 24, speedKn: [9, 17],
  },
  {
    name: "South Atlantic–Buenos",
    waypoints: [[-34.5, -52.0], [-36.0, -50.0], [-37.5, -52.5], [-38.8, -55.5], [-39.5, -58.0]],
    count: 14, speedKn: [8, 15],
  },
  {
    name: "Panama approaches",
    waypoints: [[8.2, -79.7], [7.0, -79.8], [7.0, -81.4], [7.4, -83.2], [7.8, -85.2], [8.0, -86.6]],
    count: 18, speedKn: [8, 15],
  },
  {
    name: "Transpacific–Japan",
    waypoints: [[34.5, 140.5], [33.0, 148.0], [31.0, 158.0], [28.5, 170.0], [26.0, 182.0]],
    count: 18, speedKn: [10, 19],
  },
  {
    name: "Australia–Bass Strait",
    waypoints: [[-34.0, 152.2], [-35.6, 151.8], [-37.2, 150.9], [-38.5, 149.2], [-39.7, 147.2], [-39.9, 145.0], [-39.0, 143.6], [-38.6, 144.4]],
    count: 14, speedKn: [8, 15],
  },
];
// Corridor count: 20 × ~25 avg ≈ 500 vessels. Performance-safe (batched).

// ─── VESSEL TYPES ────────────────────────────────────────────────────

interface TypeInfo {
  /** Weighted share of the population. */
  weight: number;
  /** Plausible service speed band (kn). */
  speedKn: [number, number];
}

const TYPES: Record<string, TypeInfo> = {
  "Crude Oil Tanker": { weight: 14, speedKn: [10, 15] },
  "Product Tanker": { weight: 12, speedKn: [9, 14] },
  Container: { weight: 22, speedKn: [12, 22] },
  "General Cargo": { weight: 20, speedKn: [9, 14] },
  "Bulk Carrier": { weight: 16, speedKn: [9, 13] },
  "Vehicle Carrier": { weight: 5, speedKn: [13, 18] },
  "Passenger Ferry": { weight: 4, speedKn: [14, 24] },
  "Fishing Vessel": { weight: 5, speedKn: [5, 10] },
  Tug: { weight: 2, speedKn: [4, 9] },
};

const TYPE_NAMES = Object.keys(TYPES);
const TYPE_WEIGHT_TOTAL = TYPE_NAMES.reduce((s, t) => s + TYPES[t].weight, 0);

function pickType(rand: () => number): string {
  let roll = rand() * TYPE_WEIGHT_TOTAL;
  for (const name of TYPE_NAMES) {
    roll -= TYPES[name].weight;
    if (roll <= 0) return name;
  }
  return TYPE_NAMES[0];
}

// ─── WATER-SAFE ROUTE VALIDATION ─────────────────────────────────────

/**
 * True when the whole route stays over water: every waypoint (with a
 * coastal tolerance so symbols never overlap shoreline pixels) and every
 * interpolated leg sample (10 km spacing). Runs at fleet-build time only —
 * never per frame.
 */
function isRouteWaterSafe(route: [number, number][]): boolean {
  for (const [lat, lon] of route) {
    if (!isWaterWithTolerance(lat, lon, 5)) return false;
  }
  for (let i = 0; i + 1 < route.length; i++) {
    const [aLat, aLon] = route[i];
    let [bLat, bLon] = route[i + 1];
    // Antimeridian: normalize the leg into the shorter arc.
    if (bLon - aLon > 180) bLon -= 360;
    if (bLon - aLon < -180) bLon += 360;
    const dKm = haversineKm(aLat, aLon, bLat, bLon);
    const steps = Math.max(1, Math.ceil(dKm / 10));
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      if (!isWater(aLat + (bLat - aLat) * f, aLon + (bLon - aLon) * f)) {
        return false;
      }
    }
  }
  return true;
}

/** Unwrap route longitudes so consecutive waypoints are continuous
 * (prevents linear interpolation from sweeping across the antimeridian). */
function unwrapRoute(route: [number, number][]): void {
  for (let i = 1; i < route.length; i++) {
    while (route[i][1] - route[i - 1][1] > 180) route[i][1] -= 360;
    while (route[i][1] - route[i - 1][1] < -180) route[i][1] += 360;
  }
}

// ─── SIMULATED FLEET ─────────────────────────────────────────────────

/** A simulated AIS contact — pure state, no rendering concerns. */
export interface SimVessel {
  mmsi: string;
  name: string;
  vesselType: string;
  flag: string;
  corridor: string;
  /** Route waypoints [lat, lon]. */
  route: [number, number][];
  /** Cumulative leg-start distance-along-route (m). */
  legStart: number[];
  /** Total route length (m). */
  routeLength: number;
  speedMs: number;
  /** Distance along route at simulation epoch (m). */
  offsetM: number;
  /** Route direction: +1 or −1 (some ships sail the reverse lane). */
  dir: 1 | -1;
  /** Anchor drift only (sim time at which the vessel drops anchor, or ∞). */
  anchorAtMs: number | null;
  anchorPos: [number, number] | null;
}

export interface SimPosition {
  lat: number;
  lon: number;
  headingDeg: number;
  speedKn: number;
}

const FLEET: SimVessel[] = [];
const NAMES_A = [
  "OCEAN", "PACIFIC", "ATLANTIC", "INDIAN", "STAR", "HORIZON", "MARLIN", "TITAN",
  "AURORA", "BALTIC", "CORAL", "DOLPHIN", "EAGLE", "FALCON", "GLORY", "HARMONY",
  "IVY", "JADE", "KOBE", "LUNAR", "MERIDIAN", "NEPTUNE", "ORION", "PHOENIX",
  "QUARTZ", "RUBY", "SPIRIT", "TRITON", "UNITY", "VOYAGER", "ZENITH",
];
const NAMES_B = ["STAR", "WAVE", "WIND", "LIGHT", "PRIDE", "VOYAGER", "TRADER", "PIONEER", "ENTERPRISE", "GUARDIAN", "SPIRIT", "ARROW", "CRESCENT", "PEARL", "SAPPHIRE"];
const FLAGS = ["PA", "LR", "MH", "SG", "MT", "CY", "HK", "PA", "LR", "SG"];

/**
 * Build the demo fleet once (deterministic). Called lazily by getFleet().
 */
function buildFleet(): void {
  const rand = mulberry32(0x4d415249); // "MAR1"-ish fixed demo seed

  // Dedup name generator
  const usedNames = new Set<string>();
  let nameSeq = 0;

  for (const corridor of CORRIDORS) {
    const { waypoints } = corridor;

    // Precompute leg lengths & cumulative distances for this corridor.
    const legStart: number[] = [0];
    let routeLength = 0;
    for (let i = 0; 1 + i < waypoints.length; i++) {
      routeLength += haversineKm(
        waypoints[i][0], waypoints[i][1], waypoints[i + 1][0], waypoints[i + 1][1],
      ) * 1000;
      legStart.push(routeLength);
    }

    for (let i = 0; i < corridor.count; i++) {
      const type = pickType(rand);
      const corridorSpeed = corridor.speedKn;
      // Blend type speed band with corridor character.
      const lo = Math.max(corridorSpeed[0], TYPES[type].speedKn[0]);
      const hi = Math.min(corridorSpeed[1], TYPES[type].speedKn[1]);
      const speedKn = lo + rand() * (hi - lo);

      // Unique name
      let name = "";
      do {
        name =
          rand() < 0.55
            ? `${NAMES_A[Math.floor(rand() * NAMES_A.length)]} ${NAMES_B[Math.floor(rand() * NAMES_B.length)]}`
            : `${NAMES_B[Math.floor(rand() * NAMES_B.length)]} ${Math.floor(rand() * 900 + 100)}`;
        nameSeq++;
      } while (usedNames.has(name) && nameSeq < 4000);
      usedNames.add(name);

      // Deterministic demo MMSI: 97x + 6 digits (97x MID block is unassigned
      // for real AIS — cannot be confused with a live vessel).
      const mid = 970 + Math.floor(rand() * 10);
      const mmsi = `${mid}${String(Math.floor(rand() * 1_000_000)).padStart(6, "0")}`;

      // Route: perturb each waypoint slightly per-vessel (parallel traffic
      // lanes) — NOT uniform scatter; each vessel follows the corridor.
      // Water-safe: regenerate the jitter deterministically until the full
      // route validates over water; the pre-verified corridor centerline is
      // the final zero-jitter fallback. Jitter stays ≤ 12 km — a plausible
      // parallel-lane separation that keeps coastal lanes offshore.
      const jitterKm = 2 + rand() * 10;
      let route: [number, number][] = [];
      let valid = false;
      for (let attempt = 0; attempt < 8 && !valid; attempt++) {
        route = waypoints.map((wp, wi) => {
          if (wi === waypoints.length - 1) {
            // Last leg: continue along final bearing to extend the lane.
            const prev = waypoints[wi - 1];
            const brg = bearingDeg(prev[0], prev[1], wp[0], wp[1]);
            return destinationPoint(wp[0], wp[1], brg, jitterKm * 1000);
          }
          const brg = bearingDeg(wp[0], wp[1], waypoints[wi + 1][0], waypoints[wi + 1][1]);
          // Lateral offset perpendicular to the leg bearing.
          const perp = brg + 90 * (rand() < 0.5 ? 1 : -1);
          const offKm = jitterKm * rand();
          return destinationPoint(wp[0], wp[1], perp, offKm * 1000);
        });
        unwrapRoute(route);
        valid = waterAvailable ? isRouteWaterSafe(route) : true;
      }
      if (!valid) {
        // Fallback: exact corridor waypoints — hand-verified water-safe.
        route = waypoints.map((wp) => [wp[0], wp[1]] as [number, number]);
        unwrapRoute(route);
      }

      // Per-vessel cumulative leg distances (routes differ after jitter).
      const legStartV: number[] = [0];
      let lenV = 0;
      for (let k = 0; 1 + k < route.length; k++) {
        lenV += haversineKm(route[k][0], route[k][1], route[k + 1][0], route[k + 1][1]) * 1000;
        legStartV.push(lenV);
      }

      // Some vessels travel the reverse direction (separation lanes).
      const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;

      // ~12% of the fleet anchors (e.g. waiting at anchorage) — realistic.
      const anchored = rand() < 0.12;
      const anchorProgress = rand();

      FLEET.push({
        mmsi,
        name,
        vesselType: type,
        flag: FLAGS[Math.floor(rand() * FLAGS.length)],
        corridor: corridor.name,
        route,
        legStart: legStartV,
        routeLength: lenV,
        speedMs: speedKn * 0.5144,
        offsetM: rand() * lenV,
        dir,
        anchorAtMs: anchored ? anchorProgress * lenV : null,
        anchorPos: null,
      });
    }
  }
}

let fleetReady = false;
let fleetPrepared = false;
let preparing: Promise<void> | null = null;
let waterAvailable = false;

/**
 * Simulation epoch — the sim-clock instant at which every vessel sits at
 * its seeded `offsetM`. Fixed so restarts reproduce the same picture.
 */
export const EPOCH_MS = Date.parse("2026-09-02T09:42:00Z");

/** Get the demo fleet (empty until prepareFleet() has completed). */
export function getFleet(): SimVessel[] {
  return FLEET;
}

/**
 * Build the validated fleet: waits for the land/water mask, then builds
 * deterministically with water-safe route validation. Resolves once;
 * concurrent/duplicate calls share the same promise.
 */
export function prepareFleet(): Promise<void> {
  if (fleetPrepared) return Promise.resolve();
  if (!preparing) {
    preparing = (async () => {
      try {
        await ensureWaterMask();
        waterAvailable = true;
      } catch {
        waterAvailable = false;
      }
      buildFleet();
      fleetReady = true;
      fleetPrepared = true;
    })();
  }
  return preparing;
}

/**
 * Compute a vessel's position at simulation time `tMs` (pure function).
 * Movement: uniform along-route progress from the shared sim clock.
 */
export function positionAt(v: SimVessel, tMs: number, epochMs: number): SimPosition {
  // Anchor: vessel sits at its anchorage position (tiny drift), still AIS-
  // visible — realistic harbor behavior.
  if (v.anchorAtMs !== null) {
    const along = v.anchorAtMs;
    const p = pointAlongRoute(v, along);
    if (!v.anchorPos) v.anchorPos = p;
    const drift = ((tMs - epochMs) / 1000) * 0.15; // 0.15 m/s current drift
    const brg = bearingAlongRoute(v, along);
    const [lat, lon] = destinationPoint(p[0], p[1], brg, drift);
    return { lat, lon, headingDeg: brg, speedKn: 0.3 };
  }

  const dist = (v.offsetM + (tMs - epochMs) * v.speedMs) % v.routeLength;
  const along = v.dir === 1 ? dist : v.routeLength - dist;
  const pos = pointAlongRoute(v, along);
  const brg = bearingAlongRoute(v, along);
  return { lat: pos[0], lon: pos[1], headingDeg: brg, speedKn: (v.speedMs / 0.5144) };
}

/** Geographic position at distance `along` meters along the route. */
function pointAlongRoute(v: SimVessel, along: number): [number, number] {
  const d = ((along % v.routeLength) + v.routeLength) % v.routeLength;
  // Find leg
  let i = 0;
  while (i < v.legStart.length - 2 && v.legStart[i + 1] < d) i++;
  const legLen = v.legStart[i + 1] - v.legStart[i] || 1;
  const frac = Math.min(1, (d - v.legStart[i]) / legLen);
  const [aLat, aLon] = v.route[i];
  const [bLat, bLon] = v.route[i + 1];
  return [aLat + (bLat - aLat) * frac, aLon + (bLon - aLon) * frac];
}

/** Course bearing at distance `along` meters along the route. */
function bearingAlongRoute(v: SimVessel, along: number): number {
  const d = ((along % v.routeLength) + v.routeLength) % v.routeLength;
  let i = 0;
  while (i < v.legStart.length - 2 && v.legStart[i + 1] < d) i++;
  const [aLat, aLon] = v.route[i];
  const [bLat, bLon] = v.route[i + 1];
  const brg = bearingDeg(aLat, aLon, bLat, bLon);
  return v.dir === 1 ? brg : (brg + 180) % 360;
}

/** Recent-track trail points for a vessel (limited window). */
export function trailPoints(
  v: SimVessel,
  tMs: number,
  epochMs: number,
  windowMs: number,
  steps: number,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let s = steps; s >= 0; s--) {
    const t = tMs - s * (windowMs / steps);
    const p = positionAt(v, t, epochMs);
    pts.push([p.lat, p.lon]);
  }
  return pts;
}
