// src/app/api/tmdb/search/route.ts
import { NextResponse } from "next/server";
import { tmdbFetch } from "@/lib/tmdb";

type TmdbSearchResponse = {
  page: number;
  results: Array<{
    id: number;
    name?: string; // TV
    title?: string; // Movie
    first_air_date?: string;
    release_date?: string;
    poster_path?: string | null;
    overview?: string;
  }>;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") ?? "").trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  // We’ll start with TV shows only to match your “shows” concept.
  // If you want movies later, we can expand safely.
  const data = await tmdbFetch<TmdbSearchResponse>("/search/tv", {
    query,
    include_adult: "false",
    page: 1,
  });

  // Normalize just what we need
  const results = data.results.map((r) => ({
    tmdbId: r.id,
    title: r.name ?? "Untitled",
    year: (r.first_air_date ?? "").slice(0, 4) || null,
    posterPath: r.poster_path ?? null,
    overview: r.overview ?? "",
  }));

  return NextResponse.json({ results });
}