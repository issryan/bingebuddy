// app/log/page.tsx
import LogExperience from "../components/log/LogExperience";

export default function LogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Log a show</h1>
        <p className="mt-1 text-white/70">
          Add a show, then answer quick comparisons to place it in your ranking.
        </p>
      </div>

      <LogExperience />
    </div>
  );
}