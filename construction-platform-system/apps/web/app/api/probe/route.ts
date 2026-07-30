import { NextResponse } from "next/server";
import { runNoopProbe } from "@/server/probe";

/**
 * EXIT GATE #1 demo: GET /api/probe?echo=hello round-trips the seam
 * (TS → Redis → Python worker → TS). Returns the worker's echoed result, proving
 * both runtimes are wired across the one arq/Redis seam.
 */
export async function GET(req: Request) {
  const echo = new URL(req.url).searchParams.get("echo") ?? "ping";
  try {
    const out = await runNoopProbe(echo);
    return NextResponse.json(out, { status: out.ok ? 200 : 504 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
