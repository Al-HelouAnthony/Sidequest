/**
 * Specific things people search for ("bowling", "museum", "pizza", "rooftop"…). Plain code, no AI.
 * Owner: Mhammad. Used by lib/ai/search.js (recognise the words) and /api/search (keep matching places).
 *
 * Each term:
 *  - words:    what the user may type (English + French, accents/capitals ignored, whole words).
 *  - match:    words to look for in a place's NAME or TAGS. Richer tags from Adel = better matches, automatically.
 *  - category: the broad category to fall back to when no place matches ("No bowling nearby · showing activities").
 */
import { normalize } from "./normalize";

/** @typedef {{ id: string, label: string, category: import("@/types/domain").CategoryT, words: string[], match: string[] }} SearchTerm */

/** @type {SearchTerm[]} */
export const SEARCH_TERMS = [
  // --- Culture & activities ---
  { id: "museum", label: "Museums", category: "activity", words: ["museum", "museums", "musee", "musees", "exhibit", "exhibition", "exposition"], match: ["museums", "museum", "musee", "biodome", "planetarium", "pointe a calliere", "centre des sciences"] },
  { id: "art", label: "Art", category: "activity", words: ["art", "arts", "gallery", "galleries", "galerie"], match: ["art", "galerie", "gallery", "beaux arts"] },
  { id: "cinema", label: "Movies", category: "activity", words: ["cinema", "movie", "movies", "film", "films"], match: ["cinema", "cine", "movies"] },
  { id: "market", label: "Markets", category: "activity", words: ["market", "markets", "marche", "farmers market"], match: ["markets", "marche", "market"] },
  { id: "science", label: "Science", category: "activity", words: ["science", "planetarium", "stars"], match: ["science", "sciences", "planetarium"] },
  { id: "animals", label: "Animals", category: "activity", words: ["zoo", "animals", "biodome", "aquarium"], match: ["biodome", "zoo", "aquarium", "animals"] },
  { id: "garden", label: "Gardens", category: "activity", words: ["garden", "gardens", "botanical", "jardin", "botanique"], match: ["jardin", "garden", "botanique"] },
  { id: "church", label: "Churches", category: "viewpoint", words: ["church", "basilica", "cathedral", "oratory", "eglise", "basilique"], match: ["basilique", "eglise", "cathedrale", "oratoire", "church"] },
  { id: "history", label: "History", category: "activity", words: ["history", "historic", "heritage", "histoire"], match: ["pointe a calliere", "mccord", "histoire", "history"] },
  { id: "live-music", label: "Live music", category: "bar", words: ["live music", "jazz", "concert", "concerts", "gig", "band"], match: ["live music", "jazz", "concert"] },
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
  // --- Food ---
  { id: "coffee", label: "Coffee", category: "cafe", words: ["coffee", "latte", "espresso", "cappuccino"], match: ["coffee", "espresso", "cafe"] },
  { id: "brunch", label: "Brunch", category: "cafe", words: ["brunch", "breakfast", "dejeuner"], match: ["brunch", "breakfast"] },
  { id: "bakery", label: "Bakeries", category: "cafe", words: ["bakery", "pastry", "pastries", "croissant", "boulangerie", "patisserie"], match: ["boulangerie", "patisserie", "bakery", "bagel"] },
  { id: "bubble-tea", label: "Bubble tea", category: "cafe", words: ["bubble tea", "boba"], match: ["bubble", "boba", "perles"] },
  { id: "dessert", label: "Dessert", category: "cafe", words: ["dessert", "desserts", "ice cream", "gelato", "creme glacee"], match: ["dessert", "glace", "gelato", "creme glacee"] },
  { id: "pizza", label: "Pizza", category: "restaurant", words: ["pizza", "pizzas", "pizzeria"], match: ["pizza", "pizzeria"] },
  { id: "japanese", label: "Japanese", category: "restaurant", words: ["japanese", "sushi", "ramen", "izakaya", "japonais"], match: ["japanese", "japonais", "sushi", "ramen", "izakaya"] },
  { id: "indian", label: "Indian", category: "restaurant", words: ["indian", "curry", "tandoori", "indien", "indienne"], match: ["indian", "indien", "indienne", "tandoori", "curry", "masala"] },
  { id: "thai", label: "Thai", category: "restaurant", words: ["thai", "thailandais", "pad thai"], match: ["thai", "thailandais"] },
  { id: "vietnamese", label: "Vietnamese", category: "restaurant", words: ["vietnamese", "pho", "banh mi", "vietnamien"], match: ["vietnamese", "vietnamien", "pho", "banh mi"] },
  { id: "chinese", label: "Chinese", category: "restaurant", words: ["chinese", "dumplings", "dim sum", "chinois"], match: ["chinese", "chinois", "dumpling", "dim sum"] },
  { id: "korean", label: "Korean", category: "restaurant", words: ["korean", "kbbq", "coreen"], match: ["korean", "coreen"] },
  { id: "mexican", label: "Mexican", category: "restaurant", words: ["mexican", "tacos", "taco", "burrito", "mexicain"], match: ["mexican", "mexicain", "mexicaine", "taco", "tacos", "taqueria"] },
  { id: "middle-eastern", label: "Middle Eastern", category: "restaurant", words: ["shawarma", "falafel", "lebanese", "libanais"], match: ["shawarma", "falafel", "lebanese", "libanais"] },
  { id: "italian", label: "Italian", category: "restaurant", words: ["italian", "pasta", "italien", "trattoria"], match: ["italian", "italien", "pasta", "trattoria"] },
  { id: "burger", label: "Burgers", category: "restaurant", words: ["burger", "burgers"], match: ["burger", "burgers"] },
  { id: "poutine", label: "Poutine", category: "restaurant", words: ["poutine"], match: ["poutine", "banquise"] },
  { id: "bagel", label: "Bagels", category: "cafe", words: ["bagel", "bagels"], match: ["bagel", "bagels"] },
  { id: "smoked-meat", label: "Smoked meat", category: "restaurant", words: ["smoked meat", "deli", "schwartz"], match: ["smoked meat", "deli"] },
  { id: "vegan", label: "Vegan", category: "restaurant", words: ["vegan", "vegetarian", "vegetarien", "vegetalien"], match: ["vegan", "vegetarien", "vegetalien", "vegetarian"] },
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
