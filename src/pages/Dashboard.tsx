// MARIS — Main Dashboard
// Orchestrates the complete investigation interface
import { useState, useCallback, useRef } from "react";
import MapView from "@/components/maris/MapView";
import Sidebar from "@/components/maris/Sidebar";
import Header from "@/components/maris/Header";
import RightPanel from "@/components/maris/RightPanel";
import {
  DEMO_INCIDENT,
  DEMO_VESSELS,
  DEMO_ATTRIBUTIONS,
  DEMO_ANOMALIES,
  DEMO_ENVIRONMENTAL,
  DEMO_DRIFT,
  DEMO_HYPERSPECTRAL,
  DEMO_TIMELINE,
} from "@/data/demoData";
import {
  generateJsonReport,
  generatePdfReport,
} from "@/data/reportGenerator";
import type {
  AisVessel,
  MapLayer,
  PanelView,
  InvestigationState,
} from "@/data/types";

const INITIAL_LAYERS: MapLayer[] = [
  { id: "sar", label: "SAR", enabled: true, category: "satellite" },
  { id: "optical", label: "Optical", enabled: false, category: "satellite" },
  { id: "spill", label: "Oil Spill", enabled: true, category: "analysis" },
  { id: "vessels", label: "AIS Vessels", enabled: true, category: "analysis" },
  { id: "tracks", label: "Vessel Tracks", enabled: true, category: "analysis" },
  { id: "wind", label: "Wind", enabled: false, category: "environment" },
  { id: "currents", label: "Ocean Current", enabled: false, category: "environment" },
  { id: "driftForward", label: "Drift Forecast", enabled: false, category: "analysis" },
  { id: "driftBacktrack", label: "Drift Backtrack", enabled: false, category: "analysis" },
  { id: "thickness", label: "Oil Thickness", enabled: false, category: "analysis" },
  { id: "impactZone", label: "Impact Zone", enabled: false, category: "analysis" },
];

export default function Dashboard() {
  // Investigation state
  const [state, setState] = useState<InvestigationState>({
    incident: null,
    vessels: [],
    attributions: [],
    selectedVessel: null,
    behaviorAnomalies: [],
    environmental: DEMO_ENVIRONMENTAL,
    driftResult: null,
    hyperspectral: null,
    timeline: [],
    isAnalyzing: false,
    analysisStep: "",
    analysisProgress: 0,
  });

  const [layers, setLayers] = useState<MapLayer[]>(INITIAL_LAYERS);
  const [activeView, setActiveView] = useState<PanelView>("overview");

  // Analysis simulation steps
  const ANALYSIS_STEPS = [
    { step: "Loading SAR satellite imagery...", progress: 5 },
    { step: "Preprocessing — noise reduction...", progress: 10 },
    { step: "Sea/background segmentation...", progress: 15 },
    { step: "Extracting dark-region candidates...", progress: 20 },
    { step: "Shape analysis & contextual filtering...", progress: 28 },
    { step: "Generating oil-slick polygon...", progress: 35 },
    { step: "Calculating spill area & length...", progress: 40 },
    { step: "Assigning detection confidence...", progress: 45 },
    { step: "Correlating AIS vessel data...", progress: 55 },
    { step: "Computing vessel trajectories...", progress: 60 },
    { step: "Running source attribution engine...", progress: 70 },
    { step: "Drift backtracking analysis...", progress: 78 },
    { step: "Forward drift prediction...", progress: 82 },
    { step: "AIS behaviour anomaly analysis...", progress: 88 },
    { step: "Hyperspectral thickness estimation...", progress: 94 },
    { step: "Generating investigation report...", progress: 98 },
    { step: "Investigation complete.", progress: 100 },
  ];

  const runInvestigation = useCallback(async () => {
    setState((s) => ({
      ...s,
      isAnalyzing: true,
      incident: null,
      vessels: [],
      attributions: [],
      selectedVessel: null,
      behaviorAnomalies: [],
      driftResult: null,
      hyperspectral: null,
      timeline: [],
    }));

    for (const { step, progress } of ANALYSIS_STEPS) {
      setState((s) => ({ ...s, analysisStep: step, analysisProgress: progress }));
      await new Promise((r) => setTimeout(r, 350));

      // Load data at specific progress points
      if (progress === 40) {
        setState((s) => ({ ...s, incident: DEMO_INCIDENT }));
      }
      if (progress === 60) {
        setState((s) => ({ ...s, vessels: DEMO_VESSELS }));
      }
      if (progress === 70) {
        setState((s) => ({ ...s, attributions: DEMO_ATTRIBUTIONS }));
      }
      if (progress === 78) {
        setState((s) => ({
          ...s,
          driftResult: DEMO_DRIFT,
        }));
      }
      if (progress === 88) {
        setState((s) => ({
          ...s,
          behaviorAnomalies: DEMO_ANOMALIES,
        }));
      }
      if (progress === 94) {
        setState((s) => ({ ...s, hyperspectral: DEMO_HYPERSPECTRAL }));
      }
      if (progress === 98) {
        setState((s) => ({ ...s, timeline: DEMO_TIMELINE }));
      }
    }

    setState((s) => ({
      ...s,
      isAnalyzing: false,
      analysisStep: "",
      analysisProgress: 100,
    }));
    setActiveView("overview");
  }, []);

  const handleLayerToggle = useCallback((id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l))
    );
  }, []);

  const handleVesselSelect = useCallback((vessel: AisVessel) => {
    setState((s) => ({ ...s, selectedVessel: vessel }));
    setActiveView("vessel");
  }, []);

  const handleDownloadPdf = useCallback(() => {
    const reportData = {
      incident: state.incident!,
      vessels: state.vessels,
      attributions: state.attributions,
      anomalies: state.behaviorAnomalies,
      environmental: state.environmental,
      drift: state.driftResult,
      hyperspectral: state.hyperspectral,
      timeline: state.timeline,
    };
    const doc = generatePdfReport(reportData);
    doc.save(`MARIS-Incident-${state.incident?.incidentNumber || "report"}.pdf`);
  }, [state]);

  const handleDownloadJson = useCallback(() => {
    const reportData = {
      incident: state.incident!,
      vessels: state.vessels,
      attributions: state.attributions,
      anomalies: state.behaviorAnomalies,
      environmental: state.environmental,
      drift: state.driftResult,
      hyperspectral: state.hyperspectral,
      timeline: state.timeline,
    };
    const json = generateJsonReport(reportData);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MARIS-${state.incident?.incidentNumber || "report"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const hasData = state.incident !== null;

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Header */}
      <Header
        incident={state.incident}
        activeView={activeView}
        isAnalyzing={state.isAnalyzing}
      />

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          layers={layers}
          onLayerToggle={handleLayerToggle}
          activeView={activeView}
          onViewChange={setActiveView}
          incident={state.incident}
          onRunInvestigation={runInvestigation}
          isAnalyzing={state.isAnalyzing}
        />

        {/* Map */}
        <main className="relative flex-1 overflow-hidden">
          <MapView
            incident={state.incident}
            vessels={state.vessels}
            layers={layers}
            selectedVessel={state.selectedVessel}
            driftResult={state.driftResult}
            hyperspectral={state.hyperspectral}
            environmental={state.environmental}
            onVesselSelect={handleVesselSelect}
          />

          {/* Pre-investigation overlay */}
          {!hasData && !state.isAnalyzing && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
              <div className="text-center max-w-md">
                <div className="flex justify-center mb-4">
                  <div className="flex size-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
                    <svg
                      viewBox="0 0 24 24"
                      className="size-8 text-orange-400/60"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
                    </svg>
                  </div>
                </div>
                <h2 className="text-lg font-semibold text-zinc-200 mb-1">
                  AI-powered maritime intelligence
                </h2>
                <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
                  Detect possible oil spills from satellite imagery, correlate vessel
                  movements, model drift, estimate thickness, and identify the
                  probable source — fully explained.
                </p>
                <button
                  onClick={runInvestigation}
                  className="inline-flex items-center gap-2 rounded border border-orange-500/50 bg-orange-500/10 px-4 py-2 text-[11px] font-medium text-orange-400 hover:bg-orange-500/20 transition-colors"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                  Run Investigation
                </button>
                <p className="text-[9px] text-zinc-600 mt-3">
                  Uses demonstration data — no live satellite feeds
                </p>
              </div>
            </div>
          )}

          {/* Analysis overlay */}
          {state.isAnalyzing && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/50 backdrop-blur-sm">
              <div className="text-center">
                <div className="flex justify-center mb-3">
                  <div className="size-10 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />
                </div>
                <div className="text-[11px] text-zinc-300 font-medium mb-1">
                  {state.analysisStep}
                </div>
                <div className="text-[9px] text-zinc-600">
                  {state.analysisProgress}% complete
                </div>
              </div>
            </div>
          )}

          {/* Map legend */}
          {hasData && (
            <div className="absolute bottom-3 left-3 z-10 rounded border border-zinc-800 bg-zinc-950/90 px-2 py-1.5 text-[8px] text-zinc-500 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-sm bg-orange-500/50 border border-orange-500" />
                Oil Spill Polygon
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-blue-400" />
                AIS Vessel
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-cyan-400" />
                Selected Vessel
              </div>
            </div>
          )}
        </main>

        {/* Right Panel */}
        {(hasData || state.isAnalyzing) && (
          <RightPanel
            view={activeView}
            incident={state.incident}
            vessels={state.vessels}
            selectedVessel={state.selectedVessel}
            attributions={state.attributions}
            anomalies={state.behaviorAnomalies}
            environmental={state.environmental}
            driftResult={state.driftResult}
            hyperspectral={state.hyperspectral}
            timeline={state.timeline}
            analysisStep={state.analysisStep}
            analysisProgress={state.analysisProgress}
            isAnalyzing={state.isAnalyzing}
            onVesselSelect={handleVesselSelect}
            onClose={() => {}}
            onDownloadPdf={handleDownloadPdf}
            onDownloadJson={handleDownloadJson}
          />
        )}
      </div>
    </div>
  );
}
