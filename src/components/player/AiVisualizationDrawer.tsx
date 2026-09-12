"use client";

/* Signed storage URLs and blob captures are not a fit for next/image. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Columns2,
  Download,
  LoaderCircle,
  Maximize2,
  Sparkles,
  X,
} from "lucide-react";
import {
  AI_CONCEPT_NOTICE,
  AI_VISITOR_INSTRUCTION_MAX,
} from "@/lib/ai-visualization";
import {
  startAiVisualization,
  submitAiFollowUp,
} from "@/lib/ai-visualization-client";
import {
  getAiVisualization,
  setAiVisualization,
  subscribeAiVisualization,
} from "@/store/ai-visualization-store";
import { AiVisitorKeyPanel } from "./AiVisitorKeyPanel";
import { BeforeAfterSlider } from "./BeforeAfterSlider";

type AiVisualizationDrawerProps = {
  tourSlug: string;
};

export function AiVisualizationDrawer({ tourSlug }: AiVisualizationDrawerProps) {
  const [state, setState] = useState(getAiVisualization);
  const [draft, setDraft] = useState("");
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => subscribeAiVisualization(setState), []);

  const latestImage = useMemo(
    () =>
      [...state.messages]
        .reverse()
        .find((message) => message.type === "image" && message.imageUrl),
    [state.messages],
  );
  const latestCaptureId = useMemo(
    () =>
      [...state.messages]
        .reverse()
        .find((message) => message.type === "capture")?.id ?? null,
    [state.messages],
  );

  function scrollChatToBottom(behavior: ScrollBehavior = "smooth") {
    const node = listRef.current;
    if (!node) return;
    const run = () => {
      bottomRef.current?.scrollIntoView({ block: "end", behavior });
      node.scrollTop = node.scrollHeight;
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  useEffect(() => {
    scrollChatToBottom(state.messages.length > 1 ? "smooth" : "auto");
  }, [state.messages.length, state.status, state.busy, latestImage?.id]);

  if (!state.open) return null;

  const canFollowUp =
    Boolean(state.threadId) &&
    !state.busy &&
    (state.unlimited || state.followUpsRemaining > 0) &&
    Boolean(latestImage);

  function beginNewView() {
    if (state.busy) return;
    setDraft("");
    setCompareOpen(false);
    setFullscreenUrl(null);
    setAiVisualization({
      compareImageUrl: null,
      lastCapture: null,
      error: null,
    });
    void startAiVisualization(tourSlug);
  }

  async function downloadImage(url: string, name: string) {
    const response = await fetch(url);
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = name;
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-30 bg-black/20 sm:bg-transparent"
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="AI Visualization"
        className="explore-chrome-panel pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex h-[min(92dvh,42rem)] flex-col overflow-hidden rounded-t-3xl sm:inset-y-0 sm:left-auto sm:right-0 sm:h-auto sm:w-[min(28rem,100vw)] sm:rounded-none sm:border-l sm:border-white/10"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        style={{ touchAction: "pan-y" }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/8 px-4 pb-3 pt-[max(0.9rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[14px] font-medium tracking-[-0.02em] text-[#f4f1ea]">
              <Sparkles className="size-4 text-[#d7c7a2]" strokeWidth={1.75} />
              AI Visualization
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[#9aa0a6]">
              {AI_CONCEPT_NOTICE}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close AI Visualization"
            onClick={() => setAiVisualization({ open: false })}
            className="explore-chrome-btn inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-[#c8c4bc] hover:bg-white/10 hover:text-[#f4f1ea]"
          >
            <X className="size-[18px]" strokeWidth={1.75} />
          </button>
        </header>

        <div
          ref={listRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
        >
          {state.messages.map((message) => (
            <article key={message.id} className="space-y-2">
              {message.type === "capture" && message.captureUrl ? (
                <ChatImage
                  src={message.captureUrl}
                  alt="Captured tour viewpoint"
                  caption={
                    message.id === latestCaptureId
                      ? "Current tour viewpoint"
                      : "Earlier viewpoint"
                  }
                  onReady={() => scrollChatToBottom()}
                />
              ) : null}
              {message.type === "instruction" && message.text ? (
                <p className="ai-viz-bubble ml-8 rounded-2xl rounded-br-md px-3 py-2 text-[13px] leading-5 text-[#f6ebe4]">
                  {message.text}
                </p>
              ) : null}
              {message.type === "image" && message.imageUrl ? (
                <ChatImage
                  src={message.imageUrl}
                  alt="Photorealistic architectural visualization"
                  onReady={() => scrollChatToBottom()}
                >
                  <div className="flex flex-wrap gap-1.5 px-2 py-2">
                    <ImageAction
                      icon={<Download className="size-3.5" />}
                      label="Download"
                      onClick={() =>
                        void downloadImage(
                          message.imageUrl!,
                          `ai-visualization-${message.id}.jpg`,
                        )
                      }
                    />
                    <ImageAction
                      icon={<Maximize2 className="size-3.5" />}
                      label="Fullscreen"
                      onClick={() => setFullscreenUrl(message.imageUrl)}
                    />
                    {state.originalCaptureUrl ? (
                      <ImageAction
                        icon={<Columns2 className="size-3.5" />}
                        label="Compare"
                        onClick={() => {
                          setAiVisualization({ compareImageUrl: message.imageUrl });
                          setCompareOpen(true);
                        }}
                      />
                    ) : null}
                  </div>
                </ChatImage>
              ) : null}
              {(message.type === "text" || message.type === "error") &&
              message.text ? (
                <p
                  className={`rounded-2xl px-3 py-2 text-[13px] leading-5 ${
                    message.type === "error"
                      ? "border border-[#c45c4a]/35 bg-[#2a1616]/80 text-[#f3d6d6]"
                      : "ai-viz-bubble text-[#f6ebe4]"
                  }`}
                >
                  {message.text}
                </p>
              ) : null}
            </article>
          ))}

          {state.busy ? (
            <figure className="overflow-hidden rounded-xl">
              <div className="ai-viz-skeleton aspect-[4/3] w-full">
                <div className="absolute inset-x-3 bottom-3 z-[1] rounded-xl bg-black/35 px-3 py-2.5 backdrop-blur-sm">
                  <p className="text-[13px] text-[#efece6]">
                    {state.statusLabel || "Creating photorealistic visualization"}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-[#e4cfc4]">
                    This usually takes one or two minutes.
                  </p>
                </div>
              </div>
            </figure>
          ) : null}

          {state.error ? (
            <div className="rounded-2xl border border-[#c45c4a]/30 bg-[#2a1616]/70 px-3 py-3">
              <p className="text-[13px] leading-5 text-[#f3d6d6]">{state.error}</p>
            </div>
          ) : null}
          <div ref={bottomRef} className="h-px" aria-hidden />
        </div>

        <div className="border-t border-white/8 px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-3">
          {!state.busy ? (
            <AiVisitorKeyPanel
              tourSlug={tourSlug}
              saved={state.openaiKeySaved}
              last4={state.openaiKeyLast4}
              needsKey={state.needsOpenAiKey}
            />
          ) : null}
          {latestImage && !state.busy ? (
            <form
              className="mb-3"
              onSubmit={(event) => {
                event.preventDefault();
                const next = draft.trim();
                if (!next || !canFollowUp) return;
                setDraft("");
                void submitAiFollowUp(tourSlug, next);
              }}
            >
              <label
                htmlFor="ai-viz-refine"
                className="mb-1.5 block text-[11px] font-medium tracking-[-0.01em] text-[#d7d2c8]"
              >
                Change this image
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  id="ai-viz-refine"
                  ref={inputRef}
                  value={draft}
                  maxLength={AI_VISITOR_INSTRUCTION_MAX}
                  disabled={!canFollowUp}
                  placeholder="Warmer walls, oak floors, softer daylight…"
                  onChange={(event) => setDraft(event.target.value)}
                  rows={2}
                  className="min-h-[2.75rem] min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[13px] text-[#efece6] outline-none placeholder:text-[#7d838b] focus:border-white/25 disabled:opacity-45"
                />
                <button
                  type="submit"
                  disabled={!canFollowUp || !draft.trim()}
                  className="inline-flex h-11 shrink-0 items-center rounded-xl bg-[#c45c4a] px-3 text-[12px] font-medium text-[#efece6] transition-[background-color,opacity] duration-200 hover:bg-[#d06654] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Apply
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-[#7d838b]">
                {state.unlimited
                  ? "Unlimited refinements on your key"
                  : `${state.followUpsRemaining} refinements left`}
              </p>
            </form>
          ) : null}

          <button
            type="button"
            disabled={state.busy}
            onClick={beginNewView}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#c45c4a] px-3 text-[13px] font-medium text-[#efece6] transition-[transform,opacity] duration-200 hover:bg-[#d06654] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state.busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Camera className="size-4" strokeWidth={1.75} />
            )}
            {latestImage ? "Render a new view" : "Render this view"}
          </button>
          <p className="mt-1.5 text-center text-[11px] leading-4 text-[#8b9198]">
            {state.busy
              ? "This usually takes one or two minutes."
              : latestImage
                ? "Walk to another room first, then tap to capture it."
                : "Captures whatever you are looking at in the tour."}
          </p>
        </div>
      </aside>

      {compareOpen && state.originalCaptureUrl && state.compareImageUrl ? (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="explore-chrome-panel w-full max-w-3xl rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] text-[#efece6]">Before / After</p>
              <button
                type="button"
                onClick={() => setCompareOpen(false)}
                className="text-[12px] text-[#c8c4bc]"
              >
                Close
              </button>
            </div>
            <BeforeAfterSlider
              beforeUrl={state.originalCaptureUrl}
              afterUrl={state.compareImageUrl}
            />
          </div>
        </div>
      ) : null}

      {fullscreenUrl ? (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-3"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setFullscreenUrl(null)}
        >
          <img
            src={fullscreenUrl}
            alt="Fullscreen visualization"
            className="max-h-full max-w-full rounded-lg object-contain"
            style={{ touchAction: "pinch-zoom" }}
          />
        </div>
      ) : null}
    </>
  );
}

function ChatImage({
  src,
  alt,
  caption,
  onReady,
  children,
}: {
  src: string;
  alt: string;
  caption?: string;
  onReady?: () => void;
  children?: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
  }, [src]);

  return (
    <figure className="overflow-hidden rounded-xl bg-black/30">
      <div className={ready ? undefined : "relative aspect-[4/3] w-full"}>
        {ready ? null : <div className="ai-viz-skeleton absolute inset-0" />}
        <img
          src={src}
          alt={alt}
          className={
            ready
              ? "block h-auto w-full"
              : "absolute inset-0 h-full w-full object-cover opacity-0"
          }
          style={{ touchAction: "pinch-zoom" }}
          onLoad={() => {
            setReady(true);
            onReady?.();
          }}
        />
      </div>
      {caption ? (
        <figcaption className="px-3 py-2 text-[11px] text-[#9aa0a6]">
          {caption}
        </figcaption>
      ) : null}
      {ready ? children : null}
    </figure>
  );
}

function ImageAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-white/6 px-2.5 text-[11px] text-[#c8c4bc] hover:bg-white/10 hover:text-[#f4f1ea]"
    >
      {icon}
      {label}
    </button>
  );
}
