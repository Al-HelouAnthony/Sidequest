"use client";
/**
 * Profile pickers shared by onboarding (F9) and the You screen (/me). Owner: Oscar.
 *  - NeighbourhoodPicker: one of NEIGHBOURHOODS (only the id goes to the server)
 *  - InterestPicker: tag chips from PLAN.md §6.3
 *  - PeopleList: GET /api/users (people to add) → POST /api/friends; falls back to GET /api/friends
 */
import { useEffect, useState } from "react";
import { FriendsResponse, UsersResponse } from "@/types/api";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn, focusRing } from "@/components/ui/classes";
import { INTERESTS, NEIGHBOURHOODS } from "./options";

/** @param {{ value: string | null, onChange: (id: string) => void }} props */
export function NeighbourhoodPicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Neighbourhood" className="grid grid-cols-2 gap-2">
      {NEIGHBOURHOODS.map((n) => {
        const on = value === n.id;
        return (
          <button
            key={n.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(n.id)}
            className={cn(
              "press flex min-h-12 items-center gap-2 rounded-tile px-3 text-left text-sm font-semibold",
              on ? "bg-teal text-on-teal" : "bg-surface text-ink",
              focusRing,
            )}
          >
            {on ? (
              <span key="on" className="motion-safe:animate-pop">
                <Icon name="check" strokeWidth={3} className="size-4" />
              </span>
            ) : (
              <Icon name="pin" cel strokeWidth={1.9} className="size-4" />
            )}
            <span className="min-w-0 leading-tight">{n.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** @param {{ selected: Set<string>, onToggle: (id: string) => void }} props */
export function InterestPicker({ selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {INTERESTS.map((t) => (
        <Chip key={t.id} selected={selected.has(t.id)} onClick={() => onToggle(t.id)}>
          {t.label}
        </Chip>
      ))}
    </div>
  );
}

/** @typedef {{ id: string, name: string, avatarUrl: string, isFriend: boolean }} Person */

/**
 * GET /api/users → UsersResponse { users: [{ id, name, avatarUrl, isFriend }] } (Mhammad, everyone except me).
 * @param {unknown} json
 * @returns {Person[] | null} null when the shape doesn't match (logged), so the friends fallback kicks in.
 */
function parseUsers(json) {
  const parsed = UsersResponse.safeParse(json);
  if (!parsed.success) {
    console.error("[people] GET /api/users does not match UsersResponse", parsed.error.issues);
    return null;
  }
  return parsed.data.users;
}

/** People to add as friends, with an Add button. Shows existing friends only until GET /api/users is live. */
export function PeopleList() {
  const [people, setPeople] = useState(/** @type {Person[] | null} */ (null));
  /** true when GET /api/users isn't live yet and we only show existing friends. */
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/users", { signal: ctrl.signal, cache: "no-store" });
        const users = res.ok ? parseUsers(await res.json()) : null;
        if (users) {
          setPeople(users);
          return;
        }
        // Fallback until GET /api/users lands: show who you're already friends with.
        const fr = await fetch("/api/friends", { signal: ctrl.signal, cache: "no-store" });
        const { friends } = FriendsResponse.parse(await fr.json());
        setPeople(friends.map((f) => ({ id: f.id, name: f.name, avatarUrl: f.avatarUrl, isFriend: true })));
        setFriendsOnly(true);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        console.error("[people]", e);
        setPeople([]);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const add = async (/** @type {Person} */ p) => {
    setBusy(p.id);
    setError(null);
    setPeople((list) => list?.map((x) => (x.id === p.id ? { ...x, isFriend: true } : x)) ?? null);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ friendId: p.id, closeness: 2 }),
      });
      if (!res.ok) throw new Error(`POST /api/friends ${res.status}`);
    } catch (e) {
      console.error("[people] add friend", e);
      setPeople((list) => list?.map((x) => (x.id === p.id ? { ...x, isFriend: false } : x)) ?? null);
      setError(`Couldn't add ${p.name}. Try again.`);
    } finally {
      setBusy(null);
    }
  };

  if (people === null) {
    return (
      <div className="space-y-2">
        <span className="sr-only">Loading people…</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-tile" />
        ))}
      </div>
    );
  }
  if (people.length === 0) {
    return <p className="cel rounded-tile p-4 text-center text-ink-muted">Nobody here yet. You can add friends later.</p>;
  }

  const friendCount = people.filter((p) => p.isFriend).length;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {people.map((p) => (
          <li key={p.id} className="cel flex min-h-16 items-center gap-3 rounded-tile px-3 py-2">
            <Avatar src={p.avatarUrl} name={p.name} size="md" decorative />
            <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
            {p.isFriend ? (
              <span className="inline-flex h-9 items-center gap-1 rounded-full border-[1.5px] border-line bg-teal px-3 text-sm font-bold text-on-teal">
                <Icon name="check" strokeWidth={3} className="size-4" />
                Friends
              </span>
            ) : (
              <button
                type="button"
                onClick={() => add(p)}
                disabled={busy !== null}
                aria-label={`Add ${p.name}`}
                className={cn(
                  "press inline-flex min-h-11 items-center gap-1 rounded-full bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-55",
                  focusRing,
                )}
              >
                <Icon name="plus" strokeWidth={2.5} className="size-4" />
                Add
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <p className="text-sm font-semibold text-ink-muted" aria-live="polite">
        {friendCount} {friendCount === 1 ? "friend" : "friends"}
        {friendsOnly && " · adding new people opens soon"}
      </p>
    </div>
  );
}
