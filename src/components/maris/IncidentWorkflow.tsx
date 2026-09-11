// MARIS — Command Center incident workflow (Prompt 8).
//
// Compact operational status bar + investigation progress, rendered from
// the centralized incident store's ACTUAL pipeline state. The progress
// percentage corresponds to real completed investigation stages — never a
// decorative 0→100 animation. The map remains dominant; these components
// are deliberately small.
import { useState } from "react";
import {
  CircleDashed,
  Compass,
  Download,
  FileCheck2,
  FileJson,
  FileText,
  Loader2,
  Play,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INVESTIGATION_STAGES,
  STATUS_LABELS,
  startInvestigation,
  resetInvestigation,
  investigationComplete,
  workflowProgressPct,
  type InvestigationStageId,
  type InvestigationWorkflow,
  type ManagedIncident,
  type StageState,
} from "@/data/incidentStore";

// ─── STATUS BAR (top of Command Center workspace) ────────────────────

export function IncidentStatusBar({
  incident,
  isAnalyzing,
  onDownloadPdf,
  onDownloadJson,
}: {
  incident: ManagedIncident | null;
  isAnalyzing?: boolean;
  onDownloadPdf?: () => void;
  onDownloadJson?: () => void;
}) {
  // Visibility only — closing hides the UI, it never touches the incident
  // state, workflow or pipeline. A small pill reopens it.
  const [dismissed, setDismissed] = useState(false);

  if (!incident || dismissed) return null;

  const wf = incident.workflow;
  const pct = workflowProgressPct(wf);
  const running = wf.runningStage;
  const stage = INVESTIGATION_STAGES.find((s) => s.id === running) ?? null;
  const complete = investigationComplete(wf);
  const ready = wf.reportGenerated && !complete;

  return (
    <div className="pointer-events-auto rounded border border-sky-200/10 bg-[#070d16]/95 shadow-lg shadow-black/40 backdrop-blur-sm">
      {/* Row 1: identity + status */}
      <div className="flex items-center gap-2 border-b border-sky-200/10 px-3 py-1.5">
        <span className="font-mono text-[11px] font-semibold text-zinc-100">
          {incident.incidentNumber}
        </span>
        <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-orange-400/90">
          Possible Oil Slick
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <StatusLamp status={incident.status} analyzing={!!running || isAnalyzing} />
          <span className="text-[9px] font-semibold tracking-wider text-amber-300">
            {STATUS_LABELS[incident.status]}
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="ml-1 rounded p-0.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            title="Hide status bar (investigation continues)"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Row 2: progress + current step */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between text-[8px] uppercase tracking-wider">
          <span className="text-zinc-500">Investigation Progress</span>
          <span className="font-mono font-semibold text-zinc-300">{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              complete
                ? "bg-emerald-500/80"
                : "bg-gradient-to-r from-orange-600/80 to-orange-500",
            )}
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[8px]">
          <span className="text-zinc-500">
            {complete
              ? "INVESTIGATION COMPLETE"
              : ready
                ? "REPORT READY — EXPORT REQUIRED"
                : running
                  ? `CURRENT STEP — ${stage?.label ?? ""}`
                  : "PIPELINE IDLE"}
          </span>
          {complete ? (
            <span className="flex items-center gap-1 text-emerald-400/90">
              <FileCheck2 className="size-2.5" />
              Requires validation
            </span>
          ) : ready ? (
            <span className="flex items-center gap-1 text-orange-400/90">
              <Download className="size-2.5" />
              Export to complete
            </span>
          ) : (
            <span className="text-zinc-600">
              {stage?.detail ?? "Awaiting investigation"}
            </span>
          )}
        </div>
      </div>

      {/* Row 3: actions */}
      <div className="flex items-center gap-1.5 border-t border-sky-200/10 px-2.5 py-1.5">
        <RunButton incident={incident} isAnalyzing={isAnalyzing} />
        {ready && (
          <>
            <ExportButton
              label="PDF"
              icon={<FileText className="size-2.5" />}
              exported={wf.pdfExportedAt !== null}
              onClick={onDownloadPdf}
            />
            <ExportButton
              label="JSON"
              icon={<FileJson className="size-2.5" />}
              exported={wf.jsonExportedAt !== null}
              onClick={onDownloadJson}
            />
          </>
        )}
        {complete && (
          <button
            onClick={resetInvestigation}
            className="flex items-center gap-1 rounded border border-sky-200/10 px-2 py-1 text-[9px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors"
            title="Reset demo workflow to UNVERIFIED"
          >
            <RotateCcw className="size-2.5" />
            Reset
          </button>
        )}
        {wf.lastError && (
          <span className="ml-auto flex items-center gap-1 text-[8px] text-red-400">
            <TriangleAlert className="size-2.5" />
            {wf.lastError}
          </span>
        )}
      </div>
    </div>
  );
}

function ExportButton({
  label,
  icon,
  exported,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  exported: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={exported}
      className={cn(
        "flex items-center gap-1 rounded border px-2 py-1 text-[9px] font-semibold transition-colors",
        exported
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-sky-400/40 bg-sky-400/10 text-sky-300 hover:border-sky-400/70 hover:bg-sky-400/20",
      )}
      title={exported ? `${label} exported` : `Download ${label} report`}
    >
      {exported ? <FileCheck2 className="size-2.5" /> : icon}
      {exported ? `${label} Exported` : `Download ${label}`}
    </button>
  );
}

function StatusLamp({
  status,
  analyzing,
}: {
  status: string;
  analyzing?: boolean;
}) {
  const color = analyzing
    ? "bg-sky-400"
    : status === "investigation_complete" || status === "requires_validation"
      ? "bg-emerald-400"
      : status === "report_ready" || status === "report_exported"
        ? "bg-teal-400"
        : status === "unverified" || status === "detected"
          ? "bg-amber-400"
          : "bg-sky-400";
  return (
    <span className="relative flex size-2">
      <span
        className={cn(
          "absolute inline-flex h-full w-full animate-ping rounded-full opacity-40",
          color,
          !analyzing && "animate-none opacity-0",
        )}
      />
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}

function RunButton({
  incident,
  isAnalyzing,
}: {
  incident: ManagedIncident;
  isAnalyzing?: boolean;
}) {
  const wf = incident.workflow;
  const busy = !!wf.runningStage || !!isAnalyzing;
  const complete = investigationComplete(wf);

  if (complete) {
    return (
      <span className="flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-semibold text-emerald-400">
        <FileCheck2 className="size-3" />
        Investigation Complete
      </span>
    );
  }

  if (wf.reportGenerated) {
    // Report READY but not exported — the pipeline has nothing left to run;
    // completion now requires the operator's export action, not a re-run.
    return (
      <span className="flex items-center gap-1.5 rounded border border-teal-500/40 bg-teal-500/10 px-2.5 py-1 text-[9px] font-semibold text-teal-300">
        <Download className="size-3" />
        Report Ready
      </span>
    );
  }

  return (
    <button
      onClick={startInvestigation}
      disabled={busy}
      className={cn(
        "flex items-center gap-1.5 rounded border px-2.5 py-1 text-[9px] font-semibold transition-colors",
        busy
          ? "cursor-not-allowed border-zinc-700 bg-zinc-800 text-zinc-500"
          : "border-orange-500/50 bg-orange-500/10 text-orange-400 hover:border-orange-500/70 hover:bg-orange-500/20",
      )}
    >
      {busy ? (
        <>
          <Loader2 className="size-3 animate-spin" />
          {wf.runningStage
            ? (INVESTIGATION_STAGES.find((s) => s.id === wf.runningStage)?.label ??
              "Running")
            : "Running…"}
        </>
      ) : (
        <>
          <Play className="size-2.5" />
          Run Investigation
        </>
      )}
    </button>
  );
}

// ─── INVESTIGATION OVERVIEW (right panel block) ──────────────────────

export function InvestigationProgressPanel({
  incident,
  isAnalyzing,
}: {
  incident: ManagedIncident | null;
  isAnalyzing?: boolean;
}) {
  if (!incident) {
    return (
      <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3 text-[10px] text-zinc-600">
        No active incident — run an investigation to begin.
      </div>
    );
  }

  const wf = incident.workflow;
  const pct = workflowProgressPct(wf);
  const complete = investigationComplete(wf);

  return (
    <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="size-3.5 text-orange-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
            Investigation Progress
          </span>
        </div>
        <span className="font-mono text-[10px] font-semibold text-zinc-200">
          {pct}%
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            wf.reportGenerated
              ? "bg-emerald-500/80"
              : "bg-gradient-to-r from-orange-600/80 to-orange-500",
          )}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>

      {/* Stage list — actual pipeline state */}
      <div className="mt-3 space-y-1">
        {INVESTIGATION_STAGES.map((stage) => {
          const st = stageState(stage.id, wf);
          return (
            <StageRow key={stage.id} label={stage.label} state={st} detail={stage.detail} />
          );
        })}
      </div>

      {wf.reportGenerated && !complete && (
        <div className="mt-3 rounded border border-orange-500/30 bg-orange-500/5 p-2">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold text-orange-400">
            <Download className="size-3" />
            Report ready — export required
          </div>
          <div className="mt-1 text-[8px] leading-snug text-zinc-500">
            Investigation analysis complete. Export the investigation report
            to complete the workflow.
          </div>
          <div className="mt-2 flex gap-1.5">
            <ExportStateBadge
              label="PDF"
              state={exportState("pdf", wf)}
            />
            <ExportStateBadge
              label="JSON"
              state={exportState("json", wf)}
            />
          </div>
        </div>
      )}

      {complete && (
        <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold text-emerald-400">
            <FileCheck2 className="size-3" />
            Investigation complete{" "}
            {wf.reportExportedAt && (
              <span className="font-mono text-zinc-500">
                {new Date(wf.reportExportedAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "UTC",
                })}{" "}
                UTC
              </span>
            )}
          </div>
          <div className="mt-1 text-[8px] leading-snug text-zinc-500">
            Report exported — MARIS prototype analysis compiled. Not a
            confirmation of spill origin — findings require human validation.
          </div>
          <div className="mt-2 flex gap-1.5">
            <ExportStateBadge
              label="PDF"
              state={exportState("pdf", wf)}
            />
            <ExportStateBadge
              label="JSON"
              state={exportState("json", wf)}
            />
          </div>
        </div>
      )}

      {!wf.reportGenerated && !wf.runningStage && !isAnalyzing && (
        <button
          onClick={startInvestigation}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded border border-orange-500/50 bg-orange-500/10 px-2.5 py-1.5 text-[9px] font-semibold text-orange-400 hover:bg-orange-500/20 transition-colors"
        >
          <Play className="size-2.5" />
          Run Investigation
        </button>
      )}
    </div>
  );
}

function ExportStateBadge({
  label,
  state,
}: {
  label: string;
  state: "exported" | "ready" | "none";
}) {
  const styles =
    state === "exported"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
      : state === "ready"
        ? "border-sky-400/40 bg-sky-400/10 text-sky-300"
        : "border-zinc-700 bg-zinc-900 text-zinc-500";
  const text =
    state === "exported" ? "EXPORTED" : state === "ready" ? "READY" : "NOT EXPORTED";
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-semibold tracking-wider",
        styles,
      )}
    >
      {label}
      {state === "exported" ? (
        <FileCheck2 className="size-2" />
      ) : state === "ready" ? (
        <CircleDashed className="size-2" />
      ) : null}
      {text}
    </span>
  );
}

function exportState(
  format: "pdf" | "json",
  wf: InvestigationWorkflow,
): "exported" | "ready" | "none" {
  const at = format === "pdf" ? wf.pdfExportedAt : wf.jsonExportedAt;
  if (at) return "exported";
  return wf.reportGenerated ? "ready" : "none";
}

function StageRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: StageState;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <StageMark state={state} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-[9px] font-semibold tracking-wider",
              state === "complete"
                ? "text-zinc-300"
                : state === "running"
                  ? "text-orange-300"
                  : "text-zinc-500",
            )}
          >
            {label}
          </span>
          <span
            className={cn(
              "text-[8px] font-semibold uppercase",
              state === "complete"
                ? "text-emerald-500/80"
                : state === "running"
                  ? "text-orange-400"
                  : "text-zinc-700",
            )}
          >
            {state === "complete" ? "Complete" : state === "running" ? "Running" : "Pending"}
          </span>
        </div>
        {state === "running" && (
          <div className="text-[8px] text-zinc-600">{detail}</div>
        )}
      </div>
    </div>
  );
}

function StageMark({ state }: { state: StageState }) {
  if (state === "complete") {
    return <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />;
  }
  if (state === "running") {
    return <Loader2 className="size-3 shrink-0 animate-spin text-orange-400" />;
  }
  if (state === "failed") {
    return <TriangleAlert className="size-3 shrink-0 text-red-400" />;
  }
  return <CircleDashed className="size-3 shrink-0 text-zinc-700" />;
}

function stageState(
  id: InvestigationStageId,
  wf: InvestigationWorkflow,
): StageState {
  if (wf.completedStages.includes(id)) return "complete";
  if (wf.runningStage === id) return "running";
  return "pending";
}
