import { z } from "zod";

/**
 * The brand tokens a tenant may override (white-label, ws 0.9). Deliberately a SMALL
 * allowlist of the brand-defining hues — not every token — so a tenant can't break
 * contrast/legibility. Values are HSL CHANNELS ("H S% L%", no hsl() wrapper) to match
 * @ci/ui tokens.css and keep Tailwind's <alpha-value> working.
 */
export const BRAND_TOKEN_KEYS = ["--color-primary", "--color-accent"] as const;
export type BrandTokenKey = (typeof BRAND_TOKEN_KEYS)[number];

// Strict: only digits/spaces/%. This is also the injection guard — the value is
// inlined into a <style> tag, so nothing but a channel triple may pass.
const hslChannel = z.string().regex(/^\d{1,3} \d{1,3}% \d{1,3}%$/, "must be 'H S% L%' (e.g. 174 80% 28%)");

export const SetBrandingInput = z.object({
  tokens: z
    .record(z.string(), hslChannel)
    .refine((t) => Object.keys(t).every((k) => (BRAND_TOKEN_KEYS as readonly string[]).includes(k)), {
      message: "unknown brand token key",
    }),
});
export type SetBrandingInput = z.infer<typeof SetBrandingInput>;

export interface Branding {
  tokens: Record<string, string>;
}

/**
 * Build a SAFE `:root { … }` CSS string from stored tokens — defense-in-depth even if
 * the DB somehow holds bad data: re-checks the key allowlist and the channel format,
 * dropping anything that doesn't match. Returns "" when there's nothing to override.
 */
export function brandingStyle(tokens: Record<string, string> | null | undefined): string {
  if (!tokens) return "";
  const safe = Object.entries(tokens).filter(
    ([k, v]) => (BRAND_TOKEN_KEYS as readonly string[]).includes(k) && /^\d{1,3} \d{1,3}% \d{1,3}%$/.test(v),
  );
  if (!safe.length) return "";
  return `:root{${safe.map(([k, v]) => `${k}:${v}`).join(";")}}`;
}
