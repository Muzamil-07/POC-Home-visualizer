import Link from "next/link";

export default function TourNotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#141618] px-6 text-center text-[#efece6]">
      <p className="text-[11px] tracking-[0.22em] text-[#9aa0a6] uppercase">
        Tour not found
      </p>
      <h1 className="max-w-md text-[22px] font-medium tracking-tight">
        This walkthrough is missing or unpublished.
      </h1>
      <p className="max-w-md text-[13px] leading-6 text-[#9aa0a6]">
        The share link may be mistyped, or the tour has not been published yet.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex min-h-9 items-center rounded bg-[#c45c4a] px-3 text-[12px] text-[#efece6]"
      >
        Back to editor
      </Link>
    </div>
  );
}
