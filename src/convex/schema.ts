import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // add other tables here

    // MARIS Incident Management — persistent incident records. The client
    // incident store remains the live source of truth; this table persists
    // incident snapshots so investigation history survives reloads.
    incidents: defineTable({
      incidentNumber: v.string(), // MARIS-INC-0001
      status: v.string(), // lifecycle: unverified | under_investigation | …
      severity: v.string(),
      latitude: v.number(),
      longitude: v.number(),
      areaKm2: v.optional(v.number()),
      estimatedVolumeM3: v.optional(v.number()),
      confidence: v.optional(v.number()),
      detectionSource: v.string(),
      currentSummary: v.string(),
      detectionId: v.optional(v.string()),
      sceneId: v.optional(v.string()),
      sourceIncidentId: v.optional(v.string()),
      detectedAt: v.string(),
      createdAt: v.string(),
      lastUpdatedAt: v.string(),
      timeline: v.array(
        v.object({
          id: v.string(),
          timestamp: v.string(),
          eventType: v.string(),
          description: v.string(),
          source: v.string(),
          severity: v.string(),
        }),
      ),
    })
      .index("by_incident_number", ["incidentNumber"])
      .index("by_detection", ["detectionId"]),
    analystMessages: defineTable({
      sessionId: v.string(),
      userId: v.id("users"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      contextDigest: v.optional(v.string()),
      replyToId: v.optional(v.id("analystMessages")),
      streaming: v.optional(v.boolean()),
      error: v.optional(v.boolean()),
    }).index("by_session_user", ["sessionId", "userId"]),

    // tableName: defineTable({
    //   ...
    //   // table fields
    // }).index("by_field", ["field"])
  },
  {
    schemaValidation: false,
  },
);

export default schema;
