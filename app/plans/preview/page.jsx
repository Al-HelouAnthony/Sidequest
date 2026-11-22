/**
 * /plans/preview: "How a sidequest goes" (calendar, live location, memory photos) with sample data.
 * Static route, so it wins over /plans/[id]. Screen: components/plans/FeaturePreview.jsx.
 */
import { PageTransition } from "@/components/nav/PageTransition";
import { FeaturePreview } from "@/components/plans/FeaturePreview";

/** @type {import("next").Metadata} */
export const metadata = { title: "How it works · Sidequest" };

export default function PreviewPage() {
  return (
    <PageTransition>
      <FeaturePreview />
    </PageTransition>
  );
}
