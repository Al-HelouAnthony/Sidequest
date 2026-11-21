/**
 * Cuisines for search (N1). Owner: Adel. Pure data + helpers, safe on the client.
 *
 * - id:           the filter value (FeedFilters.cuisine) and the tag put on places of that cuisine.
 * - label:        for the search summary / chips ("Indian").
 * - searchWords:  what people type (English + French), for parseSearch (Mhammad). Lowercase, no accents needed.
 * - nameWords:    whole words found in restaurant NAMES in the city health registry (public.businesses),
 *                 e.g. "SINGH'S CUISINE INDIENNE". List every form (indien, indienne…): matching is
 *                 whole-word, accent- and case-insensitive. Letters only (they go into a database filter).
 * - knownNames:   well-known restaurants whose name has no cuisine word ("O Four", "Boustan"). Matched as a
 *                 whole phrase, so "o four" never matches "four à bois" or "Carrefour". Letters and single
 *                 spaces only. Never add a generic word alone ("four", "grill", "express").
 *
 * The registry has no cuisine column: guessing from names is all we can do, so a place whose name
 * doesn't say its cuisine won't be found (and that's OK, it's labelled "hours not verified" anyway).
 */

/** @typedef {{ id: string, label: string, searchWords: string[], nameWords: string[], knownNames: string[] }} CuisineT */

/** @type {CuisineT[]} */
export const CUISINES = [
  { id: "indian", label: "Indian", searchWords: ["indian", "indien", "indienne", "curry", "tandoori", "biryani", "butter chicken", "naan"],
    nameWords: ["indien", "indienne", "indiens", "indian", "inde", "india", "tandoori", "curry", "masala", "punjab", "punjabi", "biryani", "dhaba", "tikka", "bombay", "delhi", "mumbai", "himalaya", "thali"] },
  { id: "chinese", label: "Chinese", searchWords: ["chinese", "chinois", "dim sum", "dumplings", "dumpling", "szechuan", "sichuan", "hot pot"],
    nameWords: ["chinois", "chinoise", "chinese", "szechuan", "sichuan", "dumpling", "dumplings", "wonton", "cantonais", "hunan", "shanghai", "pekin", "beijing", "dimsum"] },
  { id: "japanese", label: "Japanese", searchWords: ["japanese", "japonais", "sushi", "ramen", "izakaya", "udon"],
    nameWords: ["japonais", "japonaise", "japanese", "sushi", "sushis", "ramen", "izakaya", "udon", "yakitori", "tokyo", "osaka", "kyoto", "teriyaki"] },
  { id: "korean", label: "Korean", searchWords: ["korean", "coreen", "coréen", "bbq coreen", "bibimbap", "kimchi"],
    nameWords: ["coreen", "coreenne", "korean", "seoul", "kimchi", "bibimbap", "bulgogi"] },
  { id: "vietnamese", label: "Vietnamese", searchWords: ["vietnamese", "vietnamien", "pho", "banh mi", "bun"],
    nameWords: ["vietnamien", "vietnamienne", "vietnamese", "vietnam", "pho", "banh", "saigon", "hanoi"] },
  { id: "thai", label: "Thai", searchWords: ["thai", "thaï", "thailandais", "pad thai"],
    nameWords: ["thai", "thaï", "thailandais", "thailandaise", "bangkok", "siam"] },
  { id: "italian", label: "Italian", searchWords: ["italian", "italien", "italienne", "pasta", "pâtes", "pates", "trattoria"],
    nameWords: ["italien", "italienne", "italiano", "italiana", "italian", "trattoria", "osteria", "pasta", "pastaria", "ristorante", "risotto"] },
  { id: "pizza", label: "Pizza", searchWords: ["pizza", "pizzeria", "pizzas"],
    nameWords: ["pizza", "pizzas", "pizzeria"] },
  { id: "mexican", label: "Mexican", searchWords: ["mexican", "mexicain", "tacos", "taco", "burrito", "taqueria"],
    nameWords: ["mexicain", "mexicaine", "mexican", "mexico", "tacos", "taco", "taqueria", "burrito", "burritos", "cantina"] },
  { id: "latin", label: "Latin American", searchWords: ["latin", "latino", "arepa", "arepas", "empanada", "pupusa", "peruvian", "colombian", "venezuelan"],
    nameWords: ["arepa", "arepas", "arepera", "empanada", "empanadas", "pupuseria", "pupusas", "peruvien", "peruvienne", "colombien", "colombienne", "venezuelien", "salvadorien", "latino", "latina"] },
  { id: "middle-eastern", label: "Middle Eastern", searchWords: ["lebanese", "libanais", "middle eastern", "shawarma", "falafel", "syrian", "persian", "kebab"],
    nameWords: ["libanais", "libanaise", "lebanese", "liban", "beirut", "beyrouth", "shawarma", "chawarma", "falafel", "syrien", "syrienne", "alep", "persan", "persane", "kebab", "kabab", "mezze", "damas"],
    // Checked against the registry: whole-phrase matches only hit these chains (not "Amira", "Carrefour", "Four Seasons").
    knownNames: ["o four", "boustan", "amir", "basha", "daou"] },
  { id: "greek", label: "Greek", searchWords: ["greek", "grec", "grecque", "souvlaki", "gyro"],
    nameWords: ["grec", "grecque", "greek", "souvlaki", "gyro", "gyros", "athenes", "olympia", "taverna"] },
  { id: "french", label: "French", searchWords: ["french", "francais", "français", "bistro", "brasserie"],
    nameWords: ["bistro", "bistrot", "brasserie", "francais", "francaise", "creperie"] },
  { id: "portuguese", label: "Portuguese", searchWords: ["portuguese", "portugais", "piri piri", "churrasqueira"],
    nameWords: ["portugais", "portugaise", "portuguese", "portugal", "churrasqueira", "lisboa", "lisbonne"] },
  { id: "caribbean", label: "Caribbean", searchWords: ["caribbean", "caribeen", "haitian", "haitien", "jamaican", "griot"],
    nameWords: ["caribeen", "caribeenne", "caribbean", "antillais", "haitien", "haitienne", "jamaicain", "jamaican", "creole", "griot"] },
  { id: "quebecois", label: "Québécois", searchWords: ["poutine", "quebecois", "québécois", "casse-croute", "smoked meat"],
    nameWords: ["poutine", "poutinerie", "quebecois", "quebecoise", "patate", "frites", "friterie", "cabane"] },
  { id: "burger", label: "Burgers", searchWords: ["burger", "burgers", "hamburger"],
    nameWords: ["burger", "burgers", "hamburger", "hamburgers"] },
  { id: "deli", label: "Deli", searchWords: ["deli", "delicatessen", "smoked meat", "sandwich"],
    nameWords: ["deli", "delicatessen", "charcuterie"] },
  { id: "vegetarian", label: "Vegetarian", searchWords: ["vegetarian", "vegan", "vegetarien", "végétarien", "végane", "vegane", "plant based"],
    nameWords: ["vegetarien", "vegetarienne", "vegan", "vegane", "vegetal", "vege"] },
];

for (const c of CUISINES) c.knownNames ??= []; // same shape for every cuisine

/** @type {string[]} */
export const CUISINE_IDS = CUISINES.map((c) => c.id);

/** Everything to look for in registry names for this cuisine (database pre-filter). @param {CuisineT} c */
export const registryTerms = (c) => [...c.nameWords, ...c.knownNames];

/** @param {string} id */
export const findCuisine = (id) => CUISINES.find((c) => c.id === id) ?? null;

/** Names of things that aren't sit-down/take-out restaurants, even when the registry type says "Restaurant". */
export const EXCLUDED_NAME_WORDS = ["epicerie", "depanneur", "marche", "supermarche", "traiteur", "boulangerie", "patisserie", "cafeteria", "garderie", "ecole", "cpe", "distributrice", "entrepot", "association"];

/** "Café Névé" → "cafe neve": lowercase, no accents, punctuation → spaces. */
export const normalizeName = (s) =>
  ` ${String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

const hasWord = (normalized, word) => normalized.includes(` ${normalizeName(word).trim()} `);

/** Grocery stores, canteens… even when the registry type says "Restaurant". @param {string} name */
export const isExcludedName = (name) => {
  const n = normalizeName(name);
  return EXCLUDED_NAME_WORDS.some((w) => hasWord(n, w));
};

/**
 * Does the name contain every one of these words as a whole word (accents/case ignored)?
 * "SCHWARTZ'S CHARCUTERIE" has "schwartz"; "O FOUR ST JEAN" has "o" + "four"; "CARREFOUR" has neither.
 * @param {string} name @param {string[]} words
 */
export const nameHasAllWords = (name, words) => {
  const n = normalizeName(name);
  return words.length > 0 && words.every((w) => hasWord(n, w));
};

/**
 * Cuisine ids a restaurant name points to (may be several: "PIZZERIA ITALIENNE" → pizza, italian).
 * Excluded names (épicerie…) → [].
 * @param {string} name
 * @returns {string[]}
 */
export function cuisinesForName(name) {
  const n = normalizeName(name);
  if (isExcludedName(name)) return [];
  return CUISINES.filter((c) => c.nameWords.some((w) => hasWord(n, w)) || c.knownNames.some((k) => hasWord(n, k))).map((c) => c.id);
}
