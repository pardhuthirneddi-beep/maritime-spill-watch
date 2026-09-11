// MARIS — Right investigation panel
import { useState } from "react";
import {
  AlertTriangle,
  Anchor,
  ArrowDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  FileJson,
  FileText,
  Gauge,
  Info,
  Navigation,
  Radar,
  Ship,
  Target,
  Thermometer,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AnalystPanel from "./AnalystPanel";
import { InvestigationProgressPanel } from "./IncidentWorkflow";
import { useIncidentStore } from "@/hooks/useIncidents";
import type { ManagedIncident } from "@/data/incidentStore";
import type {
  OilSpillIncident,
  AisVessel,
  VesselAttribution,
  BehaviorAnomaly,
  EnvironmentalConditions,
  OilDriftResult,
  HyperspectralResult,
  TimelineEvent,
  PanelView,
  LatLon,
} from "@/data/types";

interface RightPanelProps {
  view: PanelView;
  incident: OilSpillIncident | null;
  vessels: AisVessel[];
  selectedVessel: AisVessel | null;
  attributions: VesselAttribution[];
  anomalies: BehaviorAnomaly[];
  environmental: EnvironmentalConditions;
  driftResult: OilDriftResult | null;
  hyperspectral: HyperspectralResult | null;
  timeline: TimelineEvent[];
  analysisStep: string;
  analysisProgress: number;
  isAnalyzing: boolean;
  onVesselSelect: (v: AisVessel) => void;
  onClose: () => void;
  onDownloadPdf: () => void;
  onDownloadJson: () => void;
}

export default function RightPanel({
  view,
  incident,
  vessels,
  selectedVessel,
  attributions,
  anomalies,
  environmental,
  driftResult,
  hyperspectral,
  timeline,
  analysisStep,
  analysisProgress,
  isAnalyzing,
  onVesselSelect,
  onClose,
  onDownloadPdf,
  onDownloadJson,
}: RightPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  // Centralized incident state — the shared source of truth.
  const incidentStore = useIncidentStore();
  const activeManagedIncident =
    incidentStore.incidents.find(
      (i) => i.id === incidentStore.activeIncidentId,
    ) ?? incidentStore.incidents[0] ?? null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute right-0 top-0 z-30 flex h-full w-8 items-center justify-center border-l border-sky-200/10 bg-zinc-950 text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ChevronLeft className="size-4" />
      </button>
    );
  }

  return (
    <aside className="relative z-20 flex h-full w-96 flex-col border-l border-sky-200/10 bg-zinc-950">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-sky-200/10 px-4 py-3">
        <h2 className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
          {view === "overview" && "Investigation Overview"}
          {view === "vessel" && (selectedVessel ? selectedVessel.name : "AIS Intelligence")}
          {view === "attribution" && "Source Attribution"}
          {view === "drift" && "Drift Analysis"}
          {view === "thickness" && "Oil Thickness"}
          {view === "timeline" && "Timeline"}
          {view === "report" && "Investigation Report"}
          {view === "satellite" && "Satellite Analysis"}
          {view === "analyst" && "AI Analyst"}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(true)}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <ChevronRight className="size-4" />
          </button>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Analysis progress */}
      {isAnalyzing && (
        <div className="border-b border-sky-200/10 px-4 py-2">
          <div className="flex items-center gap-2 text-[10px] text-zinc-400">
            <div className="size-3 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
            {analysisStep}
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-orange-500/60 rounded-full transition-all duration-500"
              style={{ width: `${analysisProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto">
        {view === "overview" && incident && (
          <OverviewPanel
            incident={incident}
            managedIncident={activeManagedIncident}
            vessels={vessels}
            attributions={attributions}
            environmental={environmental}
            hyperspectral={hyperspectral}
          />
        )}
        {view === "vessel" && (
          <VesselPanel
            vessel={selectedVessel}
            vessels={vessels}
            attributions={attributions}
            anomalies={anomalies}
            onVesselSelect={onVesselSelect}
          />
        )}
        {view === "attribution" && (
          <AttributionPanel
            attributions={attributions}
            vessels={vessels}
            onVesselSelect={onVesselSelect}
          />
        )}
        {view === "drift" && (
          <DriftPanel
            driftResult={driftResult}
            environmental={environmental}
          />
        )}
        {view === "thickness" && hyperspectral && (
          <ThicknessPanel hyperspectral={hyperspectral} />
        )}
        {view === "timeline" && (
          <AnalysisChronologyPanel managedIncident={activeManagedIncident} timeline={timeline} />
        )}
        {view === "satellite" && incident && (
          <SatellitePanel incident={incident} environmental={environmental} />
        )}
        {view === "report" && (
          <ReportPanel
            onDownloadPdf={onDownloadPdf}
            onDownloadJson={onDownloadJson}
          />
        )}
        {view === "analyst" && (
          <AnalystPanel
            incident={incident}
            vessels={vessels}
            attributions={attributions}
            anomalies={anomalies}
            environmental={environmental}
            driftResult={driftResult}
            hyperspectral={hyperspectral}
            timeline={timeline}
            isAnalyzing={isAnalyzing}
          />
        )}
      </div>
    </aside>
  );
}

// ─── ANALYSIS CHRONOLOGY (timeline view) ───────────────────────────
// Event history ONLY. Incident status/progress live in the incident
// dialog (Command Center) — never here. No status entries, no progress
// percentages, no stage state indicators in the chronology.

/** Analysis/processing sources shown as compact event tags. */
const SOURCE_TAGS: Record<string, string> = {
  SAR: "SAR",
  AIS: "AIS",
  DRIFT: "DRIFT",
  HSI: "HSI",
  REPORT: "REPORT",
  MODEL: "SAR / MODEL",
  EVIDENCE: "EVIDENCE",
  ATTRIBUTION: "AIS / ATTRIBUTION",
  ANALYSIS: "MARIS INTELLIGENCE",
};

/** Map store eventType → chronology source tag. */
function sourceTag(eventType: string, source: string): string {
  const t = eventType.toUpperCase();
  if (t === "ANALYSIS START" || t === "ANALYSIS") return SOURCE_TAGS.ANALYSIS;
  if (t.startsWith("SAR") || t === "DETECTION" || t === "GEOMETRY" || t === "AREA") return SOURCE_TAGS.SAR;
  if (t.startsWith("AIS") || t === "CANDIDATES") return SOURCE_TAGS.ATTRIBUTION;
  if (t.startsWith("DRIFT")) return SOURCE_TAGS.DRIFT;
  if (t.startsWith("HSI") || t.includes("HYPERSPECTRAL")) return SOURCE_TAGS.HSI;
  if (t.startsWith("REPORT") || t === "EXPORT") return SOURCE_TAGS.REPORT;
  if (t.includes("EVIDENCE") || t === "QUANTIFICATION") return SOURCE_TAGS.EVIDENCE;
  return source.toUpperCase();
}

/**
 * Filter OUT state-indicator entries. Status changes, progress and
 * lifecycle metadata are incident-dialog concerns, not analysis events.
 * Analysis-stage bookkeeping ("... stage completed") is also dropped:
 * the real analysis events recorded by the pipeline already describe
 * the actual work performed.
 */
function isAnalysisEvent(eventType: string, description: string): boolean {
  const t = eventType.toUpperCase();
  if (t === "STATUS" || t === "INCIDENT" || t === "INVESTIGATION" || t === "STAGE") return false;
  const d = description.toLowerCase();
  if (d.includes("status")) return false;
  // Progress-style state entries ("65% complete", "progress 40%") —
  // never analysis events. A confidence figure ("confidence 91%") is.
  if (/\d+%/.test(description) && (d.includes("complete") || d.includes("progress")))
    return false;
  if (d.endsWith("stage completed")) return false;
  return true;
}

function AnalysisChronologyPanel({
  managedIncident,
  timeline,
}: {
  managedIncident: ReturnType<typeof useIncidentStore>["incidents"][number] | null;
  timeline: TimelineEvent[];
}) {
  const managedEvents = (managedIncident?.timeline ?? []).filter((e) =>
    isAnalysisEvent(e.eventType, e.description),
  );

  return (
    <div className="p-3">
      {/* Header — incident identity only (no status, no progress) */}
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
          Analysis Chronology
        </div>
        {managedIncident && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[8px] text-zinc-600">
              {managedIncident.incidentNumber}
            </span>
            <span className="text-[7px] font-semibold uppercase tracking-[0.14em] text-orange-400/70">
              Possible Oil Slick
            </span>
          </div>
        )}
      </div>

      {managedEvents.length > 0 ? (
        <div className="space-y-0">
          {managedEvents.map((e) => (
            <ChronologyRow key={e.id} event={e} />
          ))}
        </div>
      ) : timeline.length > 0 ? (
        // Fallback: pre-analysis demo chronology (before any run).
        <div className="space-y-2">
          {timeline.map((event, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="font-mono text-[9px] text-zinc-600">{event.time}</span>
              <span className="text-[9px] text-zinc-400">{event.event}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-zinc-600">
          No analysis events recorded yet.
        </div>
      )}
    </div>
  );
}

function ChronologyRow({ event }: { event: ManagedTimelineEventRow }) {
  return (
    <div className="border-b border-sky-200/5 py-2.5 last:border-0">
      <div className="font-mono text-[9px] text-zinc-600">
        {fmtUtc(event.timestamp)}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-200">
        {event.description}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="text-[9px] leading-snug text-zinc-500">
          {eventDetail(event.eventType)}
        </div>
        <span className="shrink-0 rounded border border-sky-200/10 bg-zinc-900 px-1.5 py-0.5 text-[7px] font-semibold tracking-wider text-zinc-500">
          {sourceTag(event.eventType, event.source)}
        </span>
      </div>
    </div>
  );
}

/** Short human-readable detail line describing what the analysis step did. */
function eventDetail(eventType: string): string {
  const t = eventType.toUpperCase();
  if (t === "DETECTION") return "Satellite observation evaluated for oil-slick signatures.";
  if (t === "ANALYSIS START") return "MARIS analysis pipeline initiated for SAR, AIS and environmental evidence.";
  if (t === "ANALYSIS" || t === "AIS OBSERVATION") return "Recorded by the MARIS analysis engine during the investigation.";
  if (t === "GEOMETRY" || t === "AREA") return "Candidate slick boundary and geographic geometry calculated.";
  if (t.startsWith("AIS") || t === "CANDIDATES") return "Vessel tracks evaluated against the incident spatial and temporal window.";
  if (t.startsWith("DRIFT")) return "Backward drift reconstruction estimated a possible source zone.";
  if (t.startsWith("HSI") || t.includes("HYPERSPECTRAL")) return "Hyperspectral evidence evaluated for thickness classification.";
  if (t === "EVIDENCE") return "SAR, AIS, drift and available HSI evidence combined for source assessment.";
  if (t.startsWith("REPORT")) return "Investigation report generated and prepared for export.";
  if (t === "EXPORT") return "Investigation report successfully exported.";
  return "Analysis step recorded.";
}

type ManagedTimelineEventRow = {
  id: string;
  timestamp: string;
  eventType: string;
  description: string;
  source: string;
};

function fmtUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// ─── OVERVIEW ───────────────────────────────────────────────────────

function OverviewPanel({
  incident,
  managedIncident,
  vessels,
  attributions,
  environmental,
  hyperspectral,
}: {
  incident: OilSpillIncident;
  managedIncident: ManagedIncident | null;
  vessels: AisVessel[];
  attributions: VesselAttribution[];
  environmental: EnvironmentalConditions;
  hyperspectral: HyperspectralResult | null;
}) {
  const topAttribution = attributions[0];
  return (
    <div className="p-4 space-y-4">
      {/* Investigation progress — Prompt-8 stage machine (actual state) */}
      <InvestigationProgressPanel incident={managedIncident} />

      {/* Incident Card */}
      <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="size-3.5 text-orange-400" />
          <span className="text-[10px] font-semibold text-orange-400 uppercase">
            {incident.label}
          </span>
        </div>
        <div className="text-[10px] font-mono text-zinc-500 mb-2">
          INCIDENT #{incident.incidentNumber}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <InfoBlock label="Confidence" value={`${incident.confidence.score}%`} />
          <InfoBlock label="Area" value={`${incident.polygon.areaKm2} km²`} />
          <InfoBlock label="Length" value={`${incident.polygon.lengthKm} km`} />
          <InfoBlock label="Mode" value={incident.detectionMode.toUpperCase()} />
        </div>
        <div className="mt-2 text-[9px] font-mono text-zinc-400">
          {incident.coordinates[0].toFixed(4)}°N, {incident.coordinates[1].toFixed(4)}°E
        </div>
        <div className="mt-1 text-[9px] text-zinc-500">
          Detected: {new Date(incident.detectedAt).toLocaleString()}
        </div>
      </div>

      {/* Top Source */}
      {topAttribution && (
        <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Target className="size-3.5 text-cyan-400" />
            <span className="text-[10px] font-semibold text-cyan-400 uppercase">
              Probable Source
            </span>
          </div>
          <div className="text-[11px] font-semibold text-zinc-200">
            {topAttribution.vesselName}
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-[18px] font-bold text-cyan-400">
              {topAttribution.overallScore}
            </span>
            <span className="text-[10px] text-zinc-500">/100</span>
          </div>
          <div className="mt-2 space-y-0.5">
            {topAttribution.reasons.slice(0, 4).map((r, i) => (
              <div key={i} className="text-[9px] text-zinc-400">{r}</div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-2">
          <div className="text-[9px] text-zinc-500">Vessels</div>
          <div className="text-[14px] font-bold text-zinc-200">{vessels.length}</div>
        </div>
        <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-2">
          <div className="text-[9px] text-zinc-500">Wind</div>
          <div className="text-[14px] font-bold text-zinc-200">
            {environmental.windSpeed} kn
          </div>
          <div className="text-[8px] text-zinc-500">{environmental.windDirectionLabel}</div>
        </div>
        <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-2">
          <div className="text-[9px] text-zinc-500">Current</div>
          <div className="text-[14px] font-bold text-zinc-200">
            {environmental.currentSpeed} kn
          </div>
          <div className="text-[8px] text-zinc-500">{environmental.currentDirectionLabel}</div>
        </div>
        <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-2">
          <div className="text-[9px] text-zinc-500">Thickness</div>
          <div className="text-[14px] font-bold text-zinc-200">
            {hyperspectral?.estimatedClass || "—"}
          </div>
          <div className="text-[8px] text-zinc-500">
            {hyperspectral?.confidence || 0}%
          </div>
        </div>
      </div>

      {/* Demo Badge */}
      <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
        <div className="flex items-center gap-1.5 text-[9px] text-amber-400/80">
          <Info className="size-3" />
          Demonstration data — vessel identities and detection results are
          synthetic. Not derived from live satellite or AIS feeds.
        </div>
      </div>
    </div>
  );
}

// ─── VESSEL PROFILE ─────────────────────────────────────────────────

function VesselPanel({
  vessel,
  vessels,
  attributions,
  anomalies,
  onVesselSelect,
}: {
  vessel: AisVessel | null;
  vessels: AisVessel[];
  attributions: VesselAttribution[];
  anomalies: BehaviorAnomaly[];
  onVesselSelect: (v: AisVessel) => void;
}) {
  return (
    <div className="p-4 space-y-3">
      {/* Vessel Selector */}
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">
        Select Vessel
      </div>
      <div className="space-y-1">
        {vessels.map((v) => {
          const attr = attributions.find((a) => a.vesselId === v.mmsi);
          const anomaly = anomalies.find((a) => a.vesselId === v.mmsi);
          const isActive = vessel?.mmsi === v.mmsi;
          return (
            <button
              key={v.mmsi}
              onClick={() => onVesselSelect(v)}
              className={cn(
                "w-full rounded border p-2 text-left transition-colors",
                isActive
                  ? "border-cyan-500/50 bg-cyan-500/5"
                  : "border-sky-200/10 bg-zinc-900/30 hover:border-zinc-700"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-200">
                  {v.name}
                </span>
                {attr && (
                  <span
                    className={cn(
                      "text-[10px] font-bold",
                      attr.rank === 1 ? "text-cyan-400" : "text-zinc-500"
                    )}
                  >
                    {attr.overallScore}/100
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-zinc-500">{v.vesselType}</span>
                {anomaly && anomaly.anomalyLevel !== "LOW" && (
                  <span
                    className={cn(
                      "text-[8px] px-1 rounded",
                      anomaly.anomalyLevel === "HIGH"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-yellow-500/20 text-yellow-400"
                    )}
                  >
                    {anomaly.anomalyLevel}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Vessel Detail */}
      {vessel && (
        <>
          <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
            <div className="text-[10px] font-semibold text-zinc-300 uppercase mb-2">
              Vessel Profile
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 text-[10px]">
              <InfoRow label="Name" value={vessel.name} />
              <InfoRow label="MMSI" value={vessel.mmsi} />
              <InfoRow label="IMO" value={vessel.imo} />
              <InfoRow label="Type" value={vessel.vesselType} />
              <InfoRow label="Flag" value={vessel.flag} />
              <InfoRow label="Speed" value={`${vessel.speed} kn`} />
              <InfoRow label="Heading" value={`${vessel.heading}°`} />
              <InfoRow label="Destination" value={vessel.destination} />
            </div>
          </div>

          {/* Source Likelihood */}
          {attributions.find((a) => a.vesselId === vessel.mmsi) && (
            <SourceLikelihood
              attribution={attributions.find((a) => a.vesselId === vessel.mmsi)!}
            />
          )}

          {/* Behavior Anomaly */}
          {anomalies.find((a) => a.vesselId === vessel.mmsi) && (
            <BehaviorCard
              anomaly={anomalies.find((a) => a.vesselId === vessel.mmsi)!}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── ATTRIBUTION PANEL ──────────────────────────────────────────────

function AttributionPanel({
  attributions,
  vessels,
  onVesselSelect,
}: {
  attributions: VesselAttribution[];
  vessels: AisVessel[];
  onVesselSelect: (v: AisVessel) => void;
}) {
  return (
    <div className="p-4 space-y-3">
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider">
        Source Likelihood Ranking
      </div>

      {attributions.map((attr) => {
        const vessel = vessels.find((v) => v.mmsi === attr.vesselId);
        if (!vessel) return null;
        return (
          <button
            key={attr.vesselId}
            onClick={() => onVesselSelect(vessel)}
            className="w-full rounded border border-sky-200/10 bg-zinc-900/30 p-3 text-left hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[10px] font-bold w-5 text-center",
                    attr.rank <= 2 ? "text-orange-400" : "text-zinc-500"
                  )}
                >
                  #{attr.rank}
                </span>
                <span className="text-[11px] font-semibold text-zinc-200">
                  {attr.vesselName}
                </span>
              </div>
              <span
                className={cn(
                  "text-[13px] font-bold",
                  attr.rank === 1
                    ? "text-cyan-400"
                    : attr.rank === 2
                      ? "text-zinc-300"
                      : "text-zinc-500"
                )}
              >
                {attr.overallScore}
              </span>
            </div>

            {/* Score bar */}
            <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  attr.rank === 1 ? "bg-cyan-500/70" : "bg-zinc-600/50"
                )}
                style={{ width: `${attr.overallScore}%` }}
              />
            </div>

            <div className="mt-2 space-y-0.5">
              {attr.reasons.slice(0, 3).map((r, i) => (
                <div key={i} className="text-[8px] text-zinc-500">{r}</div>
              ))}
            </div>
          </button>
        );
      })}

      <div className="rounded border border-sky-200/10 bg-zinc-900/30 p-2">
        <div className="text-[9px] text-zinc-500">
          Scoring methodology: Multi-factor weighted analysis — distance (25%), trajectory (20%), temporal (20%), heading (10%), drift (15%), behaviour (10%). Weights are configurable.
        </div>
      </div>
    </div>
  );
}

// ─── DRIFT PANEL ────────────────────────────────────────────────────

function DriftPanel({
  driftResult,
  environmental,
}: {
  driftResult: OilDriftResult | null;
  environmental: EnvironmentalConditions;
}) {
  return (
    <div className="p-4 space-y-3">
      {/* Environmental */}
      <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
        <div className="text-[10px] font-semibold text-zinc-300 uppercase mb-2">
          Environmental Conditions
        </div>
        <div className="grid grid-cols-2 gap-y-1.5 text-[10px]">
          <InfoRow label="Wind Speed" value={`${environmental.windSpeed} kn`} />
          <InfoRow label="Wind Dir" value={`${environmental.windDirection}° ${environmental.windDirectionLabel}`} />
          <InfoRow label="Current" value={`${environmental.currentSpeed} kn ${environmental.currentDirectionLabel}`} />
          <InfoRow label="Wave Height" value={`${environmental.waveHeight} m`} />
          <InfoRow label="SST" value={`${environmental.seaSurfaceTemp}°C`} />
        </div>
      </div>

      {/* Forward Drift */}
      {driftResult && (
        <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="size-3 text-orange-400" />
            <span className="text-[10px] font-semibold text-orange-400 uppercase">
              Forward Prediction
            </span>
          </div>
          <div className="space-y-1.5">
            {driftResult.forward.map((point, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded bg-zinc-800/50 px-2 py-1"
              >
                <span className="text-[9px] font-mono text-zinc-400">{point.time}</span>
                <span className="text-[9px] text-zinc-500">
                  {point.center[0].toFixed(3)}°N, {point.center[1].toFixed(3)}°E
                </span>
                <span
                  className={cn(
                    "text-[9px] font-mono",
                    point.confidence > 60
                      ? "text-emerald-400"
                      : point.confidence > 30
                        ? "text-yellow-400"
                        : "text-zinc-500"
                  )}
                >
                  {point.confidence}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backtrack */}
      {driftResult && (
        <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDown className="size-3 text-violet-400" />
            <span className="text-[10px] font-semibold text-violet-400 uppercase">
              Backtrack Analysis
            </span>
          </div>
          <div className="space-y-1.5">
            {driftResult.backtrack.map((point, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded bg-zinc-800/50 px-2 py-1"
              >
                <span className="text-[9px] font-mono text-zinc-400">{point.time}</span>
                <span className="text-[9px] text-zinc-500">
                  {point.center[0].toFixed(3)}°N, {point.center[1].toFixed(3)}°E
                </span>
                <span className="text-[9px] font-mono text-zinc-500">
                  {point.confidence}%
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[9px] text-zinc-500">
            Probable origin region identified through backward drift analysis using
            wind and current vectors.
          </div>
        </div>
      )}

      <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
        <div className="text-[9px] text-amber-400/80">
          Drift predictions based on demonstration environmental data. Actual drift
          modelling requires real-time wind, current, and wave data.
        </div>
      </div>
    </div>
  );
}

// ─── THICKNESS PANEL ────────────────────────────────────────────────

function ThicknessPanel({
  hyperspectral,
}: {
  hyperspectral: HyperspectralResult;
}) {
  return (
    <div className="p-4 space-y-3">
      {/* Main Result */}
      <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Thermometer className="size-3 text-zinc-300" />
          <span className="text-[10px] font-semibold text-zinc-300 uppercase">
            Estimated Thickness Class
          </span>
        </div>
        <div className="text-[16px] font-bold text-zinc-100">
          {hyperspectral.estimatedClass}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[12px] font-semibold text-zinc-300">
            {hyperspectral.confidence}%
          </span>
          <span className="text-[9px] text-zinc-500">confidence</span>
        </div>
        <div className="text-[9px] text-zinc-500 mt-1">
          Uncertainty: {hyperspectral.uncertainty}
        </div>
      </div>

      {/* Thickness Classes */}
      <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
        <div className="text-[10px] font-semibold text-zinc-300 uppercase mb-2">
          Thickness Distribution
        </div>
        <div className="space-y-1.5">
          {hyperspectral.thicknessClasses.map((tc) => (
            <div key={tc.label}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="size-2 rounded-sm"
                    style={{ background: tc.color }}
                  />
                  <span className="text-[10px] text-zinc-300">{tc.label}</span>
                </div>
                <span className="text-[9px] text-zinc-500">
                  {tc.range} — {tc.percentage}%
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-zinc-800 mt-0.5 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${tc.percentage}%`,
                    background: tc.color,
                    opacity: 0.7,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Spectral Signatures */}
      <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
        <div className="text-[10px] font-semibold text-zinc-300 uppercase mb-2">
          Spectral Signature
        </div>
        <div className="h-32 w-full relative">
          <svg viewBox="0 0 400 120" className="w-full h-full">
            {/* Grid lines */}
            {[0, 30, 60, 90, 120].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="400"
                y2={y}
                stroke="#27272a"
                strokeWidth="0.5"
              />
            ))}
            {/* Intensity line */}
            <polyline
              points={hyperspectral.spectralSignatures
                .map(
                  (s, i) =>
                    `${(i / hyperspectral.spectralSignatures.length) * 400},${
                      120 - s.intensity * 110
                    }`
                )
                .join(" ")}
              fill="none"
              stroke="#60a5fa"
              strokeWidth="1"
              opacity="0.7"
            />
            {/* Oil absorption */}
            <polyline
              points={hyperspectral.spectralSignatures
                .map(
                  (s, i) =>
                    `${(i / hyperspectral.spectralSignatures.length) * 400},${
                      120 - s.oilAbsorption * 110
                    }`
                )
                .join(" ")}
              fill="none"
              stroke="#f97316"
              strokeWidth="1"
              opacity="0.6"
            />
            {/* Labels */}
            <text x="5" y="12" fill="#71717a" fontSize="7">
              400nm
            </text>
            <text x="370" y="12" fill="#71717a" fontSize="7">
              2400nm
            </text>
            <text x="5" y="7" fill="#60a5fa" fontSize="5">
              Intensity
            </text>
            <text x="50" y="7" fill="#f97316" fontSize="5">
              Oil Absorption
            </text>
          </svg>
        </div>
      </div>

      <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
        <div className="text-[9px] text-amber-400/80">
          {hyperspectral.disclaimer}
        </div>
      </div>
    </div>
  );
}

// ─── TIMELINE PANEL ─────────────────────────────────────────────────

function TimelinePanel({ timeline }: { timeline: TimelineEvent[] }) {
  const catColors: Record<string, string> = {
    vessel: "bg-blue-500",
    detection: "bg-orange-500",
    analysis: "bg-cyan-500",
    report: "bg-emerald-500",
  };
  return (
    <div className="p-4">
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-3">
        Investigation Timeline
      </div>
      <div className="relative ml-2 border-l border-sky-200/10 pl-4 space-y-3">
        {timeline.map((event, i) => (
          <div key={i} className="relative">
            <div
              className={cn(
                "absolute -left-[21px] top-1 size-2 rounded-full",
                catColors[event.category] || "bg-zinc-600"
              )}
            />
            <div className="text-[9px] font-mono text-zinc-500">{event.time}</div>
            <div className="text-[10px] text-zinc-300">{event.event}</div>
            <div className="text-[8px] text-zinc-600 uppercase">{event.category}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SATELLITE PANEL ────────────────────────────────────────────────

function SatellitePanel({
  incident,
  environmental,
}: {
  incident: OilSpillIncident;
  environmental: EnvironmentalConditions;
}) {
  return (
    <div className="p-4 space-y-3">
      <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Radar className="size-3 text-blue-400" />
          <span className="text-[10px] font-semibold text-blue-400 uppercase">
            SAR Image Analysis
          </span>
        </div>
        <div className="text-[9px] px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded inline-block mb-2">
          DEMONSTRATION DATA
        </div>
        <div className="grid grid-cols-2 gap-y-1.5 text-[10px]">
          <InfoRow label="Sensor" value="Sentinel-1 SAR (C-band)" />
          <InfoRow label="Mode" value="Interferometric Wide Swath" />
          <InfoRow label="Polarisation" value="VV + VH" />
          <InfoRow label="Resolution" value="10m × 10m" />
          <InfoRow label="Acquisition" value={new Date(incident.detectedAt).toLocaleString()} />
          <InfoRow label="Orbit" value="Descending" />
        </div>
      </div>

      <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
        <div className="text-[10px] font-semibold text-zinc-300 uppercase mb-2">
          Detection Confidence
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-[20px] font-bold text-zinc-100">
            {incident.confidence.score}%
          </span>
          <span className="text-[9px] text-zinc-500">overall confidence</span>
        </div>
        <div className="mt-2 space-y-1">
          {incident.confidence.factors.map((f, i) => (
            <div key={i} className="text-[9px] text-zinc-400 flex items-start gap-1">
              <span className="text-emerald-500 mt-px">•</span>
              {f}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
        <div className="text-[10px] font-semibold text-zinc-300 uppercase mb-2">
          Processing Pipeline
        </div>
        <div className="space-y-1">
          {[
            "SAR image acquisition",
            "Noise reduction (Lee filter)",
            "Sea/background segmentation (Otsu threshold)",
            "Dark-region candidate extraction",
            "Shape analysis (elongation, compactness)",
            "Contextual filtering (wind, currents)",
            "False-positive elimination",
            "Candidate oil-slick polygon generation",
            "Confidence scoring",
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-[9px] text-zinc-400">
              <span className="text-zinc-600 font-mono">{String(i + 1).padStart(2, "0")}</span>
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── REPORT PANEL ───────────────────────────────────────────────────

function ReportPanel({
  onDownloadPdf,
  onDownloadJson,
}: {
  onDownloadPdf: () => void;
  onDownloadJson: () => void;
}) {
  return (
    <div className="p-4 space-y-3">
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider">
        Generate Investigation Report
      </div>

      <button
        onClick={onDownloadPdf}
        className="w-full flex items-center gap-3 rounded border border-sky-200/10 bg-zinc-900/30 p-3 text-left hover:border-zinc-700 transition-colors"
      >
        <div className="flex size-8 items-center justify-center rounded bg-red-500/10">
          <FileText className="size-4 text-red-400" />
        </div>
        <div>
          <div className="text-[11px] font-semibold text-zinc-200">
            Download PDF Report
          </div>
          <div className="text-[9px] text-zinc-500">
            Complete investigation report with all sections
          </div>
        </div>
        <Download className="size-3.5 text-zinc-500 ml-auto" />
      </button>

      <button
        onClick={onDownloadJson}
        className="w-full flex items-center gap-3 rounded border border-sky-200/10 bg-zinc-900/30 p-3 text-left hover:border-zinc-700 transition-colors"
      >
        <div className="flex size-8 items-center justify-center rounded bg-emerald-500/10">
          <FileJson className="size-4 text-emerald-400" />
        </div>
        <div>
          <div className="text-[11px] font-semibold text-zinc-200">
            Download JSON Record
          </div>
          <div className="text-[9px] text-zinc-500">
            Machine-readable investigation evidence
          </div>
        </div>
        <Download className="size-3.5 text-zinc-500 ml-auto" />
      </button>

      <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
        <div className="text-[10px] font-semibold text-zinc-300 uppercase mb-2">
          Report Contents
        </div>
        <div className="space-y-1 text-[9px] text-zinc-400">
          {[
            "Incident ID & detection timestamp",
            "Satellite image metadata",
            "Spill coordinates, area & length",
            "Detection confidence & factors",
            "AIS vessel candidates",
            "Source likelihood ranking",
            "Drift analysis results",
            "Oil thickness estimate",
            "Behaviour anomaly indicators",
            "Investigation timeline",
            "Methodology & limitations",
            "Evidence disclaimer",
          ].map((item, i) => (
            <div key={i}>• {item}</div>
          ))}
        </div>
      </div>

      <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-2">
        <div className="text-[9px] text-zinc-500 italic">
          "Automated analytical result for decision support. Not a legal
          determination of responsibility."
        </div>
      </div>
    </div>
  );
}

// ─── SHARED COMPONENTS ──────────────────────────────────────────────

function SourceLikelihood({
  attribution,
}: {
  attribution: VesselAttribution;
}) {
  return (
    <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Target className="size-3 text-cyan-400" />
        <span className="text-[10px] font-semibold text-cyan-400 uppercase">
          Source Likelihood
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[20px] font-bold text-cyan-400">
          {attribution.overallScore}
        </span>
        <span className="text-[10px] text-zinc-500">/100</span>
        <span className="text-[9px] text-zinc-600 ml-2">
          Rank #{attribution.rank}
        </span>
      </div>
      <div className="mt-2 space-y-1">
        {attribution.reasons.map((r, i) => (
          <div key={i} className="text-[9px] text-zinc-400">
            {r}
          </div>
        ))}
      </div>
    </div>
  );
}

function BehaviorCard({ anomaly }: { anomaly: BehaviorAnomaly }) {
  const levelColors: Record<string, string> = {
    HIGH: "text-red-400 bg-red-500/10 border-red-500/30",
    MEDIUM: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
    LOW: "text-zinc-400 bg-zinc-800/50 border-zinc-700",
  };
  return (
    <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="size-3 text-yellow-400" />
        <span className="text-[10px] font-semibold text-yellow-400 uppercase">
          Behaviour Analysis
        </span>
      </div>
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[9px] font-bold",
          levelColors[anomaly.anomalyLevel]
        )}
      >
        Anomaly: {anomaly.anomalyLevel}
      </div>
      <div className="mt-2 space-y-1">
        {anomaly.evidence.map((e, i) => (
          <div key={i} className="text-[9px] text-zinc-400">
            • {e}
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[8px] text-zinc-600 uppercase">{label}</div>
      <div className="text-[11px] font-semibold text-zinc-200">{value}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <>
      <div className="text-[9px] text-zinc-500">{label}</div>
      <div className="text-[10px] text-zinc-300">{value}</div>
    </>
  );
}
