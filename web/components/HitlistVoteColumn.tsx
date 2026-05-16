"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

type Props = {
  voteCount: number;
  viewerHasVoted: boolean;
  /** Signed-in user who may vote */
  canVote: boolean;
  busy: boolean;
  onVoteToggle: () => void;
  className?: string;
  /** When false, hide the “Sign in to vote” line when unauthenticated (e.g. hitlist discover rows). Default true. */
  signInHint?: boolean;
};

/**
 * Reddit-style vertical voting: up chevron, score, down chevron.
 * Kurator hitlists are upvote-only; the down chevron removes your upvote (no downvotes).
 */
export function HitlistVoteColumn({
  voteCount,
  viewerHasVoted,
  canVote,
  busy,
  onVoteToggle,
  className = "",
  signInHint = true,
}: Props) {
  const score = Math.max(0, Math.trunc(Number(voteCount)));
  const upEnabled = canVote && !busy;

  return (
    <div
      className={`flex flex-col items-center gap-0.5 ${className}`.trim()}
      role="group"
      aria-label="Votes"
    >
      <button
        type="button"
        disabled={!upEnabled}
        aria-pressed={viewerHasVoted}
        aria-label={viewerHasVoted ? "Remove upvote" : "Upvote"}
        onClick={() => {
          if (!upEnabled) return;
          onVoteToggle();
        }}
        className={`rounded-md p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          viewerHasVoted
            ? "text-kurator-accent hover:bg-kurator-accent/15"
            : "text-kurator-muted hover:bg-kurator-border/40 hover:text-kurator-fg"
        }`}
      >
        <ChevronUp className="h-8 w-8" strokeWidth={2.75} aria-hidden />
      </button>
      <span
        className="min-w-[2.25rem] select-none text-center text-sm font-semibold tabular-nums leading-none text-kurator-fg"
        aria-live="polite"
      >
        {score}
      </span>
      <button
        type="button"
        disabled={!canVote || busy || !viewerHasVoted}
        aria-label="Remove upvote"
        onClick={() => {
          if (!canVote || busy || !viewerHasVoted) return;
          onVoteToggle();
        }}
        className={`rounded-md p-0.5 transition-colors disabled:cursor-default disabled:opacity-30 ${
          viewerHasVoted
            ? "text-kurator-muted hover:bg-kurator-border/40 hover:text-kurator-fg"
            : "text-kurator-muted/30"
        }`}
      >
        <ChevronDown className="h-8 w-8" strokeWidth={2.75} aria-hidden />
      </button>
      {!canVote && signInHint ? (
        <span className="max-w-[5.5rem] text-center text-[10px] leading-tight text-kurator-muted">
          Sign in to vote
        </span>
      ) : null}
    </div>
  );
}
