// src/components/my-list/MyListClient.tsx
"use client";

import { useEffect, useState } from "react";
import { getRankedShows, getState } from "@/core/logic/state";

export default function MyListClient() {
  const [ranked, setRanked] = useState(() => getRankedShows(getState()));

  useEffect(() => {
    // Keep it simple: refresh once on page load
    setRanked(getRankedShows(getState()));
  }, []);

  if (ranked.length === 0) {
    return (
      <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
        <p className="text-white/70">No shows yet.</p>
        <p className="mt-1 text-white/60">Go to Log to add your first one.</p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
      <ol className="space-y-2">
        {ranked.map((s, i) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-white/60 shrink-0">#{i + 1}</span>
              <span className="font-medium truncate">{s.title}</span>
            </div>

            <div className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white/80">
              Rating: {s.rating}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}