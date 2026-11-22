"use client";
/**
 * /plans/preview: "How it works" for the features that only appear around a sidequest's start
 * (live location from 30 min before, memory photos during, Google Calendar on "I'm in").
 * Owner: Anthony (in Oscar's components, agreed). STATIC sample data, no API calls, clearly labelled,
 * so it can be shown at any time. The real ones: components/plans/LiveLocation.jsx, PlanPhotos.jsx.
 */
import Link from "next/link";
import { AppBackground } from "@/components/ui/AppBackground";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn, focusRing } from "@/components/ui/classes";
import { StartNow } from "@/components/plans/MyPlans";

/** Sample "who's on the way" rows (the real list never shows coordinates either). */
const SAMPLE_PEOPLE = [
  { name: "You", text: "6 min away", tone: "muted" },
  { name: "Maya", text: "8 min away", tone: "muted" },
  { name: "Karim", text: "late · ~12 min", tone: "late" },
  { name: "Léa", text: "arrived", tone: "arrived" },
  { name: "Antoine", text: "not sharing", tone: "muted" },
];

/** Sample memories: photos of places from the app. */
const SAMPLE_PHOTOS = [
  { src: "/places/10000000-0000-4000-8000-000000000001.jpg", by: "Maya" },
  { src: "/places/10000000-0000-4000-8000-000000000016.jpg", by: "You" },
  { src: "/places/10000000-0000-4000-8000-000000000036.jpg", by: "Karim" },
  { src: "/places/10000000-0000-4000-8000-000000000054.jpg", by: "Léa" },
];

/** @param {{ step: string, title: string, children: React.ReactNode }} props */
function Step({ step, title, children }) {
  return (
    <section aria-labelledby={`step-${step}`} className="space-y-3">
      <h2 id={`step-${step}`} className="halo font-display text-xl font-extrabold">
        <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full border-2 border-line bg-teal text-sm text-on-teal">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function FeaturePreview() {
  return (
    <>
      <AppBackground />
      <main className="relative z-10 mx-auto min-h-dvh w-full max-w-md space-y-6 px-4 pt-safe pb-safe">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/plans"
            aria-label="Back to my plans"
            className={cn("press inline-flex size-11 items-center justify-center rounded-full bg-surface", focusRing)}
          >
            <Icon name="back" strokeWidth={2.5} className="size-5" />
          </Link>
          <span className="cel rounded-full px-3 py-1 text-sm font-bold">Preview · sample data</span>
        </div>

        <div className="space-y-1">
          <h1 className="halo font-display text-heading font-extrabold">How a sidequest goes</h1>
          <p className="halo text-ink-muted">These appear on the plan screen at the right moment. Here they are with sample data.</p>
        </div>

        <Step step="1" title="Tap “I’m in” → it’s in your calendar">
          <div className="cel flex items-center gap-3 rounded-tile p-4">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-line bg-teal text-on-teal">
              <Icon name="check" strokeWidth={3} className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Added to your Google Calendar</span>
              <span className="block text-sm text-ink-muted">Removed again if you can’t make it or the plan is cancelled.</span>
            </span>
          </div>
        </Step>

        <Step step="2" title="30 min before: who’s on the way">
          <div className="cel space-y-3 rounded-tile p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-xl font-extrabold">On the way</p>
              <Icon name="walk" strokeWidth={1.9} className="size-5" />
            </div>
            <ul className="space-y-1.5">
              {SAMPLE_PEOPLE.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-bold">{p.name}</span>
                  <span className={p.tone === "late" ? "font-semibold text-danger" : p.tone === "arrived" ? "font-semibold" : "text-ink-muted"}>{p.text}</span>
                </li>
              ))}
            </ul>
            <Button variant="secondary" fullWidth disabled>
              Share my location until we meet
            </Button>
            <p className="text-caption text-ink-muted">Opt-in. Friends see your ETA, never your exact position. Stops 30 min after the start.</p>
          </div>
        </Step>

        <Step step="3" title="During: keep the memories">
          <div className="cel flex items-center gap-3 rounded-tile p-3">
            <span className="text-2xl" aria-hidden="true">
              📸
            </span>
            <p className="min-w-0 flex-1 font-bold">Take a memory photo</p>
            <Button disabled>Open camera</Button>
          </div>
          <ul className="grid grid-cols-2 gap-2">
            {SAMPLE_PHOTOS.map((p) => (
              <li key={p.src} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local sample photos */}
                <img src={p.src} alt={`Sample memory by ${p.by}`} loading="lazy" className="aspect-square w-full rounded-tile border-2 border-line bg-raised object-cover" />
                <span className="absolute bottom-2 left-2 rounded-full bg-surface/90 px-2 py-0.5 text-xs font-bold">{p.by}</span>
              </li>
            ))}
          </ul>
          <p className="halo text-sm text-ink-muted">At the start and halfway through, everyone gets a nudge. The album is shared with the plan only.</p>
        </Step>

        <Step step="4" title="Try it for real">
          <StartNow />
        </Step>
      </main>
    </>
  );
}
