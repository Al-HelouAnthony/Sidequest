/**
 * /onboarding (PLAN.md F9). Owner: Oscar. New Google users land here from the sign-in callback:
 *   /onboarding?next=/feed&calendar=synced|failed|skipped
 * The screen lives in components/onboarding/Onboarding.jsx. It reads the query string (useSearchParams),
 * so with cacheComponents it must sit inside <Suspense>.
 */
import { Suspense } from "react";
import { Onboarding, OnboardingLoading } from "@/components/onboarding/Onboarding";

/** @type {import("next").Metadata} */
export const metadata = { title: "Welcome · Sidequest" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <Onboarding />
    </Suspense>
  );
}
