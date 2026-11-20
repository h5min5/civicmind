import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, IBM_Plex_Mono, Outfit } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "CivicMind",
  description: "AI civic complaint intelligence for Mumbai",
  applicationName: "CivicMind",
};

export const viewport: Viewport = {
  themeColor: "#07110c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${fraunces.variable} ${mono.variable}`}>
        <LocaleProvider>
          <SessionProvider>
            <SiteHeader />
            {children}
          </SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
