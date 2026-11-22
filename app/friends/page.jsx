/**
 * /friends: the Friends tab. Owner: Oscar. The screen lives in components/friends/FriendsScreen.jsx.
 */
import { PageTransition } from "@/components/nav/PageTransition";
import { FriendsScreen } from "@/components/friends/FriendsScreen";

/** @type {import("next").Metadata} */
export const metadata = { title: "Friends · Sidequest" };

export default function FriendsPage() {
  return (
    <PageTransition>
      <FriendsScreen />
    </PageTransition>
  );
}
