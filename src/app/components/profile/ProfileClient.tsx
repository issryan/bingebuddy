// src/components/profile/ProfileClient.tsx
"use client";

import { useEffect, useState } from "react";
import { getRankedShows, getState } from "@/core/logic/state";

export default function ProfileClient() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const ranked = getRankedShows(getState());
    setCount(ranked.length);
  }, []);

  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
      <div className="text-white/70 text-sm">Logged shows</div>
      <div className="mt-1 text-3xl font-semibold">{count}</div>
    </div>
  );
}