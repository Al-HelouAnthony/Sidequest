/**
 * /plans: My Plans (PLAN.md F8). Owner: Oscar. The screen lives in components/plans/MyPlans.jsx.
 */
import { PageTransition } from "@/components/nav/PageTransition";
import { MyPlans } from "@/components/plans/MyPlans";

/** @type {import("next").Metadata} */
export const metadata = { title: "My plans · Sidequest" };

export default function MyPlansPage() {
  return (
    <PageTransition>
      <MyPlans />
    </PageTransition>
  );
}
