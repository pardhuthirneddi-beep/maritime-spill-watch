// MARIS — Incident persistence: mirrors the active incident snapshot to
// the Convex `incidents` table whenever it materially changes (status,
// fields, timeline) AND hydrates the local workflow from the last
// persisted snapshot on first load. Fire-and-forget: the local store
// remains the live source of truth and the app works fully offline if
// the write fails.
import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { hydrateFromPersisted } from "@/data/incidentStore";
import type { ManagedIncident } from "@/data/incidentStore";

function signature(i: ManagedIncident): string {
  return JSON.stringify([
    i.incidentNumber,
    i.status,
    i.severity,
    i.latitude,
    i.longitude,
    i.areaKm2,
    i.estimatedVolumeM3,
    i.confidence,
    i.currentSummary,
    i.lastUpdatedAt,
    i.timeline.length,
    i.workflow.runningStage,
    i.workflow.completedStages.length,
    i.workflow.reportGenerated,
  ]);
}

/**
 * Mount once (e.g. in Dashboard) to persist incident snapshots. Dedup:
 * a write fires only when the incident's material signature changes.
 */
export function useIncidentPersistence(incident: ManagedIncident | null): void {
  const lastSig = useRef<string | null>(null);
  const upsert = useMutation(api.incidents.upsertIncident);

  useEffect(() => {
    if (!incident) return;
    const sig = signature(incident);
    if (sig === lastSig.current) return;
    lastSig.current = sig;

    // Fire-and-forget persistence; offline DEMO mode keeps working.
    void (async () => {
      try {
        await upsert({
          incidentNumber: incident.incidentNumber,
          status: incident.status,
          severity: incident.severity,
          workflow: {
            runningStage: incident.workflow.runningStage ?? undefined,
            completedStages: incident.workflow.completedStages,
            reportGenerated: incident.workflow.reportGenerated,
            reportExportedAt: incident.workflow.reportExportedAt ?? undefined,
            lastError: incident.workflow.lastError ?? undefined,
          },
          latitude: incident.latitude,
          longitude: incident.longitude,
          areaKm2: incident.areaKm2 ?? undefined,
          estimatedVolumeM3: incident.estimatedVolumeM3 ?? undefined,
          confidence: incident.confidence ?? undefined,
          detectionSource: incident.detectionSource,
          currentSummary: incident.currentSummary,
          detectionId: incident.detectionId ?? undefined,
          sceneId: incident.sceneId ?? undefined,
          sourceIncidentId: incident.sourceIncidentId ?? undefined,
          detectedAt: incident.detectedAt,
          createdAt: incident.createdAt,
          lastUpdatedAt: incident.lastUpdatedAt,
          timeline: incident.timeline.map((e) => ({
            id: e.id,
            timestamp: e.timestamp,
            eventType: e.eventType,
            description: e.description,
            source: e.source,
            severity: e.severity,
          })),
        });
      } catch {
        // Persistence is best-effort — never block the operational UI.
      }
    })();
    // `upsert` from useMutation has a stable identity; lastSig dedups writes.
  }, [incident, upsert]);
}

/**
 * One-shot hydration: adopt a previous session's persisted incident
 * snapshot (if it has MORE history than the local deterministic seed) so
 * investigation status survives page refresh. Must be mounted once where
 * the incident store is consumed (Dashboard).
 */
export function useIncidentHydration(): void {
  const hydratedRef = useRef(false);
  const persisted = useQuery(api.incidents.listIncidents, {});

  useEffect(() => {
    if (hydratedRef.current || !persisted?.length) return;
    hydratedRef.current = true;
    const row = persisted[0];
    try {
      hydrateFromPersisted({
        incidentNumber: row.incidentNumber,
        status: row.status,
        severity: row.severity,
        areaKm2: row.areaKm2 ?? undefined,
        estimatedVolumeM3: row.estimatedVolumeM3 ?? undefined,
        confidence: row.confidence ?? undefined,
        currentSummary: row.currentSummary,
        lastUpdatedAt: row.lastUpdatedAt,
        timeline: row.timeline ?? [],
        workflow: row.workflow ?? null,
      });
    } catch {
      // Hydration is best-effort — offline DEMO mode keeps working.
    }
  }, [persisted]);
}
