/**
 * N4: how to reach / book each curated place. Owner: Anthony.
 * Only VERIFIED values (official site or the place's own listing): a missing field just means the
 * sheet falls back to Google Maps, never a guessed number. Registry restaurants have no entry.
 *
 * phone: E.164 ("+15145551234"). bookingType overrides the per-category default (lib/booking/index.js).
 * @typedef {{ website?: string, bookingUrl?: string, phone?: string,
 *   bookingType?: import("@/types/api").BookingInfoT["bookingType"] }} ContactT
 */

/** @type {Record<string, ContactT>} placeId → contact */
export const CONTACTS = {};
