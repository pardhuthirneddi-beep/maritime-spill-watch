// MARIS — Command Center incident workflow (Prompt 8).
//
// Compact operational status bar + investigation progress, rendered from
// the centralized incident store's ACTUAL pipeline state. The progress
// percentage corresponds to real completed investigation stages — never a
// decorative 0→100 animation. The map remains dominant; these components
// are deliberately small.
import {
  CircleDashed,
  Compass,
  FileCheck2,
  Loader2,
  Play,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INVESTIGATION_STAGES,
  STATUS_LABELS,
  startInvestigation,
  resetInvestigation,
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
}: {
  incident: ManagedIncident | null;
  isAnalyzing?: boolean;
}) {
  if (!incident) return null;

  const wf = incident.workflow;
  const pct = workflowProgressPct(wf);
  const running = wf.runningStage;
  const stage = INVESTIGATION_STAGES.find((s) => s.id === running) ?? null;
  const complete = wf.reportGenerated;

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
              ? "REPORT GENERATED"
              : running
                ? `CURRENT STEP — ${stage?.label ?? ""}`
                : "PIPELINE IDLE"}
          </span>
          {complete ? (
            <span className="flex items-center gap-1 text-emerald-400/90">
              <FileCheck2 className="size-2.5" />
              Requires validation
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

function StatusLamp({
  status,
  analyzing,
}: {
  status: string;
  analyzing?: boolean;
}) {
  const color = analyzing
    ? "bg-sky-400"
    : status === "requires_validation"
      ? "bg-emerald-400"
      : status === "report_ready"
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
  const complete = wf.reportGenerated;

  if (complete) {
    return (
      <span className="flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-semibold text-emerald-400">
        <FileCheck2 className="size-3" />
        Investigation Complete
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

      {wf.reportGenerated && (
        <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold text-emerald-400">
            <FileCheck2 className="size-3" />
            Report generated{" "}
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
            MARIS prototype analysis complete. Not a confirmation of spill
            origin — findings require human validation.
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
