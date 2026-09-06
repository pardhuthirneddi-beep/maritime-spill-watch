// MARIS — AI Analyst panel: streaming chat grounded in the live investigation
// data, powered by the Experiential Labs API via a Convex node action.
import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Sparkles, Send, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import type {
  OilSpillIncident,
  AisVessel,
  VesselAttribution,
  BehaviorAnomaly,
  EnvironmentalConditions,
  OilDriftResult,
  HyperspectralResult,
  TimelineEvent,
} from "@/data/types";

interface AnalystPanelProps {
  incident: OilSpillIncident | null;
  vessels: AisVessel[];
  attributions: VesselAttribution[];
  anomalies: BehaviorAnomaly[];
  environmental: EnvironmentalConditions;
  driftResult: OilDriftResult | null;
  hyperspectral: HyperspectralResult | null;
  timeline: TimelineEvent[];
  isAnalyzing: boolean;
}

const QUICK_PROMPTS = [
  "Summarize this incident in plain language",
  "Which vessel is the most likely source, and why?",
  "Where will the slick be in 48 hours?",
  "What should responders do first?",
  "How reliable is this detection?",
];

export default function AnalystPanel({
  incident,
  vessels,
  attributions,
  anomalies,
  environmental,
  driftResult,
  hyperspectral,
  timeline,
  isAnalyzing,
}: AnalystPanelProps) {
  const [sessionId] = useState(
    () => `maris-analyst-${crypto.randomUUID()}`,
  );
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useQuery(api.analyst.getMessages, { sessionId }) ?? [];
  const buildContext = useAction(api.aiAnalyst.buildContext);
  const streamChat = useAction(api.aiAnalyst.streamChat);
  const clearSession = useMutation(api.analyst.clearSession);

  const isLoading = messages.some((m) => m.streaming);
  const hasConversation = messages.length > 0;
  const hasSnapshot =
    incident !== null &&
    (attributions.length > 0 || driftResult !== null);

  // Keep the latest message in view while streaming.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isLoading || el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || isLoading || isAnalyzing) return;

    setInput("");

    // Build the snapshot server-side, then stream the answer.
    try {
      const context = await buildContext({
        incident,
        vessels,
        attributions,
        anomalies,
        environmental,
        driftResult,
        hyperspectral,
        timeline,
      });

      const history = messages
        .filter((m) => !m.streaming && !m.error && m.content.length > 0)
        .slice(-12)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      await streamChat({ sessionId, question, context, history });
    } catch (err) {
      console.error("AI Analyst error:", err);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header strip */}
      <div className="flex items-center justify-between border-b border-sky-200/10 px-4 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-amber-300" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
            AI Analyst
          </span>
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-medium text-amber-400">
            claude-fable-5.1
          </span>
        </div>
        {hasConversation && (
          <button
            onClick={() => {
              void clearSession({ sessionId });
            }}
            className="cursor-pointer text-zinc-500 transition-colors hover:text-zinc-300"
            title="Clear conversation"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      {/* Message log */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {!hasConversation && (
          <div className="space-y-3">
            <div className="rounded border border-sky-200/10 bg-zinc-900/50 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="size-3 text-amber-300" />
                <span className="text-[10px] font-semibold uppercase text-amber-300">
                  Ask about this investigation
                </span>
              </div>
              <p className="text-[10px] leading-relaxed text-zinc-400">
                The analyst sees your live snapshot — SAR detection, vessel
                tracks, attribution scores, drift model, thickness estimates —
                and answers with cited numbers.
              </p>
            </div>
            <div className="space-y-1">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => void send(p)}
                  disabled={!hasSnapshot || isAnalyzing}
                  className={cn(
                    "w-full rounded border px-3 py-2 text-left text-[10px] transition-colors",
                    hasSnapshot && !isAnalyzing
                      ? "cursor-pointer border-sky-200/10 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
                      : "cursor-not-allowed border-sky-200/5 bg-zinc-900/20 text-zinc-600",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            {!hasSnapshot && (
              <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[9px] text-amber-400/80">
                Run an investigation first — the analyst answers from the
                snapshot it produces.
              </div>
            )}
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m._id}
            className={cn(
              "rounded border p-2.5",
              m.role === "user"
                ? "border-sky-200/10 bg-zinc-900/50"
                : m.error
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-amber-500/20 bg-amber-500/5",
            )}
          >
            <div
              className={cn(
                "mb-1 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-wider",
                m.role === "user" ? "text-zinc-500" : "text-amber-400",
              )}
            >
              {m.role === "user" ? (
                "You"
              ) : (
                <>
                  <Sparkles className="size-2.5" />
                  Analyst
                </>
              )}
            </div>
            <div
              className={cn(
                "whitespace-pre-wrap text-[11px] leading-relaxed",
                m.role === "user" ? "text-zinc-200" : "text-zinc-300",
                m.error && "text-red-300",
              )}
            >
              {m.content ||
                (m.streaming && (
                  <span className="flex items-center gap-2 text-zinc-500">
                    <Loader2 className="size-3 animate-spin" />
                    Analyzing snapshot…
                  </span>
                ))}
            </div>
            {m.error && (
              <div className="mt-1 flex items-center gap-1 text-[9px] text-red-400">
                <AlertTriangle className="size-3" />
                {m.content ? "Request failed" : "Error"}
              </div>
            )}
          </div>
        ))}

        {isAnalyzing && (
          <div className="rounded border border-sky-200/10 bg-zinc-900/30 p-2.5 text-[10px] text-zinc-500">
            Investigation running — the analyst will see the fresh snapshot when
            it completes.
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-sky-200/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder={
              hasSnapshot
                ? "Ask about the incident, vessels, drift…"
                : "Run an investigation to activate the analyst"
            }
            disabled={!hasSnapshot || isAnalyzing || isLoading}
            className="max-h-24 flex-1 resize-none rounded border border-sky-200/10 bg-zinc-900/50 px-2.5 py-2 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            onClick={() => void send(input)}
            disabled={!input.trim() || isLoading || isAnalyzing || !hasSnapshot}
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded border transition-colors",
              input.trim() && !isLoading && !isAnalyzing && hasSnapshot
                ? "cursor-pointer border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                : "cursor-not-allowed border-zinc-700 bg-zinc-800/50 text-zinc-600",
            )}
            title="Send"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </div>
        <div className="mt-1.5 text-[8px] text-zinc-600">
          Powered by Experiential Labs · grounded in demonstration data ·
          decision support, not a legal determination
        </div>
      </div>
    </div>
  );
}
