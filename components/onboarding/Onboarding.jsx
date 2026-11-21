"use client";
/**
 * Onboarding (PLAN.md F9). Owner: Oscar. Four quick steps, clickable in ~20 s on stage:
 *   1. Calendar: status from the sign-in redirect (?calendar=synced|failed|skipped). Sync only happens at sign-in
 *      (team decision), so failed/skipped offer "Sign in again" → /login?next=/onboarding, not a retry call.
 *   2. Neighbourhood: one of NEIGHBOURHOODS; only the id is sent (coords are looked up server-side)
 *   3. Interests: tags from PLAN.md §6.3, at least MIN_INTERESTS
 *   4. Friends: PeopleList (GET /api/users → POST /api/friends; falls back to GET /api/friends)
 * The pickers live in ./pickers.jsx (shared with the You screen).
 * Finish → PATCH /api/me { neighbourhoodId, interests } → router.replace(?next, default /feed).
 * Endpoints that aren't live yet (404/405) are skipped so onboarding never gets stuck during the build.
 * Must render inside <Suspense> (useSearchParams with cacheComponents).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MeResponse } from "@/types/api";
import { Button, IconButton, buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/classes";
import { INTERESTS, MIN_INTERESTS } from "./options";
import { InterestPicker, NeighbourhoodPicker, PeopleList } from "./pickers";

const STEPS = ["Calendar", "Neighbourhood", "Interests", "Friends"];

/** Only same-site paths, so ?next= can't send people to another site after sign-in. */
function safeNext(/** @type {string | null} */ next) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/feed";
}

/** An endpoint that doesn't exist yet (teammate's PR not merged): treat as "skip", not as a failure. */
const notLiveYet = (/** @type {number} */ status) => status === 404 || status === 405;

/** @typedef {"synced" | "failed" | "skipped"} CalendarState */

/** Calendar sync runs during Google sign-in only, so "try again" = sign in again (Anthony's callback). */
const SIGN_IN_AGAIN = "/login?next=/onboarding";

export function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const fromRedirect = params.get("calendar");

  const [step, setStep] = useState(0);
  /** @type {CalendarState} */
  const calendar = fromRedirect === "synced" || fromRedirect === "failed" ? fromRedirect : "skipped";
  const [neighbourhoodId, setNeighbourhoodId] = useState(/** @type {string | null} */ (null));
  const [interests, setInterests] = useState(() => new Set(/** @type {string[]} */ ([])));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(/** @type {string | null} */ (null));

  // Pre-fill interests the user already has (returning users, or the seeded demo accounts).
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/me", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        const known = new Set(INTERESTS.map((t) => t.id));
        const mine = MeResponse.parse(j).user.interests.filter((t) => known.has(t));
        if (mine.length) setInterests((s) => (s.size ? s : new Set(mine)));
      })
      .catch((e) => !ctrl.signal.aborted && console.warn("[onboarding] /api/me", e));
    return () => ctrl.abort();
  }, []);

  const toggleInterest = (/** @type {string} */ id) =>
    setInterests((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const finish = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ neighbourhoodId, interests: [...interests] }),
      });
      if (!res.ok && !notLiveYet(res.status)) throw new Error(`PATCH /api/me ${res.status}`);
      if (notLiveYet(res.status)) console.warn("[onboarding] PATCH /api/me not live yet; profile not saved");
      router.replace(next);
    } catch (e) {
      console.error("[onboarding] save", e);
      setSaveError("Couldn't save your profile. Try again.");
      setSaving(false);
    }
  };

  const canContinue =
    step === 0 ? true : step === 1 ? Boolean(neighbourhoodId) : step === 2 ? interests.size >= MIN_INTERESTS : true;
  const isLast = step === STEPS.length - 1;
  const ctaLabel =
    step === 2 && interests.size < MIN_INTERESTS
      ? `Pick ${MIN_INTERESTS - interests.size} more`
      : step === 1 && !neighbourhoodId
        ? "Pick your neighbourhood"
        : isLast
          ? "Start exploring"
          : "Continue";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-safe pb-safe">
      {/* Progress */}
      <div className="flex items-center gap-3">
        {step > 0 ? (
          <IconButton
            label="Back"
            variant="solid"
            icon={<Icon name="back" strokeWidth={2.5} />}
            onClick={() => setStep((s) => s - 1)}
          />
        ) : (
          <span className="size-11 shrink-0" aria-hidden="true" />
        )}
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-label="Onboarding" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-2 flex-1 rounded-full border-[1.5px] border-line transition-colors duration-300",
                i <= step ? "bg-accent" : "bg-surface",
              )}
            />
          ))}
        </div>
        <span className="w-11 shrink-0 text-right text-sm font-semibold text-ink-muted tabular-nums">
          {step + 1}/{STEPS.length}
        </span>
      </div>

      <div key={step} className="flex flex-1 flex-col gap-4 motion-safe:animate-rise">
        {step === 0 && <CalendarStep state={calendar} />}
        {step === 1 && <NeighbourhoodStep value={neighbourhoodId} onChange={setNeighbourhoodId} />}
        {step === 2 && <InterestsStep selected={interests} onToggle={toggleInterest} />}
        {step === 3 && <FriendsStep />}
      </div>

      <div className="space-y-2">
        {saveError && (
          <p role="alert" className="text-center text-sm font-semibold text-danger">
            {saveError}
          </p>
        )}
        <Button
          size="lg"
          fullWidth
          disabled={!canContinue}
          loading={saving}
          onClick={isLast ? finish : () => setStep((s) => s + 1)}
          trailingIcon={!saving && canContinue && <Icon name="arrowRight" strokeWidth={2.5} className="size-4" />}
        >
          {ctaLabel}
        </Button>
      </div>
    </main>
  );
}

/** @param {{ title: string, body?: React.ReactNode }} props */
function StepTitle({ title, body }) {
  return (
    <div className="space-y-1.5">
      <h1 className="font-display text-[2rem] leading-[1.02] font-extrabold">{title}</h1>
      {body && <p className="text-ink-muted">{body}</p>}
    </div>
  );
}

/** @param {{ state: CalendarState }} props */
function CalendarStep({ state }) {
  const connected = state === "synced";
  const copy = {
    synced: { title: "Calendar connected ✓", body: "We'll only suggest times when you and your friends are actually free." },
    failed: { title: "We couldn't read your calendar", body: "Sign in again to retry. Until then we use a sample schedule." },
    skipped: { title: "Connect your calendar", body: "Sign in with Google so suggestions fit your real free time. Until then we use a sample schedule." },
  }[state];

  return (
    <>
      <div
        className={cn(
          "mx-auto mt-4 grid size-28 place-items-center rounded-full border-[1.5px] border-line shadow-cel",
          connected ? "bg-teal text-on-teal" : "bg-surface",
        )}
      >
        {connected ? (
          <span key="ok" className="motion-safe:animate-land">
            <Icon name="check" strokeWidth={3} className="size-14" />
          </span>
        ) : (
          <Icon name="calendar" cel strokeWidth={1.6} className="size-14" />
        )}
      </div>
      <div className="text-center" role="status">
        <StepTitle title={copy.title} body={copy.body} />
      </div>
      {(state === "failed" || state === "skipped") && (
        <Link href={SIGN_IN_AGAIN} className={buttonClasses({ variant: "secondary", className: "mx-auto" })}>
          <Icon name="refresh" strokeWidth={2.5} className="size-4" />
          {state === "failed" ? "Sign in again" : "Sign in with Google"}
        </Link>
      )}
    </>
  );
}

/** @param {{ value: string | null, onChange: (id: string) => void }} props */
function NeighbourhoodStep({ value, onChange }) {
  return (
    <>
      <StepTitle title="Where do you live?" body="We use it to work out travel times. Pick the closest area." />
      <NeighbourhoodPicker value={value} onChange={onChange} />
    </>
  );
}

/** @param {{ selected: Set<string>, onToggle: (id: string) => void }} props */
function InterestsStep({ selected, onToggle }) {
  return (
    <>
      <StepTitle
        title="What gets you off the couch?"
        body={`Pick at least ${MIN_INTERESTS}. Your feed learns the rest from your swipes.`}
      />
      <InterestPicker selected={selected} onToggle={onToggle} />
      <p className="text-sm font-semibold text-ink-muted" aria-live="polite">
        {selected.size} selected
      </p>
    </>
  );
}

function FriendsStep() {
  return (
    <>
      <StepTitle title="Who do you hang out with?" body="Add friends so we can find time you're all free." />
      <PeopleList />
    </>
  );
}

/** Suspense fallback for /onboarding. */
export function OnboardingLoading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md space-y-5 px-4 pt-safe pb-safe">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-11 rounded-full" />
      <Skeleton className="mx-auto mt-4 size-28 rounded-full" />
      <Skeleton className="h-20 rounded-tile" />
    </main>
  );
}
