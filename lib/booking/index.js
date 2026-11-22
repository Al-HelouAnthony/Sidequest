/**
 * N4 "Book it": everything the organizer needs to reserve, for a confirmed plan. Owner: Anthony.
 * Pure (no I/O): the route loads the plan + place and passes them in. Never pretends to book:
 * it gives real links (official site / booking page / phone / Google Maps) and a ready message.
 */
import { toLocal } from "@/lib/time";
import { isOpenDuring } from "@/lib/engine/candidates";
import { CONTACTS } from "./contacts";

/** @typedef {import("@/types/domain").PlaceT} PlaceT */
/** @typedef {import("@/types/api").PlanViewT} PlanViewT */
/** @typedef {import("@/types/api").BookingInfoT} BookingInfoT */
/** @typedef {import("@/types/api").BookingInfoT["bookingType"]} BookingTypeT */

/**
 * Google Maps search for the place (documented Maps URLs API: /maps/search/?api=1&query=…).
 * Works for every place, incl. registry restaurants: Maps shows the phone, hours and reserve button.
 * @param {{ name: string, address: string }} place
 */
export function mapsUrl(place) {
  const query = [place.name, place.address, "Montréal"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * How this place is booked: the researched contact wins, else a sensible default per category.
 * @param {PlaceT} place
 * @param {import("./contacts").ContactT | undefined} contact
 * @returns {BookingTypeT}
 */
export function bookingTypeFor(place, contact) {
  // City events: free ones need nothing; the others → tickets / registration on the event page.
  if (place.source === "event") return place.tags.includes("free") ? "none" : "tickets";
  if (contact?.bookingType) return contact.bookingType;
  if (contact?.bookingUrl) return "online";
  switch (place.category) {
    case "restaurant":
      return "phone";
    case "park":
    case "viewpoint":
      return "none";
    case "activity":
    case "event":
      return contact?.website ? "tickets" : "walk-in";
    default: // cafe, bar
      return "walk-in";
  }
}

/** "Anthony" → "d'Anthony", "Maya" → "de Maya". @param {string} name */
const deName = (name) => (/^[aeiouyhàâéèêëîïôûù]/i.test(name) ? `d'${name}` : `de ${name}`);

/**
 * Ready-to-send text in French and English.
 * restaurant/bar/cafe → a table reservation; everything else → "we're a group of N visiting…".
 * @param {{ place: PlaceT, startAt: string, partySize: number, organizer: string, bookingType: BookingTypeT }} p
 * @returns {{ fr: string, en: string }}
 */
export function bookingMessage({ place, startAt, partySize, organizer, bookingType }) {
  const t = toLocal(startAt);
  const frDate = t.setLocale("fr-CA").toFormat("cccc d LLLL");
  const frTime = t.minute ? `${t.hour} h ${String(t.minute).padStart(2, "0")}` : `${t.hour} h`;
  const enDate = t.setLocale("en-CA").toFormat("cccc, LLLL d");
  const enTime = t.setLocale("en-US").toFormat(t.minute ? "h:mm a" : "h a"); // "7:30 PM" (en-CA gives "p.m.")
  const frPeople = partySize === 1 ? "1 personne" : `${partySize} personnes`;
  const enPeople = partySize === 1 ? "1 person" : `${partySize}`;

  const table = ["restaurant", "bar", "cafe"].includes(place.category) && bookingType !== "none";
  if (table) {
    return {
      fr: `Bonjour! J'aimerais réserver une table pour ${frPeople} le ${frDate} à ${frTime}, au nom ${deName(organizer)}. Merci!`,
      en: `Hi! I'd like to reserve a table for ${enPeople} on ${enDate} at ${enTime}, under the name ${organizer}. Thank you!`,
    };
  }
  return {
    fr: `Bonjour! Nous sommes un groupe de ${frPeople} et nous aimerions visiter ${place.name} le ${frDate} à ${frTime}. Faut-il réserver ou acheter des billets à l'avance? Merci!`,
    en: `Hi! We're a group of ${enPeople === "1 person" ? "1" : enPeople} planning to visit ${place.name} on ${enDate} at ${enTime}. Do we need to book or buy tickets ahead? Thank you!`,
  };
}

/**
 * @param {PlanViewT} plan   from getPlan() (membership already checked)
 * @param {PlaceT} place     the full place (hours needed for the open check)
 * @returns {BookingInfoT}
 */
export function bookingInfo(plan, place) {
  const contact = CONTACTS[place.id];
  const bookingType = bookingTypeFor(place, contact);
  const partySize = Math.max(1, plan.members.filter((m) => m.rsvp === "in").length);
  const organizer = (plan.members.find((m) => m.isCreator)?.name ?? "").split(" ")[0] || "Sidequest";
  return {
    bookingType,
    partySize,
    openDuring: isOpenDuring(place, plan.startAt, plan.endAt),
    hoursVerified: place.hoursVerified !== false,
    links: {
      maps: mapsUrl(place),
      ...(contact?.bookingUrl ? { booking: contact.bookingUrl } : {}),
      ...(contact?.website ? { website: contact.website } : {}),
      ...(contact?.phone ? { phone: contact.phone } : {}),
      // Events: the city's event page (tickets / registration for paid ones, details for free ones).
      ...(place.eventUrl ? (bookingType === "tickets" ? { booking: place.eventUrl } : { website: place.eventUrl }) : {}),
    },
    message: bookingMessage({ place, startAt: plan.startAt, partySize, organizer, bookingType }),
    bookingStatus: plan.bookingStatus ?? "none",
  };
}
