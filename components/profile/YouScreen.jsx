"use client";
/**
 * You (/me): the third tab. Owner: Oscar.
 * Your profile after onboarding: home postal code + interests (saved with PATCH /api/me) (friends live on the Friends tab).
 * Reuses the onboarding pickers. Saving is skipped with a note while PATCH /api/me isn't live (404/405).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { MeResponse } from "@/types/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { TAB_BAR_SPACE, TabBar } from "@/components/nav/TabBar";
import { AppBackground } from "@/components/ui/AppBackground";
import { INTERESTS, MIN_INTERESTS } from "@/components/onboarding/options";
import { InterestPicker, PostalCodeField, isPostalCode, postalErrorFrom } from "@/components/onboarding/pickers";

/** @typedef {{ id: string, name: string, avatarUrl: string }} MeBasics */

/**
 * Data credits required by the licences (CC BY 4.0 for Ville de Montréal, ODbL for OpenStreetMap, plus the
 * services' attribution terms). Wording from Adel; each source links to its licence or attribution page.
 */
const CREDITS = [
  { text: "Ville de Montréal open data, places and events (CC BY 4.0)", href: "https://creativecommons.org/licenses/by/4.0/" },
  { text: "© OpenStreetMap contributors", href: "https://www.openstreetmap.org/copyright" },
  { text: "© openrouteservice.org by HeiGIT", href: "https://openrouteservice.org/" },
  { text: "weather by Open-Meteo.com", href: "https://open-meteo.com/" },
];

function DataCredits() {
  return (
    <section aria-labelledby="you-about" className="space-y-1.5 border-t-[1.5px] border-line/15 pt-4">
      <h2 id="you-about" className="text-label font-bold text-ink-muted">
        About
      </h2>
      <p className="text-xs leading-relaxed text-ink-muted">
        Data:{" "}
        {CREDITS.map((c, i) => (
          <span key={c.href}>
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-ink-muted/40 underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              {c.text}
            </a>
            {i < CREDITS.length - 1 ? ", " : "."}
          </span>
        ))}{" "}
        Place images are AI-generated illustrations, not photos of the actual venues.
      </p>
    </section>
  );
}

export function YouScreen() {
  const [me, setMe] = useState(/** @type {MeBasics | null} */ (null));
  const [interests, setInterests] = useState(() => new Set(/** @type {string[]} */ ([])));
  const [dirty, setDirty] = useState(false);
  /** N5: home postal code. The server keeps only "H2T" and doesn't send it back, so we show the area we saved. */
  const [postal, setPostal] = useState("");
  const [postalError, setPostalError] = useState(/** @type {string | null} */ (null));
  const [savedArea, setSavedArea] = useState(/** @type {string | null} */ (null));
  const hasPostal = isPostalCode(postal);
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

  const typePostal = (/** @type {string} */ v) => {
    setPostal(v);
    setPostalError(null);
    setDirty(true);
    setStatus("idle");
  };

  const save = async () => {
    setStatus("saving");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(hasPostal ? { postalCode: postal.trim() } : {}),
          interests: [...interests],
        }),
      });
      if (hasPostal) {
        const msg = await postalErrorFrom(res);
        if (msg) {
          setPostalError(msg);
          setStatus("idle");
          return;
        }
      }
      if (res.status === 404 || res.status === 405) {
        setStatus("unavailable");
        return;
      }
      if (!res.ok) throw new Error(`PATCH /api/me ${res.status}`);
      if (hasPostal) {
        // The server keeps only the first 3 characters (the area); show what was saved.
        setSavedArea(postal.trim().slice(0, 3));
        setPostal("");
      }
      setStatus("saved");
      setDirty(false);
    } catch (e) {
      console.error("[you] save", e);
      setStatus("error");
    }
  };

  const tooFew = interests.size < MIN_INTERESTS;
  const postalTypedButInvalid = postal.trim() !== "" && !hasPostal;
  const note = {
    idle: null,
    saving: null,
    saved: { text: "Saved. Your feed will use it on the next refresh.", className: "text-ink" },
    unavailable: { text: "Saving isn't available yet. Your changes aren't stored.", className: "text-ink-muted" },
    error: { text: "Couldn't save. Try again.", className: "text-danger" },
  }[status];

  return (
    <>
    <AppBackground />
    <main className="relative z-10 mx-auto min-h-dvh w-full max-w-md space-y-6 px-4 pt-safe" style={{ paddingBottom: TAB_BAR_SPACE }}>
      <div className="flex items-center gap-3">
        {me ? (
          <Avatar src={me.avatarUrl} name={me.name} size="xl" decorative />
        ) : (
          <Skeleton className="size-16 rounded-full" />
        )}
        <div className="min-w-0">
          <h1 className="font-display text-heading font-extrabold">You</h1>
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
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="you-area" className="font-display text-xl font-extrabold">
            Home
          </h2>
          {savedArea && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted motion-safe:animate-pop">
              <Icon name="check" strokeWidth={3} className="size-4 text-teal" />
              Home set to {savedArea}
            </span>
          )}
        </div>
        <PostalCodeField id="you-postal" value={postal} onChange={typePostal} error={postalError} />
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
          disabled={!dirty || tooFew || postalTypedButInvalid}
          loading={status === "saving"}
          onClick={save}
          leadingIcon={status === "saved" && !dirty ? <Icon name="check" strokeWidth={3} className="size-4" /> : undefined}
        >
          {tooFew ? `Pick ${MIN_INTERESTS - interests.size} more interests` : status === "saved" && !dirty ? "Saved" : "Save changes"}
        </Button>
      </div>

      <p className="halo text-sm text-ink-muted">
        Friends moved to their own tab.{" "}
        <Link href="/friends" className="font-semibold text-ink underline underline-offset-2">
          Open Friends
        </Link>
      </p>

      <DataCredits />

      <TabBar active="/me" />
    </main>
    </>
  );
}
