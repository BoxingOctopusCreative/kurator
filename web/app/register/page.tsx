import type { Metadata } from "next";
import { preload } from "react-dom";
import { fetchUnsplashBackground } from "@/lib/unsplash-background.server";
import { RegisterPageInner } from "./RegisterPageInner";

export const metadata: Metadata = {
  title: "Register",
};

export default async function RegisterPage() {
  const initialBackground = await fetchUnsplashBackground();
  if (initialBackground?.url) {
    preload(initialBackground.url, {
      as: "image",
      fetchPriority: "high",
    });
  }

  return <RegisterPageInner initialBackground={initialBackground} />;
}
