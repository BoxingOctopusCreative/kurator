import { preload } from "react-dom";
import { HomePageClient } from "@/components/HomePageClient";
import { loadLandingSlogans } from "@/lib/landingSlogansMarkdown";
import { fetchUnsplashBackground } from "@/lib/unsplash-background.server";

export default async function HomePage() {
  const [initialBackground, { slogans: landingSlogans }] = await Promise.all([
    fetchUnsplashBackground(),
    loadLandingSlogans(),
  ]);

  if (initialBackground?.url) {
    preload(initialBackground.url, {
      as: "image",
      fetchPriority: "high",
    });
  }

  return <HomePageClient initialBackground={initialBackground} landingSlogans={landingSlogans} />;
}
