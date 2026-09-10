// MARIS — Incident persistence: mirrors the active incident snapshot to
// the Convex `incidents` table whenever it materially changes (status,
// fields, timeline). Fire-and-forget: the local store remains the live
// source of truth and the app works fully offline if the write fails.
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
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
  ]);
}

/**
 * Mount once (e.g. in Dashboard) to persist incident snapshots. Dedup:
 * a write fires only when the incident's material signature changes.
 */
export function useIncidentPersistence(incident: ManagedIncident | null): void {
  const lastSig = useRef<string | null>(null);

  useEffect(() => {
    if (!incident) return;
    const sig = signature(incident);
    if (sig === lastSig.current) return;
    lastSig.current = sig;

    // Fire-and-forget persistence; offline DEMO mode keeps working.
    void (async () => {
      try {
        await (api as any).incidents.upsertIncident({
          incidentNumber: incident.incidentNumber,
          status: incident.status,
          severity: incident.severity,
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
  }, [incident]);
}
