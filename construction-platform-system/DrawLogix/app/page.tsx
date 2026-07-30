import { getActiveOrgId, listOrgs } from "@/db/tenant";
import { DxfEditor } from "./_components/dxf-editor";

export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const [orgs, activeOrgId] = await Promise.all([listOrgs(), getActiveOrgId()]);
  const orgName = orgs.find((o) => o.id === activeOrgId)?.name ?? null;
  return <DxfEditor orgName={orgName} />;
}
