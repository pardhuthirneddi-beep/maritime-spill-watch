// MARIS — Incident Command panel.
//
// Two views driven entirely by the centralized incident store:
//  1. IncidentCommandStrip — compact command header for the active
//     incident (status lamp, last-updated, location, area, volume,
//     confidence, REQUIRES VALIDATION flag).
//  2. IncidentTimelineView — full event history with real timestamps.
//
// Every displayed value comes from the ManagedIncident record. No fake
// KPI numbers. Wording guardrails: POSSIBLE OIL SLICK / UNVERIFIED /
// REQUIRES VALIDATION — never "confirmed" or "responsible vessel".
import {
  AlertTriangle,
  Clock,
  Crosshair,
  Droplets,
  History,
  ScanEye,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STATUS_LABELS,
  setActiveIncident,
  type ManagedIncident,
  type ManagedTimelineEvent,
} from "@/data/incidentStore";

// ─── STATUS LAMP ─────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  detected: "bg-zinc-400",
  unverified: "bg-amber-400",
  under_investigation: "bg-sky-400",
  evidence_updated: "bg-violet-400",
  candidates_ranked: "bg-cyan-400",
  impact_assessment: "bg-teal-400",
  report_generating: "bg-indigo-400",
  report_ready: "bg-teal-300",
  report_exported: "bg-emerald-400",
  investigation_complete: "bg-emerald-500",
  requires_validation: "bg-orange-500",
};

function StatusLamp({ status }: { status: string }) {
  return (
    <span className="relative flex size-2">
      <span
        className={cn(
          "absolute inline-flex h-full w-full animate-ping rounded-full opacity-40",
          STATUS_COLORS[status] ?? "bg-zinc-400",
        )}
      />
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full",
          STATUS_COLORS[status] ?? "bg-zinc-400",
        )}
      />
    </span>
  );
}

// ─── COMMAND STRIP (compact header) ──────────────────────────────────

interface IncidentCommandStripProps {
  incident: ManagedIncident | null;
  incidents: ManagedIncident[];
  onSelectIncident?: (incidentId: string) => void;
  compact?: boolean;
}

export function IncidentCommandStrip({
  incident,
  incidents,
  onSelectIncident,
  compact,
}: IncidentCommandStripProps) {
  if (!incident) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-zinc-600">
        <AlertTriangle className="size-3" />
        No active incident
      </div>
    );
  }

  return (
    <div className="rounded border border-sky-200/10 bg-[#070d16]/95">
      {/* Identity row */}
      <div className="flex items-center gap-2 border-b border-sky-200/10 px-3 py-2">
        <Crosshair className="size-3.5 text-orange-400" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold text-zinc-100">
              {incident.incidentNumber}
            </span>
            <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-orange-400/90">
              Possible Oil Slick
            </span>
          </div>
          {incidents.length > 1 && onSelectIncident && (
            <select
              value={incident.id}
              onChange={(e) => {
                setActiveIncident(e.target.value);
                onSelectIncident(e.target.value);
              }}
              className="mt-0.5 bg-transparent text-[8px] text-zinc-500 outline-none [&>option]:bg-zinc-900"
            >
              {incidents.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.incidentNumber} — {i.detectionSource}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <StatusLamp status={incident.status} />
          <span className="text-[9px] font-semibold tracking-wider text-amber-300">
            {STATUS_LABELS[incident.status]}
          </span>
        </div>
      </div>

      {/* Vitals */}
      <div
        className={cn(
          "grid gap-px bg-sky-200/5",
          compact ? "grid-cols-4" : "grid-cols-3 sm:grid-cols-6",
        )}
      >
        <Vital
          icon={<Clock className="size-2.5" />}
          label="Last Updated"
          value={fmtUtc(incident.lastUpdatedAt)}
        />
        <Vital
          label="Location"
          value={`${incident.latitude.toFixed(3)}°N ${incident.longitude.toFixed(3)}°E`}
          mono
        />
        {incident.areaKm2 !== null && (
          <Vital
            icon={<Waves className="size-2.5" />}
            label="Area"
            value={`${incident.areaKm2} km²`}
          />
        )}
        {incident.estimatedVolumeM3 !== null && (
          <Vital
            icon={<Droplets className="size-2.5" />}
            label="Est. Volume"
            value={`${incident.estimatedVolumeM3.toLocaleString("en-US")} m³`}
          />
        )}
        {incident.confidence !== null && (
          <Vital
            icon={<ScanEye className="size-2.5" />}
            label="Confidence"
            value={`${incident.confidence}%`}
          />
        )}
        <Vital
          label="Source"
          value={incident.detectionSource}
          truncate
        />
      </div>

      {/* Footer: summary + guardrail flag */}
      <div className="flex items-center gap-2 border-t border-sky-200/10 px-3 py-1.5">
        <span className="text-[9px] leading-tight text-zinc-500">
          {incident.currentSummary}
        </span>
        <span className="ml-auto shrink-0 rounded border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[8px] font-semibold tracking-wider text-orange-400">
          REQUIRES VALIDATION
        </span>
      </div>
    </div>
  );
}

function Vital({
  icon,
  label,
  value,
  mono,
  truncate,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="bg-[#070d16] px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-zinc-600">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-[10px] text-zinc-200",
          mono && "font-mono",
          truncate && "truncate",
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ─── TIMELINE VIEW ───────────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
  info: "bg-zinc-600",
  important: "bg-sky-400",
  critical: "bg-orange-500",
};

export function IncidentTimelineView({
  incident,
  className,
}: {
  incident: ManagedIncident | null;
  className?: string;
}) {
  if (!incident) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-zinc-600">
        <History className="size-3" />
        No incident timeline
      </div>
    );
  }

  const events = [...incident.timeline].sort(
    (a, b) => b.timestamp.localeCompare(a.timestamp),
  );

  return (
    <div className={cn("rounded border border-sky-200/10 bg-[#070d16]/95", className)}>
      <div className="flex items-center justify-between border-b border-sky-200/10 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <History className="size-3 text-sky-300" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
            Incident Timeline
          </span>
        </div>
        <span className="font-mono text-[8px] text-zinc-600">
          {incident.incidentNumber} · {events.length} events
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto p-2">
        <ol className="relative space-y-0">
          {events.map((e, idx) => (
            <TimelineRow
              key={e.id}
              event={e}
              isLast={idx === events.length - 1}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}

function TimelineRow({
  event,
  isLast,
}: {
  event: ManagedTimelineEvent;
  isLast: boolean;
}) {
  return (
    <li className="relative flex gap-2.5 pb-2.5 last:pb-0">
      {/* Connector */}
      {!isLast && (
        <div className="absolute left-[3px] top-2.5 h-full w-px bg-sky-200/10" />
      )}
      <span
        className={cn(
          "relative mt-1.5 size-[7px] shrink-0 rounded-full",
          SEVERITY_COLOR[event.severity] ?? "bg-zinc-600",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[9px] font-semibold text-zinc-300">
            {fmtUtc(event.timestamp)}
          </span>
          <span className="text-[8px] font-semibold uppercase tracking-wider text-zinc-600">
            {event.eventType}
          </span>
          <span className="ml-auto hidden text-[8px] text-zinc-700 sm:block">
            {event.source}
          </span>
        </div>
        <div className="mt-0.5 text-[10px] leading-snug text-zinc-400">
          {event.description}
        </div>
      </div>
    </li>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────

function fmtUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}
