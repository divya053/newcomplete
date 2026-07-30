"use server";

import { revalidatePath } from "next/cache";
import * as host from "@/domain/host";
import { toErrorResponse } from "./errors";
import { resolveHostContext } from "./host-context";

/**
 * Host Console server actions — the BFF boundary (spec §0.4/§0.5). Each resolves the
 * HOST context (host-org membership), delegates to a domain mutation (which authorizes
 * + audits), then revalidates the affected route. Errors are mapped to the one
 * envelope shape so client forms render a consistent message. Every export is an
 * `async function` (a "use server" requirement).
 */

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: (ctx: Awaited<ReturnType<typeof resolveHostContext>>) => Promise<T>, revalidate?: string): Promise<ActionResult<T>> {
  try {
    const ctx = await resolveHostContext();
    const data = await fn(ctx);
    if (revalidate) revalidatePath(revalidate);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: toErrorResponse(e).body.error.message };
  }
}

// Tenants
export async function provisionTenantAction(input: Parameters<typeof host.provisionTenant>[1]) {
  return run((ctx) => host.provisionTenant(ctx, input), "/host/tenants");
}
export async function suspendTenantAction(orgId: string, reason: string) {
  return run((ctx) => host.suspendTenant(ctx, orgId, reason), "/host/tenants");
}
export async function restoreTenantAction(orgId: string) {
  return run((ctx) => host.restoreTenant(ctx, orgId), "/host/tenants");
}
export async function changeTenantEditionAction(orgId: string, editionId: string) {
  return run((ctx) => host.changeTenantEdition(ctx, orgId, editionId), "/host/tenants");
}
export async function impersonateAction(orgId: string, reason: string) {
  return run((ctx) => host.startImpersonation(ctx, orgId, reason), "/host/tenants");
}

// Catalog
export async function createEditionAction(input: Parameters<typeof host.createEdition>[1]) {
  return run((ctx) => host.createEdition(ctx, input), "/host/editions");
}
export async function setEditionStatusAction(id: string, status: "draft" | "published" | "archived") {
  return run((ctx) => host.setEditionStatus(ctx, id, status), "/host/editions");
}
export async function createFeatureAction(input: Parameters<typeof host.createFeature>[1]) {
  return run((ctx) => host.createFeature(ctx, input), "/host/features");
}

// Pricing
export async function setEditionPriceAction(editionId: string, currency: string, monthlyMinor: number, annualMinor: number) {
  return run((ctx) => host.setEditionPrice(ctx, editionId, currency, monthlyMinor, annualMinor), "/host/pricing");
}
export async function createCouponAction(input: Parameters<typeof host.createCoupon>[1]) {
  return run((ctx) => host.createCoupon(ctx, input), "/host/pricing");
}

// Billing
export async function retryInvoiceAction(id: string) {
  return run((ctx) => host.retryInvoice(ctx, id), "/host/subscriptions");
}

// Notifications
export async function sendBroadcastAction(input: Parameters<typeof host.sendBroadcast>[1]) {
  return run((ctx) => host.sendBroadcast(ctx, input), "/host/notifications");
}
export async function markAllInboxReadAction() {
  return run((ctx) => host.markAllInboxRead(ctx), "/host/notifications");
}

// Host users & roles
export async function inviteHostUserAction(input: Parameters<typeof host.inviteHostUser>[1]) {
  return run((ctx) => host.inviteHostUser(ctx, input), "/host/users");
}
export async function createHostRoleAction(input: Parameters<typeof host.createHostRole>[1]) {
  return run((ctx) => host.createHostRole(ctx, input), "/host/users");
}

// Settings
export async function updateSettingsAction(patch: Record<string, unknown>) {
  return run((ctx) => host.updateSettings(ctx, patch), "/host/settings");
}
export async function toggleMaintenanceAction(enabled: boolean, message: string) {
  return run((ctx) => host.toggleMaintenance(ctx, enabled, message), "/host/settings");
}

// Observability
export async function retryJobAction(id: string) {
  return run((ctx) => host.retryJob(ctx, id), "/host/observability");
}
export async function resolveJobAction(id: string, note: string) {
  return run((ctx) => host.resolveJob(ctx, id, note), "/host/observability");
}
