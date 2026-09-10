// MARIS — Centralized Incident Management store.
//
// The incident is a LIVING INVESTIGATION, not a static record: every new
// piece of evidence (SAR geometry, area recalculation, AIS correlation,
// drift, candidate ranking, hyperspectral evidence) updates the incident,
// appends a timeline event, bumps last_updated_at and emits an operational
// notification — all from real application state, never invented values.
//
// Architecture: a small module-level external store consumed through
// useSyncExternalStore (see hooks/useIncidents.ts). It is the SINGLE
// source of truth shared by the 2D Command Center, SAR viewer, 3D
// Intelligence, Reports and the AI Analyst context — no per-screen
// duplicate incident state.
//
// Terminology guardrails: incidents are "Possible Oil Slick" /
// "Unverified" / "Requires Validation". The system NEVER claims a vessel
// "caused" a spill or that a slick is "confirmed" — attribution output is
// always a "Candidate Vessel" with a "Source Likelihood" investigation
// indicator.

import {
  DEMO_INCIDENT,
  DEMO_TIMELINE,
  DEMO_SAR_DETECTIONS,
  DEMO_SAR_SCENE,
  DEMO_HYPERSPECTRAL,
} from "./demoData";
import type { HyperspectralResult } from "./types";

// ─── TYPES ───────────────────────────────────────────────────────────

/** Incident lifecycle. There is deliberately no "confirmed" status: a SAR
 * detection alone can never confirm a spill, and attribution can never
 * prove a source. The operational end-state is REQUIRES VALIDATION. */
export type IncidentStatus =
  | "detected"
  | "unverified"
  | "under_investigation"
  | "evidence_updated"
  | "candidates_ranked"
  | "impact_assessment"
  | "requires_validation";

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  detected: "DETECTED",
  unverified: "UNVERIFIED",
  under_investigation: "UNDER INVESTIGATION",
  evidence_updated: "EVIDENCE UPDATED",
  candidates_ranked: "SOURCE CANDIDATES RANKED",
  impact_assessment: "IMPACT ASSESSMENT",
  requires_validation: "REQUIRES VALIDATION",
};

export type IncidentSeverity = "low" | "medium" | "high";
export type EventSeverity = "info" | "important" | "critical";

export interface ManagedTimelineEvent {
  id: string;
  /** ISO timestamp — always from the application state that produced it. */
  timestamp: string;
  eventType: string;
  description: string;
  source: string;
  severity: EventSeverity;
}

export interface ManagedIncident {
  id: string;
  incidentNumber: string; // MARIS-INC-0001
  createdAt: string;
  detectedAt: string;
  lastUpdatedAt: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  latitude: number;
  longitude: number;
  areaKm2: number | null;
  estimatedVolumeM3: number | null;
  confidence: number | null;
  detectionSource: string;
  currentSummary: string;
  /** Link back to the underlying OilSpillIncident / SAR detection. */
  sourceIncidentId: string | null;
  detectionId: string | null;
  sceneId: string | null;
  timeline: ManagedTimelineEvent[];
}

export type NotificationKind =
  | "new_incident"
  | "incident_updated"
  | "evidence_added"
  | "candidates_ranked"
  | "status_changed";

export interface IncidentNotification {
  id: string;
  kind: NotificationKind;
  incidentId: string;
  incidentNumber: string;
  title: string;
  detail: string;
  timestamp: string;
  read: boolean;
}

export interface IncidentStoreState {
  incidents: ManagedIncident[];
  activeIncidentId: string | null;
  notifications: IncidentNotification[];
}

// ─── EXTERNAL STORE ──────────────────────────────────────────────────

let snapshot: IncidentStoreState = {
  incidents: [],
  activeIncidentId: null,
  notifications: [],
};

const listeners = new Set<() => void>();

function emit(): void {
  // Snapshot identity changes on every mutation → useSyncExternalStore
  // re-renders exactly once per update.
  snapshot = { ...snapshot };
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): IncidentStoreState {
  return snapshot;
}

function mutate(fn: (s: IncidentStoreState) => IncidentStoreState): void {
  snapshot = fn(snapshot);
  emit();
}

// ─── ID / TIME HELPERS (deterministic) ───────────────────────────────

let incidentSeq = 0;
let eventSeq = 0;
let notificationSeq = 0;

function nextIncidentNumber(): string {
  incidentSeq += 1;
  return `MARIS-INC-${String(incidentSeq).padStart(4, "0")}`;
}

function eventId(): string {
  eventSeq += 1;
  return `ev-${eventSeq}`;
}

function notificationId(): string {
  notificationSeq += 1;
  return `ntf-${notificationSeq}`;
}

/** Demo clock anchor — same instant as the demo data epoch. */
const DEMO_DATE = "2026-09-02";

function demoTime(hhmm: string): string {
  return `${DEMO_DATE}T${hhmm}:00Z`;
}

// ─── VOLUME DERIVATION (modelled, from actual HSI state) ─────────────

/**
 * Derive an estimated spill volume (m³) from the hyperspectral thickness
 * classification and the detected area. Volume = Σ(class share × class
 * mean thickness × area). Range midpoints come from the HSI result's own
 * range strings ("1–10 µm" → 5.5 µm, ">100 µm" → 150 µm assumed cap).
 * Returns null when the required inputs are unavailable — never a guess.
 */
export function deriveEstimatedVolumeM3(
  areaKm2: number | null,
  hsi: HyperspectralResult | null,
): number | null {
  if (areaKm2 === null || areaKm2 <= 0 || !hsi?.thicknessClasses?.length) {
    return null;
  }
  let meanThicknessUm = 0;
  for (const cls of hsi.thicknessClasses) {
    const nums = (cls.range.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    let mean: number | null = null;
    if (nums.length >= 2) {
      mean = (nums[0] + nums[1]) / 2;
    } else if (nums.length === 1) {
      // ">100" style open-ended range → assume 1.5× the lower bound.
      mean = cls.range.includes(">") || cls.range.includes("≥")
        ? nums[0] * 1.5
        : nums[0];
    }
    if (mean === null) return null;
    meanThicknessUm += (cls.percentage / 100) * mean;
  }
  // m³ = km² × 1e6 m²/km² × (µm × 1e-6 m/µm)  →  km² × µm
  return Math.round(areaKm2 * meanThicknessUm);
}

// ─── INCIDENT CREATION / DEDUPLICATION ───────────────────────────────

export interface DetectionInput {
  detectionId: string;
  latitude: number;
  longitude: number;
  areaKm2: number | null;
  confidence: number | null;
  detectionSource: string;
  sceneId: string | null;
  sourceIncidentId: string | null;
  detectedAt: string;
  /** Haversine proximity for geometric dedup (km). */
  dedupRadiusKm?: number;
}

function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function findByDetection(
  s: IncidentStoreState,
  input: DetectionInput,
): ManagedIncident | undefined {
  return s.incidents.find(
    (i) =>
      i.detectionId === input.detectionId ||
      i.sourceIncidentId === input.sourceIncidentId ||
      // Same source + geographically the same observation → same incident.
      (i.detectionSource === input.detectionSource &&
        haversineKm(i.latitude, i.longitude, input.latitude, input.longitude) <=
          (input.dedupRadiusKm ?? 5)),
  );
}

/**
 * Ensure an incident exists for a SAR possible-oil detection. Re-processing
 * the same observation (same detection ID / scene / location) UPDATES the
 * existing incident instead of creating a duplicate.
 */
export function ensureIncidentFromDetection(
  input: DetectionInput,
): { incident: ManagedIncident; created: boolean } {
  const existing = findByDetection(snapshot, input);
  if (existing) return { incident: existing, created: false };

  const now = new Date().toISOString();
  const incident: ManagedIncident = {
    id: `mi-${input.detectionId}`,
    incidentNumber: nextIncidentNumber(),
    createdAt: now,
    detectedAt: input.detectedAt,
    lastUpdatedAt: now,
    status: "unverified",
    severity: "medium",
    latitude: input.latitude,
    longitude: input.longitude,
    areaKm2: input.areaKm2,
    estimatedVolumeM3: null,
    confidence: input.confidence,
    detectionSource: input.detectionSource,
    currentSummary:
      "Possible oil slick detected in SAR imagery — unverified. Requires validation.",
    sourceIncidentId: input.sourceIncidentId,
    detectionId: input.detectionId,
    sceneId: input.sceneId,
    timeline: [
      {
        id: eventId(),
        timestamp: input.detectedAt,
        eventType: "DETECTION",
        description: `Possible oil slick candidate detected (${input.detectionId}) — confidence ${input.confidence ?? "n/a"}%`,
        source: input.detectionSource,
        severity: "critical",
      },
      {
        id: eventId(),
        timestamp: now,
        eventType: "INCIDENT",
        description: "Incident created — status UNVERIFIED. Requires validation.",
        source: "MARIS Incident Command",
        severity: "important",
      },
    ],
  };

  mutate((s) => ({
    ...s,
    incidents: [...s.incidents, incident],
    activeIncidentId: incident.id,
    notifications: [
      {
        id: notificationId(),
        kind: "new_incident",
        incidentId: incident.id,
        incidentNumber: incident.incidentNumber,
        title: "NEW MARITIME INCIDENT",
        detail: `Possible oil slick detected — ${incident.areaKm2 ?? "?"} km² · confidence ${incident.confidence ?? "?"}% · STATUS: UNVERIFIED · Requires validation`,
        timestamp: now,
        read: false,
      },
      ...s.notifications,
    ],
  }));

  return { incident, created: true };
}

// ─── CONTINUOUS UPDATES ──────────────────────────────────────────────

export interface IncidentUpdateInput {
  eventType: string;
  description: string;
  source: string;
  severity?: EventSeverity;
  /** Lifecycle transition (validated below). */
  status?: IncidentStatus;
  areaKm2?: number | null;
  estimatedVolumeM3?: number | null;
  confidence?: number | null;
  summary?: string;
  /** Suppress the operational notification for routine updates. */
  silent?: boolean;
}

/**
 * Record a continuous update against an incident: appends a timeline event
 * (with a real timestamp), updates the relevant fields, bumps
 * last_updated_at and emits an operational notification. Idempotent for
 * repeated identical events (render loops cannot spam the timeline).
 */
export function recordIncidentUpdate(
  incidentId: string,
  update: IncidentUpdateInput,
): void {
  const s = snapshot;
  const incident = s.incidents.find((i) => i.id === incidentId);
  if (!incident) return;

  // Idempotency: an identical event anywhere in the timeline (e.g. the
  // investigation re-run) → field refresh only, no duplicate history.
  const duplicate = incident.timeline.some(
    (e) =>
      e.eventType === update.eventType &&
      e.description === update.description,
  );
  const now = new Date().toISOString();

  const statusChanged =
    update.status !== undefined && update.status !== incident.status;

  mutate((st) => ({
    ...st,
    incidents: st.incidents.map((i) => {
      if (i.id !== incidentId) return i;
      const timeline = duplicate
        ? i.timeline
        : [
            ...i.timeline,
            {
              id: eventId(),
              timestamp: now,
              eventType: update.eventType,
              description: update.description,
              source: update.source,
              severity: update.severity ?? "info",
            },
          ];
      return {
        ...i,
        lastUpdatedAt: now,
        status: update.status ?? i.status,
        areaKm2: update.areaKm2 !== undefined ? update.areaKm2 : i.areaKm2,
        estimatedVolumeM3:
          update.estimatedVolumeM3 !== undefined
            ? update.estimatedVolumeM3
            : i.estimatedVolumeM3,
        confidence:
          update.confidence !== undefined ? update.confidence : i.confidence,
        currentSummary: update.summary ?? i.currentSummary,
        timeline,
      };
    }),
    notifications:
      update.silent || duplicate
        ? st.notifications
        : [
            {
              id: notificationId(),
              kind: statusChanged
                ? ("status_changed" as const)
                : update.eventType.includes("CANDIDATE")
                  ? ("candidates_ranked" as const)
                  : update.eventType.includes("EVIDENCE")
                    ? ("evidence_added" as const)
                    : ("incident_updated" as const),
              incidentId,
              incidentNumber: incident.incidentNumber,
              title: statusChanged ? "STATUS CHANGED" : "INCIDENT UPDATED",
              detail: `${update.description} · ${incident.incidentNumber}`,
              timestamp: now,
              read: false,
            },
            ...st.notifications,
          ],
  }));
}

// ─── SELECTION / NOTIFICATION CONTROLS ───────────────────────────────

export function setActiveIncident(incidentId: string | null): void {
  mutate((s) => ({ ...s, activeIncidentId: incidentId }));
}

export function dismissNotification(notificationId: string): void {
  mutate((s) => ({
    ...s,
    notifications: s.notifications.filter((n) => n.id !== notificationId),
  }));
}

export function markAllNotificationsRead(): void {
  mutate((s) => ({
    ...s,
    notifications: s.notifications.map((n) => ({ ...n, read: true })),
  }));
}

// ─── DETERMINISTIC DEMO SEED ─────────────────────────────────────────

let seeded = false;

/**
 * Seed the demo incident deterministically from the existing demo dataset
 * (DEMO_INCIDENT + DEMO_TIMELINE + the primary SAR detection). The same
 * seed always produces the same incident number, timeline and history —
 * restarting the application never fabricates a different past. New
 * evidence recorded during the session extends this history with real
 * timestamps.
 */
export function ensureDemoSeed(): void {
  if (seeded) return;
  seeded = true;

  const det = DEMO_SAR_DETECTIONS[0]; // primary possible_oil candidate
  const now = new Date().toISOString();

  const timeline: ManagedTimelineEvent[] = DEMO_TIMELINE.map((e) => ({
    id: eventId(),
    timestamp: demoTime(e.time),
    eventType:
      e.category === "detection"
        ? "DETECTION"
        : e.category === "vessel"
          ? "AIS OBSERVATION"
          : e.category === "report"
            ? "REPORT"
            : "ANALYSIS",
    description: e.event,
    source:
      e.category === "detection"
        ? DEMO_SAR_SCENE.satellite
        : e.category === "vessel"
          ? "AIS (demo)"
          : "MARIS analysis engine",
    severity:
      e.category === "detection" && e.event.includes("Possible oil slick")
        ? "critical"
        : e.category === "detection"
          ? "important"
          : "info",
  }));

  const incident: ManagedIncident = {
    id: `mi-${det.id}`,
    incidentNumber: nextIncidentNumber(), // MARIS-INC-0001
    createdAt: now,
    detectedAt: DEMO_INCIDENT.detectedAt,
    lastUpdatedAt: timeline[timeline.length - 1]?.timestamp ?? now,
    status: "unverified",
    severity: "medium",
    latitude: DEMO_INCIDENT.coordinates[0],
    longitude: DEMO_INCIDENT.coordinates[1],
    areaKm2: DEMO_INCIDENT.polygon.areaKm2,
    estimatedVolumeM3: null, // derived when hyperspectral evidence is loaded
    confidence: DEMO_INCIDENT.confidence.score,
    detectionSource: `${DEMO_SAR_SCENE.satellite} SAR`,
    currentSummary:
      "Possible oil slick detected — unverified. Requires validation.",
    sourceIncidentId: DEMO_INCIDENT.id,
    detectionId: det.id,
    sceneId: DEMO_SAR_SCENE.sceneId,
    timeline,
  };

  mutate((s) => ({
    ...s,
    incidents: s.incidents.some((i) => i.id === incident.id)
      ? s.incidents
      : [incident, ...s.incidents],
    activeIncidentId: s.activeIncidentId ?? incident.id,
    notifications: s.notifications.some(
      (n) => n.kind === "new_incident" && n.incidentId === incident.id,
    )
      ? s.notifications
      : [
          {
            id: notificationId(),
            kind: "new_incident",
            incidentId: incident.id,
            incidentNumber: incident.incidentNumber,
            title: "NEW MARITIME INCIDENT",
            detail: `Possible oil slick detected — ${incident.areaKm2} km² · confidence ${incident.confidence}% · STATUS: UNVERIFIED · Requires validation`,
            timestamp: incident.lastUpdatedAt,
            read: false,
          },
          ...s.notifications,
        ],
  }));
}

/** Seed-on-first-read accessor for React hooks. */
export function getIncidentStore(): IncidentStoreState {
  ensureDemoSeed();
  return snapshot;
}

export { subscribe, getSnapshot };

// Re-export the demo inputs so screens don't import demoData separately.
export { DEMO_HYPERSPECTRAL };
