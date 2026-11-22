/**
 * /me: the "You" tab (profile: neighbourhood, interests, friends). Owner: Oscar.
 * The screen lives in components/profile/YouScreen.jsx.
 */
import { PageTransition } from "@/components/nav/PageTransition";
import { YouScreen } from "@/components/profile/YouScreen";

/** @type {import("next").Metadata} */
export const metadata = { title: "You · Sidequest" };

export default function YouPage() {
  return (
    <PageTransition>
      <YouScreen />
    </PageTransition>
  );
}
