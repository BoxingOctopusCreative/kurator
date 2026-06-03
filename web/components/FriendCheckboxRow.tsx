"use client";

import type { PublicUser } from "@/lib/api";
import { toShelfAuthor } from "@/lib/shelfAuthor";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";

type Props = {
  user: PublicUser;
  checked: boolean;
  onCheckedChange: () => void;
  className?: string;
};

export function FriendCheckboxRow({ user, checked, onCheckedChange, className = "" }: Props) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-kurator-border/30 ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onCheckedChange}
        className="shrink-0"
        aria-labelledby={`friend-picker-${user.id}`}
      />
      <div id={`friend-picker-${user.id}`} className="min-w-0 flex-1">
        <ShelfAuthorLink author={toShelfAuthor(user)} variant="avatarAndName" />
      </div>
    </div>
  );
}
