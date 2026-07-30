"use client";

import DxfParser from "dxf-parser";
import { useEffect, useRef, useState } from "react";
import type { ModelSummary } from "@/ai/dxf-copilot";
import { applyOp, type DxfModel, modelBounds, parseToModel, serializeModel, withIds } from "@/domain/dxf-model";
import { dxfCopilotAction, pdfToDxfAction } from "@/server/actions";
import { ALL_SNAP_MODES, type CadHandle, CadViewport, DEFAULT_SNAPS, SNAP_LABEL, type SnapMode, type Tool } from "./cad-viewport";

// Muted layer swatches for the layer panel; the canvas itself uses bright-on-black.
const ACI: Record<number, string> = { 1: "#f87171", 2: "#facc15", 3: "#4ade80", 4: "#22d3ee", 5: "#818cf8", 6: "#e879f9", 7: "#e5e7eb", 8: "#94a3b8", 30: "#fb923c" };
const aciHex = (n: number) => ACI[n] ?? "#e5e7eb";
const UNIT_LABEL: Record<number, string> = { 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m" };
const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
const UNIT_OPTIONS = ["mm", "cm", "m", "in", "ft"];
const nativeUnit = (insunits: number) => UNIT_LABEL[insunits] ?? "mm";

const DRAW_TOOLS: [Tool, string][] = [["line", "╱ Line"], ["polyline", "⌁ Polyline"], ["rect", "▭ Rect"], ["circle", "◯ Circle"], ["text", "T Text"]];
const ANNOTATE_TOOLS: [Tool, string][] = [["dimension", "↔ Dimension"], ["hatch", "▨ Hatch"]];
const MODIFY_TOOLS: [Tool, string][] = [["move", "✥ Move"], ["copy", "⧉ Copy"], ["rotate", "⟳ Rotate"], ["scale", "⤢ Scale"], ["mirror", "◧ Mirror"]];

type Msg = { role: "user" | "assistant"; text: string };
/** One drawing in the workspace — a single DXF, or one page of a converted PDF. */
type Sheet = { page: number; model: DxfModel; truncated: boolean };

function ToolBtn({ active, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-indigo-500 text-white" : "text-slate-200 hover:bg-white/10"
      } ${className}`}
      {...props}
    />
  );
}
function Sep() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-white/10" />;
}
const selCls = "h-7 rounded border border-white/10 bg-[#0d1017] px-1.5 text-xs text-slate-200 outline-none focus:border-indigo-400";

export function DxfEditor({ orgName }: { orgName?: string | null }) {
  const [model, setModel] = useState<DxfModel | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]); // multi-page PDFs become several sheets
  const [activeSheet, setActiveSheet] = useState(0);
  const [past, setPast] = useState<DxfModel[]>([]);
  const [future, setFuture] = useState<DxfModel[]>([]);
  const [fileName, setFileName] = useState<string>("drawing");
  const [loadKey, setLoadKey] = useState(0); // bumped on each new load → viewport refits
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [scale, setScale] = useState("1");
  const [pages, setPages] = useState("");
  const [showLayers, setShowLayers] = useState(false);
  const [showCopilot, setShowCopilot] = useState(true);
  const [layerFilter, setLayerFilter] = useState("");
  const [mono, setMono] = useState(false);
  const [displayUnit, setDisplayUnit] = useState("mm");
  const [precision, setPrecision] = useState(2);
  const [measuring, setMeasuring] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [activeLayer, setActiveLayer] = useState("0");
  const [selCount, setSelCount] = useState(0);
  const [highlightedLayer, setHighlightedLayer] = useState<string | null>(null);
  const [osnap, setOsnap] = useState(true);
  const [snapModes, setSnapModes] = useState<SnapMode[]>(DEFAULT_SNAPS);
  const [ortho, setOrtho] = useState(false);
  const [polar, setPolar] = useState(false);
  const [polarInc, setPolarInc] = useState(15);
  const [showSnapMenu, setShowSnapMenu] = useState(false);
  const vpRef = useRef<CadHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── History ────────────────────────────────────────────────────────────────
  function applyModel(next: DxfModel) {
    if (model) setPast((p) => [...p.slice(-49), model]);
    setFuture([]);
    setModel(withIds(next));
  }
  function undo() {
    if (!past.length) return;
    if (model) setFuture((f) => [model, ...f]);
    setModel(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    if (model) setPast((p) => [...p, model]);
    setModel(future[0]);
    setFuture((f) => f.slice(1));
  }

  // Keyboard: undo / redo (viewport owns Esc/Enter/Delete).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F3") {
        e.preventDefault();
        setOsnap((v) => !v);
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        setOrtho((v) => !v);
        return;
      }
      if (e.key === "F10") {
        e.preventDefault();
        setPolar((v) => !v);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const setToolSafe = (t: Tool) => {
    setTool(t);
    setMeasuring(false);
  };
  const toggleLayer = (name: string) => setModel((m) => (m ? { ...m, layers: m.layers.map((l) => (l.name === name ? { ...l, visible: !l.visible } : l)) } : m));
  const setAllLayers = (visible: boolean) => setModel((m) => (m ? { ...m, layers: m.layers.map((l) => ({ ...l, visible })) } : m));
  // Click a layer name → select (highlight) all its geometry on the canvas, AutoCAD-style.
  const highlightLayer = (name: string) => {
    setHighlightedLayer((cur) => (cur === name ? null : name));
    if (highlightedLayer === name) {
      vpRef.current?.clearSelection();
    } else {
      setToolSafe("select");
      vpRef.current?.selectLayer(name);
    }
  };

  // Load one drawing into the canvas: assign ids, reset history/view, pick units + layer.
  function loadModel(raw: DxfModel) {
    const m = withIds(raw);
    setModel(m);
    setPast([]);
    setFuture([]);
    setMessages([]);
    setDisplayUnit(nativeUnit(m.insunits));
    setActiveLayer(m.layers.some((l) => l.name === "0") ? "0" : (m.layers[0]?.name ?? "0"));
    setMeasuring(false);
    setTool("select");
    setHighlightedLayer(null);
    setLoadKey((k) => k + 1);
  }

  // Switch to another sheet, saving the current sheet's edits back into the workspace first.
  function goToSheet(idx: number) {
    if (idx === activeSheet || idx < 0 || idx >= sheets.length) return;
    if (model) setSheets((s) => s.map((sh, i) => (i === activeSheet ? { ...sh, model } : sh)));
    setActiveSheet(idx);
    loadModel(sheets[idx].model);
  }

  async function onUpload(file: File) {
    setError(null);
    setWarning(null);
    setBusy(true);
    try {
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      let loaded: Sheet[];
      if (isPdf) {
        // Vector PDF → DXF happens server-side (pdf.js runs in Node). A multi-page PDF
        // comes back as one standalone drawing PER page — no more 80k-total truncation.
        const fd = new FormData();
        fd.append("file", file);
        fd.append("scale", scale);
        fd.append("pages", pages);
        const res = await pdfToDxfAction(fd);
        if (res.warning) setWarning(res.warning);
        loaded = res.pages.map((p) => ({ page: p.page, model: p.model, truncated: p.truncated }));
      } else {
        const dxf = new DxfParser().parseSync(await file.text());
        loaded = [{ page: 1, model: parseToModel(dxf), truncated: false }];
      }
      if (!loaded.length || loaded.every((s) => s.model.entities.length === 0)) throw new Error("No usable geometry (lines/polylines/text) found.");
      setSheets(loaded);
      setActiveSheet(0);
      setFileName(file.name.replace(/\.[^.]+$/, ""));
      loadModel(loaded[0].model);
    } catch (e) {
      setError(`Couldn't convert that file: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function summarize(m: DxfModel): ModelSummary {
    const texts = [...new Set(m.entities.filter((e) => e.kind === "text").map((e) => (e as { text: string }).text))].slice(0, 80);
    return { layers: m.layers.map((l) => l.name), texts, bounds: modelBounds(m), insunits: m.insunits };
  }

  async function send() {
    if (!model || !text.trim()) return;
    const instruction = text.trim();
    setText("");
    setMessages((p) => [...p, { role: "user", text: instruction }]);
    setBusy(true);
    try {
      const { reply, operations } = await dxfCopilotAction(summarize(model), instruction);
      if (operations.length) applyModel(operations.reduce((acc, op) => applyOp(acc, op), model));
      setMessages((p) => [...p, { role: "assistant", text: `${reply}${operations.length ? ` (${operations.length} edit${operations.length === 1 ? "" : "s"})` : ""}` }]);
    } catch (e) {
      setMessages((p) => [...p, { role: "assistant", text: `Error: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function exportDxf() {
    if (!model) return;
    const blob = new Blob([serializeModel(model)], { type: "application/dxf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}-edited.dxf`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const native = model ? nativeUnit(model.insunits) : "mm";
  const unitFactor = (UNIT_MM[native] ?? 1) / (UNIT_MM[displayUnit] ?? 1);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-[#0d1017] text-slate-200">
      {/* ── Row 1: file / view / measure / units ─────────────────────────────── */}
      <header className="flex shrink-0 flex-wrap items-center gap-1 border-b border-white/10 bg-[#151a24] px-2 py-1.5">
        <div className="mr-1 flex items-center gap-1.5 pr-1">
          <span className="grid h-6 w-6 place-items-center rounded bg-gradient-to-br from-indigo-500 to-sky-500 text-[11px] font-bold text-white">DL</span>
          <span className="text-sm font-semibold text-slate-100">DrawLogix</span>
        </div>
        <Sep />
        <input
          ref={fileRef}
          type="file"
          accept=".dxf,.pdf"
          className="hidden"
          onChange={(e) => {
            const fl = e.target.files?.[0];
            if (fl) onUpload(fl);
            e.currentTarget.value = "";
          }}
        />
        <ToolBtn onClick={() => fileRef.current?.click()} disabled={busy} title="Open a .dxf, or a vector .pdf (auto-converted to DXF)">
          📂 {busy ? "Opening…" : "Open PDF / DXF"}
        </ToolBtn>
        <ToolBtn onClick={exportDxf} disabled={!model}>
          ↓ Export DXF
        </ToolBtn>
        <Sep />
        <ToolBtn onClick={() => vpRef.current?.fit()} disabled={!model}>
          ⤢ Fit
        </ToolBtn>
        <ToolBtn onClick={() => vpRef.current?.zoom(1.2)} disabled={!model}>
          ＋
        </ToolBtn>
        <ToolBtn onClick={() => vpRef.current?.zoom(0.83)} disabled={!model}>
          －
        </ToolBtn>
        <ToolBtn onClick={() => setMono((v) => !v)} active={mono} disabled={!model} title="Toggle monochrome / colour">
          {mono ? "B/W" : "Colour"}
        </ToolBtn>
        <ToolBtn onClick={() => setShowLayers((v) => !v)} active={showLayers} disabled={!model}>
          ▤ Layers{model ? ` (${model.layers.length})` : ""}
        </ToolBtn>
        <Sep />
        <ToolBtn onClick={() => setMeasuring((v) => !v)} active={measuring} disabled={!model}>
          📐 Measure
        </ToolBtn>
        <Sep />
        <span className="text-[11px] text-slate-400">Units</span>
        <select value={displayUnit} onChange={(e) => setDisplayUnit(e.target.value)} disabled={!model} className={selCls}>
          {UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-slate-400">Prec</span>
        <select value={String(precision)} onChange={(e) => setPrecision(Number(e.target.value))} disabled={!model} className={selCls}>
          {[0, 1, 2, 3, 4].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <ToolBtn onClick={() => setShowCopilot((v) => !v)} active={showCopilot}>
            ✦ Copilot
          </ToolBtn>
          {orgName ? (
            <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300">🏢 {orgName}</span>
          ) : (
            <span className="text-[11px] text-red-400">No org in DB</span>
          )}
        </div>
      </header>

      {/* ── Row 2: draw / modify ribbon ──────────────────────────────────────── */}
      {model && (
        <header className="flex shrink-0 flex-wrap items-center gap-1 border-b border-white/10 bg-[#11151d] px-2 py-1.5">
          <ToolBtn onClick={() => setToolSafe("select")} active={tool === "select" && !measuring}>
            ▷ Select
          </ToolBtn>
          <ToolBtn onClick={() => setToolSafe("pan")} active={tool === "pan"}>
            ✋ Pan
          </ToolBtn>
          <Sep />
          <span className="pr-0.5 text-[11px] uppercase tracking-wide text-slate-500">Draw</span>
          {DRAW_TOOLS.map(([t, label]) => (
            <ToolBtn key={t} onClick={() => setToolSafe(t)} active={tool === t && !measuring}>
              {label}
            </ToolBtn>
          ))}
          <Sep />
          <span className="pr-0.5 text-[11px] uppercase tracking-wide text-slate-500">Annotate</span>
          {ANNOTATE_TOOLS.map(([t, label]) => (
            <ToolBtn key={t} onClick={() => setToolSafe(t)} active={tool === t && !measuring} title={t === "hatch" ? "Select a closed shape then click, or trace a boundary and press Enter" : "Click two points, then click to place the dimension"}>
              {label}
            </ToolBtn>
          ))}
          <Sep />
          <span className="pr-0.5 text-[11px] uppercase tracking-wide text-slate-500">Modify</span>
          {MODIFY_TOOLS.map(([t, label]) => (
            <ToolBtn key={t} onClick={() => setToolSafe(t)} active={tool === t && !measuring} disabled={selCount === 0} title={selCount === 0 ? "Select entities first" : ""}>
              {label}
            </ToolBtn>
          ))}
          <ToolBtn onClick={() => vpRef.current?.deleteSelection()} disabled={selCount === 0} className="text-red-300 hover:bg-red-500/15">
            🗑 Delete
          </ToolBtn>
          <Sep />
          <ToolBtn onClick={undo} disabled={past.length === 0} title="Ctrl+Z">
            ↶ Undo
          </ToolBtn>
          <ToolBtn onClick={redo} disabled={future.length === 0} title="Ctrl+Y">
            ↷ Redo
          </ToolBtn>
          <Sep />
          <span className="text-[11px] text-slate-400">Layer</span>
          <select value={activeLayer} onChange={(e) => setActiveLayer(e.target.value)} className={`${selCls} max-w-[160px]`} title="New geometry is created on this layer">
            {model.layers.map((l) => (
              <option key={l.name} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[11px] text-slate-500">{selCount > 0 ? `${selCount} selected` : `${model.entities.length} entities`}</span>
        </header>
      )}

      {/* ── Body: big canvas + copilot ────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          {model ? (
            <>
              <CadViewport
                ref={vpRef}
                model={model}
                mono={mono}
                units={displayUnit}
                unitFactor={unitFactor}
                precision={precision}
                measuring={measuring}
                fitOn={String(loadKey)}
                tool={tool}
                activeLayer={activeLayer}
                osnap={osnap}
                snapModes={snapModes}
                ortho={ortho}
                polar={polar}
                polarInc={polarInc}
                onChange={applyModel}
                onOperationDone={() => setTool("select")}
                onSelectionChange={(n) => {
                  setSelCount(n);
                  if (n === 0) setHighlightedLayer(null);
                }}
              />

              {native !== displayUnit && (
                <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-[11px] text-slate-300">
                  Drawing units <b>{native}</b> · showing <b>{displayUnit}</b>
                </div>
              )}

              {showLayers && (
                <div className="absolute left-2 top-2 z-10 w-64 rounded-md border border-white/10 bg-[#151a24] p-2 shadow-xl">
                  <input value={layerFilter} onChange={(e) => setLayerFilter(e.target.value)} placeholder="Filter layers…" className={`mb-2 w-full ${selCls} px-2`} />
                  <div className="mb-1 flex gap-3 text-xs">
                    <button type="button" onClick={() => setAllLayers(true)} className="text-indigo-300 hover:underline">
                      Show all
                    </button>
                    <button type="button" onClick={() => setAllLayers(false)} className="text-indigo-300 hover:underline">
                      Hide all
                    </button>
                  </div>
                  <p className="mb-1 text-[10px] text-slate-500">Tick = show/hide · click a name to highlight it in the drawing</p>
                  <div className="max-h-[60vh] space-y-0.5 overflow-y-auto text-xs">
                    {model.layers
                      .filter((l) => l.name.toLowerCase().includes(layerFilter.toLowerCase()))
                      .slice(0, 400)
                      .map((l) => (
                        <div key={l.name} className={`flex items-center gap-2 rounded py-0.5 pr-1 ${highlightedLayer === l.name ? "bg-indigo-500/25" : ""}`}>
                          <input type="checkbox" checked={l.visible} onChange={() => toggleLayer(l.name)} className="h-3 w-3 shrink-0" title="Show / hide layer" />
                          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: aciHex(l.aci) }} />
                          <button type="button" onClick={() => highlightLayer(l.name)} className={`flex-1 truncate text-left hover:text-indigo-300 ${highlightedLayer === l.name ? "font-medium text-indigo-200" : ""}`} title="Highlight this layer's objects on the canvas">
                            {l.name}
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <UploadDrop busy={busy} scale={scale} setScale={setScale} pages={pages} setPages={setPages} onFile={onUpload} onBrowse={() => fileRef.current?.click()} />
          )}
        </main>

        {showCopilot && (
          <aside className="flex w-[340px] shrink-0 flex-col border-l border-white/10 bg-[#151a24]">
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-sm font-medium text-slate-100">✦ AI Copilot</div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {model
                    ? "Try: “rename layer A-WALL to WALLS”, “change DOORS to red”, “replace ‘OFFICE’ with ‘STUDY’”, “add a note ‘FOR APPROVAL’ top-left”, “hide the DIMS layer”, “add a 4×3 m room labelled Store”."
                    : "Open a .pdf or .dxf to start editing with the copilot."}
                </p>
              ) : (
                messages.map((m, i) => (
                  <div key={`${m.role}-${i}`} className={`max-w-[92%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-indigo-500 text-white" : "bg-white/5 text-slate-200"}`}>
                    {m.text}
                  </div>
                ))
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-center gap-2 border-t border-white/10 p-3"
            >
              <input
                placeholder="Tell the copilot what to change…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy || !model}
                className="h-9 flex-1 rounded-md border border-white/10 bg-[#0d1017] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400 disabled:opacity-50"
              />
              <ToolBtn onClick={() => send()} disabled={busy || !model || !text.trim()} className="h-9 bg-indigo-500 px-3 text-white hover:bg-indigo-400">
                {busy ? "…" : "Send"}
              </ToolBtn>
            </form>
          </aside>
        )}
      </div>

      {/* ── Sheet tabs (one per converted PDF page) ──────────────────────────── */}
      {sheets.length > 1 && (
        <footer className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-white/10 bg-[#11151d] px-2 py-1">
          <span className="pr-1 text-[11px] uppercase tracking-wide text-slate-500">Sheets</span>
          {sheets.map((s, i) => (
            <button
              key={s.page}
              type="button"
              onClick={() => goToSheet(i)}
              title={s.truncated ? "This page was very large and was capped" : `Source page ${s.page}`}
              className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded px-2.5 text-xs transition-colors ${
                i === activeSheet ? "bg-indigo-500 text-white" : "text-slate-300 hover:bg-white/10"
              }`}
            >
              Sheet {s.page}
              {s.truncated && <span className="text-amber-300">⚠</span>}
            </button>
          ))}
        </footer>
      )}

      {/* ── Status bar: drawing aids (AutoCAD-style toggles) ─────────────────── */}
      {model && (
        <footer className="relative flex shrink-0 items-center gap-1.5 border-t border-white/10 bg-[#0b0e14] px-2 py-1 text-[11px] text-slate-300">
          <ToolBtn onClick={() => setOsnap((v) => !v)} active={osnap} title="Object Snap (F3)" className="h-6">
            ⊹ OSNAP
          </ToolBtn>
          <div className="relative">
            <ToolBtn onClick={() => setShowSnapMenu((v) => !v)} active={showSnapMenu} className="h-6 px-1.5" title="Choose which snaps are active">
              ▾
            </ToolBtn>
            {showSnapMenu && (
              <div className="absolute bottom-8 left-0 z-20 w-44 rounded-md border border-white/10 bg-[#151a24] p-2 shadow-xl">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Object snaps</div>
                {ALL_SNAP_MODES.map((m) => (
                  <label key={m} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs">
                    <input
                      type="checkbox"
                      checked={snapModes.includes(m)}
                      onChange={() => setSnapModes((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]))}
                      className="h-3 w-3"
                    />
                    <span>{SNAP_LABEL[m]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <ToolBtn onClick={() => setOrtho((v) => !v)} active={ortho} title="Ortho — constrain to H/V (F8)" className="h-6">
            ⌐ ORTHO
          </ToolBtn>
          <ToolBtn onClick={() => setPolar((v) => !v)} active={polar} title="Polar tracking (F10)" className="h-6">
            ∠ POLAR
          </ToolBtn>
          <select value={String(polarInc)} onChange={(e) => setPolarInc(Number(e.target.value))} className="h-6 rounded border border-white/10 bg-[#0d1017] px-1 text-[11px] text-slate-200 outline-none" title="Polar angle increment">
            {[5, 10, 15, 30, 45, 90].map((a) => (
              <option key={a} value={a}>
                {a}°
              </option>
            ))}
          </select>
          <span className="ml-auto text-slate-600">F3 osnap · F8 ortho · F10 polar</span>
        </footer>
      )}

      {(warning || error) && (
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-col gap-2">
          {warning && <p className="rounded-md border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{warning}</p>}
          {error && <p className="rounded-md border border-red-400/40 bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>}
        </div>
      )}
    </div>
  );
}

// Centered upload dropzone shown when no drawing is loaded.
function UploadDrop({
  busy,
  scale,
  setScale,
  pages,
  setPages,
  onFile,
  onBrowse,
}: {
  busy: boolean;
  scale: string;
  setScale: (v: string) => void;
  pages: string;
  setPages: (v: string) => void;
  onFile: (f: File) => void;
  onBrowse: () => void;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const fl = e.dataTransfer.files?.[0];
          if (fl) onFile(fl);
        }}
        className={`w-full max-w-xl space-y-4 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${drag ? "border-indigo-400 bg-indigo-500/10" : "border-white/15 bg-white/[0.03]"}`}
      >
        <div className="text-4xl">✏️</div>
        <div className="text-base font-medium text-slate-100">{busy ? "Converting…" : "Drop a .pdf or .dxf here"}</div>
        <p className="mx-auto max-w-md text-xs text-slate-400">
          A vector PDF (exported from CAD) is auto-converted to DXF. Then draw and modify on the canvas — line, polyline, rectangle, circle, text; move, copy, rotate, scale, mirror — or instruct the AI copilot, and export the finished DXF.
        </p>
        <button type="button" onClick={onBrowse} disabled={busy} className="inline-flex h-9 items-center rounded-md bg-indigo-500 px-4 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50">
          Browse files
        </button>
        <div className="mx-auto flex max-w-md flex-col gap-2 pt-2 text-left text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-right">PDF plot scale 1 :</span>
            <input value={scale} onChange={(e) => setScale(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" aria-label="PDF plot scale denominator" className={`w-20 text-center ${selCls}`} />
            <span>1 = paper-size mm; e.g. 100 for a 1:100 sheet.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-right">PDF pages:</span>
            <input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="auto" aria-label="PDF pages to convert" className={`w-20 text-center ${selCls}`} />
            <span>
              <b>auto</b> = sheets only; <b>all</b> = every page; or <b>3-5,8</b>.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
