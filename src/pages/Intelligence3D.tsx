// MARIS — 3D Intelligence route
// Composes the Cesium-based spatial investigation environment with the same
// shared demo investigation data used by SAR + 2D map. No separate dataset.
import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import Globe3DView from "@/components/maris/Globe3DView";
import {
  DEMO_INCIDENT,
  DEMO_VESSELS,
  DEMO_ATTRIBUTIONS,
  DEMO_ENVIRONMENTAL,
  DEMO_DRIFT,
} from "@/data/demoData";
import type { Globe3dLayer } from "@/data/globe3dTypes";

const INITIAL_GLOBE_LAYERS: Globe3dLayer[] = [
  { id: "globe_vessels", label: "Vessels", enabled: true },
  { id: "globe_tracks", label: "Vessel Tracks", enabled: true },
  { id: "globe_spill", label: "Oil Spill", enabled: true },
  { id: "globe_satellite", label: "SAR Swath", enabled: true },
  { id: "globe_boundaries", label: "Investigation Area", enabled: true },
  { id: "globe_grid", label: "Evidence Markers", enabled: true },
  { id: "globe_detection_zones", label: "Drift Forecast", enabled: false },
  { id: "globe_correlation", label: "Source Correlation", enabled: true },
];

export default function Intelligence3D() {
  const navigate = useNavigate();
  // Demo incident is pre-loaded — the 3D environment is investigation data,
  // not an entry point (same model as the SAR viewer).
  const incident = DEMO_INCIDENT;
  const [selectedVesselMmsi, setSelectedVesselMmsi] = useState<string | null>(
    DEMO_ATTRIBUTIONS[0]?.vesselId ?? null,
  );
  const [layers, setLayers] = useState<Globe3dLayer[]>(INITIAL_GLOBE_LAYERS);

  const handleLayerToggle = useCallback((id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)),
    );
  }, []);

  const handleVesselSelect = useCallback((mmsi: string | null) => {
    setSelectedVesselMmsi(mmsi);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#050a12] text-zinc-100 overflow-hidden">
      {/* Slim header — mirrors the SAR workstation chrome */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-sky-200/10 bg-[#0a0b10] px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/app")}
            className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back
          </button>
          <div className="h-4 w-px bg-zinc-800" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300">
            3D Intelligence
          </span>
          <div className="h-4 w-px bg-zinc-800" />
          <span className="text-[9px] font-mono text-zinc-600">
            {incident.incidentNumber} · {incident.polygon.center[0].toFixed(3)}°N{" "}
            {incident.polygon.center[1].toFixed(3)}°E
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/sar")}
            className="rounded border border-sky-200/10 px-2 py-1 text-[9px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
          >
            SAR Imagery
          </button>
          <button
            onClick={() => navigate("/app")}
            className="rounded border border-sky-200/10 px-2 py-1 text-[9px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
          >
            2D Command Center
          </button>
        </div>
      </header>

      {/* Full-bleed 3D scene */}
      <div className="relative flex-1 overflow-hidden">
        <Globe3DView
          incident={incident}
          vessels={DEMO_VESSELS}
          attributions={DEMO_ATTRIBUTIONS}
          driftResult={DEMO_DRIFT}
          environmental={DEMO_ENVIRONMENTAL}
          layers={layers}
          onLayerToggle={handleLayerToggle}
          selectedVesselMmsi={selectedVesselMmsi}
          onVesselSelect={handleVesselSelect}
          onBackTo2d={() => navigate("/app")}
        />
      </div>
    </div>
  );
}
