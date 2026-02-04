// src/app/onboarding/page.tsx
import OnboardingClient from "./OnboardingCLient";

export default function OnboardingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create your username</h1>
        <p className="mt-1 text-white/70">
          This is how friends will find you.
        </p>
      </div>

      <OnboardingClient />
    </div>
  );
}