import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Better Auth mounts ALL its endpoints (sign-in/up/out, session, …) under
// /api/auth/* (ws 0.3). This is the only auth route the app exposes.
export const { GET, POST } = toNextJsHandler(auth);
