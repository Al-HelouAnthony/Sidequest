/**
 * /memories: every photo from your sidequests, grouped by outing (Snapchat-Memories style).
 * Screen: components/memories/MemoriesScreen.jsx. API: GET /api/memories.
 */
import { PageTransition } from "@/components/nav/PageTransition";
import { MemoriesScreen } from "@/components/memories/MemoriesScreen";

/** @type {import("next").Metadata} */
export const metadata = { title: "Memories · Sidequest" };

export default function MemoriesPage() {
  return (
    <PageTransition>
      <MemoriesScreen />
    </PageTransition>
  );
}
