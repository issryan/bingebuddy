// src/lib/tmdb.ts
const TMDB_BASE = "https://api.themoviedb.org/3";

function requireApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    throw new Error("Missing TMDB_API_KEY in .env.local");
  }
  return key;
}

/**
 * Server-side TMDB fetch helper.
 * - Keeps the API key off the client
 * - Adds language default
 * - Throws on non-OK responses for easier debugging
 */
export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  const key = requireApiKey();

  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", key);

  // default params
  url.searchParams.set("language", "en-US");

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TMDB error ${res.status}: ${text || res.statusText}`);
  }

  return (await res.json()) as T;
}