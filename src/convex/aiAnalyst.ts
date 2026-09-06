// MARIS — AI Analyst action ("use node"): calls the Experiential Labs API
// (OpenAI-compatible /v1/chat/completions) and streams tokens into the
// analystMessages log via reactive internal mutations.
//
// The API key is read from EXPLABS_API_KEY (add it in the project's
// Keys/API keys UI — it is never exposed to the client).
"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";

const EXPLABS_BASE_URL = "https://api.experientiallabs.ai";
const MODEL = "claude-fable-5.1";
const MAX_HISTORY = 12; // last messages replayed to the model

/** Serializes the investigation state into a compact, model-readable digest. */
export const buildContext = action({
  args: {
    incident: v.any(),
    vessels: v.any(),
    attributions: v.any(),
    anomalies: v.any(),
    environmental: v.any(),
    driftResult: v.any(),
    hyperspectral: v.any(),
    timeline: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const lines: string[] = [];

    if (args.incident) {
      const i = args.incident;
      lines.push(
        `INCIDENT #${i.incidentNumber} "${i.label}" — status ${i.status}`,
        `  Detection: ${i.detectionMode} SAR at ${i.detectedAt}, confidence ${i.confidence?.score}%`,
        `  Factors: ${(i.confidence?.factors ?? []).join("; ")}`,
        `  Spill: area ${i.polygon?.areaKm2} km², length ${i.polygon?.lengthKm} km, center ${i.polygon?.center?.[0]},${i.polygon?.center?.[1]}`,
        `  Water depth ${i.waterDepth} m, sea state: ${i.seaState}`,
      );
    }

    if (args.environmental) {
      const e = args.environmental;
      lines.push(
        `ENVIRONMENT: wind ${e.windSpeed} kn from ${e.windDirection}° (${e.windDirectionLabel}), current ${e.currentSpeed} kn ${e.currentDirectionLabel}, waves ${e.waveHeight} m, SST ${e.seaSurfaceTemp}°C`,
      );
    }

    if (args.vessels?.length) {
      lines.push(`AIS VESSELS (${args.vessels.length}):`);
      for (const v of args.vessels) {
        lines.push(
          `  - ${v.name} [${v.vesselType}, flag ${v.flag}, MMSI ${v.mmsi}] speed ${v.speed} kn, heading ${v.heading}°, destination ${v.destination}, last seen ${v.lastSeen}`,
        );
      }
    }

    if (args.attributions?.length) {
      lines.push(`SOURCE ATTRIBUTION RANKING:`);
      for (const a of args.attributions) {
        lines.push(
          `  #${a.rank} ${a.vesselName}: score ${a.overallScore}/100 — ${a.reasons?.join("; ")}`,
        );
      }
    }

    if (args.anomalies?.length) {
      lines.push(`BEHAVIOUR ANOMALIES:`);
      for (const a of args.anomalies) {
        lines.push(
          `  - ${a.vesselName} [${a.anomalyLevel}]: ${a.evidence?.join("; ")}`,
        );
      }
    }

    if (args.driftResult) {
      const fmt = (p: { time: string; center: [number, number]; confidence: number }) =>
        `${p.time} @ ${p.center?.[0]},${p.center?.[1]} (${p.confidence}% conf)`;
      lines.push(
        `DRIFT BACKTRACK (toward probable origin): ${args.driftResult.backtrack?.map(fmt).join(" -> ")}`,
        `DRIFT FORECAST: ${args.driftResult.forward?.map(fmt).join(" -> ")}`,
      );
    }

    if (args.hyperspectral) {
      const h = args.hyperspectral;
      lines.push(
        `HYPERSPECTRAL: estimated class "${h.estimatedClass}" (${h.confidence}% confidence, uncertainty ${h.uncertainty})`,
        `  Thickness mix: ${h.thicknessClasses?.map((c: { label: string; percentage: number }) => `${c.label} ${c.percentage}%`).join(", ")}`,
      );
    }

    if (args.timeline?.length) {
      lines.push(`TIMELINE:`);
      for (const t of args.timeline) {
        lines.push(`  ${t.time} — ${t.event}`);
      }
    }

    return lines.join("\n");
  },
});

/** Streams a chat completion from Experiential Labs into the message log. */
export const streamChat = action({
  args: {
    sessionId: v.string(),
    question: v.string(),
    context: v.string(),
    history: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, { sessionId, question, context, history }) => {
    const userId = await auth.getUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const apiKey = process.env.EXPLABS_API_KEY;
    if (!apiKey) {
      throw new Error(
        "EXPLABS_API_KEY is not set. Add it in the project's Keys/API keys panel.",
      );
    }

    // 1. Persist the user message + placeholder assistant message.
    const digest =
      context.length > 96 ? context.slice(0, 96) + "…" : context;
    const userMessageId = await ctx.runMutation(
      internal.analyst.appendUserMessage,
      { sessionId, content: question, contextDigest: digest },
    );
    const assistantMessageId = await ctx.runMutation(
      internal.analyst.beginAssistantMessage,
      { sessionId, replyToId: userMessageId },
    );

    // 2. Call the Experiential Labs API (OpenAI-compatible streaming SSE).
    const systemPrompt = [
      "You are the MARIS AI Analyst — a maritime oil-spill intelligence assistant embedded in an investigation console.",
      "You receive a structured investigation snapshot (SAR detection, AIS vessels, source attribution, drift model, hyperspectral thickness, timeline).",
      "Answer questions grounded strictly in that data. Cite concrete numbers (scores, distances, times, percentages) from the snapshot.",
      "Be concise and analytical; use short paragraphs or compact bullet lists. Flag uncertainty and never fabricate data not present in the snapshot.",
      "This is a decision-support tool: analytical output, not a legal determination of responsibility.",
      "",
      "INVESTIGATION SNAPSHOT:",
      context,
    ].join("\n");

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-MAX_HISTORY),
      { role: "user", content: question },
    ];

    let response: Response;
    try {
      response = await fetch(
        `${EXPLABS_BASE_URL}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            stream: true,
            messages,
          }),
        },
      );
    } catch (err) {
      await ctx.runMutation(internal.analyst.finishAssistantMessage, {
        messageId: assistantMessageId,
        error: true,
        message: `Network error contacting Experiential Labs: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      await ctx.runMutation(internal.analyst.finishAssistantMessage, {
        messageId: assistantMessageId,
        error: true,
        message: `Experiential Labs API error ${response.status}: ${detail.slice(0, 300)}`,
      });
      return;
    }

    // 3. Parse the SSE stream and persist chunks in batches.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let pending = "";
    let chunkCount = 0;
    let sawAnyChunk = false;

    const flush = async () => {
      if (!pending) return;
      const text = pending;
      pending = "";
      await ctx.runMutation(internal.analyst.appendChunk, {
        messageId: assistantMessageId,
        chunk: text,
      });
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          for (const line of event.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload) as {
                choices?: {
                  delta?: { content?: string | null };
                }[];
              };
              const token = parsed.choices?.[0]?.delta?.content;
              if (typeof token === "string" && token.length > 0) {
                pending += token;
                sawAnyChunk = true;
                chunkCount += 1;
                if (chunkCount % 8 === 0) {
                  await flush();
                }
              }
            } catch {
              // ignore keep-alives / malformed partial events
            }
          }
        }
      }
      await flush();

      if (!sawAnyChunk) {
        await ctx.runMutation(internal.analyst.finishAssistantMessage, {
          messageId: assistantMessageId,
          error: true,
          message:
            "The model returned an empty stream. Verify the API key and model name.",
        });
      } else {
        await ctx.runMutation(internal.analyst.finishAssistantMessage, {
          messageId: assistantMessageId,
        });
      }
    } catch (err) {
      await flush();
      await ctx.runMutation(internal.analyst.finishAssistantMessage, {
        messageId: assistantMessageId,
        error: true,
        message: `Stream interrupted: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },
});
