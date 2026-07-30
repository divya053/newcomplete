"use client";

import { createAuthClient } from "better-auth/react";

/** Browser auth client (ws 0.3) — used by the login/register forms. */
export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
