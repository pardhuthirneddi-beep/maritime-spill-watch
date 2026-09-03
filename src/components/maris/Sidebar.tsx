// MARIS — Command sidebar with navigation, stats, and layer controls
import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Anchor,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Compass,
  Crosshair,
  FileText,
  Globe,
  Layers,
  Radar,
  ScanEye,
  Ship,
  Target,
  Thermometer,
  Wind,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapLayer, PanelView, OilSpillIncident } from "@/data/types";

interface SidebarProps {
  layers: MapLayer[];
  onLayerToggle: (id: string) => void;
  activeView: PanelView;
  onViewChange: (view: PanelView) => void;
  incident: OilSpillIncident | null;
  onRunInvestigation: () => void;
  isAnalyzing: boolean;
}

const NAV_ITEMS: {
  id: PanelView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "overview", label: "Command Center", icon: Crosshair },
  { id: "satellite", label: "Satellite Analysis", icon: Radar },
  { id: "vessel", label: "AIS Intelligence", icon: Ship },
  { id: "attribution", label: "Source Attribution", icon: Target },
  { id: "drift", label: "Drift Model", icon: Wind },
  { id: "thickness", label: "Hyperspectral", icon: Thermometer },
  { id: "timeline", label: "Timeline", icon: BarChart3 },
  { id: "report", label: "Report", icon: FileText },
];

const EXTERNAL_VIEWS = [
  { path: "/sar", label: "SAR Analysis", icon: ScanEye, desc: "Scientific imagery viewer" },
  { path: "/3d", label: "3D Intelligence", icon: Globe, desc: "Geospatial globe" },
];

export default function Sidebar({
  layers,
  onLayerToggle,
  activeView,
  onViewChange,
  incident,
  onRunInvestigation,
  isAnalyzing,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [layersOpen, setLayersOpen] = useState(true);
  const navigate = useNavigate();

  return (
    <aside
      className={cn(
        "relative z-20 flex h-full flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200",
        collapsed ? "w-12" : "w-64"
      )}
    >
      {/* Branding */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-3">
        <div className="flex size-7 items-center justify-center rounded bg-orange-500/20">
          <Anchor className="size-3.5 text-orange-400" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-[11px] font-semibold tracking-[0.2em] text-zinc-300 lowercase">
              maris
            </h1>
            <p className="text-[8px] text-zinc-500 leading-none">
              Oil Spill Intelligence
            </p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform",
              collapsed ? "" : "rotate-180"
            )}
          />
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* Command Center Stats */}
          {incident && (
            <div className="border-b border-zinc-800 px-3 py-3">
              <h2 className="mb-2 text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">
                Active Incident
              </h2>
              <div className="space-y-1.5">
                <StatRow
                  label="Possible Spills"
                  value="1"
                  color="text-orange-400"
                />
                <StatRow
                  label="Confidence"
                  value={`${incident.confidence.score}%`}
                  color="text-emerald-400"
                />
                <StatRow
                  label="Area"
                  value={`${incident.polygon.areaKm2} km²`}
                  color="text-zinc-300"
                />
                <StatRow
                  label="Vessels"
                  value="5"
                  color="text-blue-400"
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="border-b border-zinc-800 px-1 py-2">
            <h2 className="mb-1 px-2 text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">
              Workspace
            </h2>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] transition-colors",
                    activeView === item.id
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Layer Controls */}
          <div className="border-b border-zinc-800 px-1 py-2">
            <button
              onClick={() => setLayersOpen(!layersOpen)}
              className="flex w-full items-center gap-1.5 px-2 text-[9px] font-semibold text-zinc-500 uppercase tracking-wider"
            >
              <Layers className="size-3" />
              Layers
              {layersOpen ? (
                <ChevronDown className="size-3 ml-auto" />
              ) : (
                <ChevronRight className="size-3 ml-auto" />
              )}
            </button>
            {layersOpen && (
              <div className="mt-1 space-y-0.5">
                {layers.map((layer) => (
                  <button
                    key={layer.id}
                    onClick={() => onLayerToggle(layer.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
                  >
                    <div
                      className={cn(
                        "size-3 rounded-sm border transition-colors",
                        layer.enabled
                          ? "border-orange-500 bg-orange-500/30"
                          : "border-zinc-600"
                      )}
                    >
                      {layer.enabled && (
                        <div className="size-full flex items-center justify-center text-[8px] text-orange-400">
                          ✓
                        </div>
                      )}
                    </div>
                    {layer.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* External Views */}
          <div className="border-b border-zinc-800 px-1 py-2">
            <h2 className="mb-1 px-2 text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">
              Visualization
            </h2>
            {EXTERNAL_VIEWS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
                >
                  <Icon className="size-3.5 shrink-0" />
                  <div className="min-w-0">
                    <div>{item.label}</div>
                    <div className="text-[8px] text-zinc-600">{item.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Demo Button */}
          <div className="mt-auto px-3 py-3">
            <button
              onClick={onRunInvestigation}
              disabled={isAnalyzing}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-[11px] font-medium transition-all",
                isAnalyzing
                  ? "border-zinc-700 bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "border-orange-500/50 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/70"
              )}
            >
              {isAnalyzing ? (
                <>
                  <div className="size-3 rounded-full border-2 border-zinc-500 border-t-zinc-300 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Compass className="size-3.5" />
                  Run Investigation
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Collapsed icons */}
      {collapsed && (
        <div className="flex flex-1 flex-col items-center gap-1 py-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "flex size-8 items-center justify-center rounded transition-colors",
                  activeView === item.id
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                )}
                title={item.label}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
          <div className="my-1 h-px w-6 bg-zinc-800" />
          {EXTERNAL_VIEWS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex size-8 items-center justify-center rounded text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 transition-colors"
                title={item.label}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className={cn("text-[11px] font-semibold", color)}>{value}</span>
    </div>
  );
}
