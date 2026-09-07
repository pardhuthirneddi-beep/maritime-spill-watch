// maris — Landing page
import { useEffect, useState } from "react";
import { ArrowRight, ScanEye, Shield } from "lucide-react";
import { useNavigate } from "react-router";
import GlareHover from "@/components/GlareHover";
import Radar from "@/components/Radar";
import SpecularButton from "@/components/SpecularButton";
import MagicBento from "@/components/maris/MagicBento";

const PIPELINE = [
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
];

const STATS = [
  { label: "Detection Pipeline", value: "9 Steps" },
  { label: "Attribution Factors", value: "6 Weighted" },
  { label: "Drift Prediction", value: "T+48 h" },
  { label: "Report Format", value: "PDF + JSON" },
];

/** Live UTC clock — operational console feel */
function useUtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now.toISOString().slice(11, 19) + " UTC";
}

export default function Landing() {
  const navigate = useNavigate();
  const clock = useUtcClock();

  return (
    <div className="min-h-screen bg-[#070d17] text-slate-100 antialiased">
      {/* Top status strip */}
      <div className="border-b border-sky-200/10 bg-[#050a12]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="nav-beacon inline-block size-1.5 rounded-full bg-emerald-400" />
            <span className="text-emerald-300/80">System Operational</span>
          </div>
          <span>{clock}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-30 border-b border-sky-200/10 bg-[#050a12]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-7 items-center justify-center rounded-sm border border-amber-300/40 bg-sky-400/10">
              <Anchor />
            </div>
            <div className="leading-none">
              <div className="text-[12px] font-semibold tracking-[0.28em] uppercase text-slate-100">
                maris
              </div>
              <div className="mt-0.5 hidden text-[8px] font-mono uppercase tracking-[0.18em] text-slate-500 sm:block">
                Maritime Oil Spill Intelligence
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate("/app")}
            className="nav-frame flex items-center gap-2 rounded-sm border border-sky-200/20 bg-sky-400/10 px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-sky-100 transition-colors hover:border-amber-300/50 hover:bg-sky-400/20"
          >
            Open Platform
            <ArrowRight className="size-3" />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-60">
          <Radar
            speed={0.7}
            scale={0.42}
            ringCount={7}
            spokeCount={12}
            ringThickness={0.04}
            spokeThickness={0.008}
            sweepSpeed={0.55}
            sweepWidth={1.6}
            sweepLobes={1}
            color="#3d7fb8"
            backgroundColor="#070d17"
            falloff={2.4}
            brightness={0.85}
            enableMouseInteraction
            mouseInfluence={0.08}
          />
        </div>
        <div className="nav-grid absolute inset-0" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 30% 20%, rgba(56,110,170,0.22), transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-16">
          <div className="max-w-3xl">
            <div className="nav-rise mb-6 inline-flex items-center gap-2 rounded-sm border border-amber-300/30 bg-amber-300/5 px-3 py-1">
              <span className="size-1.5 rounded-full bg-amber-300" />
              <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-amber-200/90">
                Fleet Command — Environmental Protection
              </span>
            </div>

            <h1
              className="nav-rise mb-5 text-4xl sm:text-[3.4rem] font-semibold leading-[1.08] tracking-tight text-white"
              style={{ animationDelay: "60ms" }}
            >
              Maritime oil spill
              <br />
              <span className="text-sky-300">intelligence & attribution</span>
            </h1>

            <p
              className="nav-rise mb-9 max-w-xl text-sm leading-relaxed text-slate-400"
              style={{ animationDelay: "120ms" }}
            >
              Detect possible oil spills from satellite SAR imagery, correlate AIS vessel
              movements, estimate oil thickness, predict spill drift, and rank probable
              source vessels — all with explainable evidence in a single investigation
              platform.
            </p>

            <div
              className="nav-rise flex flex-wrap items-center gap-3"
              style={{ animationDelay: "180ms" }}
            >
              <SpecularButton
                onClick={() => navigate("/app")}
                size="md"
                radius={4}
                tint="#0ea5e9"
                tintOpacity={0.85}
                blur={6}
                textColor="#ffffff"
                lineColor="#cfe6ff"
                baseColor="#0b3a5c"
                intensity={1.1}
                shineSize={12}
                shineFade={45}
                thickness={1}
                speed={0.3}
                followMouse
                proximity={280}
                className="nav-frame font-semibold uppercase tracking-wider"
              >
                <span className="inline-flex items-center gap-2 text-[11px]">
                  Launch Investigation
                  <ArrowRight className="size-3.5" />
                </span>
              </SpecularButton>
              <button
                onClick={() => navigate("/sar")}
                className="nav-frame inline-flex items-center gap-2 rounded-sm border border-sky-200/20 bg-sky-400/5 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-sky-100 transition-colors hover:border-sky-200/40 hover:bg-sky-400/15"
              >
                <ScanEye className="size-3.5" />
                SAR Analysis
              </button>
            </div>
            <div className="mt-4">
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-600">
                Demonstration mode — no credentials required
              </span>
            </div>
          </div>

          {/* Stats */}
          <div
            className="nav-rise mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-sky-200/10 bg-sky-200/10 sm:grid-cols-4"
            style={{ animationDelay: "240ms" }}
          >
            {STATS.map((s) => (
              <GlareHover
                key={s.label}
                width="100%"
                height="auto"
                background="#0a1322"
                borderRadius="0px"
                borderColor="transparent"
                glareColor="#8ab6e0"
                glareOpacity={0.16}
                glareAngle={-20}
                glareSize={260}
                transitionDuration={700}
              >
                <div className="w-full px-5 py-4">
                  <div className="font-mono text-xl font-semibold text-sky-200">{s.value}</div>
                  <div className="mt-1 text-[9px] font-mono uppercase tracking-[0.16em] text-slate-500">
                    {s.label}
                  </div>
                </div>
              </GlareHover>
            ))}
          </div>
        </div>
        <div className="nav-braid" />
      </section>

      {/* Features */}
      <section className="border-t border-sky-200/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <div className="mb-2 text-[9px] font-mono uppercase tracking-[0.22em] text-amber-300/70">
                Section 01
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">
                Platform Capabilities
              </h2>
            </div>
            <div className="hidden h-px flex-1 mx-8 bg-gradient-to-r from-sky-200/15 to-transparent sm:block" />
          </div>

          <div className="flex justify-center">
            <MagicBento
              textAutoHide={true}
              enableStars={true}
              enableSpotlight={true}
              enableBorderGlow={true}
              enableTilt={true}
              enableMagnetism={true}
              clickEffect={true}
              spotlightRadius={300}
              particleCount={12}
              glowColor="56, 189, 248"
            />
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="border-t border-sky-200/10 bg-[#050a12]">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-10">
            <div className="mb-2 text-[9px] font-mono uppercase tracking-[0.22em] text-amber-300/70">
              Section 02
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-100">
              End-to-End Investigation Pipeline
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-sky-200/10 bg-sky-200/10 sm:grid-cols-5">
            {PIPELINE.map((step, i) => (
              <div
                key={step}
                className="group relative bg-[#0a1322] px-3 py-4 transition-colors hover:bg-[#0e1a2e]"
              >
                <div className="mb-2 font-mono text-[10px] text-amber-300/60">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="text-[10px] font-medium text-slate-300 transition-colors group-hover:text-sky-200">
                  {step}
                </div>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight className="absolute -right-[7px] top-1/2 z-10 hidden size-3 -translate-y-1/2 text-amber-300/40 sm:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-sky-200/10">
        <div className="nav-grid relative mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight text-slate-100">
            Ready to begin an investigation?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[11px] leading-relaxed text-slate-500">
            Open the command center to run detection, attribution, and reporting against
            the demonstration dataset.
          </p>
          <SpecularButton
            onClick={() => navigate("/app")}
            size="md"
            radius={4}
            tint="#0ea5e9"
            tintOpacity={0.85}
            blur={6}
            textColor="#ffffff"
            lineColor="#cfe6ff"
            baseColor="#0b3a5c"
            intensity={1.1}
            shineSize={12}
            shineFade={45}
            thickness={1}
            speed={0.3}
            followMouse
            proximity={280}
            className="mt-8 font-semibold uppercase tracking-wider"
          >
            <span className="inline-flex items-center gap-2 text-[11px]">
              Enter Command Center
              <ArrowRight className="size-3.5" />
            </span>
          </SpecularButton>

          <GlareHover
            width="min(680px, 100%)"
            height="auto"
            background="rgba(10,19,34,0.6)"
            borderRadius="2px"
            borderColor="rgba(201,162,39,0.35)"
            glareColor="#c9a227"
            glareOpacity={0.18}
            glareAngle={-30}
            glareSize={300}
            transitionDuration={900}
            playOnce
            className="nav-frame mx-auto mt-12 text-left"
          >
            <div className="flex items-center gap-4 px-6 py-4">
              <Shield className="size-5 shrink-0 text-amber-300/80" />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                  Evidence-Grade Reporting
                </div>
                <div className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                  Every investigation concludes with an auditable PDF and JSON record —
                  methodology, confidence bounds, and limitations documented for review.
                </div>
              </div>
            </div>
          </GlareHover>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-sky-200/10 bg-[#050a12] px-6 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 sm:flex-row">
          <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-slate-600">
            maris — Maritime Oil Spill Intelligence & Source Attribution System
          </div>
          <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-slate-700">
            Demonstration data only — not for operational use
          </div>
        </div>
      </footer>
    </div>
  );
}

function Anchor({ className = "size-3.5 text-amber-300" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="12" cy="5" r="3" />
      <line x1="12" y1="8" x2="12" y2="21" />
      <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
    </svg>
  );
}
