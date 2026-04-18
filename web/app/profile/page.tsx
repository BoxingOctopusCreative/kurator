"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  disable2FA,
  enable2FA,
  fetchMe,
  logout,
  patchProfile,
  setup2FA,
  type AuthUser,
  type TwoFASetup,
} from "@/lib/auth";
import { uploadAvatarImage, uploadBannerImage } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { ThemePreferenceSelect } from "@/components/ThemePreferenceSelect";
import type { SocialLinkInput } from "@/lib/validation";

function parseSocialLinks(raw: unknown): SocialLinkInput[] {
  if (!Array.isArray(raw)) return [];
  const out: SocialLinkInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label : "";
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!url) continue;
    out.push({ label, url });
  }
  return out;
}

export default function ProfilePage() {
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
  const [socialRows, setSocialRows] = useState<SocialLinkInput[]>([]);
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);

  const [twoFASetup, setTwoFASetup] = useState<TwoFASetup | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");

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
      setSocialRows(parseSocialLinks(u.social_links));
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
      social_links: socialRows,
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
      setSocialRows(parseSocialLinks(u.social_links));
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

  async function onBegin2FA() {
    setMessage(null);
    setBusy(true);
    try {
      const s = await setup2FA();
      setTwoFASetup(s);
      setEnableCode("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start 2FA setup.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm2FA(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const u = await enable2FA(enableCode.replace(/\s/g, ""));
      setUser(u);
      setTwoFASetup(null);
      setEnableCode("");
      setMessage("Two-factor authentication is on.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Invalid code.");
    } finally {
      setBusy(false);
    }
  }

  async function onDisable2FA(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const u = await disable2FA(disablePassword);
      setUser(u);
      setDisablePassword("");
      setMessage("Two-factor authentication is off.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not disable 2FA.");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    await refreshAuth();
    router.push("/");
    router.refresh();
  }

  async function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      setMessage(file ? "Choose a JPEG, PNG, GIF, or WebP image." : null);
      return;
    }
    setMessage(null);
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
      setSocialRows(parseSocialLinks(u.social_links));
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
      setSocialRows(parseSocialLinks(u.social_links));
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

  async function onBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      setMessage(file ? "Choose a JPEG, PNG, GIF, or WebP image." : null);
      return;
    }
    setMessage(null);
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
      setSocialRows(parseSocialLinks(u.social_links));
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
      setSocialRows(parseSocialLinks(u.social_links));
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

  return (
    <div className="mx-auto max-w-lg space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-kurator-fg">Profile</h1>
        <p className="mt-1 text-sm text-kurator-muted">Signed in as {user.email}</p>
      </div>

      <section className="space-y-3 border-t border-kurator-border pt-8">
        <h2 className="text-sm font-medium text-kurator-fg">Appearance</h2>
        <p className="text-sm text-kurator-muted">
          Use a light or dark interface, or follow your system setting.
        </p>
        <label className="block text-sm">
          <span className="text-kurator-muted">Theme</span>
          <ThemePreferenceSelect
            id="profile-theme"
            className="mt-1 w-full max-w-xs rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
          />
        </label>
      </section>

      <form onSubmit={onSaveProfile} className="space-y-4">
        <h2 className="text-sm font-medium text-kurator-fg">Public profile</h2>
        <label className="block text-sm">
          <span className="text-kurator-muted">Display name</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Username (public URL)</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2 read-only:cursor-not-allowed read-only:opacity-80"
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
            className="mt-1 rounded border-kurator-border"
            checked={profilePublic}
            onChange={(e) => setProfilePublic(e.target.checked)}
          />
          <span>
            <span className="font-medium text-kurator-fg">Public profile</span>
            <span className="mt-0.5 block text-xs text-kurator-muted">
              When off, only you can open your /people page; you won&apos;t appear in people search.
            </span>
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">First name (legal)</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Optional"
            autoComplete="given-name"
          />
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 rounded border-kurator-border"
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
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Optional"
            autoComplete="family-name"
          />
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 rounded border-kurator-border"
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
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, country, etc."
          />
        </label>
        <div className="space-y-2">
          <span className="text-sm text-kurator-muted">Social links</span>
          <p className="text-xs text-kurator-muted/90">
            Up to 12 links. Labels are optional; URLs must use http or https.
          </p>
          <ul className="space-y-2">
            {socialRows.map((row, i) => (
              <li key={i} className="flex flex-wrap gap-2">
                <input
                  aria-label={`Link label ${i + 1}`}
                  className="min-w-[6rem] flex-1 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
                  placeholder="Label"
                  value={row.label}
                  onChange={(e) => {
                    const next = [...socialRows];
                    next[i] = { ...next[i], label: e.target.value };
                    setSocialRows(next);
                  }}
                />
                <input
                  aria-label={`Link URL ${i + 1}`}
                  className="min-w-[12rem] flex-[2] rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
                  placeholder="https://…"
                  inputMode="url"
                  value={row.url}
                  onChange={(e) => {
                    const next = [...socialRows];
                    next[i] = { ...next[i], url: e.target.value };
                    setSocialRows(next);
                  }}
                />
                <button
                  type="button"
                  className="rounded-lg border border-kurator-border px-2 py-2 text-xs text-kurator-muted hover:text-kurator-fg"
                  onClick={() => setSocialRows(socialRows.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {socialRows.length < 12 ? (
            <button
              type="button"
              className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs text-kurator-muted hover:text-kurator-fg"
              onClick={() => setSocialRows([...socialRows, { label: "", url: "" }])}
            >
              Add link
            </button>
          ) : null}
        </div>
        <label className="block text-sm">
          <span className="text-kurator-muted">Bio</span>
          <textarea
            rows={3}
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </label>
        <div className="space-y-2">
          <span className="text-sm text-kurator-muted">Profile banner</span>
          <p className="text-xs text-kurator-muted/90">
            Wide image shown at the top of your public /people page. Optional. Same storage as photos, max 10 MB.
          </p>
          <div className="relative h-28 w-full max-w-xl overflow-hidden rounded-xl border border-kurator-border bg-kurator-bg">
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote S3/CDN URL
              <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
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
              {bannerBusy ? "Uploading…" : "Upload banner"}
            </label>
            {bannerUrl ? (
              <button
                type="button"
                disabled={busy || bannerBusy}
                onClick={() => void onClearBanner()}
                className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs text-kurator-muted hover:text-kurator-fg disabled:opacity-50"
              >
                Remove banner
              </button>
            ) : null}
          </div>
          <label className="block text-sm">
            <span className="text-kurator-muted">Or paste banner image URL</span>
            <input
              type="text"
              inputMode="url"
              className="mt-1 w-full max-w-xl rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
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
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote S3/CDN URL
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
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
                  {avatarBusy ? "Uploading…" : "Upload photo"}
                </label>
                {avatarUrl ? (
                  <button
                    type="button"
                    disabled={busy || avatarBusy}
                    onClick={() => void onClearAvatar()}
                    className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs text-kurator-muted hover:text-kurator-fg disabled:opacity-50"
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-kurator-muted/90">
                Images are stored in your app&apos;s S3 bucket (same as item covers). Max 10 MB.
              </p>
            </div>
          </div>
        </div>
        <label className="block text-sm">
          <span className="text-kurator-muted">Or paste image URL</span>
          <input
            type="text"
            inputMode="url"
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
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
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>

      <section className="space-y-4 border-t border-kurator-border pt-8">
        <h2 className="text-sm font-medium text-kurator-fg">Two-factor authentication</h2>
        <p className="text-sm text-kurator-muted">
          Add a TOTP app (1Password, Google Authenticator, etc.). You will be asked for a code when
          you log in.
        </p>
        {user.two_factor_enabled ? (
          <form onSubmit={onDisable2FA} className="space-y-3 rounded-lg border border-kurator-border bg-kurator-bg/40 p-4">
            <p className="text-sm text-kurator-accent">2FA is enabled for this account.</p>
            <label className="block text-sm">
              <span className="text-kurator-muted">Current password</span>
              <input
                type="password"
                required
                className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg border border-red-500/50 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-950/50 disabled:opacity-50"
            >
              Turn off 2FA
            </button>
          </form>
        ) : twoFASetup ? (
          <form onSubmit={onConfirm2FA} className="space-y-3 rounded-lg border border-kurator-border bg-kurator-bg/40 p-4">
            <p className="text-xs text-kurator-muted">
              Scan this URI in your authenticator app, or enter the secret manually:
            </p>
            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-black/40 p-2 font-mono text-[11px] text-zinc-300">
              {twoFASetup.otpauth_url}
            </pre>
            <p className="text-xs text-kurator-muted">
              Secret: <span className="font-mono text-zinc-300">{twoFASetup.secret}</span>
            </p>
            <label className="block text-sm">
              <span className="text-kurator-muted">Code from app</span>
              <input
                inputMode="numeric"
                required
                className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
                value={enableCode}
                onChange={(e) => setEnableCode(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent disabled:opacity-50"
              >
                Confirm and enable
              </button>
              <button
                type="button"
                className="rounded-lg border border-kurator-border px-4 py-2 text-sm text-kurator-muted hover:text-kurator-fg"
                onClick={() => {
                  setTwoFASetup(null);
                  setEnableCode("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onBegin2FA()}
            className="rounded-lg border border-kurator-border px-4 py-2 text-sm font-medium text-kurator-fg hover:bg-kurator-border/40 disabled:opacity-50"
          >
            Set up authenticator
          </button>
        )}
      </section>

      {message && (
        <p className={`text-sm ${message.startsWith("Saved") || message.includes("on.") || message.includes("off.") ? "text-emerald-400" : "text-red-400"}`}>
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-3 border-t border-kurator-border pt-6">
        <button
          type="button"
          onClick={() => void onLogout()}
          className="rounded-lg border border-kurator-border px-4 py-2 text-sm text-kurator-muted hover:text-kurator-fg"
        >
          Log out
        </button>
        <Link href="/" className="rounded-lg px-4 py-2 text-sm text-kurator-accent hover:underline">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
