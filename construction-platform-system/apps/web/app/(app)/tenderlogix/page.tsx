import { env } from "@/lib/env";
import { resolveContext } from "@/server/context";

/**
 * TenderLogix — the AutoCAD-BOQ-Tender app, run as a federated service and embedded
 * INSIDE the platform shell (behind the platform login). The full app (projects,
 * document upload, CAD viewer, the multi-agent BOQ pipeline, QS approval grid,
 * exports) runs on its own services; the platform is the authenticated front door.
 *
 * (A deeper "absorb" into a native bounded context lives in src/domain/tenderlogix
 * + the tender_* tables — used when/if we re-home the domain. This page is the
 * working app surfaced now.)
 */
export default async function TenderLogixPage() {
  await resolveContext(); // must be authenticated to reach this (the layout also gates)
  const url = env.TENDERLOGIX_URL;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">TenderLogix</h1>
        <a href={url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
          Open full screen ↗
        </a>
      </div>
      <iframe
        src={url}
        title="TenderLogix — AutoCAD BOQ Tender"
        className="w-full flex-1 rounded-lg border border-border bg-white"
        // allow the embedded app's own scripts, forms, downloads, popups
        sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-popups allow-modals"
      />
    </div>
  );
}
