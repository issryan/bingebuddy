// src/app/login/page.tsx
import AuthClient from "../components/auth/AuthClient";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="mt-1 text-white/70">
          Sign in to sync your lists across devices.
        </p>
      </div>

      <AuthClient />
    </div>
  );
}