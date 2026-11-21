"use client";
/**
 * Profile pickers shared by onboarding (F9) and the You screen (/me). Owner: Oscar.
 *  - PostalCodeField (N5): home postal code, the main way to set your home (server keeps only "H2T");
 *    NeighbourhoodPicker stays as the fallback
 *  - NeighbourhoodPicker: one of NEIGHBOURHOODS (only the id goes to the server)
 *  - InterestPicker: tag chips from PLAN.md §6.3
 *  - PeopleList: GET /api/users (people to add) → POST /api/friends; falls back to GET /api/friends.
 *    With `canRemove` (You tab): ✕ on a friend → ConfirmSheet → DELETE /api/friends/[id] (proposed endpoint;
 *    404/405 = not live yet → says so, nothing changes) → row back to "Add" with an inline Undo for a few seconds.
 */
import { useEffect, useRef, useState } from "react";
import { FriendsResponse, UsersResponse } from "@/types/api";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn, focusRing, pressable } from "@/components/ui/classes";
import { INTERESTS, NEIGHBOURHOODS } from "./options";

/** Canadian postal code, full ("H2T 1S6") or just the area ("H2T"). The server keeps only the first 3 characters. */
const POSTAL_RE = /^[A-Z]\d[A-Z](?: ?\d[A-Z]\d)?$/;

/** "h2t1s6" → "H2T 1S6" while typing (uppercase, one space after the area). */
export function formatPostalCode(/** @type {string} */ raw) {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return s.length > 3 ? `${s.slice(0, 3)} ${s.slice(3)}` : s;
}

/** True for "H2T" or "H2T 1S6". */
export const isPostalCode = (/** @type {string} */ v) => POSTAL_RE.test(v.trim());

/**
 * Turn a failed PATCH /api/me into a message for the postal field. 400 = bad / outside the area (server message),
 * 503 = lookup down. Returns null for other statuses (handled as a generic save error).
 * @param {Response} res
 */
export async function postalErrorFrom(res) {
  if (res.status === 503) return "We can't look up postal codes right now. Try again, or pick your area below.";
  if (res.status !== 400) return null;
  const json = await res.json().catch(() => ({}));
  return typeof json.error === "string" && json.error
    ? json.error
    : "We couldn't use that postal code. Check it, or pick your area below.";
}

/**
 * @param {{ value: string, onChange: (v: string) => void, error?: string | null, id?: string }} props
 */
export function PostalCodeField({ value, onChange, error, id = "postal-code" }) {
  const invalid = value.trim() !== "" && !isPostalCode(value);
  const hint = error ?? (invalid ? "Format: H2T 1S6 (or just H2T)" : null);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="halo block text-sm font-bold">
        Postal code
      </label>
      <span
        className={cn(
          "flex min-h-14 items-center gap-2 rounded-tile border-[1.5px] bg-surface pr-3 pl-3 shadow-cel",
          "transition-[transform,box-shadow,border-color] duration-200 ease-out",
          "focus-within:border-accent focus-within:shadow-[0_5px_0_var(--color-accent)] motion-safe:focus-within:-translate-y-0.5",
          error ? "border-danger" : "border-line",
        )}
      >
        <Icon name="pin" cel strokeWidth={1.9} className="size-5 shrink-0" />
        <input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="postal-code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={7}
          value={value}
          onChange={(e) => onChange(formatPostalCode(e.target.value))}
          placeholder="H2T 1S6"
          aria-invalid={Boolean(error) || invalid || undefined}
          aria-describedby={`${id}-help`}
          className="min-w-0 flex-1 bg-transparent py-3 text-lg font-bold tracking-wider uppercase outline-none placeholder:font-semibold placeholder:tracking-normal placeholder:text-ink-muted"
        />
        {isPostalCode(value) && !error && (
          <span
            key="ok"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-teal text-on-teal motion-safe:animate-pop"
          >
            <Icon name="check" strokeWidth={3} className="size-4" />
          </span>
        )}
      </span>
      <p
        id={`${id}-help`}
        role={error ? "alert" : undefined}
        className={cn("halo text-sm", error ? "font-semibold text-danger" : "text-ink-muted")}
      >
        {hint ?? "Only the first 3 characters are kept, so your exact address is never stored."}
      </p>
    </div>
  );
}

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

/** How long the inline "Undo" stays after removing a friend. */
const UNDO_MS = 6000;

/**
 * People to add as friends, with an Add button. Shows existing friends only until GET /api/users is live.
 * @param {{ canRemove?: boolean }} props `canRemove`: friends get a ✕ to remove them (You tab only).
 */
export function PeopleList({ canRemove = false }) {
  const [people, setPeople] = useState(/** @type {Person[] | null} */ (null));
  /** true when GET /api/users isn't live yet and we only show existing friends. */
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  /** Friend the "Remove?" sheet is open for. */
  const [confirmFor, setConfirmFor] = useState(/** @type {Person | null} */ (null));
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(/** @type {string | null} */ (null));
  /** Just-removed friend: their row shows "Undo" for UNDO_MS. */
  const [undoFor, setUndoFor] = useState(/** @type {string | null} */ (null));
  const undoTimer = useRef(/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined));
  useEffect(() => () => clearTimeout(undoTimer.current), []);

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

  const remove = async () => {
    const p = confirmFor;
    if (!p || removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const res = await fetch(`/api/friends/${encodeURIComponent(p.id)}`, { method: "DELETE" });
      if (res.status === 404 || res.status === 405) {
        setRemoveError("Removing friends isn't available yet.");
        return;
      }
      if (!res.ok) throw new Error(`DELETE /api/friends/${p.id} ${res.status}`);
      setPeople((list) => list?.map((x) => (x.id === p.id ? { ...x, isFriend: false } : x)) ?? null);
      setConfirmFor(null);
      clearTimeout(undoTimer.current);
      setUndoFor(p.id);
      undoTimer.current = setTimeout(() => setUndoFor(null), UNDO_MS);
    } catch (e) {
      console.error("[people] remove friend", e);
      setRemoveError(`Couldn't remove ${p.name}. Try again.`);
    } finally {
      setRemoving(false);
    }
  };

  const undo = (/** @type {Person} */ p) => {
    clearTimeout(undoTimer.current);
    setUndoFor(null);
    add(p);
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
              <>
                <span className="inline-flex h-9 items-center gap-1 rounded-full border-[1.5px] border-line bg-teal px-3 text-sm font-bold text-on-teal">
                  <Icon name="check" strokeWidth={3} className="size-4" />
                  Friends
                </span>
                {canRemove && (
                  <IconButton
                    variant="ghost"
                    label={`Remove ${p.name} as a friend`}
                    icon={<Icon name="x" strokeWidth={2.5} className="size-4" />}
                    onClick={() => {
                      setRemoveError(null);
                      setConfirmFor(p);
                    }}
                    className="-mr-1"
                  />
                )}
              </>
            ) : undoFor === p.id ? (
              <span className="inline-flex items-center gap-1 text-sm motion-safe:animate-pop">
                <span className="text-ink-muted">Removed</span>
                <button
                  type="button"
                  onClick={() => undo(p)}
                  className={cn(
                    "min-h-11 rounded-full px-3 font-bold text-ink underline decoration-accent decoration-2 underline-offset-4 hover:bg-ink/5",
                    pressable,
                    focusRing,
                  )}
                >
                  Undo
                </button>
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

      {canRemove && (
        <ConfirmSheet
          open={confirmFor !== null}
          title={confirmFor ? `Remove ${confirmFor.name}?` : "Remove friend?"}
          body={
            confirmFor && (
              <>
                You won&apos;t see suggestions or plans with {confirmFor.name} anymore, and {confirmFor.name} won&apos;t see you as free.
                Plans you already made together stay. You can add {confirmFor.name} again anytime.
              </>
            )
          }
          confirmLabel="Remove"
          busy={removing}
          error={removeError}
          onConfirm={remove}
          onClose={() => setConfirmFor(null)}
        />
      )}
    </div>
  );
}
