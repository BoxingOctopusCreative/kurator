"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Menu, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { ProfileImageCropModal } from "@/components/ProfileImageCropModal";
import { fetchMe, patchProfile, type AuthUser } from "@/lib/auth";
import { uploadAvatarImage, uploadBannerImage } from "@/lib/api";
import {
  newSocialEditRow,
  parseSocialLinksToRows,
  socialEditRowsToPayload,
  SOCIAL_PLATFORM_OPTIONS,
  type SocialEditRow,
} from "@/lib/socialPlatforms";
import { safeImageSrcUrl } from "@/lib/safeUrl";

type SortableSocialRowProps = {
  row: SocialEditRow;
  index: number;
  onPlatformChange: (index: number, platform: string) => void;
  onProfileFieldChange: (index: number, handle: string) => void;
  onRemove: (index: number) => void;
};

function SortableSocialRow({ row, index, onPlatformChange, onProfileFieldChange, onRemove }: SortableSocialRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const meta = SOCIAL_PLATFORM_OPTIONS.find((o) => o.id === row.platform);
  const platformFieldId = `profile-social-platform-${row.id}`;
  const profileFieldId = `profile-social-profile-${row.id}`;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[auto_minmax(11rem,1fr)_minmax(12rem,2fr)_auto] gap-x-2 gap-y-1 ${isDragging ? "opacity-60" : ""}`.trim()}
    >
      <span className="col-start-1 row-start-1 min-w-6" aria-hidden />
      <label htmlFor={platformFieldId} className="col-start-2 row-start-1 self-end text-xs text-kurator-muted">
        Platform
      </label>
      <label htmlFor={profileFieldId} className="col-start-3 row-start-1 self-end text-xs text-kurator-muted">
        Profile
      </label>
      <span className="col-start-4 row-start-1 w-10" aria-hidden />

      <div className="col-start-1 row-start-2 flex items-center justify-center self-stretch">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-md text-kurator-muted touch-none hover:bg-kurator-border/30 hover:text-kurator-fg active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder social link ${index + 1}`}
        >
          <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>
      <select
        id={platformFieldId}
        className="col-start-2 row-start-2 w-full min-h-10 self-center rounded-lg border border-kurator-border bg-kurator-bg px-2 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
        value={row.platform}
        onChange={(e) => onPlatformChange(index, e.target.value)}
      >
        {SOCIAL_PLATFORM_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <input
        id={profileFieldId}
        aria-label={`Social profile ${index + 1}`}
        className="col-start-3 row-start-2 w-full min-h-10 self-center rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
        placeholder={meta?.placeholder ?? ""}
        value={row.handle}
        onChange={(e) => onProfileFieldChange(index, e.target.value)}
      />
      <div className="col-start-4 row-start-2 flex items-center justify-center self-stretch">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-kurator-muted hover:bg-red-950/25 hover:text-red-400"
          aria-label={`Remove social link ${index + 1}`}
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function ProfileSettingsClient() {
  const router = useRouter();
  const { refresh: refreshAuth } = useAuth();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [displayName, setDisplayName] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [profilePublic, setProfilePublic] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstNamePublic, setFirstNamePublic] = useState(false);
  const [lastNamePublic, setLastNamePublic] = useState(false);
  const [location, setLocation] = useState("");
  const [socialRows, setSocialRows] = useState<SocialEditRow[]>([]);
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [cropSession, setCropSession] = useState<{ kind: "avatar" | "banner"; url: string } | null>(null);

  const socialDnDSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function closeCropSession() {
    setCropSession((prev) => {
      if (prev?.url) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
  }

  const load = useCallback(async () => {
    try {
      const u = await fetchMe();
      if (!u) {
        setUser(null);
        return;
      }
      setUser(u);
      setDisplayName(u.display_name);
      setProfileUsername(u.username ?? "");
      setProfilePublic(u.profile_is_public ?? true);
      setFirstName(u.first_name ?? "");
      setLastName(u.last_name ?? "");
      setFirstNamePublic(u.first_name_public ?? false);
      setLastNamePublic(u.last_name_public ?? false);
      setLocation(u.location ?? "");
      setSocialRows(parseSocialLinksToRows(u.social_links));
      setBio(u.bio);
      setAvatarUrl(u.avatar_url ?? "");
      setBannerUrl(u.banner_url ?? "");
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (user === null) {
      router.replace("/login?next=/profile");
    }
  }, [user, router]);

  function onSocialLinkDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSocialRows((prev) => {
      const oldIndex = prev.findIndex((r) => r.id === active.id);
      const newIndex = prev.findIndex((r) => r.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const onSocialPlatformChange = useCallback((index: number, platform: string) => {
    setSocialRows((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], platform, handle: "" };
      return next;
    });
  }, []);

  const onSocialProfileFieldChange = useCallback((index: number, handle: string) => {
    setSocialRows((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], handle };
      return next;
    });
  }, []);

  const onSocialRemove = useCallback((index: number) => {
    setSocialRows((prev) => prev.filter((_, j) => j !== index));
  }, []);

  function profilePatchBase() {
    return {
      display_name: displayName,
      username: profileUsername,
      profile_is_public: profilePublic,
      first_name: firstName,
      last_name: lastName,
      first_name_public: firstNamePublic,
      last_name_public: lastNamePublic,
      location,
      social_links: socialEditRowsToPayload(socialRows),
      bio,
      avatar_url: avatarUrl.trim() === "" ? "" : avatarUrl.trim(),
      banner_url: bannerUrl.trim() === "" ? "" : bannerUrl.trim(),
    } as const;
  }

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const u = await patchProfile({ ...profilePatchBase() });
      setUser(u);
      setDisplayName(u.display_name);
      setProfileUsername(u.username ?? "");
      setProfilePublic(u.profile_is_public ?? true);
      setFirstName(u.first_name ?? "");
      setLastName(u.last_name ?? "");
      setFirstNamePublic(u.first_name_public ?? false);
      setLastNamePublic(u.last_name_public ?? false);
      setLocation(u.location ?? "");
      setSocialRows(parseSocialLinksToRows(u.social_links));
      setAvatarUrl(u.avatar_url ?? "");
      setBannerUrl(u.banner_url ?? "");
      void refreshAuth();
      setMessage("Saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      setMessage(file ? "Choose a JPEG, PNG, GIF, or WebP image." : null);
      return;
    }
    setMessage(null);
    setCropSession((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { kind: "avatar", url: URL.createObjectURL(file) };
    });
  }

  async function uploadCroppedAvatar(file: File) {
    closeCropSession();
    setAvatarBusy(true);
    try {
      const url = await uploadAvatarImage(file);
      const u = await patchProfile({ ...profilePatchBase(), avatar_url: url });
      setUser(u);
      setProfileUsername(u.username ?? "");
      setProfilePublic(u.profile_is_public ?? true);
      setFirstName(u.first_name ?? "");
      setLastName(u.last_name ?? "");
      setFirstNamePublic(u.first_name_public ?? false);
      setLastNamePublic(u.last_name_public ?? false);
      setLocation(u.location ?? "");
      setSocialRows(parseSocialLinksToRows(u.social_links));
      setAvatarUrl(u.avatar_url ?? "");
      setBannerUrl(u.banner_url ?? "");
      await refreshAuth();
      setMessage("Profile photo updated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onClearAvatar() {
    setMessage(null);
    setBusy(true);
    try {
      const u = await patchProfile({ ...profilePatchBase(), avatar_url: "" });
      setUser(u);
      setProfileUsername(u.username ?? "");
      setProfilePublic(u.profile_is_public ?? true);
      setFirstName(u.first_name ?? "");
      setLastName(u.last_name ?? "");
      setFirstNamePublic(u.first_name_public ?? false);
      setLastNamePublic(u.last_name_public ?? false);
      setLocation(u.location ?? "");
      setSocialRows(parseSocialLinksToRows(u.social_links));
      setAvatarUrl("");
      setBannerUrl(u.banner_url ?? "");
      await refreshAuth();
      setMessage("Profile photo removed.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove photo.");
    } finally {
      setBusy(false);
    }
  }

  function onBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      setMessage(file ? "Choose a JPEG, PNG, GIF, or WebP image." : null);
      return;
    }
    setMessage(null);
    setCropSession((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { kind: "banner", url: URL.createObjectURL(file) };
    });
  }

  async function uploadCroppedBanner(file: File) {
    closeCropSession();
    setBannerBusy(true);
    try {
      const url = await uploadBannerImage(file);
      const u = await patchProfile({ ...profilePatchBase(), banner_url: url });
      setUser(u);
      setProfileUsername(u.username ?? "");
      setProfilePublic(u.profile_is_public ?? true);
      setFirstName(u.first_name ?? "");
      setLastName(u.last_name ?? "");
      setFirstNamePublic(u.first_name_public ?? false);
      setLastNamePublic(u.last_name_public ?? false);
      setLocation(u.location ?? "");
      setSocialRows(parseSocialLinksToRows(u.social_links));
      setAvatarUrl(u.avatar_url ?? "");
      setBannerUrl(u.banner_url ?? "");
      await refreshAuth();
      setMessage("Profile banner updated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBannerBusy(false);
    }
  }

  async function onClearBanner() {
    setMessage(null);
    setBusy(true);
    try {
      const u = await patchProfile({ ...profilePatchBase(), banner_url: "" });
      setUser(u);
      setProfileUsername(u.username ?? "");
      setProfilePublic(u.profile_is_public ?? true);
      setFirstName(u.first_name ?? "");
      setLastName(u.last_name ?? "");
      setFirstNamePublic(u.first_name_public ?? false);
      setLastNamePublic(u.last_name_public ?? false);
      setLocation(u.location ?? "");
      setSocialRows(parseSocialLinksToRows(u.social_links));
      setAvatarUrl(u.avatar_url ?? "");
      setBannerUrl("");
      await refreshAuth();
      setMessage("Profile banner removed.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove banner.");
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined || user === null) {
    return (
      <div className="mx-auto max-w-lg text-sm text-kurator-muted">
        {user === undefined ? "Loading…" : "Redirecting to login…"}
      </div>
    );
  }

  const bannerPreviewSrc = safeImageSrcUrl(bannerUrl);
  const avatarPreviewSrc = safeImageSrcUrl(avatarUrl);

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      {cropSession ? (
        <ProfileImageCropModal
          kind={cropSession.kind}
          imageObjectUrl={cropSession.url}
          onClose={closeCropSession}
          onComplete={cropSession.kind === "avatar" ? uploadCroppedAvatar : uploadCroppedBanner}
        />
      ) : null}
      <PageHeroUnsplash>
        <div>
          <h1 className="text-2xl font-semibold text-kurator-fg">Profile Settings</h1>
          <p className="mt-1 text-sm text-kurator-muted">Signed in as {user.email}</p>
        </div>
      </PageHeroUnsplash>

      <form
        onSubmit={onSaveProfile}
        className="space-y-4 rounded-xl border border-kurator-border bg-kurator-surface p-6 sm:p-8"
      >
        <h2 className="kurator-panel-title text-kurator-fg">Public Profile</h2>
        <label className="block text-sm">
          <span className="text-kurator-muted">Display name</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Username (public URL)</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2 read-only:cursor-not-allowed read-only:opacity-80"
            value={profileUsername}
            onChange={(e) => setProfileUsername(e.target.value.toLowerCase())}
            readOnly={user.username_locked ?? true}
            autoComplete="username"
            spellCheck={false}
          />
          {(user.username_locked ?? true) ? (
            <span className="mt-1 block text-xs text-kurator-muted">
              Your username is permanent. Profile:{" "}
              <Link href={`/people/${encodeURIComponent(profileUsername || "…")}`} className="text-kurator-accent hover:underline">
                /people/{profileUsername || "…"}
              </Link>
            </span>
          ) : (
            <span className="mt-1 block text-xs text-kurator-muted">
              You can set your public username once (replacing the temporary name). After that it stays permanent. Profile:{" "}
              <Link href={`/people/${encodeURIComponent(profileUsername || "…")}`} className="text-kurator-accent hover:underline">
                /people/{profileUsername || "…"}
              </Link>
            </span>
          )}
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 rounded-sm border-kurator-border"
            checked={profilePublic}
            onChange={(e) => setProfilePublic(e.target.checked)}
          />
          <span>
            <span className="font-medium text-kurator-fg">Public Profile</span>
            <span className="mt-0.5 block text-xs text-kurator-muted">
              When off, only you can open your /people page; you won&apos;t appear in people search.
            </span>
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">First name (legal)</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Optional"
            autoComplete="given-name"
          />
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 rounded-sm border-kurator-border"
            checked={firstNamePublic}
            onChange={(e) => setFirstNamePublic(e.target.checked)}
          />
          <span>
            <span className="font-medium text-kurator-fg">Show first name publicly</span>
            <span className="mt-0.5 block text-xs text-kurator-muted">
              When on, people search and your public profile can include this name.
            </span>
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Last name (legal)</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Optional"
            autoComplete="family-name"
          />
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 rounded-sm border-kurator-border"
            checked={lastNamePublic}
            onChange={(e) => setLastNamePublic(e.target.checked)}
          />
          <span>
            <span className="font-medium text-kurator-fg">Show last name publicly</span>
            <span className="mt-0.5 block text-xs text-kurator-muted">
              When on, people search and your public profile can include this name.
            </span>
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Location</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, country, etc."
          />
        </label>
        <div className="space-y-2">
          <span className="text-sm text-kurator-muted">Social links</span>
          <p className="text-xs text-kurator-muted/90">
            Choose a platform, then enter your username or paste a full profile URL (https). Up to 12 links.
            Drag the handle icon beside each row to change display order on your public profile (keyboard: focus the
            handle and use arrows).
            Mastodon and &quot;Other website&quot; always need a full URL.
          </p>
          <DndContext sensors={socialDnDSensors} collisionDetection={closestCenter} onDragEnd={onSocialLinkDragEnd}>
            <SortableContext items={socialRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-3">
                {socialRows.map((row, i) => (
                  <SortableSocialRow
                    key={row.id}
                    row={row}
                    index={i}
                    onPlatformChange={onSocialPlatformChange}
                    onProfileFieldChange={onSocialProfileFieldChange}
                    onRemove={onSocialRemove}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {socialRows.length < 12 ? (
            <button
              type="button"
              className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs text-kurator-muted hover:text-kurator-fg"
              onClick={() => setSocialRows([...socialRows, newSocialEditRow()])}
            >
              Add Link
            </button>
          ) : null}
        </div>
        <label className="block text-sm">
          <span className="text-kurator-muted">Bio</span>
          <textarea
            rows={3}
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </label>
        <div className="space-y-2">
          <span className="text-sm text-kurator-muted">Profile banner</span>
          <p className="text-xs text-kurator-muted/90">
            Wide image for your public /people page (crop to 3:1, exported 1800×600). Optional. Max 10 MB before crop.
          </p>
          <div className="relative h-28 w-full overflow-hidden rounded-xl border border-kurator-border bg-kurator-bg shadow-surface">
            {bannerPreviewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote S3/CDN URL
              <img src={bannerPreviewSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-kurator-muted">
                No banner
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              id="profile-banner-file"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="sr-only"
              onChange={(e) => void onBannerFile(e)}
              disabled={bannerBusy || busy}
            />
            <label
              htmlFor="profile-banner-file"
              className={`inline-flex cursor-pointer rounded-lg border border-kurator-border bg-kurator-bg px-3 py-1.5 text-xs font-medium text-kurator-fg hover:bg-kurator-surface ${bannerBusy || busy ? "pointer-events-none opacity-50" : ""}`}
            >
              {bannerBusy ? "Uploading…" : "Upload Banner"}
            </label>
            {bannerUrl ? (
              <button
                type="button"
                disabled={busy || bannerBusy}
                onClick={() => void onClearBanner()}
                className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs text-kurator-muted hover:text-kurator-fg disabled:opacity-50"
              >
                Remove Banner
              </button>
            ) : null}
          </div>
          <label className="block text-sm">
            <span className="text-kurator-muted">Or paste banner image URL</span>
            <input
              type="text"
              inputMode="url"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
        </div>
        <div className="space-y-2">
          <span className="text-sm text-kurator-muted">Profile photo</span>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-kurator-border bg-kurator-bg">
              {avatarPreviewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote S3/CDN URL
                <img src={avatarPreviewSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-kurator-muted">
                  No photo
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                id="profile-avatar-file"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="sr-only"
                onChange={(e) => void onAvatarFile(e)}
                disabled={avatarBusy || busy}
              />
              <div className="flex flex-wrap gap-2">
                <label
                  htmlFor="profile-avatar-file"
                  className={`inline-flex cursor-pointer rounded-lg border border-kurator-border bg-kurator-bg px-3 py-1.5 text-xs font-medium text-kurator-fg hover:bg-kurator-surface ${avatarBusy || busy ? "pointer-events-none opacity-50" : ""}`}
                >
                  {avatarBusy ? "Uploading…" : "Upload Photo"}
                </label>
                {avatarUrl ? (
                  <button
                    type="button"
                    disabled={busy || avatarBusy}
                    onClick={() => void onClearAvatar()}
                    className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs text-kurator-muted hover:text-kurator-fg disabled:opacity-50"
                  >
                    Remove Photo
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-kurator-muted/90">
                Square crop, exported 512×512. Max 10 MB before crop.
              </p>
            </div>
          </div>
        </div>
        <label className="block text-sm">
          <span className="text-kurator-muted">Or paste image URL</span>
          <input
            type="text"
            inputMode="url"
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save Profile"}
        </button>
      </form>

      {message ? (
        <p className={`text-sm ${message === "Saved." || message.includes("updated") || message.includes("removed") ? "text-emerald-400" : "text-red-400"}`}>
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 border-t border-kurator-border pt-6">
        <Link href="/" className="rounded-lg px-4 py-2 text-sm text-kurator-accent hover:underline">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
