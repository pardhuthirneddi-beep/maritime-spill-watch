// MARIS — Top header bar
import { Anchor, Clock, Radio, Satellite } from "lucide-react";
import type { OilSpillIncident, PanelView } from "@/data/types";

interface HeaderProps {
  incident: OilSpillIncident | null;
  activeView: PanelView;
  isAnalyzing: boolean;
}

export default function Header({ incident, activeView, isAnalyzing }: HeaderProps) {
  return (
    <header className="relative z-30 flex h-11 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4">
      {/* Left: Incident info */}
      <div className="flex items-center gap-3">
        {incident ? (
          <>
            <div className="flex items-center gap-1.5">
              <Radio className="size-3 text-orange-400 animate-pulse" />
              <span className="text-[10px] font-semibold text-orange-400 uppercase">
                Active Investigation
              </span>
            </div>
            <div className="h-4 w-px bg-zinc-800" />
            <span className="text-[10px] font-mono text-zinc-400">
              #{incident.incidentNumber}
            </span>
            <div className="h-4 w-px bg-zinc-800" />
            <span className="text-[10px] text-zinc-500">
              {incident.coordinates[0].toFixed(4)}°N, {incident.coordinates[1].toFixed(4)}°E
            </span>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <Satellite className="size-3 text-zinc-600" />
            <span className="text-[10px] text-zinc-600">
              No active incident — click Run Investigation
            </span>
          </div>
        )}
      </div>

      {/* Center: Mode badge */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-0.5">
          <div className="size-1.5 rounded-full bg-amber-400" />
          <span className="text-[8px] font-semibold text-amber-400/80 uppercase tracking-wider">
            Demonstration Mode
          </span>
        </div>
      </div>

      {/* Right: Status */}
      <div className="flex items-center gap-3">
        {isAnalyzing && (
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-[9px] text-orange-400/70">Processing</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-zinc-600">
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
