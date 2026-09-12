// MARIS — Deterministic temporal replay engine (3D Intelligence)
// Derives per-vessel positions at any timestamp from the shared trajectory
// data (no separate dataset). Deterministic: same time → same scene.

import type { AisVessel } from "./types";
import type { EvidenceEvent, ReplayFrame, TemporalPosition } from "./globe3dTypes";
import { geodesicDistanceKm, interpolateLatLon } from "./geo";

const AREA_CENTER: [number, number] = [12.047, 86.972];
const AREA_RADIUS_KM = 8;

/** Replay window start (first AIS fix across all vessels). */
export function replayStartMs(vessels: AisVessel[]): number {
  return Math.min(
    ...vessels.flatMap((v) => v.timestamps.map((t) => Date.parse(t))),
  );
}

/** Replay window end (last AIS fix / incident detection). */
export function replayEndMs(vessels: AisVessel[]): number {
  const lastFix = Math.max(
    ...vessels.flatMap((v) => v.timestamps.map((t) => Date.parse(t))),
  );
  return lastFix;
}

/**
 * A vessel's interpolated position at an instant of the replay clock.
 * Exported so the 3D view can drive per-frame rendering from the same
 * pure function the replay engine uses (one trajectory, one truth).
 */
export function positionAt(v: AisVessel, tMs: number): TemporalPosition {
  const ts = v.timestamps.map((s) => Date.parse(s));
  const traj = v.trajectory;

  if (tMs <= ts[0]) {
    return {
      lat: traj[0][0],
      lon: traj[0][1],
      headingDeg: v.heading,
      speedKn: v.speed,
      inArea: geodesicDistanceKm(traj[0], AREA_CENTER) <= AREA_RADIUS_KM,
      fixIndex: 0,
    };
  }
  if (tMs >= ts[ts.length - 1]) {
    const last = traj.length - 1;
    return {
      lat: traj[last][0],
      lon: traj[last][1],
      headingDeg: v.heading,
      speedKn: v.speed,
      inArea: geodesicDistanceKm(traj[last], AREA_CENTER) <= AREA_RADIUS_KM,
      fixIndex: last,
    };
  }

  let i = 0;
  while (i < ts.length - 2 && ts[i + 1] < tMs) i++;

  const span = ts[i + 1] - ts[i];
  const frac = Math.max(0, Math.min(1, (tMs - ts[i]) / span));
  const p = interpolateLatLon(traj[i], traj[i + 1], frac);

  // Heading from segment bearing
  const dLat = ((traj[i + 1][0] - traj[i][0]) * Math.PI) / 180;
  const dLon = ((traj[i + 1][1] - traj[i][1]) * Math.PI) / 180;
  const bearing =
    (Math.atan2(
      Math.sin(dLon) * Math.cos((traj[i + 1][0] * Math.PI) / 180),
      Math.cos((traj[i][0] * Math.PI) / 180) * Math.sin((traj[i + 1][0] * Math.PI) / 180) -
        Math.sin((traj[i][0] * Math.PI) / 180) * Math.cos((traj[i + 1][0] * Math.PI) / 180) * Math.cos(dLon),
    ) *
      180) /
      Math.PI;
  const headingDeg = (bearing + 360) % 360;

  return {
    lat: p[0],
    lon: p[1],
    headingDeg,
    speedKn: v.speed,
    inArea: geodesicDistanceKm(p, AREA_CENTER) <= AREA_RADIUS_KM,
    fixIndex: i,
  };
}

/** Build the frame at a specific time — pure function, no state. */
export function buildReplayFrame(
  vessels: AisVessel[],
  events: EvidenceEvent[],
  tMs: number,
): ReplayFrame {
  const positions: Record<string, TemporalPosition> = {};
  for (const v of vessels) {
    positions[v.mmsi] = positionAt(v, tMs);
  }
  return {
    timeMs: tMs,
    positions,
    visibleEvents: events.filter((e) => Date.parse(e.time) <= tMs),
  };
}

/** Live correlation metrics for the selected vessel at a replay time. */
export interface CorrelationMetrics {
  distanceKm: number;
  hoursBeforeDetection: number;
  trackIntersectsArea: boolean;
  enteredArea: boolean;
  /** 0-100 — deterministic function of geometry + demo attribution score. */
  score: number;
}

export function computeCorrelation(
  vessel: AisVessel,
  spillCenter: [number, number],
  attributionScore: number,
): CorrelationMetrics {
  const closest = vessel.trajectory.reduce(
    (best, p) => {
      const d = geodesicDistanceKm(p, spillCenter);
      return d < best.d ? { d, p } : best;
    },
    { d: Infinity, p: vessel.trajectory[0] },
  );

  // Earliest fix inside the investigation area (if any)
  let entered = false;
  let enteredAt: number | null = null;
  vessel.trajectory.forEach((p, i) => {
    if (!entered && geodesicDistanceKm(p, AREA_CENTER) <= AREA_RADIUS_KM) {
      entered = true;
      enteredAt = Date.parse(vessel.timestamps[i]);
    }
  });

  const detectionMs = Date.parse("2026-09-02T09:42:00Z");
  const hoursBefore = enteredAt
    ? (detectionMs - enteredAt) / 3_600_000
    : (detectionMs - Date.parse(vessel.timestamps[0])) / 3_600_000;

  return {
    distanceKm: closest.d,
    hoursBeforeDetection: Math.max(0, hoursBefore),
    trackIntersectsArea: entered,
    enteredArea: entered,
    // Score already exists from the attribution engine (demo) — recompute a
    // geometric version so panel numbers always match scene geometry.
    score: Math.round(
      0.45 * attributionScore +
        0.3 * Math.max(0, 100 - closest.d * 8) +
        0.25 * (entered ? 100 : 30),
    ),
  };
}

/** True if a lat/lon is inside the demo investigation area circle. */
export function isInInvestigationArea(lat: number, lon: number): boolean {
  return geodesicDistanceKm([lat, lon], AREA_CENTER) <= AREA_RADIUS_KM;
}

// ─── EVIDENCE EVENTS (from shared timeline + trajectory data) ────────

/** Derived from the shared DEMO_TIMELINE + vessel trajectories — no new data. */
export const EVIDENCE_EVENTS: EvidenceEvent[] = [
  {
    id: "EV-01",
    time: "2026-09-02T09:05:00Z",
    lat: 12.089,
    lon: 87.018,
    label: "Ocean Star enters area",
    detail:
      "MV OCEAN STAR enters the investigation area from the northeast at transit speed.",
    category: "vessel",
    vesselId: "419000782",
  },
  {
    id: "EV-02",
    time: "2026-09-02T09:12:00Z",
    lat: 12.082,
    lon: 87.005,
    label: "Speed reduction begins",
    detail: "MV OCEAN STAR speed drops from 14.2 kn toward 4.1 kn over 21 minutes.",
    category: "vessel",
    vesselId: "419000782",
  },
  {
    id: "EV-03",
    time: "2026-09-02T09:17:00Z",
    lat: 12.076,
    lon: 86.995,
    label: "31° course deviation",
    detail:
      "MV OCEAN STAR deviates 31° from the standard shipping lane, entering the probable source corridor.",
    category: "vessel",
    vesselId: "419000782",
  },
  {
    id: "EV-04",
    time: "2026-09-02T09:30:00Z",
    lat: 12.071,
    lon: 86.985,
    label: "Low-speed transit in corridor",
    detail:
      "Extended low-speed transit through the probable source corridor — inconsistent with normal passage.",
    category: "vessel",
    vesselId: "419000782",
  },
  {
    id: "EV-05",
    time: "2026-09-02T09:42:00Z",
    lat: 12.0471,
    lon: 86.9718,
    label: "SAR acquisition",
    detail:
      "Sentinel-1A SAR acquisition — dark elongated anomaly detected on the ocean surface.",
    category: "detection",
  },
  {
    id: "EV-06",
    time: "2026-09-02T09:48:00Z",
    lat: 12.0471,
    lon: 86.9718,
    label: "Spill flagged (91%)",
    detail:
      "Automated detection flags possible oil slick — 14.7 km² elongated feature, confidence 91%.",
    category: "detection",
  },
  {
    id: "EV-07",
    time: "2026-09-02T09:52:00Z",
    lat: 12.053,
    lon: 86.982,
    label: "Probable origin identified",
    detail:
      "Drift backtracking identifies probable origin near 12.053°N 86.982°E — 4.2 km from OCEAN STAR track.",
    category: "analysis",
  },
];

/** Boundary of the investigation area for display (circle → polygon). */
export function investigationAreaPolygon(steps = 48): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const brg = (i / steps) * 2 * Math.PI;
    const lat = AREA_CENTER[0] + (AREA_RADIUS_KM / 111) * Math.cos(brg);
    const lon =
      AREA_CENTER[1] +
      (AREA_RADIUS_KM / (111 * Math.cos((AREA_CENTER[0] * Math.PI) / 180))) *
        Math.sin(brg);
    pts.push([lat, lon]);
  }
  return pts;
}

export const INVESTIGATION_AREA_CENTER = AREA_CENTER;
export const INVESTIGATION_AREA_RADIUS_KM = AREA_RADIUS_KM;
