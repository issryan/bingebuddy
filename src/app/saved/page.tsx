"use client";


import { useRouter, useSearchParams } from "next/navigation";

function ratingBadgeClass(rating: number): string {
  if (rating >= 7) return "border-green-600/40 text-green-700";
  if (rating >= 4) return "border-yellow-600/40 text-yellow-700";
  return "border-red-600/40 text-red-700";
}

function formatRating(rating: string | null): string | null {
  if (!rating) return null;
  const n = Number(rating);
  if (Number.isNaN(n)) return null;
  return n.toFixed(1);
}

export default function SavedPage() {
  const router = useRouter();
  const params = useSearchParams();

  const title = params.get("title") ?? "Your show";
  const rank = params.get("rank");
  const ratingRaw = params.get("rating");
  const rating = formatRating(ratingRaw);
  const ratingNumber = rating ? Number(rating) : null;

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-2xl space-y-6">
        {/* Top bar with X */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/my-list")}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>

          <div className="text-sm text-white/60">Saved</div>

          <div className="w-[42px]" />
        </div>

        {/* Result card (Beli-ish) */}
        <div className="rounded-3xl border border-white/15 bg-white px-6 py-6 text-black">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs text-black/50">BingeBuddy</div>
              <div className="mt-2 text-2xl font-semibold truncate">{title}</div>

              <div className="mt-2 text-sm text-black/60">
                {rank ? (
                  <>
                    Ranked <span className="font-medium">#{rank}</span>
                    {rating ? (
                      <>
                        {" "}
                        • Rating <span className="font-medium">{rating}</span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>Added to your list</>
                )}
              </div>
            </div>

            {/* Rating circle */}
            {rating && ratingNumber !== null ? (
              <div
                className={
                  "shrink-0 inline-flex items-center justify-center w-14 h-14 rounded-full border bg-black/5 text-lg font-semibold " +
                  ratingBadgeClass(ratingNumber)
                }
                aria-label={`Rating ${rating}`}
                title={`Rating ${rating}`}
              >
                {rating}
              </div>
            ) : null}
          </div>
        </div>

        {/* “Share” area (placeholder only) */}
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-sm font-medium">Share with friends</div>
          <div className="mt-3 text-sm text-white/60">
            Sharing options coming soon.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/70">
              Copy Link
            </button>
            <button className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/70">
              IG Story
            </button>
            <button className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/70">
              IG Post
            </button>
            <button className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/70">
              TikTok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}