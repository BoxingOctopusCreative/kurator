import { preload } from "react-dom";
import { HomePageClient } from "@/components/HomePageClient";
import { fetchUnsplashBackground } from "@/lib/unsplash-background.server";

export default async function HomePage() {
  const initialBackground = await fetchUnsplashBackground();

  if (initialBackground?.url) {
    preload(initialBackground.url, {
      as: "image",
      fetchPriority: "high",
    });
  }

  return <HomePageClient initialBackground={initialBackground} />;
}
