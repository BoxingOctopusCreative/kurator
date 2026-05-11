import type { Metadata } from "next";
import { SentryExampleClient } from "./SentryExampleClient";

export const metadata: Metadata = {
  title: "Sentry Example",
  description: "Send test errors to Sentry.",
  robots: { index: false, follow: false },
};

export default function SentryExamplePage() {
  return <SentryExampleClient />;
}
