// src/app/api/tmdb/details/route.ts
import { NextResponse } from "next/server";
import { tmdbFetch } from "@/lib/tmdb";

type TmdbTvDetails = {
  id: number;
  name: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  genres?: Array<{ id: number; name: string }>;
  number_of_seasons?: number;
  number_of_episodes?: number;
};

type TmdbTvCredits = {
  cast?: Array<{ name: string }>;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const idRaw = searchParams.get("id");
  const id = Number(idRaw);

  if (!idRaw || Number.isNaN(id)) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }

  const data = await tmdbFetch<TmdbTvDetails>(`/tv/${id}`);
  const credits = await tmdbFetch<TmdbTvCredits>(`/tv/${id}/credits`);

  const payload = {
    tmdbId: data.id,
    title: data.name,
    year: (data.first_air_date ?? "").slice(0, 4) || null,
    posterPath: data.poster_path ?? null,
    overview: data.overview ?? "",
    genres: (data.genres ?? []).map((g) => g.name),

    seasons: typeof data.number_of_seasons === "number" ? data.number_of_seasons : null,
    episodes: typeof data.number_of_episodes === "number" ? data.number_of_episodes : null,
    cast: (credits.cast ?? []).slice(0, 10).map((c) => c.name),
  };

  return NextResponse.json(payload);
}