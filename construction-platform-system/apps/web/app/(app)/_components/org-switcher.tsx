"use client";

import { Select } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { switchOrgAction } from "@/server/tenancy";

/** Active-tenant switcher. Changing it sets the active-org cookie and re-scopes everything. */
export function OrgSwitcher({ orgs, activeOrgId }: { orgs: { orgId: string; orgName: string }[]; activeOrgId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onChange(orgId: string) {
    if (orgId === activeOrgId) return;
    setBusy(true);
    try {
      await switchOrgAction(orgId);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Select
      key={activeOrgId}
      className="h-8 w-56"
      aria-label="Active organization"
      defaultValue={activeOrgId}
      disabled={busy || orgs.length <= 1}
      onChange={(e) => onChange(e.target.value)}
    >
      {orgs.map((o) => (
        <option key={o.orgId} value={o.orgId}>
          {o.orgName}
        </option>
      ))}
    </Select>
  );
}
