"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import {
  accentButtonClass,
  fieldClassName,
  panelClassName,
} from "@/components/viewer/chrome";

export function AdminLoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error || "Couldn't sign in.");
      }
      window.location.href = "/";
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : "Couldn't sign in.",
      );
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className={`${panelClassName()} w-full max-w-sm rounded-md border border-white/10 p-5 shadow-[0_16px_48px_rgba(0,0,0,0.45)]`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded border border-white/10 bg-black/20 text-[#c8c4bc]">
          <LockKeyhole className="size-3.5" aria-hidden />
        </span>
        <div>
          <h1 className="text-[15px] font-medium tracking-wide">Editor access</h1>
          <p className="mt-1 text-[12px] leading-5 text-[#9aa0a6]">
            This workspace is private. Published tours stay public.
          </p>
        </div>
      </div>

      <label className="mt-5 flex flex-col gap-1 text-[11px] text-[#9aa0a6]">
        Username
        <input
          className={fieldClassName()}
          name="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
      </label>
      <label className="mt-3 flex flex-col gap-1 text-[11px] text-[#9aa0a6]">
        Password
        <input
          className={fieldClassName()}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>

      {error ? (
        <p className="mt-3 text-[12px] leading-5 text-[#d7a39a]">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className={`${accentButtonClass(busy)} mt-5 w-full justify-center`}
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
