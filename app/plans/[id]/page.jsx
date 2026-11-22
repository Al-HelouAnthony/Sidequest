/**
 * /plans/[id]: one plan, live (PLAN.md F6). Owner: Oscar. The screen lives in components/plans/PlanScreen.jsx.
 * cacheComponents is on, so the client part that reads the URL (useParams) must sit inside <Suspense>.
 */
import { PageTransition } from "@/components/nav/PageTransition";
import { Suspense } from "react";
import { PlanFromUrl, PlanLoading } from "@/components/plans/PlanScreen";

export default function PlanPage() {
  return (
    <PageTransition>
      <Suspense fallback={<PlanLoading />}>
        <PlanFromUrl />
      </Suspense>
    </PageTransition>
  );
}
