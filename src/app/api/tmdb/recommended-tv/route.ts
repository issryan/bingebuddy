import { NextResponse } from "next/server";
import { tmdbFetch } from "@/lib/tmdb";

type TmdbGenre = { id: number; name: string };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toYear(firstAirDate: unknown): string | null {
  if (typeof firstAirDate !== "string") return null;
  const y = firstAirDate.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : null;
}

function splitGenresParam(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitNumberListParam(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

function uniq(nums: number[]): number[] {
  return Array.from(new Set(nums));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const genresRaw = searchParams.get("genres") ?? "";
    const limitRaw = searchParams.get("limit") ?? "12";
    const excludeRaw = searchParams.get("exclude") ?? "";

    const limit = clamp(Number(limitRaw) || 12, 1, 40);
    const excludeIds = new Set<number>(uniq(splitNumberListParam(excludeRaw)));

    const genreTokens = splitGenresParam(genresRaw);
    if (genreTokens.length === 0) {
      return NextResponse.json(
        { error: "Missing genres. Use ?genres=Drama,Crime&limit=12 (optional: &exclude=1399,1668)" },
        { status: 400 }
      );
    }

    // If tokens are numeric, treat as genre IDs. Otherwise map from name -> id.
    const allNumeric = genreTokens.every((g) => /^\d+$/.test(g));
    let genreIds: number[] = [];

    if (allNumeric) {
      genreIds = genreTokens
        .map((g) => Number(g))
        .filter((n) => Number.isFinite(n));
    } else {
      const genreList = await tmdbFetch<{ genres: TmdbGenre[] }>(
        "/genre/tv/list",
        { language: "en-US" }
      );

      const map = new Map<string, number>();
      for (const g of genreList.genres ?? []) {
        if (g?.name && Number.isFinite(g.id)) {
          map.set(String(g.name).trim().toLowerCase(), g.id);
        }
      }

      genreIds = genreTokens
        .map((name) => map.get(name.toLowerCase()))
        .filter((id): id is number => typeof id === "number" && Number.isFinite(id));
    }

    genreIds = uniq(genreIds);

    if (genreIds.length === 0) {
      return NextResponse.json(
        { error: "No valid genres found." },
        { status: 400 }
      );
    }

    const discover = await tmdbFetch<{ results: any[] }>("/discover/tv", {
      language: "en-US",
      sort_by: "popularity.desc",
      include_adult: "false",
      include_null_first_air_dates: "false",
      with_genres: genreIds.join(","),
      page: "1",
    });

    const results = (discover.results ?? [])
      .filter((r) => r && Number.isFinite(r.id) && (r.name || r.original_name))
      .filter((r) => !excludeIds.has(Number(r.id)))
      .slice(0, limit)
      .map((r) => ({
        tmdbId: Number(r.id),
        title: String(r.name ?? r.original_name ?? ""),
        year: toYear(r.first_air_date),
        posterPath: typeof r.poster_path === "string" ? r.poster_path : null,
        overview: typeof r.overview === "string" ? r.overview : "",
      }));

    return NextResponse.json({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}