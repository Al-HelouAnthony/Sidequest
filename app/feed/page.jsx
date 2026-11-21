"use client";
/**
 * PLACEHOLDER. Owner: Oscar. Proves the /api/feed contract end to end.
 * Replace with the real snap-scroll feed (components/feed/*).
 */
import { useEffect, useState } from "react";
import { FeedResponse } from "@/types";
import { formatSlot } from "@/lib/time";
import { mockUsers } from "@/lib/mocks/users";

export default function FeedPage() {
  const [cards, setCards] = useState(/** @type {import("@/types/feed").FeedCardT[] | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    fetch("/api/feed")
      .then(async (r) => (r.ok ? FeedResponse.parse(await r.json()) : Promise.reject(new Error(r.statusText))))
      .then((d) => setCards(d.cards))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto w-full max-w-md p-4">
      <h1 className="text-2xl font-bold">Sidequest (placeholder feed)</h1>
      <p className="mb-4 text-sm opacity-70">
        Log in as:{" "}
        {mockUsers.map((u) => (
          <a key={u.id} className="mr-2 underline" href={`/api/dev/login-as?id=${u.id}`}>
            {u.name}
          </a>
        ))}
      </p>
      {error && <p className="text-red-600">Error: {error}</p>}
      {!cards && !error && <p>Loading…</p>}
      <ul className="space-y-3">
        {cards?.map((c) => (
          <li key={c.id} className="rounded-lg border p-3">
            <div className="font-semibold">
              {c.place.name} · {c.place.category} · {"$".repeat(c.place.priceLevel)}
            </div>
            <div className="text-sm">{formatSlot(c.slot.start, c.slot.end)}</div>
            <div className="text-sm">With: {c.friends.map((f) => `${f.name} (${f.travelMin} min)`).join(", ")}</div>
            <div className="text-sm italic">{c.caption}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
