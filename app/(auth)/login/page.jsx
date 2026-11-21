/**
 * /login: "Continue with Google" (+ demo friends in DEMO_MODE). Owner: Anthony (Part 13).
 * Server shell; the interactive card is a Client Component inside <Suspense>
 * (it reads ?error=, which is request data under cacheComponents).
 */
import { Suspense } from "react";
import { mockUsers, DEMO_USER_ID } from "@/lib/mocks/users";
import { LoginCard } from "./LoginCard";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  const demoMode = process.env.DEMO_MODE !== "false";
  const demoFriends = demoMode ? mockUsers.filter((u) => u.id !== DEMO_USER_ID).map(({ id, name }) => ({ id, name })) : [];
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Suspense fallback={null}>
        <LoginCard demoFriends={demoFriends} />
      </Suspense>
    </main>
  );
}
