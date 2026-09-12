"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, LoaderCircle, Share2 } from "lucide-react";
import type { ModelSource, ModelStats } from "./glb";
import {
  selectCurrentViewpoints,
  selectStartViewpointId,
  useTourStore,
} from "@/store/tour-store";
import { usePublishStore } from "@/store/publish-store";
import {
  accentButtonClass,
  fieldClassName,
  panelClassName,
  toolbarToggleClass,
} from "./chrome";
import {
  BLOB_MODEL_MESSAGE,
  buildPublishedTourData,
  hashPublishedSnapshot,
  isPublishableModelUrl,
} from "@/lib/build-published-tour";
import { isSupabaseBrowserConfigured } from "@/lib/public-config";
import type { GroundSettings } from "@/lib/ground";

type PublishTourModalProps = {
  open: boolean;
  onClose: () => void;
  source: ModelSource | null;
  stats: ModelStats | null;
  ground: GroundSettings | null;
};

const TITLE_DEFAULT = "Architectural Walkthrough";

export function PublishTourModal({
  open,
  onClose,
  source,
  stats,
  ground,
}: PublishTourModalProps) {
  if (!open) return null;
  return (
    <PublishTourForm
      onClose={onClose}
      source={source}
      stats={stats}
      ground={ground}
    />
  );
}

function supabaseConfigured() {
  return isSupabaseBrowserConfigured();
}

function PublishTourForm({
  onClose,
  source,
  stats,
  ground,
}: {
  onClose: () => void;
  source: ModelSource | null;
  stats: ModelStats | null;
  ground: GroundSettings | null;
}) {
  const titleId = useId();
  const viewpoints = useTourStore(selectCurrentViewpoints);
  const startViewpointId = useTourStore(selectStartViewpointId);
  const modelId = useTourStore((state) => state.modelId);
  const record = usePublishStore((state) =>
    modelId ? state.recordsByModel[modelId] ?? null : null,
  );

  const [title, setTitle] = useState(record?.title || TITLE_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState(record?.shareUrl ?? "");
  const [modelReachable, setModelReachable] = useState<boolean | null>(null);
  const [aiVisualizationEnabled, setAiVisualizationEnabled] = useState(
    record?.aiVisualizationEnabled !== false,
  );

  const modelUrl = source?.url ?? "";
  const localOnly = Boolean(modelUrl && !isPublishableModelUrl(modelUrl));
  const configured = supabaseConfigured();
  const hasStartView = Boolean(startViewpointId);
  const published = Boolean(record);
  const snapshotReady = Boolean(source && stats && hasStartView && !localOnly);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  useEffect(() => {
    if (!source || localOnly) return;
    const controller = new AbortController();
    void fetch(source.url, { method: "HEAD", signal: controller.signal })
      .then((response) => {
        setModelReachable(response.ok || response.status === 405);
      })
      .catch(() => {
        if (!controller.signal.aborted) setModelReachable(false);
      });
    return () => controller.abort();
  }, [localOnly, source]);

  const warnings = useMemo(() => {
    const next: string[] = [];
    if (!configured) {
      next.push(
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and keys, then restart.",
      );
    }
    if (!hasStartView) next.push("Set a Start View before publishing.");
    if (localOnly) next.push(BLOB_MODEL_MESSAGE);
    return next;
  }, [configured, hasStartView, localOnly]);
  const blocking = warnings.length > 0 || !snapshotReady;

  async function publish(asNew: boolean) {
    if (!source || !stats || !modelId || !startViewpointId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const tourData = buildPublishedTourData({
        source,
        stats,
        viewpoints,
        startViewpointId: startViewpointId!,
        ground,
        aiVisualization: { enabled: aiVisualizationEnabled },
      });
      const payload = {
        title: title.trim() || TITLE_DEFAULT,
        isPublished: true,
        tourData,
      };
      const updating = Boolean(record && !asNew);
      const response = await fetch(
        updating ? `/api/tours/${record!.tourId}` : "/api/tours",
        {
          method: updating ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...(updating ? { "x-tour-edit-token": record!.editToken } : {}),
          },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        id?: string;
        slug?: string;
        editToken?: string;
        shareUrl?: string;
      };
      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
          throw new Error(
            "This browser cannot update that published tour. Use Publish as new Tour.",
          );
        }
        throw new Error(body.error || "Couldn't publish this tour.");
      }
      const nextShare = body.shareUrl || shareUrl;
      const snapshot = await hashPublishedSnapshot(tourData);
      usePublishStore.getState().saveRecord(modelId, {
        tourId: body.id || record?.tourId || "",
        slug: body.slug || record?.slug || "",
        editToken: body.editToken || record?.editToken || "",
        shareUrl: nextShare,
        lastPublishedAt: new Date().toISOString(),
        lastPublishedSnapshotHash: snapshot,
        title: payload.title,
        autoplayEnabled: false,
        dwellTime: 2.5,
        startViewpointId: tourData.startView.id,
        aiVisualizationEnabled,
      });
      setShareUrl(nextShare);
      setSuccess("Tour published successfully");
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Couldn't publish this tour.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function shareLink() {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch {
        // Fall through to copy.
      }
    }
    await copyLink();
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-3">
      <div
        role="dialog"
        aria-labelledby={titleId}
        className={`${panelClassName()} max-h-[min(40rem,92dvh)] w-full max-w-lg overflow-y-auto rounded-md border border-white/10 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.45)]`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id={titleId} className="text-[14px] font-medium">
              {published ? "Save & Update" : "Publish Tour"}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-[#9aa0a6]">
              Publish a read-only share link. The GLB stays at its public URL.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={toolbarToggleClass(false)}
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[11px] text-[#9aa0a6]">
            Tour title
            <input
              className={fieldClassName()}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <p className="rounded border border-white/8 bg-black/20 px-2 py-1.5 text-[12px] leading-5 text-[#c8c4bc]">
            Start View: {viewpoints.find((item) => item.id === startViewpointId)?.name ?? "—"}
          </p>

          <label className="flex items-start gap-2 rounded border border-white/8 bg-black/20 px-2 py-2 text-[12px] leading-5 text-[#c8c4bc]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={aiVisualizationEnabled}
              onChange={(event) => setAiVisualizationEnabled(event.target.checked)}
            />
            <span>
              Allow AI Visualization on the public tour. Visitors can capture a
              viewpoint and generate a photorealistic concept image.
            </span>
          </label>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-[#9aa0a6]">
            <dt>Start View</dt>
            <dd className="text-right font-mono text-[#efece6]">
              {hasStartView ? "Ready" : "Missing"}
            </dd>
            <dt>Model URL</dt>
            <dd className="truncate text-right text-[#efece6]">{modelUrl || "—"}</dd>
          </dl>

          {warnings.map((warning) => (
            <p
              key={warning}
              className="rounded border border-[#c45c4a]/30 bg-[#2a1616]/70 px-2 py-1.5 text-[12px] leading-5 text-[#f3d6d6]"
            >
              {warning}
            </p>
          ))}
          {modelReachable === false ? (
            <p className="rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[12px] leading-5 text-[#c8c4bc]">
              The model URL did not respond to a HEAD request. Publishing can
              still continue if the public URL is valid.
            </p>
          ) : null}

          {error ? (
            <p className="text-[12px] leading-5 text-[#f3d6d6]">{error}</p>
          ) : null}
          {success ? (
            <p className="text-[12px] leading-5 text-[#b7d7b0]">{success}</p>
          ) : null}

          {shareUrl ? (
            <div className="rounded border border-white/10 bg-black/20 p-2">
              <p className="truncate font-mono text-[11px] text-[#c8c4bc]">
                {shareUrl}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className={toolbarToggleClass(false)}
                >
                  {copied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  Copy Link
                </button>
                <button
                  type="button"
                  onClick={() => void shareLink()}
                  className={toolbarToggleClass(false)}
                >
                  <Share2 className="size-3.5" />
                  Share
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={toolbarToggleClass(false)}
                >
                  <ExternalLink className="size-3.5" />
                  Open Public Tour
                </a>
              </div>
              {record?.lastPublishedAt ? (
                <p className="mt-2 text-[11px] text-[#9aa0a6]">
                  Last published {new Date(record.lastPublishedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {published ? (
              <button
                type="button"
                disabled={busy || !snapshotReady}
                onClick={() => void publish(true)}
                className={`${toolbarToggleClass(false)} disabled:opacity-35`}
              >
                Publish as new Tour
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy || blocking}
              onClick={() => void publish(false)}
              className={accentButtonClass(busy || blocking)}
            >
              {busy ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : null}
              {busy
                ? "Publishing…"
                : published
                  ? "Save & Update"
                  : "Publish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
