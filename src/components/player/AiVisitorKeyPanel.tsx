"use client";

import { useEffect, useState } from "react";
import { KeyRound, LoaderCircle, X } from "lucide-react";
import {
  removeVisitorOpenAiKey,
  saveVisitorOpenAiKey,
} from "@/lib/ai-visualization-client";

type AiVisitorKeyPanelProps = {
  tourSlug: string;
  saved: boolean;
  last4: string | null;
  needsKey: boolean;
};

export function AiVisitorKeyPanel({
  tourSlug,
  saved,
  last4,
  needsKey,
}: AiVisitorKeyPanelProps) {
  const [editing, setEditing] = useState(needsKey);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (needsKey && !saved) setEditing(true);
  }, [needsKey, saved]);

  async function onSave() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveVisitorOpenAiKey(tourSlug, draft);
      setDraft("");
      setEditing(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Couldn't save this OpenAI key.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeVisitorOpenAiKey(tourSlug);
      setEditing(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Couldn't remove this OpenAI key.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (saved && !editing) {
    return (
      <div className="ai-viz-key-cta mb-3 rounded-xl px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-[12px] font-medium leading-4 text-[#f4f1ea]">
            Using your OpenAI key ···{last4}
            <span className="mt-0.5 block text-[11px] font-normal text-[#e4cfc4]">
              Unlimited renders on this key.
            </span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRemove()}
            className="shrink-0 text-[11px] text-[#f3d6d6] hover:text-[#efece6] disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="ai-viz-key-cta mb-3 flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left"
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#c45c4a]/35 text-[#f4d2c6]">
          <KeyRound className="size-4" strokeWidth={1.75} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium tracking-[-0.02em] text-[#f4f1ea]">
            Use your own OpenAI key
          </span>
          <span className="mt-0.5 block text-[11px] text-[#e4cfc4]">
            Unlimited renders on your account
          </span>
        </span>
      </button>
    );
  }

  function closeEditor() {
    setDraft("");
    setError(null);
    setEditing(false);
  }

  return (
    <div className="ai-viz-key-cta mb-3 rounded-xl px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#f4f1ea]">
          <KeyRound className="size-3.5 text-[#f4d2c6]" strokeWidth={1.75} />
          Use your OpenAI key
        </p>
        <button
          type="button"
          aria-label="Close API key form"
          disabled={busy}
          onClick={closeEditor}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[#e4cfc4] hover:bg-white/10 hover:text-[#f4f1ea] disabled:opacity-40"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-[#e4cfc4]/80">
        Paste a paid API key to keep rendering without the hourly limit. It is
        saved for you on this browser and never shown again.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          disabled={busy}
          placeholder="sk-..."
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-[13px] text-[#efece6] outline-none placeholder:text-[#7d838b] focus:border-white/25"
        />
        <button
          type="button"
          disabled={busy || draft.trim().length < 20}
          onClick={() => void onSave()}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#c45c4a] px-3 text-[12px] font-medium text-[#efece6] disabled:opacity-35"
        >
          {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          Save
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-[11px] leading-4 text-[#f3d6d6]">{error}</p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        className="mt-2 text-[11px] text-[#e4cfc4] hover:text-[#f4f1ea] disabled:opacity-40"
        onClick={closeEditor}
      >
        {saved ? "Keep current key" : "Cancel"}
      </button>
    </div>
  );
}
