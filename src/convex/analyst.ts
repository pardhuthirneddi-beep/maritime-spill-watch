// MARIS — AI Analyst: reactive message log for the chat panel
// The node action that calls Groq lives in aiAnalyst.ts ("use node").
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalMutation } from "./_generated/server";
import { auth } from "./auth";

/** Streamed tokens land here; the client subscribes via useQuery. */
export const getMessages = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    return await ctx.db
      .query("analystMessages")
      .withIndex("by_session_user", (q) =>
        q.eq("sessionId", sessionId).eq("userId", userId),
      )
      .order("asc")
      .collect();
  },
});

/** Appends the user's question as a message. Returns the id used as streamId. */
export const appendUserMessage = internalMutation({
  args: {
    sessionId: v.string(),
    content: v.string(),
    contextDigest: v.string(),
  },
  handler: async (ctx, { sessionId, content, contextDigest }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const id = await ctx.db.insert("analystMessages", {
      sessionId,
      userId,
      role: "user",
      content,
      contextDigest,
      streaming: false,
      error: false,
    });
    return id;
  },
});

/** Creates the placeholder assistant message the action streams into. */
export const beginAssistantMessage = internalMutation({
  args: {
    sessionId: v.string(),
    replyToId: v.id("analystMessages"),
  },
  handler: async (ctx, { sessionId, replyToId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const id = await ctx.db.insert("analystMessages", {
      sessionId,
      userId,
      role: "assistant",
      content: "",
      replyToId,
      streaming: true,
      error: false,
    });
    return id;
  },
});

/** Streaming sink: appends one chunk of tokens to the assistant message. */
export const appendChunk = internalMutation({
  args: {
    messageId: v.id("analystMessages"),
    chunk: v.string(),
  },
  handler: async (ctx, { messageId, chunk }) => {
    const doc = await ctx.db.get(messageId);
    if (doc === null) throw new Error("Message not found");
    await ctx.db.patch(messageId, { content: doc.content + chunk });
  },
});

/** Marks the stream finished (or errored). */
export const finishAssistantMessage = internalMutation({
  args: {
    messageId: v.id("analystMessages"),
    error: v.optional(v.boolean()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { messageId, error, message }) => {
    const doc = await ctx.db.get(messageId);
    if (doc === null) return;
    const content = error && message ? (doc.content || message) : doc.content;
    await ctx.db.patch(messageId, {
      content,
      streaming: false,
      error: error ?? false,
    });
  },
});

/** Clears the conversation for a session. */
export const clearSession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const docs = await ctx.db
      .query("analystMessages")
      .withIndex("by_session_user", (q) =>
        q.eq("sessionId", sessionId).eq("userId", userId),
      )
      .collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
  },
});
