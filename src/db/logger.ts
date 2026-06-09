import { eq, desc } from "drizzle-orm";
import { db } from "./index";
import {
  bundleSubmissions,
  lifecycleEvents,
  agentDecisions,
  type NewBundleSubmission,
  type NewLifecycleEvent,
  type NewAgentDecision,
  type BundleSubmission,
} from "./schema";
import { LifecycleStage, FailureType } from "../config/constants";

// ─── Bundle Submission Helpers ────────────────────────────────────────────────

export async function insertBundleSubmission(
  data: NewBundleSubmission
): Promise<BundleSubmission> {
  const [result] = await db
    .insert(bundleSubmissions)
    .values(data)
    .returning();
  return result!;
}

export async function updateBundleStage(
  bundleId: string,
  stage: LifecycleStage,
  extra?: {
    failureType?: FailureType;
    failureMessage?: string;
    agentReasoning?: string;
    agentDecision?: string;
    finalizedAt?: Date;
  }
) {
  await db
    .update(bundleSubmissions)
    .set({
      finalStage: stage,
      ...(extra?.failureType && { failureType: extra.failureType }),
      ...(extra?.failureMessage && { failureMessage: extra.failureMessage }),
      ...(extra?.agentReasoning && { agentReasoning: extra.agentReasoning }),
      ...(extra?.agentDecision && { agentDecision: extra.agentDecision }),
      ...(extra?.finalizedAt && { finalizedAt: extra.finalizedAt }),
    })
    .where(eq(bundleSubmissions.bundleId, bundleId));
}

export async function getBundleSubmission(
  bundleId: string
): Promise<BundleSubmission | undefined> {
  const [result] = await db
    .select()
    .from(bundleSubmissions)
    .where(eq(bundleSubmissions.bundleId, bundleId));
  return result;
}

export async function getRecentSubmissions(limit = 10) {
  return db
    .select()
    .from(bundleSubmissions)
    .orderBy(desc(bundleSubmissions.submittedAt))
    .limit(limit);
}

// ─── Lifecycle Event Helpers ──────────────────────────────────────────────────

export async function insertLifecycleEvent(data: NewLifecycleEvent) {
  const [result] = await db
    .insert(lifecycleEvents)
    .values(data)
    .returning();
  return result;
}

export async function getLifecycleEvents(bundleId: string) {
  return db
    .select()
    .from(lifecycleEvents)
    .where(eq(lifecycleEvents.bundleId, bundleId))
    .orderBy(lifecycleEvents.recordedAt);
}

// ─── Agent Decision Helpers ───────────────────────────────────────────────────

export async function insertAgentDecision(data: NewAgentDecision) {
  const [result] = await db
    .insert(agentDecisions)
    .values(data)
    .returning();
  return result;
}

export async function getAgentDecisions(bundleId: string) {
  return db
    .select()
    .from(agentDecisions)
    .where(eq(agentDecisions.bundleId, bundleId))
    .orderBy(agentDecisions.decidedAt);
}

// ─── Full Bundle Report ───────────────────────────────────────────────────────
// Returns everything about a bundle in one call — useful for logging/debugging

export async function getBundleReport(bundleId: string) {
  const [submission, events, decisions] = await Promise.all([
    getBundleSubmission(bundleId),
    getLifecycleEvents(bundleId),
    getAgentDecisions(bundleId),
  ]);

  if (!submission) return null;

  return {
    submission,
    events,
    decisions,
    summary: {
      bundleId,
      finalStage: submission.finalStage,
      tipLamports: submission.tipLamports,
      retryCount: submission.retryCount,
      totalDurationMs:
        submission.finalizedAt && submission.submittedAt
          ? submission.finalizedAt.getTime() -
            submission.submittedAt.getTime()
          : null,
      stagesReached: events.map((e) => e.stage),
      failed: submission.finalStage === "FAILED",
      failureType: submission.failureType ?? null,
    },
  };
}