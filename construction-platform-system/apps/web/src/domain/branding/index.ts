// The ONLY import surface for the branding (white-label) bounded context.
export { getBranding } from "./use-cases/get-branding";
export { setBranding } from "./use-cases/set-branding";
export { BRAND_TOKEN_KEYS, type BrandTokenKey, type Branding, brandingStyle, SetBrandingInput } from "./model";
