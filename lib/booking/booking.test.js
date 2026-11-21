/** N4 Book it: pure rules. Montréal is UTC−5 in November (19:30 local = 00:30Z next day). */
import { describe, expect, it } from "vitest";
import { BookingInfo } from "@/types/api";
import { mockPlaces } from "@/lib/mocks/places";
import { bookingInfo, bookingMessage, bookingTypeFor, mapsUrl } from "./index";

const byName = (n) => /** @type {import("@/types/domain").PlaceT} */ (mockPlaces.find((p) => p.name === n));
const schwartz = byName("Schwartz's Deli"); // restaurant, 09:00–23:00 every day
const mbam = byName("Musée des beaux-arts"); // closed Monday, Sat 10–17
const park = byName("Parc La Fontaine");

/** A confirmed PlanView: Anthony + `ins` said in, Léa invited. */
const plan = (place, startAt, endAt, ins = ["Maya Chen", "Karim"], bookingStatus) => ({
  id: "p", creatorId: "a", placeId: place.id, startAt, endAt, status: "confirmed", createdAt: startAt,
  ...(bookingStatus ? { bookingStatus } : {}),
  place: { id: place.id, name: place.name, category: place.category, photoUrl: "", address: place.address },
  members: [
    { userId: "a", name: "Anthony Helou", avatarUrl: "", rsvp: "in", isCreator: true },
    ...ins.map((name, i) => ({ userId: `f${i}`, name, avatarUrl: "", rsvp: "in", isCreator: false })),
    { userId: "l", name: "Léa", avatarUrl: "", rsvp: "invited", isCreator: false },
  ],
});
const SAT_1930 = "2026-11-22T00:30:00.000Z"; // Sat Nov 21, 19:30 local
const SAT_2030 = "2026-11-22T01:30:00.000Z";

describe("bookingInfo", () => {
  it("restaurant: party = people who said in (organizer included), open check, FR + EN table message", () => {
    const info = BookingInfo.parse(bookingInfo(plan(schwartz, SAT_1930, SAT_2030), schwartz));
    expect(info.partySize).toBe(3);
    expect(info.bookingType).toBe("phone");
    expect(info.openDuring).toBe(true);
    expect(info.hoursVerified).toBe(true);
    expect(info.bookingStatus).toBe("none");
    expect(info.message.fr).toBe("Bonjour! J'aimerais réserver une table pour 3 personnes le samedi 21 novembre à 19 h 30, au nom d'Anthony. Merci!");
    expect(info.message.en).toBe("Hi! I'd like to reserve a table for 3 on Saturday, November 21 at 7:30 PM, under the name Anthony. Thank you!");
    expect(info.links.maps).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Schwartz/);
  });

  it("flags a plan outside opening hours (museum on Saturday evening)", () => {
    expect(bookingInfo(plan(mbam, SAT_1930, SAT_2030), mbam).openDuring).toBe(false);
  });

  it("registry restaurant: hoursVerified false comes through", () => {
    const reg = { ...schwartz, id: "20000000-0000-4000-8000-000000000042", hoursVerified: false, source: /** @type {const} */ ("registry") };
    expect(bookingInfo(plan(reg, SAT_1930, SAT_2030), reg).hoursVerified).toBe(false);
  });

  it("parks need nothing; museums get a visit message, not a table", () => {
    expect(bookingInfo(plan(park, SAT_1930, SAT_2030), park).bookingType).toBe("none");
    const m = bookingInfo(plan(mbam, SAT_1930, SAT_2030), mbam).message;
    expect(m.en).toContain("We're a group of 3 planning to visit Musée des beaux-arts");
    expect(m.fr).toContain("Nous sommes un groupe de 3 personnes");
  });

  it("keeps bookingStatus from the plan", () => {
    expect(bookingInfo(plan(schwartz, SAT_1930, SAT_2030, [], "requested"), schwartz).bookingStatus).toBe("requested");
  });
});

describe("helpers", () => {
  it("bookingTypeFor: researched contact wins, else per category", () => {
    expect(bookingTypeFor(schwartz, undefined)).toBe("phone");
    expect(bookingTypeFor(schwartz, { bookingUrl: "https://x.example" })).toBe("online");
    expect(bookingTypeFor(schwartz, { bookingType: "walk-in" })).toBe("walk-in");
    expect(bookingTypeFor(byName("Bily Kun"), undefined)).toBe("walk-in");
    expect(bookingTypeFor(mbam, { website: "https://www.mbam.qc.ca" })).toBe("tickets");
  });

  it("French: 'de' vs 'd'', whole hours, 1 person", () => {
    const m = bookingMessage({ place: schwartz, startAt: "2026-11-22T00:00:00.000Z", partySize: 1, organizer: "Maya", bookingType: "phone" });
    expect(m.fr).toContain("pour 1 personne le samedi 21 novembre à 19 h, au nom de Maya");
    expect(m.en).toContain("for 1 person on Saturday, November 21 at 7 PM");
  });

  it("maps link is a valid URL for any name", () => {
    expect(() => new URL(mapsUrl({ name: "Café & Co #1", address: "1 Rue X" }))).not.toThrow();
  });
});
