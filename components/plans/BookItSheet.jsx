"use client";
/**
 * N4 "Book it" sheet (organizer, confirmed plan). Owner: Anthony (Oscar's components, agreed).
 * GET /api/plans/[id]/booking → real links (booking page / call / website / Google Maps) and a
 * FR/EN message to copy; "Mark as requested" → POST, and every member's plan screen shows it.
 * Never pretends to book: the organizer reserves through the restaurant's own channel.
 */
import { useCallback, useEffect, useState } from "react";
import { BookingAgentResult, BookingInfo } from "@/types/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn, focusRing } from "@/components/ui/classes";

/** "+15148424813" → "514-842-4813". @param {string} e164 */
const prettyPhone = (e164) => e164.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");

/** @type {Record<import("@/types/api").BookingInfoT["bookingType"], string>} */
const HOW = {
  online: "They take reservations online.",
  phone: "Reserve by phone. The message below is ready to read or text.",
  "walk-in": "They don't usually take reservations. Just show up (you can still call to check).",
  tickets: "Buy your tickets online ahead of time.",
  none: "No reservation needed. Just show up!",
};

/** Same rule as the server's message (lib/booking): these get "a table", the rest "a group". */
const TABLE_CATEGORIES = ["restaurant", "bar", "cafe"];

/**
 * @param {{ planId: string, category: string, open: boolean, onClose: () => void, title: string, onRequested: () => void }} props
 */
export function BookItSheet({ planId, category, open, onClose, title, onRequested }) {
  const [info, setInfo] = useState(/** @type {import("@/types/api").BookingInfoT | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [lang, setLang] = useState(/** @type {"fr" | "en"} */ ("fr"));
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(/** @type {string | null} */ (null));

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(planId)}/booking`, { cache: "no-store" });
      if (!res.ok) throw new Error(`booking ${res.status}`);
      setInfo(BookingInfo.parse(await res.json()));
    } catch (e) {
      console.error("[book-it] load", e);
      setError("Couldn't load the booking details.");
    }
  }, [planId]);

  // Booking assistant: reads the place's own website (separate call: a live read can take ~10 s).
  const [agent, setAgent] = useState(/** @type {import("@/types/api").BookingAgentResultT | null} */ (null));
  const [agentFailed, setAgentFailed] = useState(false);
  const loadAgent = useCallback(async () => {
    setAgentFailed(false);
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(planId)}/booking/agent`, { cache: "no-store" });
      if (!res.ok) throw new Error(`agent ${res.status}`);
      setAgent(BookingAgentResult.parse(await res.json()));
    } catch (e) {
      console.error("[book-it] assistant", e);
      setAgentFailed(true);
    }
  }, [planId]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [open, load]);

  // Once per sheet: the answer doesn't change while it's open (cached on the server).
  useEffect(() => {
    if (!open || agent) return;
    const t = setTimeout(loadAgent, 0);
    return () => clearTimeout(t);
  }, [open, agent, loadAgent]);

  const copy = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.message[lang]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const markRequested = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(planId)}/booking`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `booking ${res.status}`);
      setInfo((i) => (i ? { ...i, bookingStatus: "requested" } : i));
      onRequested();
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const requested = info?.bookingStatus === "requested";
  const link = (/** @type {string} */ href, /** @type {string} */ label, /** @type {"primary" | "secondary"} */ variant = "secondary", external = true) => (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={buttonClasses({ variant, size: "lg", fullWidth: true, className: focusRing })}
    >
      {label}
    </a>
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Book it"
      description={title}
      footer={
        info && info.bookingType !== "none" ? (
          <div className="space-y-2">
            {saveError && (
              <p role="alert" className="text-center text-sm font-semibold text-danger">
                {saveError}
              </p>
            )}
            <Button
              size="lg"
              fullWidth
              variant={requested ? "secondary" : "primary"}
              loading={saving}
              disabled={requested}
              onClick={markRequested}
              leadingIcon={requested ? <Icon name="check" strokeWidth={3} className="size-4" /> : undefined}
            >
              {requested ? "Reservation requested" : "I booked it · tell everyone"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {!info ? (
        error ? (
          <div className="space-y-3 py-6 text-center">
            <p role="alert" className="font-semibold text-danger">{error}</p>
            <Button variant="secondary" onClick={load}>Try again</Button>
          </div>
        ) : (
          <div className="space-y-3 pb-2">
            <span className="sr-only">Loading booking details…</span>
            <Skeleton className="h-12 rounded-tile" />
            <Skeleton className="h-28 rounded-tile" />
            <Skeleton className="h-12 rounded-full" />
          </div>
        )
      ) : (
        <div className="space-y-4 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="cel inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold">
              <Icon name="friends" className="size-4" />
              {TABLE_CATEGORIES.includes(category) ? `Table for ${info.partySize}` : `Group of ${info.partySize}`}
            </span>
            {!info.hoursVerified && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1 text-sm font-semibold">
                <Icon name="clock" className="size-4" /> Hours not verified · call ahead
              </span>
            )}
          </div>

          {!info.openDuring && (
            <p role="alert" className="rounded-tile bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
              Our hours say it&apos;s closed for part of this time. Double-check before you book.
            </p>
          )}

          {info.bookingType !== "none" && <AssistantCard agent={agent} failed={agentFailed} phone={info.links.phone} />}

          <p className="text-ink-muted">{HOW[info.bookingType]}</p>

          {info.bookingType !== "none" && (
            <section className="space-y-2" aria-label="Message to send">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink-muted">Message</span>
                <div role="group" aria-label="Language" className="flex gap-1">
                  {/** @type {const} */ (["fr", "en"]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={lang === l}
                      onClick={() => setLang(l)}
                      className={cn(
                        "press min-h-11 rounded-full px-3 text-sm font-bold uppercase",
                        lang === l ? "bg-ink text-surface" : "bg-raised text-ink-muted",
                        focusRing,
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <p lang={lang} className="rounded-tile bg-raised px-4 py-3 leading-relaxed">
                {info.message[lang]}
              </p>
              <Button variant="ghost" fullWidth onClick={copy} leadingIcon={copied ? <Icon name="check" strokeWidth={3} className="size-4" /> : undefined}>
                {copied ? "Copied" : "Copy message"}
              </Button>
            </section>
          )}

          <div className="space-y-2">
            {info.links.booking && link(info.links.booking, "Open booking page", "primary")}
            {info.links.phone && link(`tel:${info.links.phone}`, `Call ${prettyPhone(info.links.phone)}`, info.links.booking ? "secondary" : "primary", false)}
            {info.links.website && link(info.links.website, info.bookingType === "tickets" ? "Buy tickets" : "Website")}
            {link(info.links.maps, "Find on Google Maps")}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

/** What each assistant verdict means for the organizer. */
const AGENT_TITLE = {
  online: "Book online",
  "no-reservations": "No reservations",
  phone: "Reserve by phone",
  unknown: "Call ahead",
};

/**
 * Booking assistant findings (read from the place's own website; never books by itself).
 * Fallback for "unknown": the phone number + clear steps.
 * @param {{ agent: import("@/types/api").BookingAgentResultT | null, failed: boolean, phone?: string }} props
 */
function AssistantCard({ agent, failed, phone }) {
  if (!agent && !failed) {
    return (
      <div role="status" className="cel flex items-center gap-3 rounded-tile p-4">
        <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-current border-r-transparent text-ink-muted" />
        <span className="text-sm font-semibold text-ink-muted">Booking assistant is reading their website…</span>
      </div>
    );
  }
  const verdict = agent?.verdict ?? "unknown";
  const host = agent?.source ? new URL(agent.source).hostname.replace(/^www\./, "") : null;
  return (
    <section aria-label="Booking assistant" className="cel space-y-3 rounded-tile p-4 motion-safe:animate-rise">
      <div className="flex items-center gap-2">
        <Icon name="search" strokeWidth={2.4} className="size-4" />
        <span className="text-sm font-semibold text-ink-muted">Booking assistant{host ? ` · read ${host}` : ""}</span>
      </div>
      <p className="font-bold">{AGENT_TITLE[verdict]}</p>
      {agent && verdict !== "unknown" && <p className="text-sm">{agent.summary}</p>}
      {agent?.quote && (
        <blockquote className="border-l-4 border-line pl-3 text-sm text-ink-muted">
          From their site: “{agent.quote}”
        </blockquote>
      )}
      {verdict === "online" && agent?.bookingUrl && (
        <a
          href={agent.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ variant: "primary", size: "lg", fullWidth: true, className: focusRing })}
        >
          {agent.platform && !/their own/i.test(agent.platform) ? `Reserve on ${agent.platform}` : "Open their booking page"}
        </a>
      )}
      {verdict === "no-reservations" && <p className="text-sm">No need to book: just show up together (arrive a bit early if it&apos;s busy).</p>}
      {verdict === "unknown" && (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>{phone ? `Call ${prettyPhone(phone)}` : "Find their number on Google Maps (button below)"}.</li>
          <li>Read them the message below (French or English).</li>
          <li>Once they say yes, tap “I booked it” so everyone knows.</li>
        </ol>
      )}
    </section>
  );
}
