import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema, type ScheduleRow } from "@/db/client";
import { isAiConfigured, runArchitectAgent } from "@/ai/agent";
import { withTenant } from "@/db/tenant";
import { saveConcept } from "./persist";

/**
 * AI copilot turn: store the user message, run the Claude tool-calling agent against
 * the project's current concept, persist its edits (re-rendering plan/DXF/3D/IFC from
 * the new schedule), and store the assistant reply. Falls back to a no-AI message if
 * the key isn't configured.
 */
export async function sendCopilotMessage(orgId: string, projectId: string, content: string) {
  const text = content.trim();
  if (!text) throw new Error("Type a message");

  await withTenant(orgId, async (tx) => {
    await tx.insert(schema.drawingMessages).values({ id: randomUUID(), orgId, projectId, role: "user", content: text });
  });

  let reply: string;
  if (!isAiConfigured()) {
    reply = "The AI copilot isn't configured (no ANTHROPIC_API_KEY). Add it to .env.local to enable conversational design.";
  } else {
    const current = await loadSchedule(orgId, projectId);
    try {
      const { schedule, reply: agentReply } = await runArchitectAgent(current, text);
      await saveConcept(orgId, projectId, schedule);
      reply = agentReply;
    } catch (e) {
      reply = `The copilot hit an error: ${(e as Error).message}`;
    }
  }

  await withTenant(orgId, async (tx) => {
    await tx.insert(schema.drawingMessages).values({ id: randomUUID(), orgId, projectId, role: "assistant", content: reply });
  });
  return { reply };
}

/** Design a whole building from a natural-language brief, in one shot. */
export async function designFromBrief(orgId: string, projectId: string, brief: string) {
  const text = brief.trim();
  if (!text) throw new Error("Describe the building you want");
  if (!isAiConfigured()) throw new Error("AI copilot isn't configured (no ANTHROPIC_API_KEY).");

  const current = await loadSchedule(orgId, projectId);
  const { schedule, reply } = await runArchitectAgent(current, `Design this from scratch: ${text}`);
  await saveConcept(orgId, projectId, schedule);

  await withTenant(orgId, async (tx) => {
    await tx.insert(schema.drawingMessages).values({ id: randomUUID(), orgId, projectId, role: "user", content: `Design: ${text}` });
    await tx.insert(schema.drawingMessages).values({ id: randomUUID(), orgId, projectId, role: "assistant", content: reply });
  });
  return { reply };
}

async function loadSchedule(orgId: string, projectId: string): Promise<ScheduleRow[]> {
  const drawing = (
    await db
      .select({ schedule: schema.drawings.schedule })
      .from(schema.drawings)
      .where(and(eq(schema.drawings.orgId, orgId), eq(schema.drawings.projectId, projectId), isNull(schema.drawings.archivedAt)))
      .orderBy(desc(schema.drawings.createdAt))
      .limit(1)
  )[0];
  return (drawing?.schedule as ScheduleRow[] | null) ?? [];
}
