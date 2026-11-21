/**
 * MOCK DATA. 20 Montréal spots with APPROXIMATE coordinates and simplified hours.
 * Adel replaces this with the real curated list (data/places.json → Supabase).
 * Photos are random placeholders from picsum.photos, not the real places.
 */

const photo = (/** @type {string} */ slug) => `https://picsum.photos/seed/${slug}/800/1400`;

/** @returns {import("@/types/domain").OpeningHoursT} */
const every = (/** @type {string} */ open, /** @type {string} */ close) => ({
  mon: [{ open, close }],
  tue: [{ open, close }],
  wed: [{ open, close }],
  thu: [{ open, close }],
  fri: [{ open, close }],
  sat: [{ open, close }],
  sun: [{ open, close }],
});

const pid = (/** @type {number} */ n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** @type {import("@/types/domain").PlaceT[]} */
export const mockPlaces = [
  { id: pid(1), name: "Café Olimpico", category: "cafe", tags: ["coffee", "cheap-eats"], lat: 45.5229, lng: -73.6018, address: "124 Rue Saint-Viateur O", priceLevel: 1, photoUrl: photo("olimpico"), hours: every("07:00", "23:00"), typicalDurationMin: 60, indoor: true },
  { id: pid(2), name: "Kondiaronk Lookout", category: "viewpoint", tags: ["views", "outdoors", "free"], lat: 45.504, lng: -73.5874, address: "1196 Voie Camillien-Houde", priceLevel: 1, photoUrl: photo("kondiaronk"), hours: every("09:00", "23:00"), typicalDurationMin: 90, indoor: false },
  { id: pid(3), name: "Schwartz's Deli", category: "restaurant", tags: ["cheap-eats", "iconic", "deli"], lat: 45.5165, lng: -73.5779, address: "3895 Boul. Saint-Laurent", priceLevel: 2, photoUrl: photo("schwartz"), hours: every("09:00", "23:00"), typicalDurationMin: 60, indoor: true },
  { id: pid(4), name: "Marché Jean-Talon", category: "activity", tags: ["markets", "cheap-eats"], lat: 45.5363, lng: -73.6147, address: "7070 Av. Henri-Julien", priceLevel: 1, photoUrl: photo("jeantalon"), hours: every("09:00", "18:00"), typicalDurationMin: 90, indoor: false },
  { id: pid(5), name: "Parc La Fontaine", category: "park", tags: ["outdoors", "free"], lat: 45.527, lng: -73.569, address: "3933 Av. du Parc-La Fontaine", priceLevel: 1, photoUrl: photo("lafontaine"), hours: every("09:00", "23:00"), typicalDurationMin: 60, indoor: false },
  { id: pid(6), name: "Bily Kun", category: "bar", tags: ["bars", "live-music"], lat: 45.5248, lng: -73.581, address: "354 Av. du Mont-Royal E", priceLevel: 2, photoUrl: photo("bilykun"), hours: every("15:00", "03:00"), typicalDurationMin: 120, indoor: true },
  { id: pid(7), name: "St-Viateur Bagel", category: "cafe", tags: ["cheap-eats", "iconic"], lat: 45.5226, lng: -73.6008, address: "263 Rue Saint-Viateur O", priceLevel: 1, photoUrl: photo("stviateur"), hours: every("06:00", "23:00"), typicalDurationMin: 45, indoor: true },
  { id: pid(8), name: "Musée des beaux-arts", category: "activity", tags: ["art", "museums"], lat: 45.4986, lng: -73.5794, address: "1380 Rue Sherbrooke O", priceLevel: 2, photoUrl: photo("mbam"), hours: { tue: [{ open: "10:00", close: "17:00" }], wed: [{ open: "10:00", close: "21:00" }], thu: [{ open: "10:00", close: "17:00" }], fri: [{ open: "10:00", close: "17:00" }], sat: [{ open: "10:00", close: "17:00" }], sun: [{ open: "10:00", close: "17:00" }] }, typicalDurationMin: 120, indoor: true },
  { id: pid(9), name: "Old Port Clock Tower", category: "viewpoint", tags: ["views", "outdoors", "free"], lat: 45.51, lng: -73.547, address: "1 Quai de l'Horloge", priceLevel: 1, photoUrl: photo("clocktower"), hours: every("10:00", "21:00"), typicalDurationMin: 60, indoor: false },
  { id: pid(10), name: "Le Mal Nécessaire", category: "bar", tags: ["bars", "cocktails"], lat: 45.5076, lng: -73.5603, address: "1106 Boul. Saint-Laurent", priceLevel: 3, photoUrl: photo("malnecessaire"), hours: every("16:00", "02:00"), typicalDurationMin: 90, indoor: true },
  { id: pid(11), name: "Kazu", category: "restaurant", tags: ["japanese", "cheap-eats"], lat: 45.4949, lng: -73.5797, address: "1862 Rue Sainte-Catherine O", priceLevel: 2, photoUrl: photo("kazu"), hours: { mon: [{ open: "12:00", close: "22:00" }], thu: [{ open: "12:00", close: "22:00" }], fri: [{ open: "12:00", close: "22:00" }], sat: [{ open: "12:00", close: "22:00" }], sun: [{ open: "12:00", close: "22:00" }] }, typicalDurationMin: 60, indoor: true },
  { id: pid(12), name: "Parc Jarry", category: "park", tags: ["outdoors", "free"], lat: 45.534, lng: -73.628, address: "285 Rue Faillon O", priceLevel: 1, photoUrl: photo("jarry"), hours: every("09:00", "23:00"), typicalDurationMin: 60, indoor: false },
  { id: pid(13), name: "Marché Atwater", category: "activity", tags: ["markets"], lat: 45.481, lng: -73.577, address: "138 Av. Atwater", priceLevel: 2, photoUrl: photo("atwater"), hours: every("09:00", "18:00"), typicalDurationMin: 60, indoor: true },
  { id: pid(14), name: "Pikolo Espresso Bar", category: "cafe", tags: ["coffee"], lat: 45.51, lng: -73.573, address: "3418 Av. du Parc", priceLevel: 2, photoUrl: photo("pikolo"), hours: every("08:00", "18:00"), typicalDurationMin: 60, indoor: true },
  { id: pid(15), name: "Biodôme", category: "activity", tags: ["museums", "nature"], lat: 45.5597, lng: -73.5499, address: "4777 Av. Pierre-De Coubertin", priceLevel: 3, photoUrl: photo("biodome"), hours: every("09:00", "17:00"), typicalDurationMin: 120, indoor: true },
  { id: pid(16), name: "La Banquise", category: "restaurant", tags: ["cheap-eats", "iconic", "late-night", "quebecois"], lat: 45.5255, lng: -73.5751, address: "994 Rue Rachel E", priceLevel: 1, photoUrl: photo("banquise"), hours: every("09:00", "23:00"), typicalDurationMin: 60, indoor: true },
  { id: pid(17), name: "Lachine Canal path", category: "park", tags: ["outdoors", "free"], lat: 45.485, lng: -73.57, address: "Canal de Lachine", priceLevel: 1, photoUrl: photo("lachine"), hours: every("09:00", "22:00"), typicalDurationMin: 90, indoor: false },
  { id: pid(18), name: "Oratoire Saint-Joseph", category: "viewpoint", tags: ["views", "free"], lat: 45.4925, lng: -73.618, address: "3800 Chem. Queen Mary", priceLevel: 1, photoUrl: photo("oratoire"), hours: every("09:00", "21:00"), typicalDurationMin: 60, indoor: false },
  { id: pid(19), name: "Centre des sciences", category: "activity", tags: ["museums"], lat: 45.5054, lng: -73.5513, address: "2 Rue de la Commune O", priceLevel: 3, photoUrl: photo("sciences"), hours: every("10:00", "17:00"), typicalDurationMin: 120, indoor: true },
  { id: pid(20), name: "Le Darling", category: "bar", tags: ["bars", "coffee", "brunch"], lat: 45.5187, lng: -73.5879, address: "4328 Boul. Saint-Laurent", priceLevel: 2, photoUrl: photo("darling"), hours: every("08:00", "03:00"), typicalDurationMin: 90, indoor: true },
];
