import type { Metadata } from "next";
import { preload } from "react-dom";
import { fetchUnsplashBackground } from "@/lib/unsplash-background.server";
import { LoginPageInner } from "./LoginPageInner";

export const metadata: Metadata = {
  title: "Login",
};

export default async function LoginPage() {
  const initialBackground = await fetchUnsplashBackground();
  if (initialBackground?.url) {
    preload(initialBackground.url, {
      as: "image",
      fetchPriority: "high",
    });
  }

  return <LoginPageInner initialBackground={initialBackground} />;
}
