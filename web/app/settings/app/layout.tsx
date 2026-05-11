import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "App Settings",
};

export default function AppSettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
