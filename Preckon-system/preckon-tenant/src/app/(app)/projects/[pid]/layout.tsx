"use client";
// The project workspace. The tab bar *is* the preconstruction chain: each stage
// carries a status dot derived from its own artifacts, so you can see at a
// glance where the bid is and who it is waiting on.
//
// The layout owns the project's data (artifacts, runs, workflows) and hands it
// down, so the seven module surfaces don't each re-fetch the same graph.

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useApi, Skeleton, ErrorBox, StatusChip } from "@/lib/ui";
import { ProjectContext, type Project, type Lifecycle } from "@/lib/project";
import { buildChain, type LicensedModule } from "@/lib/chain";
import { useI18n, type Key } from "@/lib/i18n";
import { useCopilot } from "@/lib/appctx";

export default function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ pid: string }> }) {
  const { pid } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const openCopilot = useCopilot();
  const { t } = useI18n();

  // The layout owns the project graph for every child surface, so it polls on a
  // slow cadence: the artifact list is the heaviest read in the app, and a child
  // page (a live run, say) polls its own endpoint far more often on top of this.
  const proj = useApi<Project>(`/projects/${pid}`);
  const lc = useApi<Lifecycle>(`/projects/${pid}/lifecycle`, [], { refreshMs: 15000 });
  const artifacts = useApi<any[]>(`/projects/${pid}/artifacts`, [], { refreshMs: 10000 });
  /* A run in flight is the one moment this screen is changing while someone
     watches it, so the poll tightens to three seconds and drops back when the
     run settles. Ten is fine for an idle project and far too slow underneath a
     stage header counting seconds — the clock would tick smoothly and the
     progress beside it would arrive in ten-second jumps. */
  const [liveRun, setLiveRun] = useState(false);
  const runs = useApi<any[]>(`/projects/${pid}/runs`, [], { refreshMs: liveRun ? 3000 : 10000 });

  const anyLive = (runs.data ?? []).some((r) => r.status === "running");
  useEffect(() => { setLiveRun(anyLive); }, [anyLive]);

  /* The moment a run stops, re-read the artifacts. Without this the stage says
     "completed in 2m 14s" while the panel underneath still shows what was there
     before it ran, for up to another ten seconds — the run is announced as
     finished and its output is not yet on screen. */
  const wasLive = useRef(anyLive);
  const reloadArtifacts = artifacts.reload;
  useEffect(() => {
    if (wasLive.current && !anyLive) reloadArtifacts();
    wasLive.current = anyLive;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyLive]);
  const workflows = useApi<{ key: string; name: string; moduleKey: string }[]>("/workflows");
  const ent = useApi<{ licensedModules: LicensedModule[] }>("/entitlements");

  if (proj.loading) return <Skeleton rows={6} />;
  if (proj.error || !proj.data) return <ErrorBox message={proj.error ?? t("project.notFound")} onRetry={proj.reload} />;

  const project = proj.data;
  const base = `/projects/${pid}`;
  const live = (artifacts.data ?? []).filter((a) => a.status !== "superseded");
  const stages = buildChain(ent.data?.licensedModules ?? [], artifacts.data ?? [], runs.data ?? [], workflows.data ?? []);

  const reload = () => { proj.reload(); lc.reload(); artifacts.reload(); runs.reload(); };
  const on = (href: string, exact = false) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <ProjectContext.Provider
      value={{
        project,
        lifecycle: lc.data,
        artifacts: live,
        runs: runs.data ?? [],
        workflows: workflows.data ?? [],
        stages,
        loading: artifacts.loading || ent.loading,
        reload,
      }}
    >
      <button className="pw-back" onClick={() => router.push("/projects")}>
        <svg className="dir-flip" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        {t("project.back")}
      </button>

      <div className="pw-head">
        <div>
          <h1>{project.name}</h1>
          <div className="pw-meta">
            {project.client_name && <span className="mc">{project.client_name}</span>}
            {project.code && <span className="mc">{project.code}</span>}
            {project.lifecycle_key && <StatusChip status={lc.data?.state ?? project.lifecycle_state} />}
            <StatusChip status={project.status} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="mini" onClick={openCopilot}>{t("project.askCopilot")}</button>
        </div>
      </div>

      <nav className="pw-tabs">
        <Link href={base} className={on(base, true) ? "on" : ""}>{t("tab.overview")}</Link>
        <Link href={`${base}/documents`} className={on(`${base}/documents`) ? "on" : ""}>
          <span className="sd processing" />{t("tab.documents")}
        </Link>

        {/* The chain itself — one tab per licensed module, in running order. */}
        {stages.map((s) => {
          const href = `${base}/modules/${s.key}`;
          return (
            <Link key={s.key} href={href} className={on(href) ? "on" : ""} title={s.full}>
              <span className={"sd " + s.status} />{t(("stage." + s.key) as Key)}
            </Link>
          );
        })}

        {/* Submission closes the chain, after Procurement. It is not a module:
            there is no agent to run and nothing to derive — the bonds and
            certificates are chased, not computed. A stage that could never be
            run would sit at "pending" for ever, so it is a register instead. */}
        <span className="sep" aria-hidden />
        <Link href={`${base}/submission`} className={on(`${base}/submission`) ? "on" : ""}>
          {t("tab.submission")}
        </Link>
      </nav>

      {children}
    </ProjectContext.Provider>
  );
}
