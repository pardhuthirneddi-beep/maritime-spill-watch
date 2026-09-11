// MARIS — Top header bar
import { useState } from "react";
import { Bell, Clock, Radio, Satellite } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dismissNotification,
  markAllNotificationsRead,
  setActiveIncident,
  type IncidentNotification,
} from "@/data/incidentStore";
import type { OilSpillIncident, PanelView } from "@/data/types";

interface HeaderProps {
  incident: OilSpillIncident | null;
  activeView: PanelView;
  isAnalyzing: boolean;
  notifications?: IncidentNotification[];
  onOpenIncident?: () => void;
}

export default function Header({
  incident,
  activeView: _activeView,
  isAnalyzing,
  notifications = [],
  onOpenIncident,
}: HeaderProps) {
  return (
    <header className="relative z-30 flex h-11 items-center justify-between border-b border-sky-200/10 bg-[#050a12] px-4">
      {/* Left: Incident info */}
      <div className="flex items-center gap-3">
        {incident ? (
          <>
            <div className="flex items-center gap-1.5">
              <Radio className="size-3 text-amber-300 animate-pulse" />
              <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider">
                Investigation Active
              </span>
            </div>
            <div className="h-4 w-px bg-sky-200/10" />
            <span className="text-[10px] font-mono text-sky-200/80">
              #{incident.incidentNumber}
            </span>
            <div className="h-4 w-px bg-sky-200/10" />
            <span className="text-[10px] text-zinc-500">
              {incident.coordinates[0].toFixed(4)}°N, {incident.coordinates[1].toFixed(4)}°E
            </span>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <Satellite className="size-3 text-slate-600" />
            <span className="text-[10px] text-zinc-600">
              No active incident — run an investigation to begin
            </span>
          </div>
        )}
      </div>

      {/* Center: Mode badge */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="flex items-center gap-1.5 rounded border border-amber-300/30 bg-amber-300/5 px-2 py-0.5">
          <div className="size-1.5 rounded-full bg-amber-300" />
          <span className="text-[8px] font-semibold text-amber-300/90 uppercase tracking-[0.16em]">
            Demo Data
          </span>
        </div>
      </div>

      {/* Right: notification bell + status */}
      <div className="flex items-center gap-3">
        <NotificationBell
          notifications={notifications}
          onOpenIncident={onOpenIncident}
        />
        {isAnalyzing && (
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 rounded-full bg-amber-300 animate-pulse" />
            <span className="text-[9px] text-amber-300/80">Processing</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-slate-500">
          <Clock className="size-3" />
          <span className="text-[9px] font-mono">
            {new Date().toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })} UTC
          </span>
        </div>
      </div>
    </header>
  );
}

// ─── NOTIFICATION BELL (Prompt-8 §12) ───────────────────────────────
//
// Compact bell icon in the header with an unread counter. Clicking opens
// a closable drawer listing the operational alerts — never a permanently
// displayed card stack.

const BELL_KIND_COLOR: Record<IncidentNotification["kind"], string> = {
  new_incident: "text-orange-400",
  incident_updated: "text-sky-300",
  evidence_added: "text-violet-300",
  candidates_ranked: "text-cyan-300",
  status_changed: "text-amber-300",
};

function NotificationBell({
  notifications,
  onOpenIncident,
}: {
  notifications: IncidentNotification[];
  onOpenIncident?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex size-6 items-center justify-center rounded transition-colors",
          open
            ? "bg-zinc-800 text-zinc-200"
            : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300",
        )}
        title="Operational notifications"
      >
        <Bell className={cn("size-3.5", unread > 0 && "text-orange-400")} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-3 items-center justify-center rounded-full bg-orange-500 text-[7px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away layer */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-8 z-50 w-72 rounded border border-sky-200/10 bg-[#070d16]/97 shadow-xl shadow-black/50 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-sky-200/10 px-3 py-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                Operational Notifications
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-[8px] text-zinc-500 hover:text-zinc-300"
              >
                Close
              </button>
            </div>
            {notifications.length === 0 ? (
              <div className="px-3 py-4 text-center text-[9px] text-zinc-600">
                No notifications
              </div>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto p-1.5">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setActiveIncident(n.incidentId);
                      onOpenIncident?.();
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full rounded border px-2 py-1.5 text-left transition-colors",
                      !n.read
                        ? "border-l-2 border-l-orange-400/70 border-sky-200/10 bg-zinc-900/60"
                        : "border-sky-200/10 bg-zinc-900/30",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-[8px] font-bold uppercase tracking-wider",
                          BELL_KIND_COLOR[n.kind],
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
                ))}
              </div>
            )}
            {notifications.length > 0 && (
              <div className="flex items-center justify-between border-t border-sky-200/10 px-3 py-1.5">
                <button
                  onClick={markAllNotificationsRead}
                  className="text-[8px] text-zinc-500 hover:text-zinc-300"
                >
                  Mark all read
                </button>
                <button
                  onClick={() => {
                    for (const n of notifications) dismissNotification(n.id);
                  }}
                  className="text-[8px] text-zinc-600 hover:text-zinc-300"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
