// app/my-list/page.tsx
import MyListClient from "../components/my-list/MyListClient";

export default function MyListPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My List</h1>
        <p className="mt-1 text-white/70">
          Your ranked shows, from best to worst.
        </p>
      </div>

      <MyListClient />
    </div>
  );
}