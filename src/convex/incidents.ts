// MARIS — Incident Management backend (Convex).
//
// Persistence for the centralized incident store. The client store remains
// the live source of truth; these functions persist incident snapshots so
// investigation history survives reloads. Semantics mirror a REST incident
// API: list (GET /incidents), upsert-with-dedup (POST), update (PATCH),
// and per-incident timeline (GET /incidents/{id}/timeline).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const timelineEventValidator = v.object({
  id: v.string(),
  timestamp: v.string(),
  eventType: v.string(),
  description: v.string(),
  source: v.string(),
  severity: v.string(),
});

const workflowValidator = v.object({
  runningStage: v.optional(v.string()),
  completedStages: v.array(v.string()),
  reportGenerated: v.boolean(),
  // Prompt-10: export is the final investigation gate — per-format
  // download timestamps recorded by the actual export handlers.
  pdfExportedAt: v.optional(v.string()),
  jsonExportedAt: v.optional(v.string()),
  reportExportedAt: v.optional(v.string()),
  lastError: v.optional(v.string()),
});

const incidentPatchValidator = v.object({
  status: v.optional(v.string()),
  severity: v.optional(v.string()),
  workflow: v.optional(workflowValidator),
  areaKm2: v.optional(v.number()),
  estimatedVolumeM3: v.optional(v.number()),
  confidence: v.optional(v.number()),
  currentSummary: v.optional(v.string()),
  lastUpdatedAt: v.optional(v.string()),
  timelineEvent: v.optional(timelineEventValidator),
});

/** List all persisted incidents, newest detection first (GET /incidents). */
export const listIncidents = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("incidents").collect();
    return rows.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  },
});

/** Get one incident by incident number (GET /incidents/{number}). */
export const getIncident = query({
  args: { incidentNumber: v.string() },
  handler: async (ctx, { incidentNumber }) => {
    return await ctx.db
      .query("incidents")
      .withIndex("by_incident_number", (q) => q.eq("incidentNumber", incidentNumber))
      .unique();
  },
});

/** Timeline for one incident (GET /incidents/{id}/timeline). */
export const getIncidentTimeline = query({
  args: { incidentNumber: v.string() },
  handler: async (ctx, { incidentNumber }) => {
    const inc = await ctx.db
      .query("incidents")
      .withIndex("by_incident_number", (q) => q.eq("incidentNumber", incidentNumber))
      .unique();
    return inc?.timeline ?? [];
  },
});

/**
 * Upsert an incident with deduplication (POST /incidents). An existing
 * record with the same incidentNumber OR detectionId is UPDATED in place —
 * re-processing the same SAR observation never creates a duplicate row.
 * Returns the document id and whether a new record was created.
 */
export const upsertIncident = mutation({
  args: {
    incidentNumber: v.string(),
    status: v.string(),
    severity: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    areaKm2: v.optional(v.number()),
    estimatedVolumeM3: v.optional(v.number()),
    confidence: v.optional(v.number()),
    detectionSource: v.string(),
    workflow: workflowValidator,
    currentSummary: v.string(),
    detectionId: v.optional(v.string()),
    sceneId: v.optional(v.string()),
    sourceIncidentId: v.optional(v.string()),
    detectedAt: v.string(),
    createdAt: v.string(),
    lastUpdatedAt: v.string(),
    timeline: v.array(timelineEventValidator),
  },
  handler: async (ctx, args) => {
    const existingByNumber = await ctx.db
      .query("incidents")
      .withIndex("by_incident_number", (q) =>
        q.eq("incidentNumber", args.incidentNumber),
      )
      .unique();
    if (existingByNumber) {
      await ctx.db.patch(existingByNumber._id, {
        status: args.status,
        severity: args.severity,
        areaKm2: args.areaKm2,
        estimatedVolumeM3: args.estimatedVolumeM3,
        confidence: args.confidence,
        currentSummary: args.currentSummary,
        lastUpdatedAt: args.lastUpdatedAt,
        timeline: args.timeline,
        workflow: args.workflow,
      });
      return { id: existingByNumber._id, created: false };
    }
    let existingByDetection: { _id: Id<"incidents"> } | null = null;
    if (args.detectionId) {
      existingByDetection = await ctx.db
        .query("incidents")
        .withIndex("by_detection", (q) => q.eq("detectionId", args.detectionId))
        .unique();
    }
    if (existingByDetection) {
      await ctx.db.patch(existingByDetection._id, {
        status: args.status,
        severity: args.severity,
        areaKm2: args.areaKm2,
        estimatedVolumeM3: args.estimatedVolumeM3,
        confidence: args.confidence,
        currentSummary: args.currentSummary,
        lastUpdatedAt: args.lastUpdatedAt,
        timeline: args.timeline,
        workflow: args.workflow,
      });
      return { id: existingByDetection._id, created: false };
    }
    const id = await ctx.db.insert("incidents", args);
    return { id, created: true };
  },
});

/**
 * Apply a partial update + optional timeline event (PATCH /incidents/{id}).
 * Validates all incoming data against the patch validator.
 */
export const patchIncident = mutation({
  args: {
    incidentNumber: v.string(),
    patch: incidentPatchValidator,
  },
  handler: async (ctx, { incidentNumber, patch }) => {
    const inc = await ctx.db
      .query("incidents")
      .withIndex("by_incident_number", (q) => q.eq("incidentNumber", incidentNumber))
      .unique();
    if (!inc) throw new Error(`Incident ${incidentNumber} not found`);

    const { timelineEvent, ...fields } = patch;
    const updates: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) updates[k] = val;
    }
    const timeline = timelineEvent
      ? [...inc.timeline, timelineEvent]
      : inc.timeline;
    updates.lastUpdatedAt =
      fields.lastUpdatedAt ?? new Date().toISOString();
    updates.timeline = timeline;
    await ctx.db.patch(inc._id, updates);
    return { id: inc._id };
  },
});
