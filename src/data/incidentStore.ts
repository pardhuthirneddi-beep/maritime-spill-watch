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
  | "report_ready"
  | "requires_validation";

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  detected: "DETECTED",
  unverified: "UNVERIFIED",
  under_investigation: "UNDER INVESTIGATION",
  evidence_updated: "EVIDENCE UPDATED",
  candidates_ranked: "SOURCE CANDIDATES RANKED",
  impact_assessment: "ANALYSIS IN PROGRESS",
  report_ready: "REPORT READY",
  requires_validation: "REQUIRES VALIDATION",
};

// ─── INVESTIGATION WORKFLOW (Prompt 8 state machine) ─────────────────

/** The seven MARIS investigation stages. Progress = completed stages. */
export type InvestigationStageId =
  | "detection"
  | "verification"
  | "quantification"
  | "ais_correlation"
  | "drift_reconstruction"
  | "evidence_fusion"
  | "report";

export interface InvestigationStage {
  id: InvestigationStageId;
  label: string;
  /** Short operational description shown under the running stage. */
  detail: string;
}

export const INVESTIGATION_STAGES: InvestigationStage[] = [
  { id: "detection", label: "DETECTION", detail: "SAR observation & candidate extraction" },
  { id: "verification", label: "VERIFICATION", detail: "Geometry, context & confidence screening" },
  { id: "quantification", label: "QUANTIFICATION", detail: "Area, length & confidence estimate" },
  { id: "ais_correlation", label: "AIS CORRELATION", detail: "Vessel correlation & trajectories" },
  { id: "drift_reconstruction", label: "DRIFT RECONSTRUCTION", detail: "Backtracking & forecast modelling" },
  { id: "evidence_fusion", label: "EVIDENCE FUSION", detail: "Attribution, anomalies & HSI fused" },
  { id: "report", label: "REPORT", detail: "Investigation report generation" },
];

export type StageState = "pending" | "running" | "complete" | "failed";

/** Workflow block stored on the incident — persisted with the snapshot. */
export interface InvestigationWorkflow {
  /** Stage id currently executing (null when idle/completed). */
  runningStage: InvestigationStageId | null;
  /** Stages that have completed, in order. */
  completedStages: InvestigationStageId[];
  /** Whether the report artifact was successfully generated + exported. */
  reportGenerated: boolean;
  reportExportedAt: string | null;
  /** Human error note when a stage fails (never silently swallowed). */
  lastError: string | null;
}

/** Percentage of the pipeline completed — derived from ACTUAL stage state,
 * never a decorative animation. Detection complete ⇒ 1/7 ≈ 14%, etc. */
export function workflowProgressPct(wf: InvestigationWorkflow): number {
  const done = wf.completedStages.length;
  const running = wf.runningStage ? 1 : 0;
  return Math.round(((done + 0.5 * running) / INVESTIGATION_STAGES.length) * 100);
}

/** The status implied by the workflow's actual position in the pipeline. */
export function workflowStatus(wf: InvestigationWorkflow): IncidentStatus {
  if (wf.lastError && !wf.runningStage) return "under_investigation";
  if (wf.runningStage) {
    // Quantification and beyond = evidence actively being assembled.
    const idx = INVESTIGATION_STAGES.findIndex((s) => s.id === wf.runningStage);
    return idx >= 3 ? "evidence_updated" : "under_investigation";
  }
  const done = new Set(wf.completedStages);
  if (done.size === INVESTIGATION_STAGES.length) {
    return wf.reportGenerated ? "requires_validation" : "report_ready";
  }
  if (done.has("evidence_fusion")) return "impact_assessment";
  if (done.has("ais_correlation")) return "candidates_ranked";
  if (done.has("quantification")) return "evidence_updated";
  if (done.size > 0) return "under_investigation";
  return "unverified";
}

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
  /** Prompt-8 investigation workflow (stage machine + progress). */
  workflow: InvestigationWorkflow;
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

const IDLE_WORKFLOW: InvestigationWorkflow = {
  runningStage: null,
  completedStages: [],
  reportGenerated: false,
  reportExportedAt: null,
  lastError: null,
};

function initialWorkflow(): InvestigationWorkflow {
  // Detection (stage 1) is inherently complete once an incident exists.
  return { ...IDLE_WORKFLOW, completedStages: ["detection"] };
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
    workflow: initialWorkflow(),
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

// ─── INVESTIGATION WORKFLOW CONTROLS (Prompt 8) ─────────────────────

/** Emit an operational notification with an explicit kind/title. */
function pushNotification(
  s: IncidentStoreState,
  incident: ManagedIncident,
  kind: NotificationKind,
  title: string,
  detail: string,
): IncidentNotification[] {
  return [
    {
      id: notificationId(),
      kind,
      incidentId: incident.id,
      incidentNumber: incident.incidentNumber,
      title,
      detail,
      timestamp: new Date().toISOString(),
      read: false,
    },
    ...s.notifications,
  ];
}

function findActive(s: IncidentStoreState): ManagedIncident | undefined {
  return (
    s.incidents.find((i) => i.id === s.activeIncidentId) ?? s.incidents[0]
  );
}

function withWorkflow(
  incident: ManagedIncident,
  wf: InvestigationWorkflow,
  status?: IncidentStatus,
): ManagedIncident {
  return {
    ...incident,
    workflow: wf,
    status: status ?? workflowStatus(wf),
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * RUN INVESTIGATION: moves the incident UNVERIFIED → UNDER INVESTIGATION,
 * marks the first incomplete stage RUNNING, and appends the timeline event
 * "Investigation initiated". No-op when already running (guards double-click).
 */
export function startInvestigation(): void {
  mutate((s) => {
    const incident = findActive(s);
    if (!incident) return s;
    if (incident.workflow.runningStage) return s; // already running

    const nextStage =
      INVESTIGATION_STAGES.find(
        (st) => !incident.workflow.completedStages.includes(st.id),
      ) ?? null;
    if (!nextStage) return s; // everything complete — nothing to run

    const wf: InvestigationWorkflow = {
      ...incident.workflow,
      runningStage: nextStage.id,
      lastError: null,
    };

    const firstRun = incident.status === "unverified" || incident.status === "detected";
    const events = firstRun
      ? [
          ...incident.timeline,
          {
            id: eventId(),
            timestamp: new Date().toISOString(),
            eventType: "INVESTIGATION",
            description: "Investigation initiated — pipeline started",
            source: "MARIS Incident Command",
            severity: "important" as EventSeverity,
          },
        ]
      : incident.timeline;

    const updated = withWorkflow(
      { ...incident, timeline: events },
      wf,
      "under_investigation",
    );

    return {
      ...s,
      incidents: s.incidents.map((i) => (i.id === incident.id ? updated : i)),
      notifications: firstRun
        ? pushNotification(
            s,
            incident,
            "status_changed",
            "STATUS CHANGED",
            `Investigation initiated · ${incident.incidentNumber}`,
          )
        : s.notifications,
    };
  });
}

/**
 * Progress the pipeline: mark the current stage complete, optionally start
 * the next one. `stageState` reflects ACTUAL application processing — the
 * Dashboard pipeline calls this as its real analysis steps complete.
 */
export function completeStage(stageId: InvestigationStageId): void {
  mutate((s) => {
    const incident = findActive(s);
    if (!incident) return s;
    if (incident.workflow.completedStages.includes(stageId)) return s;

    const completedStages = [...incident.workflow.completedStages, stageId];
    const nextIdx = INVESTIGATION_STAGES.findIndex(
      (st) => st.id === stageId,
    ) + 1;
    const nextStage = INVESTIGATION_STAGES[nextIdx] ?? null;
    const stillRunning =
      nextStage && !completedStages.includes(nextStage.id)
        ? nextStage.id
        : null;

    const wf: InvestigationWorkflow = {
      ...incident.workflow,
      runningStage: stillRunning,
      completedStages,
      lastError: null,
    };

    const stageLabel =
      INVESTIGATION_STAGES.find((st) => st.id === stageId)?.label ?? stageId;
    const now = new Date().toISOString();
    const events: ManagedTimelineEvent[] = [
      ...incident.timeline,
      {
        id: eventId(),
        timestamp: now,
        eventType: "STAGE",
        description: `${stageLabel.charAt(0)}${stageLabel.slice(1).toLowerCase()} stage completed`,
        source: "MARIS analysis engine",
        severity: "info" as EventSeverity,
      },
    ];
    const updated = withWorkflow({ ...incident, timeline: events }, wf);

    return {
      ...s,
      incidents: s.incidents.map((i) => (i.id === incident.id ? updated : i)),
      notifications:
        stageId === "report"
          ? pushNotification(
              s,
              incident,
              "status_changed",
              "REPORT READY",
              `Investigation stages complete · ${incident.incidentNumber} — generate/export the report to finish`,
            )
          : s.notifications,
    };
  });
}

/** Mark a stage failed — surfaced in the UI, never silently swallowed. */
export function failStage(stageId: InvestigationStageId, error: string): void {
  mutate((s) => {
    const incident = findActive(s);
    if (!incident) return s;
    const wf: InvestigationWorkflow = {
      ...incident.workflow,
      runningStage: null,
      lastError: `${stageId}: ${error}`,
    };
    const updated = withWorkflow({ ...incident }, wf);
    return {
      ...s,
      incidents: s.incidents.map((i) => (i.id === incident.id ? updated : i)),
      notifications: pushNotification(
        s,
        incident,
        "incident_updated",
        "STAGE ERROR",
        `${stageId} failed — ${error} · ${incident.incidentNumber}`,
      ),
    };
  });
}

/**
 * Record a SUCCESSFULLY generated report. Per Prompt-8 §9 the incident
 * reaches its final state only after generation/export succeeds — call
 * this AFTER the artifact is written, not when the report page opens.
 */
export function markReportGenerated(): void {
  mutate((s) => {
    const incident = findActive(s);
    if (!incident) return s;
    if (incident.workflow.reportGenerated) return s;

    const now = new Date().toISOString();
    const wf: InvestigationWorkflow = {
      ...incident.workflow,
      runningStage: null,
      completedStages: INVESTIGATION_STAGES.map((st) => st.id),
      reportGenerated: true,
      reportExportedAt: now,
    };
    const updated = withWorkflow({ ...incident }, wf, "requires_validation");

    const events: ManagedTimelineEvent[] = [
      ...incident.timeline,
      {
        id: eventId(),
        timestamp: now,
        eventType: "REPORT",
        description: "Investigation report generated",
        source: "MARIS report engine",
        severity: "important" as EventSeverity,
      },
      {
        id: eventId(),
        timestamp: now,
        eventType: "STATUS",
        description:
          "Investigation complete — evidence compiled. REQUIRES VALIDATION",
        source: "MARIS Incident Command",
        severity: "important" as EventSeverity,
      },
    ];

    return {
      ...s,
      incidents: s.incidents.map((i) =>
        i.id === incident.id ? { ...updated, timeline: events } : i,
      ),
      notifications: pushNotification(
        s,
        incident,
        "status_changed",
        "REPORT READY",
        `Investigation report generated — ${incident.incidentNumber} · REQUIRES VALIDATION`,
      ),
    };
  });
}

/**
 * Reset the demo incident workflow to UNVERIFIED (Prompt-8 §15). Reverts
 * pipeline progress + report state but PRESERVES detection history and
 * dedup identity — no duplicate incident is created.
 */
export function resetInvestigation(): void {
  mutate((s) => {
    const incident = findActive(s);
    if (!incident) return s;
    const wf = initialWorkflow();
    const updated = withWorkflow({ ...incident }, wf, "unverified");
    return {
      ...s,
      incidents: s.incidents.map((i) => (i.id === incident.id ? updated : i)),
      notifications: pushNotification(
        s,
        incident,
        "status_changed",
        "INCIDENT RESET",
        `Workflow reset to UNVERIFIED · ${incident.incidentNumber}`,
      ),
    };
  });
}

// ─── SELECTION / NOTIFICATION CONTROLS ───────────────────────────

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
    workflow: initialWorkflow(),
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
