"use client";
// AI usage — what is running, what it cost, and what it is on course to cost.
//
// Every figure reads ai_usage_ledger, which holds one row per ATTEMPT. A job
// that failed twice and then succeeded is three rows here and one on ai_job,
// and the bill is the three — so a page built on ai_job would under-report
// exactly the calls nobody remembers paying for.
//
// It refreshes on a timer because the question it answers is "what is happening
// now", and a number that needs a manual reload to be true is a number people
// stop trusting.

import { useEffect, useState } from "react";
import { useApi, Skeleton } from "@/lib/ui";
import { useI18n } from "@/lib/i18n";

const money = (minor: number, cur = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format((minor ?? 0) / 100);
const num = (n: number) => new Intl.NumberFormat().format(Math.round(n ?? 0));

/** 12345 → 12.3k. Token counts are read for magnitude, not to the digit. */
/** "2026-08" → "August 2026", in the reader's own locale. */
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" })
    .format(new Date(y, (m ?? 1) - 1, 1));
};

const compact = (n: number) =>
  new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n ?? 0);

export default function UsageAdmin() {
  const { t } = useI18n();
  const [tick, setTick] = useState(0);
  /* "" = this month. A YYYY-MM pins a past one; "all" is since the beginning. */
  const [period, setPeriod] = useState("");
  const usage = useApi<any>(`/usage?t=${tick}${period ? `&month=${period}` : ""}`);

  /* Only the current month moves under you. Polling a finished one re-fetches
     numbers that cannot change, so the timer stops when you look back.

     All-time is NOT finished — it contains the current month and is still
     accumulating — so it keeps polling and is never labelled closed. Treating
     "not this month" as "closed" put a "closed period" chip on a running total. */
  const isAllTime = period === "all";
  const isPastMonth = period !== "" && !isAllTime;
  const live = period === "" || isAllTime;

  // 15s. Fast enough that "running now" means now; slow enough that a page left
  // open on a wall display is not a load generator of its own.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [live]);

  if (usage.loading && !usage.data) return <Skeleton rows={6} />;
  if (usage.error) return <div className="card"><p className="csub">{String(usage.error)}</p></div>;

  const d = usage.data;
  if (!d) return null;

  const cacheRate = d.month.calls ? Math.round((100 * d.month.cacheHits) / d.month.calls) : 0;
  const failRate = d.month.calls ? Math.round((100 * d.month.failed) / d.month.calls) : 0;
  const wasteMinor = (d.waste ?? []).reduce((a: number, w: any) => a + Number(w.cost_minor ?? 0), 0);
  const wasteTokens = (d.waste ?? []).reduce((a: number, w: any) => a + Number(w.tokens ?? 0), 0);
  const wasteCalls = (d.waste ?? []).reduce((a: number, w: any) => a + Number(w.calls ?? 0), 0);
  /* Lead with money where there is money, and with tokens where there is not.
     A failed call can record zero cost and still have burned the context window
     — reading "$0.00" beside "49% of calls produced nothing" makes the panel
     look broken when it is in fact telling the truth about a cheap failure. */
  const wasteValue = wasteMinor > 0 ? money(wasteMinor) : `${compact(wasteTokens)} tok`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Which period. The page answered only "this month", which is not the
             question someone signing off a bill asks. ──────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="sl">{t("usage.period")}</span>
        <select
          className="mono"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          aria-label={t("usage.period")}
          style={{ fontSize: 12, padding: "6px 10px", border: "1px solid var(--hairline)",
                   borderRadius: 7, background: "var(--panel-2)", color: "var(--ink)" }}
        >
          <option value="">{t("usage.thisMonth")}</option>
          {(d.months ?? [])
            .filter((m: any) => m.ym !== new Date().toISOString().slice(0, 7))
            .map((m: any) => <option key={m.ym} value={m.ym}>{monthLabel(m.ym)}</option>)}
          <option value="all">{t("usage.allTime")}</option>
        </select>
        {isPastMonth && <span className="chip">{t("usage.historic")}</span>}
      </div>

      {/* ── The four numbers someone opens this page for ─────────────────── */}
      <div className="kpis">
        <Kpi label={t("usage.running")} value={`${d.live.running}`}
             sub={d.live.queued ? t("usage.queuedN", { n: d.live.queued }) : t("usage.queueEmpty")}
             warn={d.live.oldestWaitSeconds > 300} />
        <Kpi label={t("usage.spentMonth")} value={money(d.month.costMinor)}
             sub={t("usage.callsN", { n: num(d.month.calls) })} />
        {/* A projection only means something for a part-elapsed period. On a
            finished month the API returns the actual, so calling it "projected"
            would dress a final figure up as an estimate. */}
        <Kpi
          label={isPastMonth ? t("usage.finalTotal") : t("usage.projected")}
          value={money(d.month.projectedCostMinor)}
          sub={isPastMonth
            ? t("usage.finalTotalSub")
            : isAllTime
              ? t("usage.allTimeSub")
              : t("usage.projectedSub", { day: d.month.dayOfMonth, days: d.month.daysInMonth })} />
        <Kpi label={t("usage.wasted")} value={wasteValue}
             sub={t("usage.wastedSub", { n: num(wasteCalls), pct: failRate })}
             warn={wasteCalls > 0} />
      </div>

      {/* ── Per step. The table the question "how much does this step cost"
             is actually asking. ────────────────────────────────────────── */}
      <div className="card" style={{ padding: "14px 18px" }}>
        <div className="chead"><div>
          <h2>{t("usage.byStep")}</h2>
          <div className="csub">{t("usage.byStepSub")}</div>
        </div></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ marginTop: 8 }}>
            <thead><tr>
              <th>{t("usage.colStep")}</th>
              <th>{t("usage.colClass")}</th>
              <th className="r">{t("usage.colCalls")}</th>
              <th className="r">{t("usage.colIn")}</th>
              <th className="r">{t("usage.colOut")}</th>
              <th className="r">{t("usage.colWorst")}</th>
              <th className="r">{t("usage.colMs")}</th>
              <th className="r">{t("usage.colConf")}</th>
              <th className="r">{t("usage.colFailed")}</th>
              <th className="r">{t("usage.colCost")}</th>
            </tr></thead>
            <tbody>
              {(d.byStep ?? []).map((r: any, i: number) => (
                <tr key={i} className={Number(r.failed) > 0 || Number(r.empty_answers) > 0 ? "flagged" : ""}>
                  <td className="t-name">{r.task_type}<br /><span className="csub mono" style={{ fontSize: 11 }}>{r.module}</span></td>
                  <td><span className="chip">{r.execution_class}</span></td>
                  <td className="r num">{num(r.calls)}</td>
                  <td className="r num">{num(r.in_avg)}</td>
                  <td className="r num">{num(r.out_avg)}</td>
                  <td className="r num">{compact(r.worst)}</td>
                  <td className="r num">{r.ms_avg ? num(r.ms_avg) : "—"}</td>
                  <td className="r num">{r.conf_avg ?? "—"}</td>
                  <td className="r num">
                    {Number(r.failed) || Number(r.empty_answers)
                      ? `${num(r.failed)}${Number(r.empty_answers) ? ` +${num(r.empty_answers)}∅` : ""}`
                      : "—"}
                  </td>
                  <td className="r num">{money(r.cost_minor)}</td>
                </tr>
              ))}
              {!(d.byStep ?? []).length && (
                <tr><td colSpan={10}><span className="csub">{t("usage.none")}</span></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* ∅ needs saying once rather than being guessed at. */}
        <div className="csub" style={{ marginTop: 10 }}>{t("usage.emptyLegend")}</div>
      </div>

      {/* ── Month by month. The breakdown the picker indexes, and a trend on
             its own — one row per month that had any usage. ───────────────── */}
      {(d.months ?? []).length > 1 && (
        <div className="card" style={{ padding: "14px 18px" }}>
          <div className="chead"><div>
            <h2>{t("usage.byMonth")}</h2>
            <div className="csub">{t("usage.byMonthSub")}</div>
          </div></div>
          <table style={{ marginTop: 8 }}>
            <thead><tr>
              <th>{t("usage.colMonth")}</th>
              <th className="r">{t("usage.colCalls")}</th>
              <th className="r">{t("usage.colTokens")}</th>
              <th className="r">{t("usage.colFailed")}</th>
              <th className="r">{t("usage.colCost")}</th>
            </tr></thead>
            <tbody>
              {d.months.map((m: any) => (
                <tr key={m.ym}
                    className={m.ym === (d.period?.month ?? new Date().toISOString().slice(0, 7)) ? "flagged" : ""}
                    onClick={() => setPeriod(m.ym === new Date().toISOString().slice(0, 7) ? "" : m.ym)}
                    style={{ cursor: "pointer" }}>
                  <td className="t-name">{monthLabel(m.ym)}</td>
                  <td className="r num">{num(m.calls)}</td>
                  <td className="r num">{compact(m.tokens)}</td>
                  <td className="r num">{Number(m.failed) ? num(m.failed) : "—"}</td>
                  <td className="r num">{money(m.cost_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── The bill, per project ───────────────────────────────────────── */}
      <div className="card" style={{ padding: "14px 18px" }}>
        <div className="chead"><div>
          <h2>{t("usage.byProject")}</h2>
          <div className="csub">{t("usage.byProjectSub")}</div>
        </div></div>
        <table style={{ marginTop: 8 }}>
          <thead><tr>
            <th>{t("usage.colProject")}</th>
            <th className="r">{t("usage.colCalls")}</th>
            <th className="r">{t("usage.colTokens")}</th>
            <th className="r">{t("usage.colFailed")}</th>
            <th className="r">{t("usage.colCost")}</th>
          </tr></thead>
          <tbody>
            {(d.byProject ?? []).map((r: any) => (
              <tr key={r.id}>
                <td className="t-name">{r.name}<br /><span className="csub mono" style={{ fontSize: 11 }}>{r.code ?? "—"}</span></td>
                <td className="r num">{num(r.calls)}</td>
                <td className="r num">{compact(r.tokens)}</td>
                <td className="r num">{Number(r.failed) ? num(r.failed) : "—"}</td>
                <td className="r num">{money(r.cost_minor)}</td>
              </tr>
            ))}
            {!(d.byProject ?? []).length && (
              <tr><td colSpan={5}><span className="csub">{t("usage.none")}</span></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Spend with nothing to show for it ───────────────────────────── */}
      {(d.waste ?? []).length > 0 && (
        <div className="card" style={{ padding: "14px 18px" }}>
          <div className="chead"><div>
            <h2>{t("usage.waste")}</h2>
            <div className="csub">{t("usage.wasteSub")}</div>
          </div></div>
          <table style={{ marginTop: 8 }}>
            <thead><tr>
              <th>{t("usage.colStep")}</th>
              <th>{t("usage.colReason")}</th>
              <th className="r">{t("usage.colCalls")}</th>
              <th className="r">{t("usage.colTokens")}</th>
              <th className="r">{t("usage.colCost")}</th>
            </tr></thead>
            <tbody>
              {d.waste.map((r: any, i: number) => (
                <tr key={i} className="flagged">
                  <td className="t-name">{r.task_type}</td>
                  <td><span className="chip">{r.reason}</span></td>
                  <td className="r num">{num(r.calls)}</td>
                  <td className="r num">{compact(r.tokens)}</td>
                  <td className="r num">{money(r.cost_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Live tail. Proof the numbers above are not a cached summary. ── */}
      <div className="card" style={{ padding: "14px 18px" }}>
        <div className="chead"><div>
          <h2>{t("usage.recent")}</h2>
          <div className="csub">{t("usage.recentSub")}</div>
        </div></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ marginTop: 8 }}>
            <thead><tr>
              <th>{t("usage.colWhen")}</th>
              <th>{t("usage.colStep")}</th>
              <th>{t("usage.colProject")}</th>
              <th className="r">{t("usage.colTokens")}</th>
              <th className="r">{t("usage.colMs")}</th>
              <th className="r">{t("common.status")}</th>
            </tr></thead>
            <tbody>
              {(d.recent ?? []).map((r: any, i: number) => (
                <tr key={i} className={r.outcome !== "succeeded" ? "flagged" : ""}>
                  <td className="mono" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                    {new Date(r.created_at).toLocaleTimeString()}
                  </td>
                  <td className="t-name">{r.task_type}
                    {Number(r.attempt) > 1 && <span className="chip" style={{ marginInlineStart: 6 }}>#{r.attempt}</span>}
                  </td>
                  <td>{r.project ?? "—"}</td>
                  <td className="r num">{num(Number(r.input_tokens) + Number(r.output_tokens))}</td>
                  <td className="r num">{r.latency_ms ? num(r.latency_ms) : "—"}</td>
                  <td className="r">
                    <span className="chip">{r.validation_status ?? r.outcome}</span>
                  </td>
                </tr>
              ))}
              {!(d.recent ?? []).length && (
                <tr><td colSpan={6}><span className="csub">{t("usage.none")}</span></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="csub">{t("usage.footnote", { rate: cacheRate })}</p>
    </div>
  );
}

/* .k / .v / .sub are the existing KPI classes used across the app — reused
   rather than renamed, so this panel inherits the dashboard's type scale and
   its RTL numeral handling instead of drifting from it. */
function Kpi({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="kpi">
      <div className="k">{label}</div>
      <div className="v" style={warn ? { color: "var(--red)" } : undefined}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
