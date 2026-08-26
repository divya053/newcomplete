import { z } from "zod";
import { route, ok } from "@/lib/http";
import { requirePermission, requireProject } from "@/lib/context";
import { actorFromCtx } from "@/lib/usecase";
import { postUserMessage, clearConversation } from "@/lib/persona";

// §6.3 POST /projects/{pid}/conversations/{cid}/messages — append user turn +
// enqueue the persona's respond job (the assistant turn lands on the callback).
const Body = z.object({ content: z.string().min(1) });

export const POST = route<{ pid: string; cid: string }>(async (req, ctx, { pid, cid }) => {
  requirePermission(ctx, "workflow.read");
  await requireProject(ctx, pid);
  const body = Body.parse(await req.json());
  const { messageId, jobId } = await postUserMessage(actorFromCtx(ctx), {
    tenantId: ctx.tenantId,
    projectId: pid,
    conversationId: cid,
    userId: ctx.user.id,
    content: body.content,
  });
  return ok({ messageId, jobId }, 202);
});

// DELETE /projects/{pid}/conversations/{cid}/messages — empty the thread.
//
// On the messages collection rather than the conversation, because that is what
// it removes: the conversation row survives so the drawer can find the thread
// again. Deleting the conversation would orphan its run_id link.
//
// Gated on workflow.run, not workflow.read. Posting a message is read-level
// because the answer is advisory, but discarding the reasoning behind confirmed
// artifacts is not something a viewer should be able to do. workflow.run is the
// nearest existing right that separates people who drive a project from people
// who only look at one — there is no workflow.write in CORE_PERMISSIONS.
export const DELETE = route<{ pid: string; cid: string }>(async (_req, ctx, { pid, cid }) => {
  requirePermission(ctx, "workflow.run");
  await requireProject(ctx, pid);
  const { cleared } = await clearConversation(actorFromCtx(ctx), {
    tenantId: ctx.tenantId,
    projectId: pid,
    conversationId: cid,
  });
  return ok({ conversationId: cid, cleared });
});
