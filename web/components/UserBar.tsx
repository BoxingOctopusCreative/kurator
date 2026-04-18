"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import { User } from "lucide-react";
import { ThemePreferenceSelect } from "@/components/ThemePreferenceSelect";

/** Shown in AppChrome only when the user is signed in. */
export function UserBar() {
  const router = useRouter();
  const { user, refresh } = useAuth();

  async function onLogout() {
    await logout();
    await refresh();
    router.push("/");
    router.refresh();
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <ThemePreferenceSelect className="max-w-[7.5rem] rounded-md border border-kurator-border bg-kurator-bg px-2 py-1 text-xs text-kurator-fg outline-none ring-kurator-accent focus:ring-2" />
      <Link
        href={`/people/${encodeURIComponent(user.username)}`}
        className="rounded-md px-2 py-1 text-kurator-muted hover:bg-kurator-border/50 hover:text-kurator-fg"
        title="Public profile"
      >
        @{user.username}
      </Link>
      <Link
        href="/profile"
        className="flex max-w-[10rem] items-center gap-1.5 truncate rounded-md px-2 py-1 text-kurator-muted hover:bg-kurator-border/50 hover:text-kurator-fg"
        title={user.email}
      >
        {user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- profile URL from S3 or external
          <img
            src={user.avatar_url}
            alt=""
            className="h-6 w-6 shrink-0 rounded-full object-cover"
          />
        ) : (
          <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <span className="truncate">{user.display_name || user.email}</span>
      </Link>
      <button
        type="button"
        onClick={() => void onLogout()}
        className="rounded-md px-2 py-1 text-kurator-muted hover:text-kurator-fg"
      >
        Log out
      </button>
    </div>
  );
}
