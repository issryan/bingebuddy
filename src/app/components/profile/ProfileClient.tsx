"use client";

import { useEffect, useMemo, useState } from "react";
import { getRankedShows, getState } from "@/core/logic/state";

type WantToWatchItem = { id: string; title: string };

const WANT_TO_WATCH_KEY = "bingebuddy.wantToWatch";

function safeGetWantToWatch(): WantToWatchItem[] {
  try {
    const raw = localStorage.getItem(WANT_TO_WATCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((x) => x && typeof x.id === "string" && typeof x.title === "string")
      .map((x) => ({ id: x.id, title: x.title }));
  } catch {
    return [];
  }
}

function formatShortDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function ProfileClient() {
  const [rankedCount, setRankedCount] = useState(0);
  const [wantToWatchCount, setWantToWatchCount] = useState(0);
  const [avgRating, setAvgRating] = useState<number | null>(null);

  const [topShow, setTopShow] = useState<{ title: string; rating: number } | null>(null);
  const [bottomShow, setBottomShow] = useState<{ title: string; rating: number } | null>(null);
  const [newestShow, setNewestShow] = useState<{ title: string; dateLabel: string } | null>(null);
  const [daysSinceFirst, setDaysSinceFirst] = useState<number | null>(null);

  useEffect(() => {
    const ranked = getRankedShows(getState());
    setRankedCount(ranked.length);

    const wtw = safeGetWantToWatch();
    setWantToWatchCount(wtw.length);

    if (ranked.length === 0) {
      setAvgRating(null);
      setTopShow(null);
      setBottomShow(null);
      setNewestShow(null);
      setDaysSinceFirst(null);
      return;
    }

    const sum = ranked.reduce((acc, s) => acc + s.rating, 0);
    const avg = sum / ranked.length;
    setAvgRating(Math.round(avg * 10) / 10);

    // Top + bottom (based on ranked order)
    setTopShow({ title: ranked[0].title, rating: ranked[0].rating });
    const last = ranked[ranked.length - 1];
    setBottomShow({ title: last.title, rating: last.rating });

    // Newest ranked (based on createdAt)
    const newest = ranked.reduce((best, cur) => (cur.createdAt > best.createdAt ? cur : best), ranked[0]);
    setNewestShow({ title: newest.title, dateLabel: formatShortDate(newest.createdAt) });

    // Days since first log
    const earliest = ranked.reduce((best, cur) => (cur.createdAt < best.createdAt ? cur : best), ranked[0]);
    const days = Math.floor((Date.now() - earliest.createdAt) / (1000 * 60 * 60 * 24));
    setDaysSinceFirst(Math.max(0, days));
  }, []);

  const avgText = useMemo(() => {
    if (avgRating === null) return "—";
    return avgRating.toFixed(1);
  }, [avgRating]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Ranked shows</div>
          <div className="mt-1 text-3xl font-semibold">{rankedCount}</div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Want to watch</div>
          <div className="mt-1 text-3xl font-semibold">{wantToWatchCount}</div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Average rating</div>
          <div className="mt-1 text-3xl font-semibold">{avgText}</div>
          <div className="mt-2 text-xs text-white/50">Derived from your ranked order</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Top show</div>
          <div className="mt-1 text-lg font-semibold truncate">
            {topShow ? topShow.title : "—"}
          </div>
          <div className="mt-1 text-sm text-white/60">
            {topShow ? `Rating ${topShow.rating}` : ""}
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Lowest show</div>
          <div className="mt-1 text-lg font-semibold truncate">
            {bottomShow ? bottomShow.title : "—"}
          </div>
          <div className="mt-1 text-sm text-white/60">
            {bottomShow ? `Rating ${bottomShow.rating}` : ""}
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Newest ranked</div>
          <div className="mt-1 text-lg font-semibold truncate">
            {newestShow ? newestShow.title : "—"}
          </div>
          <div className="mt-1 text-sm text-white/60">
            {newestShow ? newestShow.dateLabel : ""}
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Days since first log</div>
          <div className="mt-1 text-3xl font-semibold">
            {daysSinceFirst === null ? "—" : daysSinceFirst}
          </div>
        </div>
      </div>
    </div>
  );
}