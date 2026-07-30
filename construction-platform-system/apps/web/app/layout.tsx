import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@ci/ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Preckon",
  description: "Preckon — preconstruction intelligence by TechSME",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

// Applied before first paint to avoid a flash of the wrong theme (FOUC). Reads the
// saved choice (ci-theme) or falls back to the OS preference, then sets the `dark`
// class the design tokens (.dark in @ci/ui tokens.css) key off.
const noFlashTheme = `(function(){try{var t=localStorage.getItem('ci-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: tiny static no-FOUC theme bootstrap */}
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
