import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Database setup",
};

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
