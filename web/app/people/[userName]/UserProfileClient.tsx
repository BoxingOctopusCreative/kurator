"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import type { CollectionListResponse, UserProfile } from "@/lib/api";
import { fetchUserProfile, followUser, unfollowUser, publicLegalNameLine } from "@/lib/api";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { FollowListDialog } from "@/components/FollowListDialog";
import { SocialLinkDecorativeIcon } from "@/lib/socialLinkIcon";
import { socialPlatformDisplayName } from "@/lib/socialPlatforms";
import { safeHttpUrl, safeImageSrcUrl } from "@/lib/safeUrl";
import { useAuth } from "@/components/AuthProvider";

type Props = {
  userRef: string;
  initialProfile: UserProfile;
  initialCollections: CollectionListResponse;
};

export function UserProfileClient({ userRef, initialProfile, initialCollections }: Props) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(initialProfile);
  const [collections, setCollections] = useState(initialCollections);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [followListOpen, setFollowListOpen] = useState<"followers" | "following" | null>(null);

  useEffect(() => {
    setProfile(initialProfile);
    setCollections(initialCollections);
    setError(null);
  }, [userRef, initialProfile, initialCollections]);

  useEffect(() => {
    if (!user || user.id === profile.id) return;
    let cancelled = false;
    void fetchUserProfile(userRef)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        /* keep server-rendered profile */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch follow state when viewer identity changes
  }, [userRef, user?.id, profile.id]);

  async function refreshProfile() {
    try {
      setProfile(await fetchUserProfile(userRef));
    } catch {
      /* ignore */
    }
  }

  async function toggleFollow() {
    if (!user || user.id === profile.id) return;
    setFollowBusy(true);
    try {
      if (profile.is_following) {
        await unfollowUser(profile.username);
      } else {
        await followUser(profile.username);
      }
      await refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update follow.");
    } finally {
      setFollowBusy(false);
    }
  }

  const bannerSrc = safeImageSrcUrl(profile.banner_url);
  const avatarSrc = safeImageSrcUrl(profile.avatar_url);

  const profileHeaderInner = (
    <>
      <div className="flex flex-wrap items-start gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-kurator-border bg-kurator-bg">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote CDN / S3 profile URL
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-kurator-muted">No photo</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-kurator-fg md:text-3xl">
            {profile.display_name || profile.username}
          </h1>
          <p className="mt-1 text-xs text-kurator-muted">@{profile.username}</p>
          {(() => {
            const legal = publicLegalNameLine(profile);
            return legal ? <p className="mt-1 text-sm text-kurator-muted">{legal}</p> : null;
          })()}
          {profile.location ? <p className="mt-2 text-sm text-kurator-muted">{profile.location}</p> : null}
        </div>
      </div>
      {profile.social_links?.length ? (
        <ul className="mt-4 flex flex-wrap gap-3">
          {profile.social_links.map((link, i) => {
            const socialHref = safeHttpUrl(link.url);
            const label = socialPlatformDisplayName(link.platform ?? "");
            const wrapClass =
              "inline-flex rounded-full p-2 text-kurator-accent transition-colors duration-150 hover:bg-kurator-border/50";
            return (
              <li key={`${link.url}-${i}`}>
                {socialHref ? (
                  <a
                    href={socialHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={label}
                    aria-label={label}
                    className={wrapClass}
                  >
                    <SocialLinkDecorativeIcon url={link.url} platform={link.platform ?? undefined} />
                  </a>
                ) : (
                  <span title={label} aria-label={label} className={`${wrapClass} cursor-default opacity-60`}>
                    <SocialLinkDecorativeIcon url={link.url} platform={link.platform ?? undefined} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {profile.bio ? <p className="mt-3 text-sm text-kurator-muted">{profile.bio}</p> : null}
      <p className="mt-4 flex flex-wrap items-center gap-x-2 text-xs text-kurator-muted">
        <button
          type="button"
          disabled={followBusy}
          onClick={() => setFollowListOpen("followers")}
          className="rounded underline-offset-2 hover:text-kurator-fg hover:underline disabled:opacity-50"
        >
          {profile.follower_count} follower{profile.follower_count === 1 ? "" : "s"}
        </button>
        <span aria-hidden className="text-kurator-muted/60">
          ·
        </span>
        <button
          type="button"
          disabled={followBusy}
          onClick={() => setFollowListOpen("following")}
          className="rounded underline-offset-2 hover:text-kurator-fg hover:underline disabled:opacity-50"
        >
          {profile.following_count} following
        </button>
      </p>
      {user && user.id !== profile.id && (
        <button
          type="button"
          disabled={followBusy}
          onClick={() => void toggleFollow()}
          className="mt-4 rounded-lg border border-kurator-border px-4 py-2 text-sm font-medium text-kurator-fg hover:bg-kurator-border/40 disabled:opacity-50"
        >
          {profile.is_following ? "Unfollow" : "Follow"}
        </button>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <FollowListDialog
        variant={followListOpen}
        userRef={userRef}
        profileDisplayName={profile.display_name || profile.username}
        onOpenChange={(next) => {
          if (!next) setFollowListOpen(null);
        }}
      />
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      <>
        {bannerSrc ? (
          <div className="relative -mx-1 mb-6 h-40 overflow-hidden rounded-xl shadow-surface border border-kurator-border bg-kurator-border/40 sm:mx-0 sm:h-48">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote S3/CDN */}
            <img src={bannerSrc} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}

        {bannerSrc ? (
          <header className="mb-8 border-b border-kurator-border pb-6">{profileHeaderInner}</header>
        ) : (
          <PageHeroUnsplash bleedToMainTop={false}>
            <header className="border-b border-kurator-border pb-6">{profileHeaderInner}</header>
          </PageHeroUnsplash>
        )}

        <section>
          <h2 className="mb-4 text-lg font-medium text-kurator-fg">Public collections</h2>
          {!collections || collections.items.length === 0 ? (
            <p className="text-sm text-kurator-muted">No public collections to show.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {collections.items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/collections/${c.id}`}
                    className="flex h-full items-start gap-3 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface/60 p-4 hover:border-kurator-accent/50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kurator-border/60 text-kurator-accent">
                      <Layers className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-kurator-fg">{c.name}</span>
                      <p className="mt-1 text-xs text-kurator-muted">
                        {c.item_count} {c.item_count === 1 ? "item" : "items"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </>
    </div>
  );
}
