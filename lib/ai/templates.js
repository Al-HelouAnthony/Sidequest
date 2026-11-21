/**
 * Template caption: the line of text on each feed card. Plain code, no AI.
 * Owner: Mhammad. Called by Anthony's engine (lib/engine/index.js) and Adel's mocks (lib/mocks/feedCards.js).
 * Also the fallback when Claude captions fail. Pieces are joined with " · ".
 * Must never throw and never return an empty string.
 */

/** Oscar's card shows 2 lines of caption, about 90 characters. */
export const MAX_CAPTION_CHARS = 90;

/** A word for each weather type in types/domain.js (WeatherIcon). */
const WEATHER_WORDS = {
  sun: "sunny",
  partly: "partly cloudy",
  cloud: "cloudy",
  rain: "rainy",
  snow: "snowy",
  storm: "stormy",
  fog: "foggy",
};

/** Several wordings per part so cards don't all read the same. {x} gets filled in. */
export const WORDINGS = {
  oneFriend: ["You and {a} are both free", "{a} is free too", "Free at the same time as {a}", "{a} can make it too"],
  manyFriends: ["You, {list} are all free", "{list} are free too", "{list} can all make it"],
  weather: ["{temp}, {word}", "{word}, {temp}", "{temp} and {word}"],
  tips: {
    deepCold: ["Bundle up: hat and gloves", "Hat, gloves, big coat", "Dress for the deep cold"],
    snow: ["Wear warm boots", "Boots on", "Snow boots weather"],
    rain: ["Bring an umbrella", "Umbrella time", "Grab a rain jacket"],
    freezing: ["Get your winter coat", "Winter coat weather", "Dress warm"],
    cold: ["Get your coat", "Grab a jacket", "Coat weather"],
    cool: ["A light jacket will do", "Light layers", "Sweater weather"],
    warm: ["T-shirt weather", "Dress light", "Leave the jacket home"],
  },
  travelGroup: ["~{min} min for everyone", "Everyone's ~{min} min away", "Max ~{min} min for the group"],
  travelAlone: ["~{min} min away", "~{min} min from you", "A ~{min} min trip"],
};

/**
 * Same text in → same number out. Used to pick a wording without randomness.
 * @param {string} text
 */
function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + /** @type {number} */ (ch.codePointAt(0))) >>> 0;
  return h;
}

/**
 * Pick one wording. `offset` makes each part pick independently.
 * @param {string[]} list
 * @param {number} seed
 * @param {number} offset
 */
function pick(list, seed, offset) {
  return list[(seed + offset) % list.length];
}

/**
 * Fill {a}, {list}, {temp}… in a wording.
 * @param {string} wording
 * @param {Record<string, string | number>} values
 */
function fill(wording, values) {
  return wording.replace(/\{(\w+)\}/g, (_, key) => String(values[key]));
}

/**
 * @param {string[]} names
 * @param {number} seed
 */
function whoPart(names, seed) {
  if (names.length === 0) return null;
  if (names.length === 1) return fill(pick(WORDINGS.oneFriend, seed, 0), { a: names[0] });
  const list = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return fill(pick(WORDINGS.manyFriends, seed, 0), { list });
}

/**
 * @param {{ icon: string, tempC: number }} weather
 * @param {number} seed
 */
function weatherPart({ icon, tempC }, seed) {
  const word = Object.hasOwn(WEATHER_WORDS, icon) ? WEATHER_WORDS[/** @type {keyof typeof WEATHER_WORDS} */ (icon)] : null;
  if (!Number.isFinite(tempC)) return word;
  const temp = `${Math.round(tempC)}°C`;
  return word ? fill(pick(WORDINGS.weather, seed, 1), { temp, word }) : temp;
}

/**
 * Which kind of clothing tip fits this weather.
 * @param {{ icon: string, tempC: number }} weather
 * @returns {keyof typeof WORDINGS.tips | null}
 */
function tipKind({ icon, tempC }) {
  const hasTemp = Number.isFinite(tempC);
  if (hasTemp && tempC <= -10) return "deepCold";
  if (icon === "snow") return "snow";
  if (icon === "rain" || icon === "storm") return "rain";
  if (!hasTemp) return null;
  if (tempC <= 0) return "freezing";
  if (tempC <= 10) return "cold";
  if (tempC <= 18) return "cool";
  return "warm";
}

/**
 * @param {{ icon: string, tempC: number }} weather
 * @param {number} seed
 */
function clothingTip(weather, seed) {
  const kind = tipKind(weather);
  return kind ? pick(WORDINGS.tips[kind], seed, 2) : null;
}

/**
 * @param {number} myTravelMin
 * @param {{ travelMin: number }[]} friends
 * @param {number} seed
 */
function travelPart(myTravelMin, friends, seed) {
  const longest = Math.max(myTravelMin, ...friends.map((f) => f.travelMin));
  if (!Number.isFinite(longest)) return null;
  const list = friends.length > 0 ? WORDINGS.travelGroup : WORDINGS.travelAlone;
  return fill(pick(list, seed, 3), { min: longest });
}

/**
 * @param {Pick<import("@/types/feed").FeedCardT, "friends" | "weather" | "myTravelMin">} card
 * @returns {string}
 */
export function templateCaption(card) {
  const friends = card.friends ?? [];
  const weather = card.weather ?? { icon: "", tempC: NaN };
  const names = friends.map((f) => f.name);
  const seed = hash(`${names.join(",")}|${weather.icon}|${Math.round(weather.tempC)}|${card.myTravelMin}`);

  const who = whoPart(names, seed);
  const sky = weatherPart(weather, seed);
  const tip = clothingTip(weather, seed);
  const travel = travelPart(card.myTravelMin, friends, seed);

  // Too long for the card? Drop travel first, then the tip. Friends and weather always stay.
  const versions = [
    [who, sky, tip, travel],
    [who, sky, tip],
    [who, sky],
  ];
  for (const parts of versions) {
    const text = parts.filter(Boolean).join(" · ");
    if (text.length <= MAX_CAPTION_CHARS) return text || "Worth a look";
  }
  return [who, sky].filter(Boolean).join(" · ") || "Worth a look";
}
