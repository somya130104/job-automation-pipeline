import type { Metadata, Viewport } from "next";
import { Anton, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/components/chrome/AuthProvider";
import "./globals.css";

// Anton for the oversized hero slabs, Space Grotesk for UI, JetBrains for the
// mono micro-labels that give the chrome its "instrument panel" feel.
const display = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kaam Se Kaam — bhai, hire karwa de",
  description:
    "A personal job aggregator, resume matcher and application tracker. Pulls real postings straight off company ATS boards, scores them against your resume, and tracks every application in one place.",
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* ClerkProvider goes inside <body>; it no-ops when keys are absent. */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
