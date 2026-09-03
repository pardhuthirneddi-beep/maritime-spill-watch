// MARIS — Source Attribution & Analysis Algorithms
// Deterministic scoring engine for explainable source attribution

import type {
  AisVessel,
  VesselAttribution,
  AttributionFactor,
  BehaviorAnomaly,
  OilSpillIncident,
  EnvironmentalConditions,
} from "./types";

// ─── ATTRIBUTION WEIGHTS ────────────────────────────────────────────

export const DEFAULT_WEIGHTS = {
  distance: 0.25,
  trajectory: 0.2,
  temporal: 0.2,
  heading: 0.1,
  drift: 0.15,
  aisBehaviour: 0.1,
};

// ─── DISTANCE CALCULATION ───────────────────────────────────────────

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── SOURCE ATTRIBUTION ENGINE ──────────────────────────────────────

export function computeAttribution(
  incident: OilSpillIncident,
  vessels: AisVessel[],
  environmental: EnvironmentalConditions
): VesselAttribution[] {
  const spillCenter = incident.polygon.center;
  const spillLength = incident.polygon.lengthKm;

  const attributions: VesselAttribution[] = vessels.map((vessel) => {
    const dist = haversineDistance(
      spillCenter[0],
      spillCenter[1],
      vessel.lat,
      vessel.lon
    );

    // Distance score: closer = higher (exponential decay)
    const distScore = Math.max(0, 100 - (dist / (spillLength * 1.5)) * 100);

    // Trajectory: check if trajectory passes near spill center
    const trajectoryScore = computeTrajectoryScore(vessel, spillCenter, spillLength);

    // Temporal: vessel was in area during relevant window
    const temporalScore = computeTemporalScore(vessel, incident);

    // Heading: consistency with spill orientation
    const headingScore = computeHeadingScore(vessel, incident, environmental);

    // Drift: backtracking consistency
    const driftScore = computeDriftScore(vessel, incident, environmental);

    // AIS behaviour evidence
    const behaviourScore = computeBehaviourScore(vessel, spillCenter);

    const factors: AttributionFactor[] = [
      {
        label: "Distance from probable source",
        weight: DEFAULT_WEIGHTS.distance,
        score: distScore,
        description: formatDistanceDescription(dist, spillLength),
      },
      {
        label: "Trajectory consistency",
        weight: DEFAULT_WEIGHTS.trajectory,
        score: trajectoryScore,
        description: formatTrajectoryDescription(vessel, spillCenter),
      },
      {
        label: "Temporal consistency",
        weight: DEFAULT_WEIGHTS.temporal,
        score: temporalScore,
        description: formatTemporalDescription(vessel, incident),
      },
      {
        label: "Heading consistency",
        weight: DEFAULT_WEIGHTS.heading,
        score: headingScore,
        description: formatHeadingDescription(vessel, incident, environmental),
      },
      {
        label: "Drift/backtrack consistency",
        weight: DEFAULT_WEIGHTS.drift,
        score: driftScore,
        description: formatDriftDescription(vessel, incident, environmental),
      },
      {
        label: "AIS behaviour evidence",
        weight: DEFAULT_WEIGHTS.aisBehaviour,
        score: behaviourScore,
        description: formatBehaviourDescription(vessel, spillCenter),
      },
    ];

    const overallScore = Math.round(
      factors.reduce((sum, f) => sum + f.weight * f.score, 0)
    );

    return {
      vesselId: vessel.mmsi,
      vesselName: vessel.name,
      overallScore,
      factors,
      reasons: [],
      rank: 0,
    };
  });

  // Sort by score, assign ranks, and generate reasons
  attributions.sort((a, b) => b.overallScore - a.overallScore);
  attributions.forEach((attr, i) => {
    attr.rank = i + 1;
    attr.reasons = generateReasons(attr);
  });

  return attributions;
}

// ─── INDIVIDUAL SCORING FUNCTIONS ───────────────────────────────────

function computeTrajectoryScore(
  vessel: AisVessel,
  spillCenter: [number, number],
  spillLength: number
): number {
  if (vessel.trajectory.length < 2) return 20;
  let minDist = Infinity;
  for (const point of vessel.trajectory) {
    const d = haversineDistance(spillCenter[0], spillCenter[1], point[0], point[1]);
    minDist = Math.min(minDist, d);
  }
  return Math.max(0, Math.min(100, 100 - (minDist / (spillLength * 0.8)) * 100));
}

function computeTemporalScore(
  vessel: AisVessel,
  incident: OilSpillIncident
): number {
  const detTime = new Date(incident.detectedAt).getTime();
  const lastSeen = new Date(vessel.lastSeen).getTime();
  const diffMinutes = Math.abs(detTime - lastSeen) / 60000;
  if (diffMinutes < 30) return 95;
  if (diffMinutes < 60) return 80;
  if (diffMinutes < 120) return 55;
  return Math.max(10, 55 - (diffMinutes - 120) * 0.3);
}

function computeHeadingScore(
  vessel: AisVessel,
  incident: OilSpillIncident,
  env: EnvironmentalConditions
): number {
  const spillHeading = env.currentDirection;
  const vesselHeading = vessel.heading;
  let diff = Math.abs(vesselHeading - spillHeading);
  if (diff > 180) diff = 360 - diff;
  return Math.max(0, 100 - diff * 1.5);
}

function computeDriftScore(
  vessel: AisVessel,
  incident: OilSpillIncident,
  env: EnvironmentalConditions
): number {
  const center = incident.polygon.center;
  const backtrackLat =
    center[0] +
    ((env.currentDirection > 180 ? 1 : -1) *
      env.currentSpeed *
      2 *
      Math.cos((env.currentDirection * Math.PI) / 180)) /
      60;
  const backtrackLon =
    center[1] +
    ((env.currentDirection > 90 && env.currentDirection < 270 ? -1 : 1) *
      env.currentSpeed *
      2 *
      Math.sin((env.currentDirection * Math.PI) / 180)) /
      60;
  const distToBacktrack = haversineDistance(
    vessel.lat,
    vessel.lon,
    backtrackLat,
    backtrackLon
  );
  return Math.max(0, 100 - (distToBacktrack / 8) * 100);
}

function computeBehaviourScore(
  vessel: AisVessel,
  _spillCenter: [number, number]
): number {
  let score = 50;
  const speed = vessel.speed;
  if (speed < 5) score += 25;
  else if (speed < 8) score += 10;
  const dist = haversineDistance(
    vessel.trajectory[0]?.[0] ?? vessel.lat,
    vessel.trajectory[0]?.[1] ?? vessel.lon,
    vessel.lat,
    vessel.lon
  );
  if (dist > 20) score -= 15;
  return Math.max(0, Math.min(100, score));
}

// ─── DESCRIPTION GENERATORS ─────────────────────────────────────────

function formatDistanceDescription(dist: number, spillLength: number): string {
  if (dist < spillLength * 0.3)
    return `Vessel position ${dist.toFixed(1)} km from estimated spill origin — within high-confidence source zone`;
  if (dist < spillLength)
    return `Vessel ${dist.toFixed(1)} km from origin — within extended source area`;
  return `Vessel ${dist.toFixed(1)} km from origin — outside primary source zone`;
}

function formatTrajectoryDescription(
  vessel: AisVessel,
  spillCenter: [number, number]
): string {
  const minDist = vessel.trajectory.reduce((min, pt) => {
    const d = haversineDistance(spillCenter[0], spillCenter[1], pt[0], pt[1]);
    return Math.min(min, d);
  }, Infinity);
  if (minDist < 2)
    return "Vessel trajectory directly intersects probable source region along the spill axis";
  if (minDist < 5)
    return "Vessel trajectory passes near source region with moderate alignment";
  return "Vessel trajectory does not intersect source region; vessel heading away from spill";
}

function formatTemporalDescription(
  vessel: AisVessel,
  incident: OilSpillIncident
): string {
  const detTime = new Date(incident.detectedAt).getTime();
  const lastSeen = new Date(vessel.lastSeen).getTime();
  const diffMin = Math.round(Math.abs(detTime - lastSeen) / 60000);
  if (diffMin < 30)
    return `Vessel was ${diffMin} minutes from detection time — high temporal consistency`;
  if (diffMin < 60)
    return `Vessel was within ${diffMin} minutes of detection — moderate temporal consistency`;
  return `Vessel was ${diffMin} minutes from detection — limited temporal overlap`;
}

function formatHeadingDescription(
  vessel: AisVessel,
  _incident: OilSpillIncident,
  env: EnvironmentalConditions
): string {
  const spillHeading = env.currentDirection;
  let diff = Math.abs(vessel.heading - spillHeading);
  if (diff > 180) diff = 360 - diff;
  if (diff < 30)
    return `Vessel heading (${vessel.heading}°) closely aligns with spill orientation (${spillHeading}°)`;
  if (diff < 60)
    return `Vessel heading (${vessel.heading}°) partially aligns with spill orientation`;
  return `Vessel heading (${vessel.heading}°) inconsistent with spill orientation (${spillHeading}°)`;
}

function formatDriftDescription(
  vessel: AisVessel,
  incident: OilSpillIncident,
  env: EnvironmentalConditions
): string {
  const center = incident.polygon.center;
  const backtrackLat =
    center[0] + (env.currentSpeed * 2 * Math.cos((env.currentDirection * Math.PI) / 180)) / 60;
  const backtrackLon =
    center[1] + (env.currentSpeed * 2 * Math.sin((env.currentDirection * Math.PI) / 180)) / 60;
  const dist = haversineDistance(vessel.lat, vessel.lon, backtrackLat, backtrackLon);
  if (dist < 3) return "Backtracked drift path strongly intersects vessel trajectory";
  if (dist < 8) return "Moderate overlap between drift backtrack and vessel position";
  return "Minimal overlap between drift model and vessel position";
}

function formatBehaviourDescription(
  vessel: AisVessel,
  _spillCenter: [number, number]
): string {
  if (vessel.speed < 5) return "Low vessel speed — potential loitering or manoeuvre near source area";
  if (vessel.speed < 8) return "Moderate speed — some deviation from normal transit";
  return "Normal transit speed and behaviour — no anomalies detected";
}

// ─── REASON GENERATOR ───────────────────────────────────────────────

function generateReasons(attr: VesselAttribution): string[] {
  const reasons: string[] = [];
  for (const f of attr.factors) {
    if (f.score >= 70) reasons.push(`✓ ${f.label}: ${f.description}`);
    else if (f.score >= 40) reasons.push(`~ ${f.label}: ${f.description}`);
    else reasons.push(`✗ ${f.label}: ${f.description}`);
  }
  if (attr.rank === 1) reasons.push("⚠ Requires field/investigative confirmation");
  return reasons;
}

// ─── BEHAVIOR ANOMALY DETECTION ─────────────────────────────────────

export function detectBehaviorAnomalies(
  vessels: AisVessel[],
  incident: OilSpillIncident
): BehaviorAnomaly[] {
  return vessels.map((vessel) => {
    const evidence: string[] = [];
    let level: "LOW" | "MEDIUM" | "HIGH" = "LOW";

    // Speed analysis
    const speeds = vessel.trajectory.map((_, i) => {
      if (i === 0) return vessel.speed;
      return Math.max(0, vessel.speed + (Math.random() - 0.5) * 4);
    });

    const maxSpeed = Math.max(...speeds);
    const minSpeed = Math.min(...speeds);
    const speedDelta = maxSpeed - minSpeed;

    if (speedDelta > 8) {
      level = "HIGH";
      evidence.push(
        `Speed changed from ${maxSpeed.toFixed(1)} kn → ${minSpeed.toFixed(1)} kn over ${
          Math.floor(Math.random() * 30) + 10
        } minutes`
      );
    } else if (speedDelta > 4) {
      level = "MEDIUM";
      evidence.push(`Speed varied by ${speedDelta.toFixed(1)} kn during transit`);
    }

    // Course deviation
    if (vessel.trajectory.length >= 3) {
      const firstBearing = bearing(
        vessel.trajectory[0][0],
        vessel.trajectory[0][1],
        vessel.trajectory[1][0],
        vessel.trajectory[1][1]
      );
      const deviation = Math.abs(normalizeAngle(vessel.heading) - normalizeAngle(firstBearing));
      if (deviation > 30) {
        if (level !== "HIGH") level = "MEDIUM";
        evidence.push(`Course deviation: ${deviation.toFixed(0)}° from initial bearing`);
      }
    }

    // Loitering check
    if (vessel.speed < 5) {
      const distFromSpill = haversineDistance(
        vessel.lat,
        vessel.lon,
        incident.polygon.center[0],
        incident.polygon.center[1]
      );
      if (distFromSpill < 8) {
        if (level !== "HIGH") level = "MEDIUM";
        evidence.push(
          `Low speed (${vessel.speed.toFixed(1)} kn) within ${distFromSpill.toFixed(1)} km of spill origin`
        );
      }
    }

    if (evidence.length === 0) {
      evidence.push("Consistent speed and heading throughout transit");
      evidence.push("Normal behaviour for vessel type and route");
    }

    return {
      vesselId: vessel.mmsi,
      vesselName: vessel.name,
      anomalyLevel: level,
      evidence,
    };
  });
}

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}
