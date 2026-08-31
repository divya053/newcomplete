"use client";
import { useEffect, useMemo, useState } from "react";
import { useApi, useCan, useToast, Skeleton, EmptyState, StatusChip, Drawer, Field, fmtDate } from "@/lib/ui";
import { api } from "@/lib/apiclient";
import { Icon } from "@/lib/icons";
import { useI18n, type Key } from "@/lib/i18n";
import { permLabel, permHint, domainLabel, roleLabel, tierHint } from "./permission-labels";

const TIERS = ["owner_admin", "delivery", "review", "view"];
const tierLabel = (t: (k: Key) => string, tier: string) => t(("tier." + tier) as Key);

/** Team & roles — the customer's own RBAC surface, used by Admin → Team. */
export default function TeamAdmin() {
  const canManage = useCan("admin.users");
  const toast = useToast();
  const { t } = useI18n();
  const users = useApi<any[]>("/users", [], { refreshMs: 8000 });
  const roles = useApi<any[]>("/roles");
  const perms = useApi<any[]>("/permissions");

  const roleList = roles.data ?? [];
  const permsByDomain = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of perms.data ?? []) { const a = m.get(p.domain) ?? []; a.push(p); m.set(p.domain, a); }
    return [...m.entries()];
  }, [perms.data]);

  // ── drawers
  const [addUser, setAddUser] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [roleDrawer, setRoleDrawer] = useState<null | { mode: "new" | "edit"; role?: any }>(null);
  const [invite, setInvite] = useState<{ email: string; password: string } | null>(null);

  return (
    <>

      {invite && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--teal)", background: "var(--teal-tint)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 3 }}>{t("team.inviteHeading")}</div>
              <div style={{ fontSize: 13 }}><span className="mono">{invite.email}</span> · {t("team.tempPassword")} <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>{invite.password}</span></div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="mini sm" onClick={() => { navigator.clipboard?.writeText(`${invite.email} / ${invite.password}`); toast(t("team.copied")); }}>{t("team.copy")}</button>
              <button className="mini sm" onClick={() => setInvite(null)}>{t("team.dismiss")}</button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chead">
          <div><h2>{t("admin.people")}</h2><div className="csub">{t("admin.peopleSub", { n: (users.data ?? []).length })}</div></div>
          {canManage && <button className="mini sm pri" onClick={() => setAddUser(true)}><Icon.add /> {t("admin.invite")}</button>}
        </div>
        {users.loading ? <Skeleton rows={3} /> : users.error ? <EmptyState title={t("team.loadFail")} sub={users.error} /> : (
          <table>
            <thead><tr><th>{t("team.colMember")}</th><th>{t("settings.email")}</th><th>{t("team.colRole")}</th><th>{t("common.status")}</th><th className="r">{t("team.colLastActive")}</th>{canManage && <th></th>}</tr></thead>
            <tbody>
              {(users.data ?? []).map((u) => (
                <tr key={u.id}>
                  <td className="t-name">{u.name ?? "—"}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{u.email}</td>
                  <td>{u.roles ? u.roles.split(", ").map((r: string) => <span key={r} className="chip plain" style={{ marginRight: 4, color: "var(--slate-600)", background: "var(--panel-2)" }}>{r}</span>) : <span className="csub">{t("team.noRoles")}</span>}</td>
                  <td><StatusChip status={u.status} /></td>
                  <td className="r mono" style={{ fontSize: 11.5 }}>{fmtDate(u.created_at)}</td>
                  {canManage && (
                    <td className="r" style={{ whiteSpace: "nowrap" }}>
                      <button className="mini sm" onClick={() => setEditUser(u)}>{t("team.rolesBtn")}</button>{" "}
                      <button className="mini sm" onClick={async () => {
                        const status = u.status === "suspended" ? "active" : "suspended";
                        try { await api.patch(`/users/${u.id}`, { status }); toast(status === "active" ? t("team.activated") : t("team.deactivated")); users.reload(); }
                        catch (e: any) { toast(e?.message ?? t("team.updateFail")); }
                      }}>{u.status === "suspended" ? t("team.activate") : t("team.deactivate")}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="chead"><h2>{t("team.roles")}</h2>{canManage && <button className="mini sm pri" onClick={() => setRoleDrawer({ mode: "new" })}><Icon.add /> {t("team.newRole")}</button>}</div>
        {roles.loading ? <Skeleton rows={3} /> : (
          <table>
            <thead><tr><th>{t("team.colRoleName")}</th><th>{t("team.colKey")}</th><th>{t("team.colTier")}</th><th className="r">{t("team.colPerms")}</th>{canManage && <th></th>}</tr></thead>
            <tbody>
              {roleList.map((r) => (
                <tr key={r.id}>
                  <td className="t-name">{roleLabel(t, r)}{r.is_system ? <span className="chip plain" style={{ marginLeft: 6, color: "var(--teal-press)", background: "var(--teal-tint)" }}>{t("team.systemChip")}</span> : null}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.key}</td>
                  <td style={{ fontSize: 12.5 }}>{tierLabel(t, r.tier)}</td>
                  <td className="r num">{r.permissions}</td>
                  {canManage && (
                    <td className="r" style={{ whiteSpace: "nowrap" }}>
                      {r.is_system ? <span className="csub" style={{ fontSize: 11 }}>{t("team.readOnly")}</span> : (
                        <>
                          <button className="mini sm" onClick={() => setRoleDrawer({ mode: "edit", role: r })}>{t("common.edit")}</button>{" "}
                          <button className="mini sm" onClick={async () => {
                            if (!window.confirm(t("team.deleteRoleConfirm", { name: r.name }))) return;
                            try { await api.del(`/roles/${r.id}`); toast(t("team.roleDeleted")); roles.reload(); users.reload(); }
                            catch (e: any) { toast(e?.message ?? t("team.roleDeleteFail")); }
                          }}>{t("common.remove")}</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {addUser && <AddUserDrawer roles={roleList} onClose={() => setAddUser(false)} onDone={(res: any) => { setAddUser(false); users.reload(); if (res?.password) setInvite({ email: res.email, password: res.password }); }} toast={toast} t={t} />}
      {editUser && <EditUserDrawer user={editUser} roles={roleList} onClose={() => setEditUser(null)} onDone={() => { setEditUser(null); users.reload(); }} toast={toast} t={t} />}
      {roleDrawer && <RoleDrawer drawer={roleDrawer} permsByDomain={permsByDomain} onClose={() => setRoleDrawer(null)} onDone={() => { setRoleDrawer(null); roles.reload(); }} toast={toast} t={t} />}
    </>
  );
}

function RoleCheck({ roles, selected, toggle }: { roles: any[]; selected: Set<string>; toggle: (k: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {roles.map((r) => (
        <label key={r.key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} style={{ width: "auto" }} />
          {r.name} <span className="mono" style={{ fontSize: 10.5, color: "var(--slate-400)" }}>{r.key}</span>
        </label>
      ))}
    </div>
  );
}

function AddUserDrawer({ roles, onClose, onDone, toast, t }: any) {
  const [email, setEmail] = useState(""); const [name, setName] = useState("");
  const [pw, setPw] = useState(""); const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  /** Whole group on or off. Nineteen checkboxes is a lot of clicking for
      "this role can do everything with projects". */
  const setMany = (keys: string[], on: boolean) =>
    setSel((s) => { const n = new Set(s); for (const k of keys) on ? n.add(k) : n.delete(k); return n; });

  /* Search matches what is ON SCREEN as well as the key underneath, so typing
     "approve" finds bid.approve and artifact.confirm - which is how someone
     who does not know the keys would look for them. Groups that end up empty
     are dropped rather than left as bare headings. */
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return permsByDomain;
    const hit = (p: any) =>
      p.key.toLowerCase().includes(needle) ||
      String(p.description ?? "").toLowerCase().includes(needle) ||
      permLabel(t, p.key, p.description).toLowerCase().includes(needle) ||
      (permHint(t, p.key) ?? "").toLowerCase().includes(needle);
    return permsByDomain
      .map(([d, list]: any) => [d, list.filter(hit)])
      .filter(([, list]: any) => list.length > 0);
  }, [q, permsByDomain, t]);
  async function submit() {
    if (!email.trim()) return; setBusy(true);
    try {
      const res = await api.post<any>("/users", { email, name: name || undefined, roleKeys: [...sel], password: pw || undefined });
      toast(t("team.added"));
      onDone(res);
    } catch (e: any) { toast(e?.message ?? t("team.addFail")); } finally { setBusy(false); }
  }
  return (
    <Drawer open title={t("team.addMember")} onClose={onClose}
      footer={<><button className="mini" onClick={onClose}>{t("common.cancel")}</button><button className="mini pri" disabled={busy || !email.trim()} onClick={submit}>{busy ? t("team.adding") : t("team.addMember")}</button></>}>
      <Field label={t("team.fieldEmail")}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" /></Field>
      <Field label={t("team.fieldName")}><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t("team.fieldTempPw")}><input value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("team.tempPwHint")} /></Field>
      <Field label={t("team.roles")}><RoleCheck roles={roles} selected={sel} toggle={toggle} /></Field>
    </Drawer>
  );
}

function EditUserDrawer({ user, roles, onClose, onDone, toast, t }: any) {
  const initial = new Set<string>((user.role_keys ? String(user.role_keys).split(",") : []).filter(Boolean));
  const [sel, setSel] = useState<Set<string>>(initial);
  const [busy, setBusy] = useState(false);
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  async function submit() {
    setBusy(true);
    try { await api.patch(`/users/${user.id}`, { roleKeys: [...sel] }); toast(t("team.rolesUpdated")); onDone(); }
    catch (e: any) { toast(e?.message ?? t("team.updateFail")); } finally { setBusy(false); }
  }
  return (
    <Drawer open title={t("team.rolesFor", { name: user.name ?? user.email })} onClose={onClose}
      footer={<><button className="mini" onClick={onClose}>{t("common.cancel")}</button><button className="mini pri" disabled={busy} onClick={submit}>{busy ? t("common.saving") : t("team.saveRoles")}</button></>}>
      <RoleCheck roles={roles} selected={sel} toggle={toggle} />
    </Drawer>
  );
}

function RoleDrawer({ drawer, permsByDomain, onClose, onDone, toast, t }: any) {
  const editing = drawer.mode === "edit";
  const [name, setName] = useState(editing ? drawer.role.name : "");
  const [tier, setTier] = useState(editing ? drawer.role.tier : "delivery");
  const [sel, setSel] = useState<Set<string>>(new Set(editing && drawer.role.permission_keys ? String(drawer.role.permission_keys).split(",").filter(Boolean) : []));
  const [busy, setBusy] = useState(false);
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  async function submit() {
    if (!name.trim()) return; setBusy(true);
    try {
      if (editing) await api.patch(`/roles/${drawer.role.id}`, { name, permissions: [...sel] });
      else await api.post("/roles", { name, tier, permissions: [...sel] });
      toast(editing ? t("team.roleUpdated") : t("team.roleCreated")); onDone();
    } catch (e: any) { toast(e?.message ?? t("team.roleSaveFail")); } finally { setBusy(false); }
  }
  return (
    <Drawer open title={editing ? t("team.editRole", { name: drawer.role.name }) : t("team.newRole")} onClose={onClose}
      footer={<><button className="mini" onClick={onClose}>{t("common.cancel")}</button><button className="mini pri" disabled={busy || !name.trim()} onClick={submit}>{busy ? t("common.saving") : editing ? t("team.saveRole") : t("team.createRole")}</button></>}>
      <Field label={t("team.roleName")}><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      {!editing && (
        <Field label={t("team.tier")}>
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="rd-select">
            {TIERS.map((tr) => <option key={tr} value={tr}>{tierLabel(t, tr)}</option>)}
          </select>
          {/* What the tier actually means. It decides the ceiling on what this
              role may ever be granted, which is not something to infer from the
              word "Delivery". */}
          {tierHint(t, tier) && <p className="rd-hint">{tierHint(t, tier)}</p>}
        </Field>
      )}

      <div className="rd-perms">
        <div className="rd-permhead">
          <span className="rd-permcount">{t("team.permissionsCount", { n: sel.size })}</span>
          {/* The key is an identifier, not a label. Off by default; one click
              away for an administrator who needs to match it against a policy. */}
          <label className="rd-keys">
            <input type="checkbox" checked={showKeys} onChange={() => setShowKeys((v) => !v)} />
            {t("team.showKeys")}
          </label>
        </div>

        <input
          className="rd-search"
          type="search"
          value={q}
          placeholder={t("team.permSearch")}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t("team.permSearch")}
        />

        {sel.size === 0 && !q && <p className="rd-warn">{t("team.permNoneChosen")}</p>}

        {/* One scroll, not two. This list used to carry maxHeight:360 with its
            own overflow INSIDE the drawer body, which already scrolls - so a
            long list sat in a letterbox with empty drawer beneath it. */}
        {shown.length === 0 ? (
          <p className="rd-warn">{t("team.permNone", { q })}</p>
        ) : shown.map(([domain, list]: any) => {
          const keys = list.map((p: any) => p.key);
          const on = keys.filter((k: string) => sel.has(k)).length;
          return (
            <section key={domain} className="rd-group">
              <div className="rd-grouphead">
                <h4>{domainLabel(t, domain)}</h4>
                <span className="rd-groupn">{on}/{keys.length}</span>
                <button type="button" className="rd-linkbtn" onClick={() => setMany(keys, true)}>{t("team.selectAll")}</button>
                <button type="button" className="rd-linkbtn" onClick={() => setMany(keys, false)}>{t("team.clearGroup")}</button>
              </div>
              {list.map((p: any) => {
                const hint = permHint(t, p.key);
                return (
                  <label key={p.key} className={"rd-perm" + (sel.has(p.key) ? " on" : "")}>
                    <input type="checkbox" checked={sel.has(p.key)} onChange={() => toggle(p.key)} />
                    <span className="rd-permtext">
                      <span className="rd-permname">{permLabel(t, p.key, p.description)}</span>
                      {hint && <span className="rd-permhint">{hint}</span>}
                      {/* dir="ltr": a permission key is an identifier and must
                          not reorder under Arabic. */}
                      {showKeys && <span className="mono rd-permkey" dir="ltr">{p.key}</span>}
                    </span>
                  </label>
                );
              })}
            </section>
          );
        })}
      </div>
    </Drawer>
  );
}
