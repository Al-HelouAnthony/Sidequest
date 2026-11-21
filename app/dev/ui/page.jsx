/**
 * DEV ONLY. Owner: Oscar. Shows every components/ui piece (PLAN.md F1).
 * Delete this folder before the Sat 1 AM feature freeze.
 */
import { UiShowcase } from "./UiShowcase";

/** @type {import("next").Metadata} */
export const metadata = {
  title: "UI kit (dev) · Sidequest",
  robots: { index: false, follow: false },
};

export default function DevUiPage() {
  return <UiShowcase />;
}
