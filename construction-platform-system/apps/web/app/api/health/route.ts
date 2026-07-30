import { NextResponse } from "next/server";

// Liveness probe for the web runtime. The AI tier exposes its own /health.
export function GET() {
  return NextResponse.json({ status: "ok", runtime: "web" });
}
