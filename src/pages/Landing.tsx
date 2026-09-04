// maris — Landing page
import { ArrowRight, Globe, Layers, Radio, ScanEye, Shield, Target, Wind } from "lucide-react";
import { useNavigate } from "react-router";

const FEATURES = [
  {
    icon: Layers,
    title: "Satellite Oil Spill Detection",
    desc: "SAR synthetic-aperture radar analysis with dark-spot extraction, shape classification, and contextual filtering to identify possible oil slicks with quantified confidence.",
  },
  {
    icon: Target,
    title: "Probable Source Attribution",
    desc: "Multi-factor scoring engine ranks candidate vessels by distance, trajectory alignment, temporal proximity, heading consistency, drift correlation, and behavioural indicators.",
  },
  {
    icon: Wind,
    title: "Drift Forecasting & Backtracking",
    desc: "Forward prediction models spill dispersion over 48 hours. Backtracking reconstructs the probable origin from wind and ocean-current vectors.",
  },
  {
    icon: Globe,
    title: "Hyperspectral Thickness Estimation",
    desc: "Experimental oil-thickness classification using synthetic hyperspectral spectral signatures, with per-class confidence and uncertainty bounds.",
  },
  {
    icon: Radio,
    title: "AIS Vessel Intelligence",
    desc: "Automatic Identification System integration for real-time vessel tracking, trajectory reconstruction, and behavioural anomaly detection.",
  },
  {
    icon: Shield,
    title: "Investigation Report Generation",
    desc: "Automated PDF and machine-readable JSON evidence records with explainable methodology, limitations, and legal disclaimers.",
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.2em] text-zinc-300 lowercase">
            maris
          </span>
          <span className="text-[9px] text-zinc-600 hidden sm:inline ml-1">
            Maritime Oil Spill Intelligence
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/app")}
            className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[10px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
          >
            Open Platform
            <ArrowRight className="size-3" />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6 pt-28 pb-20">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-100 leading-[1.1] mb-5">
              AI-powered maritime
              <br />
              oil spill intelligence
            </h1>

            <p className="text-sm text-zinc-400 leading-relaxed max-w-xl mb-8">
              Detect possible oil spills from satellite SAR imagery, correlate AIS vessel
              movements, estimate oil thickness, predict spill drift, and rank probable
              source vessels — all with explainable evidence in a single investigation
              platform.
            </p>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => navigate("/app")}
                className="inline-flex items-center gap-2 rounded bg-zinc-100 px-4 py-2 text-[11px] font-medium text-zinc-900 hover:bg-white transition-colors"
              >
                Launch Investigation
                <ArrowRight className="size-3.5" />
              </button>
              <button
                onClick={() => navigate("/sar")}
                className="inline-flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-[11px] font-medium text-zinc-300 hover:border-zinc-500 transition-colors"
              >
                <ScanEye className="size-3.5" />
                SAR Analysis
              </button>
            </div>
            <div className="mt-3">
              <span className="text-[9px] text-zinc-600">
                No login required for demo
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-20 grid grid-cols-4 gap-4 border-t border-zinc-800 pt-8">
            {[
              { label: "Detection Pipeline", value: "9 Steps" },
              { label: "Attribution Factors", value: "6 Weighted" },
              { label: "Drift Prediction", value: "T+48 h" },
              { label: "Report Format", value: "PDF + JSON" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-lg font-semibold text-zinc-100">{s.value}</div>
                <div className="text-[9px] text-zinc-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-zinc-800">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-8">
            Platform Capabilities
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded border border-zinc-800 bg-zinc-900/30 p-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="mb-3 flex size-8 items-center justify-center rounded bg-zinc-800">
                    <Icon className="size-4 text-zinc-400" />
                  </div>
                  <h3 className="text-[11px] font-semibold text-zinc-200 mb-1">
                    {f.title}
                  </h3>
                  <p className="text-[9px] text-zinc-500 leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="border-t border-zinc-800">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-8">
            End-to-End Investigation Pipeline
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {[
              "SAR Imagery",
              "Oil Detection",
              "Spill Analysis",
              "AIS Correlation",
              "Environmental Data",
              "Drift Modelling",
              "Source Attribution",
              "Hyperspectral Analysis",
              "Behaviour Anomaly",
              "Report Generation",
            ].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2.5 py-1 text-[9px] text-zinc-400">
                  <span className="text-zinc-600 font-mono mr-1">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {step}
                </div>
                {i < 9 && (
                  <ArrowRight className="size-3 text-zinc-700" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="text-[9px] text-zinc-600">
            maris — Maritime Oil Spill Intelligence & Source Attribution System
          </div>
          <div className="text-[9px] text-zinc-700">
            Demonstration data only — not for operational use
          </div>
        </div>
      </footer>
    </div>
  );
}
