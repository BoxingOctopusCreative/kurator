import type { Metadata, Viewport } from "next";
import "@fontsource/opendyslexic/400.css";
import "@fontsource/opendyslexic/700.css";
import { Atkinson_Hyperlegible, Cabin, Lexend } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { ThemedShell } from "@/components/ThemedShell";

const cabin = Cabin({
  subsets: ["latin"],
  variable: "--font-cabin",
  display: "swap",
});

const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-lexend",
  display: "swap",
});

const atkinsonHyperlegible = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
  display: "swap",
});

const htmlFontVars = [cabin.variable, lexend.variable, atkinsonHyperlegible.variable].join(" ");

export const metadata: Metadata = {
  title: {
    default: "Kurator",
    template: "Kurator - %s",
  },
  description: "Collection tracker — games, music, books, movies, TV, and anime.",
  icons: {
    icon: "https://assets.kuratorapp.cc/brand/PNG/kurator_favicon-white.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kurator",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8edf5" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0f14" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={htmlFontVars} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://assets.kuratorapp.cc" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://assets.kuratorapp.cc" />
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.unsplash.com" />
      </head>
      <body className="font-sans">
        <AuthProvider>
          <ThemedShell>
            <AppShell>{children}</AppShell>
          </ThemedShell>
        </AuthProvider>
      </body>
    </html>
  );
}
