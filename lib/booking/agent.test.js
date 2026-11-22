/** N4 booking assistant: page reading + every check on Claude's answer. No network, no Claude. */
import { describe, expect, it, vi } from "vitest";
import { BookingAgentResult } from "@/types/api";
import { bookingAgent, checkFindings, clip, eventBookingResult, readPage, readSite } from "./agent";

const SCHWARTZ = { id: "10000000-0000-4000-8000-000000000003", name: "Schwartz's Deli", category: "restaurant" }; // has a website in contacts.js
const BIODOME = { id: "10000000-0000-4000-8000-000000000015", name: "Biodôme", category: "activity" }; // website, nothing saved
const KAZU = { id: "10000000-0000-4000-8000-000000000011", name: "Kazu", category: "restaurant" }; // phone only

const HOME = `<html><head><script>var x = "<a href='https://evil.example'>no</a>";</script><style>.a{}</style></head>
<body><nav><a href="/menu">Menu</a> <a href="/reservations">Réservations</a> <a href="tel:+15148424813">514-842-4813</a></nav>
<p>Bienvenue chez nous!&nbsp;Since 1928.</p></body></html>`;
const RESA = `<html><body><h1>Reservations</h1><p>We don&#39;t take reservations. First come, first served.</p>
<a href="https://www.opentable.ca/r/test-restaurant">Book on OpenTable</a></body></html>`;

/** Fake fetch serving the two pages above. */
const fakeFetch = vi.fn(async (url) => {
  const body = String(url).endsWith("/reservations") ? RESA : HOME;
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
});

describe("readPage / readSite", () => {
  it("keeps visible text + absolute links, drops scripts, decodes entities", () => {
    const page = readPage(HOME, "https://www.schwartzsdeli.com/");
    expect(page.text).toContain("Bienvenue chez nous! Since 1928.");
    expect(page.text).not.toContain("evil");
    expect(page.links.map((l) => l.href)).toEqual(["https://www.schwartzsdeli.com/menu", "https://www.schwartzsdeli.com/reservations", "tel:+15148424813"]);
  });

  it("follows ONE same-site booking page and puts booking links first", async () => {
    const site = await readSite("https://www.schwartzsdeli.com/", /** @type {any} */ (fakeFetch));
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(site?.text).toContain("We don't take reservations.");
    expect(site?.links[0].href).toMatch(/reservations|opentable/);
  });

  it("refuses non-https websites", async () => {
    expect(await readSite("http://example.com", /** @type {any} */ (fakeFetch))).toBeNull();
  });
});

describe("checkFindings (Claude's answer is never trusted blindly)", () => {
  const page = { text: "We don't take reservations. First come, first served.", links: [{ text: "Book on OpenTable", href: "https://www.opentable.ca/r/test" }] };
  const base = { bookingLinkIndex: null, platform: null, quote: null, summary: "x" };

  it("online: the URL comes from the page's own links, platform detected", () => {
    const r = BookingAgentResult.parse(checkFindings({ ...base, verdict: "online", bookingLinkIndex: 0 }, page, "https://site.example"));
    expect(r).toMatchObject({ verdict: "online", bookingUrl: "https://www.opentable.ca/r/test", platform: "OpenTable" });
  });

  it("online with an index that doesn't exist → unknown (no invented link)", () => {
    expect(checkFindings({ ...base, verdict: "online", bookingLinkIndex: 7 }, page, "https://site.example").verdict).toBe("unknown");
  });

  it("no-reservations needs a quote that is really on the page", () => {
    const real = checkFindings({ ...base, verdict: "no-reservations", quote: "We don’t take  reservations." }, page, "https://site.example");
    expect(real).toMatchObject({ verdict: "no-reservations", quote: "We don't take reservations." });
    const made_up = checkFindings({ ...base, verdict: "no-reservations", quote: "Reservations are never accepted here." }, page, "https://site.example");
    expect(made_up.verdict).toBe("unknown");
  });
});

describe("clip", () => {
  it("short text unchanged; long text ends at a clause, else a word, never mid-word", () => {
    expect(clip("Short.")).toBe("Short.");
    const clause = `${"a".repeat(70)} first part; second part ${"b ".repeat(80)}`;
    expect(clip(clause)).toBe(`${"a".repeat(70)} first part.`);
    const words = "word ".repeat(60);
    const out = clip(words);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(181);
    expect(out).not.toMatch(/wor…$/);
  });
});

describe("saved results (agent-cache.json)", () => {
  it("every entry is a valid result for a place with a website, never a 'couldn't open' failure", async () => {
    const saved = (await import("./agent-cache.json")).default;
    const { CONTACTS } = await import("./contacts");
    for (const [id, r] of Object.entries(saved)) {
      BookingAgentResult.parse(r);
      expect(CONTACTS[id]?.website, id).toBeTruthy();
      expect(r.summary).not.toMatch(/Couldn't open|unavailable/);
      expect(r.summary.length).toBeLessThanOrEqual(181);
    }
  });
});

describe("bookingAgent", () => {
  it("no website on file → unknown, no fetch, no Claude", async () => {
    const ask = vi.fn();
    const r = BookingAgentResult.parse(await bookingAgent(KAZU, { ask, fetchImpl: /** @type {any} */ (fakeFetch) }));
    expect(r.verdict).toBe("unknown");
    expect(ask).not.toHaveBeenCalled();
  });

  it("saved answer (agent-cache.json) wins: no fetch, no Claude", async () => {
    const ask = vi.fn();
    const fetchImpl = vi.fn();
    const r = await bookingAgent(SCHWARTZ, { ask, fetchImpl: /** @type {any} */ (fetchImpl) });
    expect(r.source).toBe("https://www.schwartzsdeli.com");
    expect(ask).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("live: reads the site, checks the answer, caches it", async () => {
    const ask = vi.fn(async () => ({ verdict: /** @type {const} */ ("no-reservations"), bookingLinkIndex: null, platform: null, quote: "We don't take reservations.", summary: "Their website says they don't take reservations: just show up." }));
    const r = await bookingAgent(BIODOME, { ask, fetchImpl: /** @type {any} */ (fakeFetch), fresh: true });
    expect(r).toMatchObject({ verdict: "no-reservations", quote: "We don't take reservations.", source: "https://espacepourlavie.ca" });
    const again = await bookingAgent(BIODOME, { ask });
    expect(again).toEqual(r);
    expect(ask).toHaveBeenCalledOnce();
    expect(ask.mock.calls[0][1]).toEqual(BIODOME); // Claude is told which place it is reading
  });

  it("Claude down → unknown, never throws", async () => {
    const ask = vi.fn(async () => {
      throw new Error("timeout");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await bookingAgent(BIODOME, { ask, fetchImpl: /** @type {any} */ (fakeFetch), fresh: true });
    expect(r.verdict).toBe("unknown");
    warn.mockRestore();
  });

  it("city events are answered from our data: no fetch, no Claude, nothing claimed as 'read'", async () => {
    const ask = vi.fn();
    const fetchImpl = vi.fn();
    const paid = { id: "50000000-0000-4000-8000-00000000abcd", name: "Concert", category: "event", source: "event", tags: ["live-music"], eventUrl: "https://montreal.ca/evenements/test-1" };
    const r = BookingAgentResult.parse(await bookingAgent(paid, { ask, fetchImpl: /** @type {any} */ (fetchImpl) }));
    expect(r).toMatchObject({ verdict: "online", bookingUrl: "https://montreal.ca/evenements/test-1" });
    expect(r.source).toBeUndefined();
    expect(ask).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(eventBookingResult({ tags: ["free"] }).verdict).toBe("no-reservations");
    expect(eventBookingResult({ tags: [] }).verdict).toBe("unknown");
  });
});
