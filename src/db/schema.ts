import {
    pgTable,
    serial,
    text,
    timestamp,
    integer,
    bigint,
    pgEnum,
    index,
  } from "drizzle-orm/pg-core";
  
  // ─── Enums ────────────────────────────────────────────────────────────────────
  
  export const lifecycleStageEnum = pgEnum("lifecycle_stage", [
    "SUBMITTED",
    "PROCESSED",
    "CONFIRMED",
    "FINALIZED",
    "FAILED",
  ]);
  
  export const failureTypeEnum = pgEnum("failure_type", [
    "EXPIRED_BLOCKHASH",
    "FEE_TOO_LOW",
    "COMPUTE_EXCEEDED",
    "BUNDLE_DROPPED",
    "LEADER_SKIPPED",
    "SIMULATION_FAILED",
    "NETWORK_ERROR",
    "UNKNOWN",
  ]);
  
  // ─── Bundle Submissions ───────────────────────────────────────────────────────
  // One row per bundle submitted. The top-level record.
  
  export const bundleSubmissions = pgTable(
    "bundle_submissions",
    {
      id: serial("id").primaryKey(),
  
      // Bundle identifier returned by Jito
      bundleId: text("bundle_id").notNull().unique(),
  
      // The main transaction signature we're tracking
      signature: text("signature").notNull(),
  
      // Tip details
      tipLamports: bigint("tip_lamports", { mode: "number" }).notNull(),
      tipAccount: text("tip_account").notNull(),
  
      // Blockhash used at submission time
      blockhash: text("blockhash").notNull(),
  
      // Slot at submission time
      submittedSlot: bigint("submitted_slot", { mode: "number" }).notNull(),
  
      // Final stage reached
      finalStage: lifecycleStageEnum("final_stage").notNull().default("SUBMITTED"),
  
      // Failure info (null if successful)
      failureType: failureTypeEnum("failure_type"),
      failureMessage: text("failure_message"),
  
      // Retry tracking
      retryCount: integer("retry_count").notNull().default(0),
      parentBundleId: text("parent_bundle_id"), // set if this is a retry of another bundle
  
      // Agent reasoning (populated when agent is invoked)
      agentReasoning: text("agent_reasoning"),
      agentDecision: text("agent_decision"),
  
      // Timestamps
      submittedAt: timestamp("submitted_at").notNull().defaultNow(),
      finalizedAt: timestamp("finalized_at"),
    },
    (table) => [
      index("idx_bundle_submissions_bundle_id").on(table.bundleId),
      index("idx_bundle_submissions_signature").on(table.signature),
      index("idx_bundle_submissions_submitted_at").on(table.submittedAt),
    ]
  );
  
  // ─── Lifecycle Events ─────────────────────────────────────────────────────────
  // One row per commitment stage transition. Multiple rows per bundle.
  
  export const lifecycleEvents = pgTable(
    "lifecycle_events",
    {
      id: serial("id").primaryKey(),
  
      // Links back to the bundle
      bundleId: text("bundle_id")
        .notNull()
        .references(() => bundleSubmissions.bundleId),
  
      // Which stage this event represents
      stage: lifecycleStageEnum("stage").notNull(),
  
      // Slot number at this stage
      slot: bigint("slot", { mode: "number" }),
  
      // Latency from previous stage in milliseconds (null for first event)
      latencyFromPreviousMs: integer("latency_from_previous_ms"),
  
      // Failure info (only for FAILED stage)
      failureType: failureTypeEnum("failure_type"),
      failureMessage: text("failure_message"),
  
      // When this event was recorded
      recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    },
    (table) => [
      index("idx_lifecycle_events_bundle_id").on(table.bundleId),
      index("idx_lifecycle_events_stage").on(table.stage),
    ]
  );
  
  // ─── Agent Decisions ──────────────────────────────────────────────────────────
  // One row per time the AI agent was invoked. Full audit trail.
  
  export const agentDecisions = pgTable(
    "agent_decisions",
    {
      id: serial("id").primaryKey(),
  
      // Links back to the bundle that triggered this decision
      bundleId: text("bundle_id")
        .notNull()
        .references(() => bundleSubmissions.bundleId),
  
      // What the agent was given as input
      failureType: failureTypeEnum("failure_type").notNull(),
      failureMessage: text("failure_message").notNull(),
      retryCount: integer("retry_count").notNull(),
  
      // What the agent decided
      reasoning: text("reasoning").notNull(),
      shouldRetry: text("should_retry").notNull(), // "yes" | "no"
      adjustedTipLamports: bigint("adjusted_tip_lamports", { mode: "number" }),
      adjustedPriorityFee: bigint("adjusted_priority_fee", { mode: "number" }),
      waitSlots: integer("wait_slots"), // how long agent says to wait before retry
      additionalNotes: text("additional_notes"),
  
      // Which model made this decision
      model: text("model").notNull(),
  
      // When the agent was invoked
      decidedAt: timestamp("decided_at").notNull().defaultNow(),
    },
    (table) => [
      index("idx_agent_decisions_bundle_id").on(table.bundleId),
    ]
  );
  
  // ─── Types ────────────────────────────────────────────────────────────────────
  
  export type BundleSubmission = typeof bundleSubmissions.$inferSelect;
  export type NewBundleSubmission = typeof bundleSubmissions.$inferInsert;
  
  export type LifecycleEvent = typeof lifecycleEvents.$inferSelect;
  export type NewLifecycleEvent = typeof lifecycleEvents.$inferInsert;
  
  export type AgentDecision = typeof agentDecisions.$inferSelect;
  export type NewAgentDecision = typeof agentDecisions.$inferInsert;