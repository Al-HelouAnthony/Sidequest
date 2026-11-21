/**
 * N4: how to reach / book each curated place. Owner: Anthony.
 * Only VERIFIED values (researched Nov 21, 2026): a phone is kept only when the place's own site,
 * Tourisme Montréal (mtl.org) or two independent listings agree; a website only when it's clearly
 * the official one. Anything else is left out on purpose: the sheet then falls back to Google Maps,
 * never a guessed number. Registry restaurants have no entry (Maps only).
 * Left out: La Banquise / Beauty's websites (two domains in listings), Le Mal Nécessaire (moved 2024,
 * no current number), Dieu du Ciel phone + Cinéma Moderne (one source), Le Petit Alep (its listed
 * number belongs to Alep next door).
 *
 * phone: E.164 ("+15145551234"). bookingType overrides the per-category default (lib/booking/index.js).
 * @typedef {{ website?: string, bookingUrl?: string, phone?: string,
 *   bookingType?: import("@/types/api").BookingInfoT["bookingType"] }} ContactT
 */

/** "10000000-0000-4000-8000-000000000003" from 3 (data/places.json ids). @param {number} n */
const pid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** @type {Record<string, ContactT>} placeId → contact */
export const CONTACTS = {
  // Restaurants (default: phone)
  [pid(3)]: { website: "https://www.schwartzsdeli.com", phone: "+15148424813" }, // Schwartz's Deli
  [pid(11)]: { phone: "+15149372333" }, // Kazu
  [pid(16)]: { phone: "+15145252415" }, // La Banquise
  [pid(27)]: { phone: "+15148498883" }, // Beauty's Luncheonette
  [pid(28)]: { phone: "+15145225175" }, // Ma Poule Mouillée
  [pid(29)]: { phone: "+15148440216" }, // Patati Patata
  [pid(30)]: { phone: "+15145087267" }, // Arepera du Plateau
  [pid(31)]: { website: "https://www.timeoutmarket.com/montreal/en/", phone: "+15143703883", bookingType: "walk-in" }, // Time Out Market (food hall)
  [pid(32)]: { website: "https://lestersdeli.com", phone: "+15142131313" }, // Lester's Deli
  [pid(34)]: { website: "https://pizzeriagema.com", phone: "+15144194448" }, // Pizzeria Gema
  // Bars (default: walk-in)
  [pid(6)]: { phone: "+15148455392" }, // Bily Kun
  [pid(20)]: { phone: "+15143791233" }, // Le Darling
  [pid(35)]: { website: "https://www.dieuduciel.com" }, // Brasserie Dieu du Ciel!
  [pid(36)]: { website: "https://casadelpopolo.com" }, // Casa del Popolo
  [pid(37)]: { phone: "+15149316808", bookingType: "phone" }, // Upstairs Jazz: reservations by phone (mtl.org)
  [pid(41)]: { phone: "+15143939277" }, // Brutopia
  // Museums (website → tickets)
  [pid(8)]: { website: "https://www.mbam.qc.ca" }, // Musée des beaux-arts
  [pid(15)]: { website: "https://espacepourlavie.ca" }, // Biodôme (timed tickets online)
  [pid(54)]: { website: "https://espacepourlavie.ca" }, // Jardin botanique
  [pid(55)]: { website: "https://pacmusee.qc.ca" }, // Pointe-à-Callière
  [pid(57)]: { website: "https://espacepourlavie.ca" }, // Planétarium
};
