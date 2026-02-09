// src/app/home/page.tsx
import HomeClient from "../components/home/HomeClient";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Home</h1>
        <p className="mt-1 text-white/70">
          Trending and popular shows to explore.
        </p>
      </div>

      <HomeClient />
    </div>
  );
}