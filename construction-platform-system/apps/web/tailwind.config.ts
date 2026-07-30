import preset from "@ci/config/tailwind-preset";
import type { Config } from "tailwindcss";

// Styles come from the shared preset (tokens from @ci/ui). No app-local palette.
export default {
  presets: [preset],
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
} satisfies Config;
