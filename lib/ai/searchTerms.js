/**
 * Specific things people search for ("bowling", "museum", "pizza", "rooftop"…). Plain code, no AI.
 * Owner: Mhammad. Used by lib/ai/search.js (recognise the words) and /api/search (keep matching places).
 *
 * Each term:
 *  - words:    what the user may type (English + French, accents/capitals ignored, whole words).
 *  - match:    words to look for in a place's NAME or TAGS. Richer tags from Adel = better matches, automatically.
 *  - category: the broad category to fall back to when no place matches ("No bowling nearby · showing activities").
 *  - cuisine:  set for cuisines (N1). /api/search then also pulls matching restaurants from the city registry.
 *
 * Cuisines come from Adel's lib/cuisines.js (one source of truth): his searchWords are what people type,
 * and places match on the cuisine id (a tag Adel puts on curated + registry places) or his nameWords.
 */
import { CUISINES } from "@/lib/cuisines";
import { normalize } from "./normalize";

/**
 * @typedef {{ id: string, label: string, category: import("@/types/domain").CategoryT, words: string[],
 *   match: string[], cuisine?: string }} SearchTerm
 */

/** Adel's cuisines as search terms. @type {SearchTerm[]} */
const CUISINE_TERMS = CUISINES.map((c) => ({
  id: c.id,
  label: c.label,
  category: /** @type {const} */ ("restaurant"),
  words: c.searchWords,
  match: [c.id, ...c.nameWords],
  cuisine: c.id,
}));

/** @type {SearchTerm[]} */
const OTHER_TERMS = [
  // --- Culture & activities ---
  // "exhibit/exhibition/expo" are event words now (search.js): dated expos come from Adel's events.
  { id: "museum", label: "Museums", category: "activity", words: ["museum", "museums", "musee", "musees"], match: ["museums", "museum", "musee", "biodome", "planetarium", "pointe a calliere", "centre des sciences"] },
  { id: "art", label: "Art", category: "activity", words: ["art", "arts", "gallery", "galleries", "galerie"], match: ["art", "galerie", "gallery", "beaux arts"] },
  { id: "cinema", label: "Movies", category: "activity", words: ["cinema", "movie", "movies", "film", "films"], match: ["cinema", "cine", "movies", "film", "films"] },
  { id: "market", label: "Markets", category: "activity", words: ["market", "markets", "marche", "farmers market"], match: ["markets", "marche", "market"] },
  { id: "science", label: "Science", category: "activity", words: ["science", "planetarium", "stars"], match: ["science", "sciences", "planetarium"] },
  { id: "animals", label: "Animals", category: "activity", words: ["zoo", "animals", "biodome", "aquarium"], match: ["biodome", "zoo", "aquarium", "animals"] },
  { id: "garden", label: "Gardens", category: "activity", words: ["garden", "gardens", "botanical", "jardin", "botanique"], match: ["jardin", "garden", "botanique"] },
  { id: "church", label: "Churches", category: "viewpoint", words: ["church", "basilica", "cathedral", "oratory", "eglise", "basilique"], match: ["basilique", "eglise", "cathedrale", "oratoire", "church"] },
  { id: "history", label: "History", category: "activity", words: ["history", "historic", "heritage", "histoire"], match: ["pointe a calliere", "mccord", "histoire", "history"] },
  // Concerts are city events first (Adel's events, tag "concert"), so nothing found → fall back to Events.
  { id: "live-music", label: "Live music", category: "event", words: ["live music", "jazz", "concert", "concerts", "gig", "band"], match: ["live music", "jazz", "concert", "music"] },
  // Event types (Adel tags events with these): exact searches over the city events.
  { id: "exhibition", label: "Exhibitions", category: "event", words: ["expo", "expos", "exhibit", "exhibition", "exhibitions", "exposition", "expositions"], match: ["exhibition", "exposition", "expo", "exhibit"] },
  { id: "festival", label: "Festivals", category: "event", words: ["festival", "festivals"], match: ["festival", "festivals"] },
  { id: "dance", label: "Dance", category: "event", words: ["danse", "dance", "dance show"], match: ["dance", "danse"] },
  { id: "circus", label: "Circus", category: "event", words: ["circus", "cirque"], match: ["circus", "cirque"] },
  { id: "spoken-word", label: "Spoken word", category: "event", words: ["spoken word", "poetry", "slam", "poesie"], match: ["spoken word", "poetry", "slam", "poesie"] },
  { id: "comedy", label: "Comedy", category: "event", words: ["comedy", "stand up", "standup", "humour"], match: ["comedy", "humour", "comedie"] },
  { id: "theatre", label: "Theatre", category: "event", words: ["theatre", "theater", "musical"], match: ["theatre", "theater"] },
  { id: "bowling", label: "Bowling", category: "activity", words: ["bowling", "quilles"], match: ["bowling", "quilles"] },
  { id: "karaoke", label: "Karaoke", category: "bar", words: ["karaoke"], match: ["karaoke"] },
  { id: "billiards", label: "Pool", category: "bar", words: ["pool", "billiards", "billard", "snooker"], match: ["billard", "billiards", "pool hall"] },
  { id: "escape-room", label: "Escape rooms", category: "activity", words: ["escape room", "escape rooms", "escape game"], match: ["escape"] },
  { id: "arcade", label: "Arcade", category: "activity", words: ["arcade", "video games", "arcades"], match: ["arcade"] },
  { id: "climbing", label: "Climbing", category: "activity", words: ["climbing", "bouldering", "escalade"], match: ["escalade", "climbing", "bloc"] },
  { id: "skating", label: "Skating", category: "activity", words: ["skating", "ice skating", "rink", "patin", "patinoire"], match: ["patin", "patinoire", "skating", "rink"] },
  { id: "board-games", label: "Board games", category: "cafe", words: ["board games", "board game", "boardgames", "jeux de societe"], match: ["board game", "jeux", "ludique"] },
  { id: "spa", label: "Spa", category: "activity", words: ["spa", "sauna", "thermal"], match: ["spa", "bain", "sauna", "thermal"] },
  { id: "hotel", label: "Hotels", category: "activity", words: ["hotel", "hotels", "hôtel", "hôtels"], match: ["hotel", "hotels"] },
  { id: "library", label: "Libraries", category: "activity", words: ["library", "libraries", "bibliotheque"], match: ["library", "bibliotheque"] },
  { id: "nightclub", label: "Nightclubs", category: "bar", words: ["nightclub", "nightclubs", "night club", "clubbing", "dancing", "boite de nuit"], match: ["nightclub", "clubbing", "dancing"] },
  { id: "minigolf", label: "Mini golf", category: "activity", words: ["minigolf", "mini golf", "mini putt"], match: ["minigolf", "mini golf"] },
  { id: "trampoline", label: "Trampoline", category: "activity", words: ["trampoline", "trampolines"], match: ["trampoline"] },
  { id: "water-park", label: "Water parks", category: "park", words: ["water park", "waterpark", "parc aquatique"], match: ["water park", "aquatique"] },
  // --- Food ---
  { id: "coffee", label: "Coffee", category: "cafe", words: ["coffee", "latte", "espresso", "cappuccino"], match: ["coffee", "espresso", "cafe"] },
  { id: "brunch", label: "Brunch", category: "cafe", words: ["brunch", "breakfast", "dejeuner"], match: ["brunch", "breakfast"] },
  { id: "bakery", label: "Bakeries", category: "cafe", words: ["bakery", "pastry", "pastries", "croissant", "boulangerie", "patisserie"], match: ["boulangerie", "patisserie", "bakery", "bagel"] },
  { id: "bubble-tea", label: "Bubble tea", category: "cafe", words: ["bubble tea", "boba"], match: ["bubble", "boba", "perles"] },
  { id: "dessert", label: "Dessert", category: "cafe", words: ["dessert", "desserts", "ice cream", "gelato", "creme glacee"], match: ["dessert", "glace", "gelato", "creme glacee"] },
  { id: "bagel", label: "Bagels", category: "cafe", words: ["bagel", "bagels"], match: ["bagel", "bagels"] },
  // Cuisines (pizza, Indian, burgers, Québécois/poutine, deli/smoked meat, vegetarian…) come from Adel's list below.
  // --- Drinks & nights out ---
  { id: "cocktails", label: "Cocktails", category: "bar", words: ["cocktail", "cocktails", "cocktail bar"], match: ["cocktails", "cocktail"] },
  { id: "wine", label: "Wine", category: "bar", words: ["wine", "wine bar", "vin", "bar a vin"], match: ["wine", "vin", "bar a vin"] },
  { id: "beer", label: "Beer", category: "bar", words: ["beer", "brewery", "microbrewery", "craft beer", "biere", "microbrasserie"], match: ["beer", "biere", "brewery", "brasserie", "microbrasserie"] },
  { id: "rooftop", label: "Rooftops", category: "bar", words: ["rooftop", "rooftops", "terrace", "terrasse", "patio"], match: ["rooftop", "terrasse", "terrace", "patio"] },
  { id: "late-night", label: "Late night", category: "bar", words: ["late night", "after midnight", "open late"], match: ["late night"] },
  // --- Outdoors ---
  { id: "hike", label: "Hikes", category: "park", words: ["hike", "hiking", "trail", "trails", "sentier"], match: ["mont royal", "sentier", "trail", "nature", "path"] },
  { id: "lookout", label: "Lookouts", category: "viewpoint", words: ["lookout", "belvedere", "panorama"], match: ["views", "lookout", "belvedere", "observatoire"] },
  { id: "beach", label: "Beaches", category: "park", words: ["beach", "beaches", "plage"], match: ["beach", "plage"] },
];

/** Everything search understands as a specific thing. */
export const SEARCH_TERMS = [...OTHER_TERMS, ...CUISINE_TERMS];

/**
 * Specific terms found in an already-normalized query.
 * @param {string} text normalized query (see normalize.js)
 * @returns {SearchTerm[]}
 */
export function findTerms(text) {
  return SEARCH_TERMS.filter((t) => t.words.some((w) => text.includes(normalize(w))));
}

/**
 * Does this place match ANY of the terms? Looks at the place's name and tags (whole words).
 * @param {{ name: string, tags: string[] }} place
 * @param {SearchTerm[]} terms
 */
export function placeMatches(place, terms) {
  const hay = normalize(`${place.name} ${place.tags.join(" ")}`);
  return terms.some((t) => t.match.some((m) => hay.includes(normalize(m))));
}
