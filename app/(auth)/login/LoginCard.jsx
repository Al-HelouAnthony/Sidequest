"use client";
/**
 * Sign-in card. Owner: Anthony (Part 13). Uses Oscar's Button + design tokens.
 * Asks for Calendar read access up front, so Part 14 (calendar sync) needs no second consent.
 */
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

// readonly: read busy times at sign-in. calendar.events (G2): add a plan to your calendar on "I'm in".
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";

/** @param {{ demoFriends: { id: string, name: string }[] }} props */
export function LoginCard({ demoFriends }) {
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(params.get("error"));

  async function signIn() {
    setLoading(true);
    setError(null);
    try {
      const next = params.get("next") ?? "/feed";
      const { error: e } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          scopes: CALENDAR_SCOPE,
          // Always return a fresh Google token with the calendar scope (Part 14).
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (e) throw e;
      // On success the browser is already navigating to Google.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start Google sign-in.");
      setLoading(false);
    }
  }

  return (
    <div className="cel rounded-card bg-surface p-6 text-ink">
      <h1 className="font-display text-3xl font-bold">Sidequest</h1>
      <p className="mt-2 text-ink-muted">What you could do together this week.</p>

      {error && (
        <p role="alert" className="mt-4 rounded-tile bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Button className="mt-6" fullWidth size="lg" loading={loading} onClick={signIn}>
        Continue with Google
      </Button>
      <p className="mt-2 text-center text-xs text-ink-muted">We only read when you&apos;re busy, never your event details.</p>

      {demoFriends.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-sm text-ink-muted">Demo: continue as a friend</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {demoFriends.map((f) => (
              <a key={f.id} href={`/api/dev/login-as?id=${f.id}`} className="rounded-button bg-raised px-3 py-1.5 text-sm font-medium hover:bg-shade">
                {f.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
