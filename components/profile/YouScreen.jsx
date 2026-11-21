"use client";
/**
 * You (/me): the third tab. Owner: Oscar.
 * Your profile after onboarding: neighbourhood + interests (saved with PATCH /api/me) and friends (PeopleList).
 * Reuses the onboarding pickers. Saving is skipped with a note while PATCH /api/me isn't live (404/405).
 */
import { useEffect, useState } from "react";
import { MeResponse } from "@/types/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { TAB_BAR_SPACE, TabBar } from "@/components/nav/TabBar";
import { INTERESTS, MIN_INTERESTS, NEIGHBOURHOODS } from "@/components/onboarding/options";
import { InterestPicker, NeighbourhoodPicker, PeopleList } from "@/components/onboarding/pickers";

/** @typedef {{ id: string, name: string, avatarUrl: string }} MeBasics */

export function YouScreen() {
  const [me, setMe] = useState(/** @type {MeBasics | null} */ (null));
  const [neighbourhoodId, setNeighbourhoodId] = useState(/** @type {string | null} */ (null));
  const [interests, setInterests] = useState(() => new Set(/** @type {string[]} */ ([])));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState(/** @type {"idle" | "saving" | "saved" | "unavailable" | "error"} */ ("idle"));
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/me", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`me ${r.status}`))))
      .then((json) => {
        const { user } = MeResponse.parse(json);
        const known = new Set(INTERESTS.map((t) => t.id));
        setMe({ id: user.id, name: user.name, avatarUrl: user.avatarUrl });
        setInterests(new Set(user.interests.filter((t) => known.has(t))));
        // The server stores the neighbourhood's centre as the home (not the id), so match it back.
        const home = NEIGHBOURHOODS.find((n) => Math.abs(n.lat - user.homeLat) < 1e-4 && Math.abs(n.lng - user.homeLng) < 1e-4);
        if (home) setNeighbourhoodId(home.id);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        console.error("[you] /api/me", e);
        setLoadFailed(true);
      });
    return () => ctrl.abort();
  }, [reloadKey]);

  const toggleInterest = (/** @type {string} */ id) => {
    setInterests((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setDirty(true);
    setStatus("idle");
  };

  const pickNeighbourhood = (/** @type {string} */ id) => {
    setNeighbourhoodId(id);
    setDirty(true);
    setStatus("idle");
  };

  const save = async () => {
    setStatus("saving");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(neighbourhoodId ? { neighbourhoodId } : {}), interests: [...interests] }),
      });
      if (res.status === 404 || res.status === 405) {
        setStatus("unavailable");
        return;
      }
      if (!res.ok) throw new Error(`PATCH /api/me ${res.status}`);
      setStatus("saved");
      setDirty(false);
    } catch (e) {
      console.error("[you] save", e);
      setStatus("error");
    }
  };

  const tooFew = interests.size < MIN_INTERESTS;
  const note = {
    idle: null,
    saving: null,
    saved: { text: "Saved. Your feed will use it on the next refresh.", className: "text-ink" },
    unavailable: { text: "Saving isn't available yet. Your changes aren't stored.", className: "text-ink-muted" },
    error: { text: "Couldn't save. Try again.", className: "text-danger" },
  }[status];

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md space-y-6 px-4 pt-safe" style={{ paddingBottom: TAB_BAR_SPACE }}>
      <div className="flex items-center gap-3">
        {me ? (
          <Avatar src={me.avatarUrl} name={me.name} size="xl" decorative />
        ) : (
          <Skeleton className="size-16 rounded-full" />
        )}
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold">You</h1>
          <p className="truncate text-ink-muted">{me ? me.name : loadFailed ? "Couldn't load your profile" : "Loading…"}</p>
        </div>
      </div>

      {loadFailed && !me && (
        <div role="alert" className="cel flex items-center justify-between gap-3 rounded-tile p-3.5">
          <span className="text-sm font-semibold">Check your connection and try again.</span>
          <Button
            variant="secondary"
            onClick={() => {
              setLoadFailed(false);
              setReloadKey((k) => k + 1);
            }}
          >
            Try again
          </Button>
        </div>
      )}

      <section aria-labelledby="you-area" className="space-y-3">
        <h2 id="you-area" className="font-display text-xl font-extrabold">
          Neighbourhood
        </h2>
        <NeighbourhoodPicker value={neighbourhoodId} onChange={pickNeighbourhood} />
      </section>

      <section aria-labelledby="you-interests" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="you-interests" className="font-display text-xl font-extrabold">
            Interests
          </h2>
          <span className="text-sm font-semibold text-ink-muted">{interests.size} selected</span>
        </div>
        <InterestPicker selected={interests} onToggle={toggleInterest} />
      </section>

      <div className="space-y-2">
        {note && (
          <p role="status" className={`text-center text-sm font-semibold ${note.className}`}>
            {note.text}
          </p>
        )}
        <Button
          size="lg"
          fullWidth
          disabled={!dirty || tooFew}
          loading={status === "saving"}
          onClick={save}
          leadingIcon={status === "saved" && !dirty ? <Icon name="check" strokeWidth={3} className="size-4" /> : undefined}
        >
          {tooFew ? `Pick ${MIN_INTERESTS - interests.size} more interests` : status === "saved" && !dirty ? "Saved" : "Save changes"}
        </Button>
      </div>

      <section aria-labelledby="you-friends" className="space-y-3">
        <h2 id="you-friends" className="font-display text-xl font-extrabold">
          Friends
        </h2>
        <PeopleList />
      </section>

      <TabBar active="/me" />
    </main>
  );
}
