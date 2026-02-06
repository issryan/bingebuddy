// src/app/feed/page.tsx
import FeedClient from "../components/feed/FeedClient";

export default function FeedPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Feed</h1>
        <p className="mt-1 text-white/70">Friends-only activity.</p>
      </div>
      <FeedClient />
    </div>
  );
}