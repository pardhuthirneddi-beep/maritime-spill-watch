// MARIS — Operational notification rail (command-center alerts).
//
// Compact, persistent, non-blocking: sits above the map as a technical
// alert stack — never a web-app toast. Each alert links to its incident.
import { useState } from "react";
import {
  BellOff,
  ChevronDown,
  ChevronUp,
  Radar,
  RefreshCw,
  Target,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dismissNotification,
  markAllNotificationsRead,
  setActiveIncident,
} from "@/data/incidentStore";
import type { IncidentNotification } from "@/data/incidentStore";

interface NotificationRailProps {
  notifications: IncidentNotification[];
  activeIncidentId: string | null;
  /** Called when the user follows an alert to its incident (e.g. to switch views). */
  onOpenIncident?: (incidentId: string) => void;
}

const KIND_STYLES: Record<
  IncidentNotification["kind"],
  { color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  new_incident: { color: "text-orange-400", icon: Radar },
  incident_updated: { color: "text-sky-300", icon: RefreshCw },
  evidence_added: { color: "text-violet-300", icon: Target },
  candidates_ranked: { color: "text-cyan-300", icon: Target },
  status_changed: { color: "text-amber-300", icon: RefreshCw },
};

export default function NotificationRail({
  notifications,
  activeIncidentId,
  onOpenIncident,
}: NotificationRailProps) {
  const [expanded, setExpanded] = useState(true);
  const unread = notifications.filter((n) => !n.read).length;

  if (notifications.length === 0) return null;

  return (
    <div className="absolute left-3 top-3 z-20 w-64 pointer-events-none">
      <div className="pointer-events-auto rounded border border-sky-200/10 bg-[#070d16]/95 shadow-lg shadow-black/40 backdrop-blur-sm">
        {/* Header */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center gap-2 border-b border-sky-200/10 px-2.5 py-1.5"
        >
          <Radar
            className={cn(
              "size-3 text-orange-400",
              unread > 0 && "animate-pulse",
            )}
          />
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
            Operational Alerts
          </span>
          {unread > 0 && (
            <span className="rounded bg-orange-500/20 px-1 text-[8px] font-bold text-orange-300">
              {unread}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="ml-auto size-3 text-zinc-600" />
          ) : (
            <ChevronDown className="ml-auto size-3 text-zinc-600" />
          )}
        </button>

        {expanded && (
          <>
            <div className="max-h-56 space-y-1 overflow-y-auto p-1.5">
              {notifications.map((n) => {
                const style = KIND_STYLES[n.kind];
                const Icon = style.icon;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "group rounded border px-2 py-1.5 transition-colors",
                      n.incidentId === activeIncidentId
                        ? "border-orange-500/30 bg-orange-500/5"
                        : "border-sky-200/10 bg-zinc-900/40",
                      !n.read && "border-l-2 border-l-orange-400/70",
                    )}
                  >
                    <button
                      onClick={() => {
                        setActiveIncident(n.incidentId);
                        onOpenIncident?.(n.incidentId);
                      }}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className={cn("size-2.5", style.color)} />
                        <span
                          className={cn(
                            "text-[8px] font-bold uppercase tracking-wider",
                            style.color,
                          )}
                        >
                          {n.title}
                        </span>
                        <span className="ml-auto font-mono text-[8px] text-zinc-600">
                          {new Date(n.timestamp).toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "UTC",
                          })}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[9px] text-zinc-300">
                        {n.incidentNumber}
                      </div>
                      <div className="text-[9px] leading-tight text-zinc-500">
                        {n.detail}
                      </div>
                    </button>
                    <button
                      onClick={() => dismissNotification(n.id)}
                      className="absolute right-3 mt-1 hidden text-zinc-600 hover:text-zinc-300 group-hover:block"
                      title="Dismiss"
                    >
                      <X className="size-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-sky-200/10 px-2.5 py-1">
              <button
                onClick={markAllNotificationsRead}
                className="text-[8px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Mark all read
              </button>
              <span className="text-[8px] text-zinc-700">
                {notifications.length} event
                {notifications.length === 1 ? "" : "s"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Silence unused-import lint for the icon set if a kind is ever removed.
void BellOff;
