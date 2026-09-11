// MARIS — Automatic operational incident alert (Prompt-9 §4/§5).
//
// When the Command Center opens with an UNVERIFIED, unacknowledged demo
// incident, this alert appears AUTOMATICALLY in the upper-right area of
// the map — no notification-bell click required. It overlays the map
// without permanently shrinking it and is dismissed with × or VIEW
// INCIDENT (which marks the alert read). All displayed values come from
// the actual incident state — never hard-coded KPIs.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STATUS_LABELS,
  markNotificationRead,
  setActiveIncident,
  type ManagedIncident,
  type IncidentNotification,
} from "@/data/incidentStore";

interface IncidentAlertOverlayProps {
  incident: ManagedIncident | null;
  notifications: IncidentNotification[];
  /** Called when the user follows the alert into the incident view. */
  onViewIncident?: () => void;
}

export default function IncidentAlertOverlay({
  incident,
  notifications,
  onViewIncident,
}: IncidentAlertOverlayProps) {
  // The auto-alert is driven by the incident's own unacknowledged
  // new-incident notification — real store state, not local fake state.
  const alert = notifications.find(
    (n) =>
      n.kind === "new_incident" &&
      !n.read &&
      (incident ? n.incidentId === incident.id : true),
  );

  // The IncidentCommand strip already occupies the upper-right once the
  // user has interacted; to avoid stacking, the auto-alert dismisses
  // itself whenever the incident becomes acknowledged. Local hide state
  // only covers the × button within this session view.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!alert) setHidden(false);
  }, [alert?.id]);

  if (!incident || !alert || hidden) return null;

  return (
    <div className="absolute right-3 top-[8.5rem] z-30 w-72 pointer-events-auto">
      <div className="rounded border border-orange-500/40 bg-[#070d16]/97 shadow-xl shadow-black/50 backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-orange-500/30 px-3 py-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-40" />
            <span className="relative inline-flex size-2 rounded-full bg-orange-500" />
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-orange-400">
            New Maritime Incident
          </span>
          <button
            onClick={() => setHidden(true)}
            className="ml-auto text-zinc-500 hover:text-zinc-200 transition-colors"
            title="Dismiss alert"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Identity */}
        <div className="px-3 py-2">
          <div className="font-mono text-[12px] font-semibold text-zinc-100">
            {incident.incidentNumber}
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-orange-400/90">
            Possible Oil Slick
          </div>
        </div>

        {/* Fields — all from actual incident state */}
        <div className="space-y-1.5 border-t border-sky-200/10 px-3 py-2">
          <AlertField label="Status">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-amber-400" />
              <span className="text-[9px] font-semibold tracking-wider text-amber-300">
                {STATUS_LABELS[incident.status]}
              </span>
            </span>
          </AlertField>
          <AlertField label="Detected">
            <span className="font-mono text-[9px] text-zinc-300">
              {fmtUtcDateTime(incident.detectedAt)}
            </span>
          </AlertField>
          <AlertField label="Location">
            <span className="font-mono text-[9px] text-zinc-300">
              {incident.latitude.toFixed(3)}°N {incident.longitude.toFixed(3)}°E
            </span>
          </AlertField>
          {incident.areaKm2 !== null && (
            <AlertField label="Est. Area">
              <span className="font-mono text-[9px] text-zinc-300">
                {incident.areaKm2} km²
              </span>
            </AlertField>
          )}
          {incident.estimatedVolumeM3 !== null && (
            <AlertField label="Est. Volume">
              <span className="font-mono text-[9px] text-zinc-300">
                {incident.estimatedVolumeM3.toLocaleString("en-US")} m³
              </span>
            </AlertField>
          )}
          {incident.confidence !== null && (
            <AlertField label="Confidence">
              <span className="font-mono text-[9px] text-zinc-300">
                {incident.confidence}%
              </span>
            </AlertField>
          )}
          <div className="pt-0.5">
            <span className="rounded border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[8px] font-semibold tracking-wider text-orange-400">
              Requires Validation
            </span>
          </div>
        </div>

        {/* Action */}
        <div className="border-t border-sky-200/10 px-3 py-2">
          <button
            onClick={() => {
              setActiveIncident(incident.id);
              markNotificationRead(alert.id);
              onViewIncident?.();
            }}
            className={cn(
              "w-full rounded border border-orange-500/50 bg-orange-500/10 px-2.5 py-1.5",
              "text-[9px] font-semibold tracking-wider text-orange-400",
              "hover:bg-orange-500/20 hover:border-orange-500/70 transition-colors",
            )}
          >
            View Incident
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[8px] uppercase tracking-wider text-zinc-600">
        {label}
      </span>
      {children}
    </div>
  );
}

function fmtUtcDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    }) +
    " " +
    d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) +
    " UTC"
  );
}
