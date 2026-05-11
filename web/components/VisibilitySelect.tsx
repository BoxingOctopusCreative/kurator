"use client";

import { Globe2, Lock, Users } from "lucide-react";
import type { Visibility } from "@/lib/api";

type Option = {
  value: Visibility;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
};

const OPTIONS: Option[] = [
  {
    value: "private",
    label: "Private",
    description: "Only you can see this.",
    icon: Lock,
  },
  {
    value: "followers",
    label: "Followers",
    description: "People who follow you (and friends) can see this.",
    icon: Users,
  },
  {
    value: "friends",
    label: "Friends only",
    description: "Only mutual follows can see this.",
    icon: Globe2,
  },
];

type Props = {
  value: Visibility;
  onChange: (v: Visibility) => void;
  /** Used to scope the radio inputs to a single group when multiple selectors share a page. */
  name: string;
  /** Optional caption rendered above the options. */
  legend?: string;
  disabled?: boolean;
};

/** Three-way visibility radio group for lists, collections, and wishlists. */
export function VisibilitySelect({ value, onChange, name, legend, disabled }: Props) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      {legend ? (
        <legend className="text-xs font-medium uppercase tracking-wide text-kurator-muted">
          {legend}
        </legend>
      ) : null}
      <div className="flex flex-col gap-2">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const checked = value === opt.value;
          return (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 py-1.5 text-sm transition-colors ${
                checked ? "text-kurator-fg" : "text-kurator-muted hover:text-kurator-fg/90"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                className="mt-1 h-3.5 w-3.5 shrink-0 accent-kurator-accent"
                name={name}
                value={opt.value}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(opt.value)}
              />
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-current" aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-inherit">{opt.label}</span>
                <span className="text-xs text-kurator-muted">{opt.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
