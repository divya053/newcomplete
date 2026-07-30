"use client";

import { Badge, Button, Card, CardContent } from "@ci/ui";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useState } from "react";
import { setBrandingAction } from "@/server/branding";

// Design-system defaults (mirror @ci/ui tokens.css) — used to seed the pickers and
// for the Reset action.
const DEFAULTS = { "--color-primary": "174 80% 28%", "--color-accent": "199 89% 48%" } as const;

/** "H S% L%" channel string -> "#rrggbb" for the native color input. */
function channelToHex(channel: string): string {
  const m = channel.match(/^(\d{1,3}) (\d{1,3})% (\d{1,3})%$/);
  if (!m) return "#000000";
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  const to = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** "#rrggbb" -> "H S% L%" channel string (the token format @ci/ui expects). */
function hexToChannel(hex: string): string {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return DEFAULTS["--color-primary"];
  const r = Number.parseInt(m[0] as string, 16) / 255;
  const g = Number.parseInt(m[1] as string, 16) / 255;
  const b = Number.parseInt(m[2] as string, 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function BrandingForm({ initial }: { initial: Record<string, string> }) {
  const router = useRouter();
  const [primary, setPrimary] = useState(channelToHex(initial["--color-primary"] ?? DEFAULTS["--color-primary"]));
  const [accent, setAccent] = useState(channelToHex(initial["--color-accent"] ?? DEFAULTS["--color-accent"]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const primaryCh = hexToChannel(primary);
  const accentCh = hexToChannel(accent);

  // The preview overrides the brand vars for its OWN subtree only — child elements
  // using bg-primary/text-accent recolor live as the pickers change.
  const previewVars = { "--color-primary": primaryCh, "--color-accent": accentCh } as CSSProperties;

  async function save(tokens: Record<string, string>) {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await setBrandingAction({ tokens });
      setDone(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-5 py-5">
          <ColorField label="Primary" hint="Buttons, links, active nav, brand accents" value={primary} channel={primaryCh} onChange={setPrimary} />
          <ColorField label="Accent" hint="Secondary highlights, info, gradients" value={accent} channel={accentCh} onChange={setAccent} />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={() => save({ "--color-primary": primaryCh, "--color-accent": accentCh })} disabled={busy}>
              {busy ? "Saving…" : "Save branding"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setPrimary(channelToHex(DEFAULTS["--color-primary"]));
                setAccent(channelToHex(DEFAULTS["--color-accent"]));
                save({ ...DEFAULTS });
              }}
            >
              Reset to default
            </Button>
            {done && <span className="text-sm text-success">Saved — reload to see it everywhere.</span>}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card>
        <CardContent className="py-5" style={previewVars}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live preview</p>
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-primary to-accent text-sm font-bold text-white">CI</span>
              <span className="font-semibold">Your workspace</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button>Primary action</Button>
              <Button variant="outline">Secondary</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="accent">Accent</Badge>
              <Badge variant="success">Published</Badge>
            </div>
            <a className="inline-block text-sm font-medium text-primary hover:underline">A themed link →</a>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <span className="block h-full w-3/4 rounded-full bg-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ColorField({
  label,
  hint,
  value,
  channel,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  channel: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-md border border-border bg-background p-1"
          aria-label={`${label} color`}
        />
        <div className="text-sm">
          <div className="font-mono">{value}</div>
          <div className="font-mono text-xs text-muted-foreground">{channel}</div>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
