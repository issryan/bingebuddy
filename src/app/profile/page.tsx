// src/app/profile/page.tsx
import AuthClient from "../components/auth/AuthClient";
import ProfileClient from "../components/profile/ProfileClient";

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-1 text-white/70">Your stats and account.</p>
      </div>

      {/* Account (sign out lives here) */}
      <AuthClient />

      {/* Stats */}
      <ProfileClient />
    </div>
  );
}