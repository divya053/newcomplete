# Value Engineering in Preckon — where it already is, and what is missing

**Version:** 1.0 · **Date:** 26 August 2026
**Status:** Gap analysis against `preckon-engineering-bible` chapter `35-ValueLogix`

---

## 1. The finding that changes the question

Value Engineering is **already specified**, in depth, in the Preckon
Engineering Bible: chapter `35-ValueLogix`, twenty documents, roughly
230 KB of specification, plus a blueprint and a competitive parity
matrix.

That chapter covers essentially everything in the proposal that prompted
this note — including the two ideas presented as the furthest-reaching:

| Proposal | Already specified as |
|---|---|
| "continuous value engineering, not two workshops" | `PEB-VAL-140` — **Value Radar**: continuous detection, portfolio analytics, benchmark intelligence |
| "AI should not approve the VE decision" | `PEB-VAL-130` — AI-assisted VE: **grounding and authority boundaries** |
| Curtain wall A vs B with an impact table | `PEB-VAL-040` alternatives + `PEB-VAL-050` blast radius |
| "Direct saving vs lifecycle cost" | `PEB-VAL-060` — cost, lifecycle economics, carbon |
| "22 weeks → 14 weeks lead time" | `PEB-VAL-070` — procurement, constructability, schedule value |
| "fire-rating compliance confirmed" | `PEB-VAL-080` — compliance and contractual **hard gates** |
| "Architect + Structural + Client approve" | `PEB-VAL-100` — multidisciplinary review, **delegated authority** |
| "flows back into the baseline" | `PEB-VAL-110` — adoption, change control, cross-domain handover |

So the useful question is not *should Preckon do VE* or *what should it
look like*. Both are answered. The question is **what has to exist
before any of it can run**.

### A correction

An earlier review of the `Documents/` folder reported the PRA /
Engineering Bible as missing, because the Master Blueprint names it as
the detailed source of truth and no such file was in that folder. That
was wrong. It is a separate private repository — `preckon-engineering-bible`,
477 files across 28 chapters, with its own governance standards, a
specification quality gate and a docs-validation workflow.

---

## 2. What is built today

**Nothing.** ValueLogix appears in no part of the running system:

- no `valuelogix` module key in the construction pack — the eight seeded
  modules are tenderlogix, drawlogix, doclogix, quantlogix, costlogix,
  schedulelogix, narrativelogix, procurelogix
- no tables, no artifact type, no agent, no workflow
- no reference to value engineering anywhere in `src/` or `db/`

This is not a criticism of sequencing. VE sits on top of nearly every
other module, and several of those are themselves thin.

---

## 3. Why it cannot be built next

A VE item is only meaningful if the platform can answer, for one
proposed substitution:

> which drawings, specification clauses, BOQ items, cost lines,
> procurement packages and schedule activities does this touch, and what
> does each of them become?

That is `PEB-VAL-050`, blast radius, and it is the heart of the whole
chapter. Everything else in a VE case — the saving, the lead time, the
risk — is a consequence of that traversal.

Preckon cannot perform it yet:

| Needed by a VE case | State today |
|---|---|
| Cross-module impact traversal | `cad/impact.ts` does this shape of work for **drawings → measurements only**. There is no Doc→Draw→Quant→Cost→Schedule traversal. |
| Cost beyond pricing a BOQ | CostLogix is ~19%. Budget, commitments, forecast and lifecycle cost are not started. |
| Procurement lead time | ProcureLogix is ~17%. Package grouping exists; RFQ, quotes and commitments do not. |
| Schedule impact | ScheduleLogix is ~27%. A real CPM engine exists; calendars, baselines and progress do not. |
| Specification clause linkage | `spec_clause` extraction works. Clauses are not yet tracked requirement objects. |
| A stable baseline to compare against | `PEB-VAL-030` requires evidence authority and staleness. `pcm_quantity` has a status column; dirty propagation is not wired end to end. |

A VE module built on top of these would produce impact tables with most
cells empty, and a saving figure with no lifecycle or schedule term.
That is worse than not having it: a number presented with authority that
nobody can trace is exactly what VE is supposed to replace.

---

## 4. What Preckon already has that VE needs

The foundations are real, and they are the expensive ones:

- **Propose → review → apply → audit.** `PEB-VAL-130`'s authority
  boundary is not a new rule here; it is how the whole platform already
  works. `bim_proposal`, the artifact review queue, `run_deviation`
  approvals and the tamper-evident `audit_chain` are the same shape as a
  VE approval.
- **Provenance.** `artifact_provenance`, `source_region` and the trace
  endpoints are what lets a VE case cite its evidence rather than assert
  it.
- **Deterministic engines.** `boq/reconcile.ts` already refuses to
  present a disputed quantity as agreed, and reports the gap. VE needs
  exactly that instinct applied to cost and time.
- **Revision awareness.** Document revisions, supersession, and the
  retrieval layer's refusal to answer from a superseded revision are
  what `PEB-VAL-030` asks for in a baseline snapshot.

---

## 5. Recommended sequence

Not "build ValueLogix". In order:

1. **Cross-module knowledge graph.** Typed edges beyond PCM, with
   lineage and downstream-impact queries. This is the single dependency
   that unblocks blast radius, and it is already specified in chapters
   21 and `PEB-VAL-050`.
2. **Requirements as objects** (TenderLogix). `PEB-VAL-020` needs a
   stated required function; clause extraction is not the same thing.
   Without it, "equivalent" cannot be argued.
3. **Cost and procurement depth.** Lifecycle cost and lead time are two
   of the three terms in a real VE decision.
4. **Then a VE workspace**, thin: a value case, alternatives, the impact
   traversal, hard gates, delegated approval, and handover back to the
   baselines.
5. **Value Radar last.** Continuous detection is the differentiator, and
   it is worth nothing until a single VE case can be computed
   trustworthily.

---

## 6. Where this differs from the proposal

Only in one respect, and it is a matter of sequencing rather than
substance.

The proposal suggests designing the VE domain model across
Draw → QTY → Cost → Procurement → Schedule → Change, then deciding on
the UI. That design already exists in chapter 35 and is more complete
than a fresh pass would be.

What does **not** exist is the connective tissue those documents assume:
the graph that makes blast radius computable. Designing the VE model
again would produce a second good specification sitting on the same
missing foundation.

The honest next step is to implement chapter 21, not to re-specify
chapter 35.

---

## 7. Tracking

ValueLogix now appears in the module completion workbook as its own
sheet: sixteen features, all Missing, each pointing at the PEB document
that specifies it and naming the dependency that blocks it. The
Engineering Bible has a sheet too, covering its own coverage, automation
and the two gaps that matter — no code cites a chapter, and nothing
records which chapters are implemented.

That second gap is why the Bible cannot currently answer "what is left
to build", despite being the document best placed to.
