"use client";
// Settings — personal to you. The workspace-level things (team, branding, plan)
// live under Admin; this is profile, notifications and display preferences.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApi, useMe, useToast, Skeleton } from "@/lib/ui";
import { readPref, writePref } from "@/lib/brand";
import { LOCALES, localeMeta, useI18n, type Key, type Locale } from "@/lib/i18n";

const TABS: { key: string; label: Key }[] = [
  { key: "profile", label: "settings.tabProfile" },
  { key: "notifs", label: "settings.tabNotifs" },
  { key: "prefs", label: "settings.tabPrefs" },
];


/* Permission keys, grouped and translated into what they let a person do.
   The keys stay the source of truth — anything unmapped simply does not appear,
   so a new permission cannot silently claim a capability nobody wrote copy for. */
const PERM_TEXT: Record<string, Key> = {
  "project.create": "perm.projectCreate",
  "project.update": "perm.projectUpdate",
  "project.archive": "perm.projectArchive",
  "project.read_all": "perm.projectReadAll",
  "project.member.manage": "perm.projectMembers",
  "artifact.confirm": "perm.artifactConfirm",
  "artifact.edit": "perm.artifactEdit",
  "workflow.run": "perm.workflowRun",
  "library.manage": "perm.libraryManage",
  "admin.users": "perm.adminUsers",
  "admin.branding": "perm.adminBranding",
  "admin.settings": "perm.adminSettings",
  "billing.view": "perm.billingView",
  "tenant.transfer_ownership": "perm.transferOwnership",
};

const PERM_GROUPS: { domain: string; label: Key; keys: string[] }[] = [
  { domain: "project",  label: "perm.groupProjects", keys: ["project.create", "project.update", "project.archive", "project.read_all", "project.member.manage"] },
  { domain: "work",     label: "perm.groupWork",     keys: ["artifact.confirm", "artifact.edit", "workflow.run"] },
  { domain: "library",  label: "perm.groupLibrary",  keys: ["library.manage"] },
  { domain: "admin",    label: "perm.groupAdmin",    keys: ["admin.users", "admin.branding", "admin.settings", "billing.view", "tenant.transfer_ownership"] },
];

function groupPermissions(held: string[]): { domain: string; label: Key; can: Key[] }[] {
  const has = new Set(held);
  return PERM_GROUPS
    .map((g) => ({
      domain: g.domain,
      label: g.label,
      can: g.keys.filter((k) => has.has(k)).map((k) => PERM_TEXT[k]).filter(Boolean),
    }))
    .filter((g) => g.can.length > 0);
}

export default function SettingsPage() {
  const [tab, setTab] = useState("profile");
  const { t } = useI18n();
  return (
    <>
      <div className="page-head">
        <div><h1>{t("settings.title")}</h1><p>{t("settings.sub")}</p></div>
      </div>
      <nav className="pw-tabs">
        {TABS.map((x) => (
          <button key={x.key} className={tab === x.key ? "on" : ""} onClick={() => setTab(x.key)}>{t(x.label)}</button>
        ))}
      </nav>
      {tab === "profile" ? <Profile /> : tab === "notifs" ? <Notifications /> : <Preferences />}
    </>
  );
}

function Profile() {
  const me = useMe();
  const { t } = useI18n();
  const ent = useApi<{ editionRef: string | null; licensedModules: any[] }>("/entitlements");
  const initials = (me?.name ?? me?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="row two">
      <div className="card">
        <h2>{t("settings.profile")}</h2>
        <div className="csub">{t("settings.profileSub")}</div>
        <div className="brand-prev">
          <div className="avatar" style={{ width: 48, height: 48, fontSize: 16 }}>{initials}</div>
          <div>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{me?.name ?? me?.email ?? "—"}</div>
            <div style={{ fontSize: 12, color: "var(--slate-500)" }}>{me?.roles?.map((r) => r.name).join(", ") || t("settings.noRole")}</div>
          </div>
        </div>
        <div className="trow-lbl" style={{ marginTop: 14 }}>{t("settings.email")} <b className="mono">{me?.email ?? "—"}</b></div>
        <div className="trow-lbl">{t("settings.domain")} <b style={{ textTransform: "capitalize" }}>{me?.domain ?? "—"}</b></div>
        <div className="trow-lbl">{t("settings.edition")} <b style={{ textTransform: "capitalize" }}>{ent.data?.editionRef ?? "—"}</b></div>
        <p className="csub" style={{ marginTop: 14, marginBottom: 0 }}>
          {t("settings.profileNote")}
        </p>
      </div>

      <div className="card">
        <h2>{t("settings.canDo")}</h2>
        <div className="csub">{t("settings.canDoSub")}</div>
        {!me ? <Skeleton rows={3} /> : (
          /* Grouped by domain and written as things a person does, rather than
             a wall of raw keys. It listed "artifact.confirm", "workflow.run",
             "tenant.transfer_ownership" and twenty more in a flat row — every
             one of them accurate, and none of them an answer to "what can I do
             here?" for anyone who had not read the permission model. */
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            {groupPermissions(me.permissions).map((g) => (
              <div key={g.domain}>
                <div className="sl" style={{ marginBottom: 5 }}>{t(g.label)}</div>
                <ul style={{ margin: 0, paddingInlineStart: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                  {g.can.map((k) => <li key={k} className="csub" style={{ fontSize: 13 }}>{t(k)}</li>)}
                </ul>
              </div>
            ))}
            {me.permissions.length === 0 && <p className="csub" style={{ margin: 0 }}>{t("settings.noPerms")}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

const NOTIF_ROWS: { key: string; title: Key; desc: Key }[] = [
  { key: "review_ready", title: "settings.notifReview", desc: "settings.notifReviewSub" },
  { key: "run_failed", title: "settings.notifRun", desc: "settings.notifRunSub" },
  { key: "deadline", title: "settings.notifDeadline", desc: "settings.notifDeadlineSub" },
  { key: "weekly", title: "settings.notifWeekly", desc: "settings.notifWeeklySub" },
];

function Notifications() {
  const toast = useToast();
  const { t } = useI18n();
  const [on, setOn] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOn(readPref("notifs", { review_ready: true, run_failed: true, deadline: true, weekly: false } as Record<string, boolean>));
  }, []);

  function toggle(key: string) {
    const next = { ...on, [key]: !on[key] };
    setOn(next);
    writePref("notifs", next);
    toast(t("toast.prefSaved"));
  }

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <h2>{t("settings.notifs")}</h2>
      <div className="csub">{t("settings.notifsSub")}</div>
      {NOTIF_ROWS.map((r) => (
        <div className="set-row" key={r.key}>
          <div><div className="sl">{t(r.title)}</div><div className="desc">{t(r.desc)}</div></div>
          <button className={"switch" + (on[r.key] ? " on" : "")} onClick={() => toggle(r.key)} aria-label={t(r.title)} aria-pressed={!!on[r.key]} />
        </div>
      ))}
      <p className="csub" style={{ marginTop: 16, marginBottom: 0 }}>
        {t("settings.notifNote")}
      </p>
    </div>
  );
}

function Preferences() {
  const toast = useToast();
  const { t, locale, userLocale, tenantLocale, setUserLocale } = useI18n();
  const [theme, setTheme] = useState("light");
  const [prefs, setPrefs] = useState<{ currency: string; dateFormat: string }>({ currency: "USD", dateFormat: "DD MMM YYYY" });

  useEffect(() => {
    // The PREFERENCE, not the resolved theme: "system" must show as System in
    // the picker rather than as whatever the OS happens to be right now.
    setTheme(document.documentElement.getAttribute("data-theme-pref") ?? "system");
    setPrefs(readPref("display", { currency: "USD", dateFormat: "DD MMM YYYY" }));
  }, []);

  function setThemeMode(mode: string) {
    setTheme(mode);
    document.documentElement.setAttribute("data-theme", mode);
    try { localStorage.setItem("preckon-theme", mode); } catch {}
  }
  function setPref(k: "currency" | "dateFormat", v: string) {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    writePref("display", next);
    toast(t("toast.prefSaved"));
  }

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <h2>{t("settings.prefs")}</h2>
      <div className="csub">{t("settings.prefsSub")}</div>

      {/* Language is per-person; leaving it on the workspace default means a new
          admin choice takes effect here without anyone having to change it. */}
      <div className="set-row">
        <div><div className="sl">{t("settings.language")}</div><div className="desc">{t("settings.languageSub")}</div></div>
        <select
          value={userLocale ?? ""}
          onChange={(e) => setUserLocale(e.target.value ? (e.target.value as Locale) : null)}
          aria-label={t("settings.language")}
        >
          <option value="">{t("settings.languageWorkspace", { name: localeMeta(tenantLocale).native })}</option>
          {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
        </select>
      </div>

      <div className="set-row">
        <div><div className="sl">{t("settings.theme")}</div><div className="desc">{t("settings.themeSub")}</div></div>
        <div className="range">
          <button className={theme !== "dark" ? "on" : ""} onClick={() => setThemeMode("light")}>{t("settings.light")}</button>
          <button className={theme === "dark" ? "on" : ""} onClick={() => setThemeMode("dark")}>{t("settings.dark")}</button>
        </div>
      </div>

      <div className="set-row">
        <div><div className="sl">{t("settings.currency")}</div><div className="desc">{t("settings.currencySub")}</div></div>
        <select value={prefs.currency} onChange={(e) => setPref("currency", e.target.value)}>
          {["USD", "CAD", "EUR", "GBP", "AED"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="set-row">
        <div><div className="sl">{t("settings.dateFormat")}</div><div className="desc">{t("settings.dateFormatSub")}</div></div>
        <select value={prefs.dateFormat} onChange={(e) => setPref("dateFormat", e.target.value)}>
          {["DD MMM YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].map((f) => <option key={f}>{f}</option>)}
        </select>
      </div>

      <p className="csub" style={{ marginTop: 16, marginBottom: 0 }}>
        {t("settings.planLink")} <Link className="rowbtn" href="/admin">{t("nav.admin")}</Link>
      </p>
    </div>
  );
}
