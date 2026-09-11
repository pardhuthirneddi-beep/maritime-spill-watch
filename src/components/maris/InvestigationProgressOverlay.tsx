// MARIS — floating Investigation Progress overlay (Prompt 11 UX fix).
//
// Purely a VISIBILITY control. The panel shows the real centralized
// workflow state (workflowProgressPct / runningStage) and never mutates
// it: minimizing or closing hides UI only — the investigation keeps
// running in the background and the reopened panel reflects the latest
// actual progress.
//
// Modes:
//   open      — compact panel (never a modal, never covers the map)
//   minimized — one-row status bar
//   closed    — small unobtrusive "PROGRESS 40%" pill to reopen
import { useEffect, useRef, useState } from "react";
import {
  CircleDashed,
  Compass,
  FileCheck2,
  Loader2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INVESTIGATION_STAGES,
  investigationComplete,
  workflowProgressPct,
  type ManagedIncident,
} from "@/data/incidentStore";

type PanelMode = "open" | "minimized" | "closed";

export function InvestigationProgressOverlay({
  incident,
  isAnalyzing,
}: {
  incident: ManagedIncident | null;
  isAnalyzing?: boolean;
}) {
  const [mode, setMode] = useState<PanelMode>("closed");
  const running = !!incident?.workflow.runningStage || !!isAnalyzing;

  // Auto-open exactly when an investigation STARTS (idle → running).
  // Never re-opens on its own afterwards — visibility stays under the
  // operator's control while the pipeline continues in the background.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (running && !wasRunning.current) setMode("open");
    wasRunning.current = running;
  }, [running]);

  if (!incident) return null;

  const wf = incident.workflow;
  const pct = workflowProgressPct(wf);
  const complete = investigationComplete(wf);
  const hasActivity = running || pct > 0;

  // Nothing to show: no investigation yet, panel closed.
  if (!hasActivity) return null;

  // ── CLOSED: small unobtrusive reopen pill ──────────────────────────
  if (mode === "closed") {
    return (
      <button
        onClick={() => setMode("open")}
        className="pointer-events-auto absolute left-3 top-3 z-20 flex items-center gap-2 rounded border border-sky-200/10 bg-[#070d16]/95 px-2.5 py-1.5 shadow-lg shadow-black/40 backdrop-blur-sm transition-colors hover:border-sky-400/40"
        title="Reopen investigation progress"
      >
        {running ? (
          <Loader2 className="size-3 animate-spin text-orange-400" />
        ) : complete ? (
          <FileCheck2 className="size-3 text-emerald-400" />
        ) : (
          <Compass className="size-3 text-orange-400" />
        )}
        <span className="text-[8px] font-semibold uppercase tracking-wider text-zinc-500">
          {complete ? "Investigation" : "Progress"}
        </span>
        <span className="font-mono text-[10px] font-semibold text-zinc-200">
          {pct}%
        </span>
      </button>
    );
  }

  // ── MINIMIZED: one-row compact status bar ──────────────────────────
  if (mode === "minimized") {
    const step = currentStepLabel(wf, complete);
    return (
      <div className="pointer-events-auto absolute left-3 top-3 z-20 flex w-56 items-center gap-2 rounded border border-sky-200/10 bg-[#070d16]/95 px-2.5 py-1.5 shadow-lg shadow-black/40 backdrop-blur-sm">
        {running && (
          <Loader2 className="size-3 shrink-0 animate-spin text-orange-400" />
        )}
        <span className="text-[8px] font-semibold uppercase tracking-wider text-zinc-500">
          Investigation
        </span>
        <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
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
        <span className="font-mono text-[10px] font-semibold text-zinc-200">
          {pct}%
        </span>
        <button
          onClick={() => setMode("open")}
          className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          title="Expand"
        >
          <Plus className="size-3" />
        </button>
        {step && !running && !complete && (
          <span className="sr-only">{step}</span>
        )}
      </div>
    );
  }

  // ── OPEN: compact floating panel ───────────────────────────────────
  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-20 w-60 max-w-[calc(100vw-6rem)] rounded border border-sky-200/10 bg-[#070d16]/95 shadow-lg shadow-black/40 backdrop-blur-sm">
      {/* Header: title + pct + minimize/close */}
      <div className="flex items-center gap-2 border-b border-sky-200/10 px-2.5 py-1.5">
        <Compass className="size-3 shrink-0 text-orange-400" />
        <span className="min-w-0 flex-1 truncate text-[9px] font-semibold uppercase tracking-wider text-zinc-300">
          Investigation Progress
        </span>
        <span className="font-mono text-[10px] font-semibold text-zinc-200">
          {pct}%
        </span>
        <button
          onClick={() => setMode("minimized")}
          className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          title="Minimize"
        >
          <Minus className="size-3" />
        </button>
        <button
          onClick={() => setMode("closed")}
          className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          title="Close (investigation continues)"
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Progress bar + current step (REAL pipeline state) */}
      <div className="px-2.5 py-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
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
        <div className="mt-1.5 flex items-center gap-1.5 text-[8px] uppercase tracking-wider">
          {complete ? (
            <>
              <FileCheck2 className="size-2.5 text-emerald-400" />
              <span className="font-semibold text-emerald-400">
                Investigation complete
              </span>
            </>
          ) : wf.reportGenerated ? (
            <>
              <span className="font-semibold text-teal-300">
                Report ready — export required
              </span>
            </>
          ) : wf.runningStage ? (
            <>
              <Loader2 className="size-2.5 animate-spin text-orange-400" />
              <span className="font-semibold text-orange-300">
                {INVESTIGATION_STAGES.find((s) => s.id === wf.runningStage)
                  ?.label ?? "Running"}
              </span>
            </>
          ) : (
            <span className="text-zinc-600">Pipeline idle</span>
          )}
        </div>
        {complete && (
          <div className="mt-0.5 text-[8px] text-zinc-500">
            Requires validation
          </div>
        )}
      </div>
    </div>
  );
}

function currentStepLabel(
  wf: ManagedIncident["workflow"],
  complete: boolean,
): string | null {
  if (complete) return "INVESTIGATION COMPLETE";
  if (wf.reportGenerated) return "REPORT READY";
  if (wf.runningStage)
    return (
      INVESTIGATION_STAGES.find((s) => s.id === wf.runningStage)?.label ?? null
    );
  return null;
}
