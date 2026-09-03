// MARIS — Landing page
import { Anchor, ArrowRight, Globe, Layers, Radio, Shield, Target, Wind } from "lucide-react";
import { useNavigate } from "react-router";

const FEATURES = [
  {
    icon: Layers,
    title: "SAR Oil Spill Detection",
    desc: "Satellite synthetic aperture radar imagery analysis with dark-spot detection, shape analysis, and contextual filtering.",
  },
  {
    icon: Target,
    title: "Source Attribution",
    desc: "Multi-factor probabilistic source-vessel ranking using distance, trajectory, temporal, heading, drift, and behaviour analysis.",
  },
  {
    icon: Wind,
    title: "Drift Modelling",
    desc: "Forward prediction and backward drift analysis using wind and ocean current environmental vectors.",
  },
  {
    icon: Globe,
    title: "Hyperspectral Thickness",
    desc: "Experimental oil-thickness class estimation using synthetic hyperspectral spectral signatures.",
  },
  {
    icon: Radio,
    title: "AIS Vessel Intelligence",
    desc: "Automatic Identification System vessel tracking, trajectory correlation, and behaviour anomaly detection.",
  },
  {
    icon: Shield,
    title: "Investigation Reports",
    desc: "Automated PDF and JSON evidence records with explainable methodology and legal disclaimers.",
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded bg-orange-500/20">
            <Anchor className="size-3.5 text-orange-400" />
          </div>
          <span className="text-[11px] font-bold tracking-widest text-zinc-100 uppercase">
            MARIS
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
            Open Dashboard
            <ArrowRight className="size-3" />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-20">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-[8px] text-amber-400/80 uppercase tracking-wider">
              <div className="size-1 rounded-full bg-amber-400" />
              SIH 2026 Hackathon Prototype
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-100 leading-[1.1] mb-4">
              Maritime Oil Spill
              <br />
              <span className="text-orange-400">Intelligence System</span>
            </h1>

            <p className="text-sm text-zinc-400 leading-relaxed max-w-xl mb-6">
              End-to-end investigation platform: satellite SAR detection → oil spill
              analysis → AIS vessel correlation → source attribution → drift
              modelling → hyperspectral thickness estimation → explainable
              investigation reports.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/app")}
                className="inline-flex items-center gap-2 rounded bg-orange-500 px-4 py-2 text-[11px] font-medium text-white hover:bg-orange-600 transition-colors"
              >
                Run Investigation
                <ArrowRight className="size-3.5" />
              </button>
              <span className="text-[9px] text-zinc-600">
                No login required — demonstration mode
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-16 grid grid-cols-4 gap-4 border-t border-zinc-800 pt-8">
            {[
              { label: "Detection Pipeline", value: "9 Steps" },
              { label: "Attribution Factors", value: "6 Factors" },
              { label: "Drift Prediction", value: "T+48h" },
              { label: "Report Format", value: "PDF + JSON" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-lg font-bold text-zinc-100">{s.value}</div>
                <div className="text-[9px] text-zinc-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-zinc-800">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-8">
            System Capabilities
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
            Investigation Workflow
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
              "Hyperspectral",
              "Behaviour Analysis",
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
            MARIS — Maritime Oil Spill Intelligence & Source Attribution System
          </div>
          <div className="text-[9px] text-zinc-700">
            SIH 2026 Hackathon Prototype — Demonstration Data Only
          </div>
        </div>
      </footer>
    </div>
  );
}
