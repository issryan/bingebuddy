import { NextResponse } from "next/server";
import { tmdbFetch } from "@/lib/tmdb";

type TvCard = {
  tmdbId: number;
  title: string;
  year: string | null;
  posterPath: string | null;
  overview: string;
};

function mapResult(r: any): TvCard | null {
  const id = typeof r?.id === "number" ? r.id : Number(r?.id);
  if (!Number.isFinite(id)) return null;

  const title = typeof r?.name === "string" ? r.name : "";
  const firstAir = typeof r?.first_air_date === "string" ? r.first_air_date : null;
  const year = firstAir && firstAir.length >= 4 ? firstAir.slice(0, 4) : null;

  return {
    tmdbId: id,
    title,
    year,
    posterPath: typeof r?.poster_path === "string" ? r.poster_path : null,
    overview: typeof r?.overview === "string" ? r.overview : "",
  };
}

// Cache this route for 1 hour to reduce TMDB usage
export const revalidate = 60 * 60;

export async function GET() {
  try {
    const data = await tmdbFetch("/tv/popular");

    const results: TvCard[] = Array.isArray(data?.results)
      ? data.results.map(mapResult).filter(Boolean).slice(0, 20)
      : [];

    return NextResponse.json({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ results: [], error: msg }, { status: 500 });
  }
}