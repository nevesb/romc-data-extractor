import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/layout/SiteHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ROMClassic Wiki | Ragnarok M Classic data atlas",
  description: "Search items, monsters, skills and formulas mirrored from fresh Ragnarok M Classic snapshots.",
  icons: {
    icon: "/favicon.ico",
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-[var(--background)] text-[var(--foreground)] antialiased`}>
        <div className="romc-bg min-h-screen overflow-hidden">
          <div className="romc-halo romc-halo--one" />
          <div className="romc-halo romc-halo--two" />
          <SiteHeader />
          <main className="relative mx-auto max-w-6xl px-6 py-12 lg:py-16">{children}</main>
        </div>
      </body>
    </html>
  );
}
