export type Show = {
  // Internal unique id (used by ranking logic and localStorage)
  id: string;

  // Canonical TMDB id (used to fetch metadata and link to details page)
  tmdbId: number | null;

  // Display title (from TMDB selection)
  title: string;

  // Creation timestamp (unchanged)
  createdAt: number;

  // --- TMDB metadata (optional, can be filled lazily) ---
  posterPath?: string | null; // e.g. "/abc123.jpg"
  year?: string | null;       // e.g. "2019"
  overview?: string;          // short description
  genres?: string[];          // genre names
};

export type RankedShow = Show & {
  // Derived rating (NOT stored as truth)
  rating: number;
};