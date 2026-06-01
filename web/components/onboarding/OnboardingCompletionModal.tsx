"use client";

import { KuratorModal } from "@/components/KuratorModal";

type Props = {
  open: boolean;
  busy: boolean;
  onFinish: () => void;
};

export function OnboardingCompletionModal({ open, busy, onFinish }: Props) {
  return (
    <KuratorModal open={open} onOpenChange={() => {}} dismissible={false} overlayClassName="bg-black/50">
      <div className="space-y-4 text-center sm:text-left">
        <h2 className="text-xl font-semibold text-kurator-fg">You&apos;re all set!</h2>
        <p className="text-sm text-kurator-muted">
          Your profile, security, and first shelves are ready. Follow friends, explore collections, and
          start curating.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={onFinish}
          className="w-full rounded-lg bg-kurator-accent px-4 py-2.5 text-sm font-semibold text-kurator-onAccent disabled:opacity-50"
        >
          {busy ? "Finishing…" : "Enter Kurator"}
        </button>
      </div>
    </KuratorModal>
  );
}
