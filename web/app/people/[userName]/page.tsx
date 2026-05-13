import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { apiUrl } from "@/lib/apiUrl";
import {
  fetchProfileOwnerCollections,
  fetchProfileOwnerLists,
  fetchProfileOwnerWishlists,
  fetchPublicUserProfile,
  type UserProfile,
} from "@/lib/api";
import {
  filterCollectionListForUserProfile,
  filterListsForUserProfile,
  filterWishlistsForUserProfile,
} from "@/lib/profilePublicShelves";
import { normalizeProfileUrlSegment } from "@/lib/validation";
import { UserProfileClient } from "./UserProfileClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userName: string }>;
}): Promise<Metadata> {
  const { userName } = await params;
  const ref = normalizeProfileUrlSegment(userName);
  if (!ref) {
    return { title: "Profile" };
  }
  try {
    const res = await fetch(apiUrl(`/users/${encodeURIComponent(ref)}`), { cache: "no-store" });
    if (!res.ok) {
      return { title: "Profile" };
    }
    const p = (await res.json()) as UserProfile;
    const title = p.display_name?.trim() || p.username || "Profile";
    const desc =
      (p.bio && p.bio.trim().slice(0, 160)) ||
      `Profile on Kurator (@${p.username}).`;
    const ogImages: string[] = [];
    if (p.banner_url) ogImages.push(p.banner_url);
    if (p.avatar_url) ogImages.push(p.avatar_url);
    return {
      title,
      description: desc,
      openGraph: {
        title,
        description: desc,
        type: "profile",
        ...(ogImages.length ? { images: ogImages.map((url) => ({ url })) } : {}),
      },
      twitter: {
        card: ogImages.length ? "summary_large_image" : "summary",
        title,
        description: desc,
        ...(ogImages[0] ? { images: [ogImages[0]] } : {}),
      },
    };
  } catch {
    return { title: "Profile" };
  }
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ userName: string }>;
}) {
  const { userName } = await params;
  const ref = normalizeProfileUrlSegment(userName);
  if (!ref) {
    notFound();
  }
  const profile = await fetchPublicUserProfile(ref);
  if (!profile) {
    notFound();
  }
  const cookieStore = await cookies();
  const cookieParts = cookieStore.getAll();
  const cookieHeader =
    cookieParts.length > 0 ? cookieParts.map((c) => `${c.name}=${c.value}`).join("; ") : undefined;
  const [rawCollections, rawLists, rawWishlists] = await Promise.all([
    fetchProfileOwnerCollections(profile.id, { cookieHeader }),
    fetchProfileOwnerLists(profile.id, { cookieHeader }),
    fetchProfileOwnerWishlists(profile.id, { cookieHeader }),
  ]);
  const collections = filterCollectionListForUserProfile(rawCollections, profile.id);
  const lists = filterListsForUserProfile(rawLists, profile.id);
  const wishlists = filterWishlistsForUserProfile(rawWishlists, profile.id);
  return (
    <UserProfileClient
      userRef={ref}
      initialProfile={profile}
      initialCollections={collections}
      initialLists={lists}
      initialWishlists={wishlists}
    />
  );
}
