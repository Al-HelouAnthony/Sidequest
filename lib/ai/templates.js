/**
 * Template caption: the line of text on each feed card. Plain code, no AI.
 * Owner: Mhammad. Called by Anthony's engine (lib/engine/index.js) and Adel's mocks (lib/mocks/feedCards.js).
 * Pieces are joined with " · ". Must never throw and never return an empty string.
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

/**
 * "You and Maya are both free", or null when no friend is free.
 * @param {string[]} names
 */
function whoPart(names) {
  if (names.length === 0) return null;
  if (names.length === 1) return `You and ${names[0]} are both free`;
  return `You, ${names.slice(0, -1).join(", ")} and ${names.at(-1)} are all free`;
}

/**
 * "4°C, cloudy". Always shows the real temperature when there is one.
 * @param {{ icon: string, tempC: number }} weather
 */
function weatherPart({ icon, tempC }) {
  const word = Object.hasOwn(WEATHER_WORDS, icon) ? WEATHER_WORDS[icon] : null;
  if (!Number.isFinite(tempC)) return word;
  const temp = `${Math.round(tempC)}°C`;
  return word ? `${temp}, ${word}` : temp;
}

/**
 * A short clothing tip from the temperature and the weather.
 * @param {{ icon: string, tempC: number }} weather
 */
function clothingTip({ icon, tempC }) {
  const hasTemp = Number.isFinite(tempC);
  if (hasTemp && tempC <= -10) return "Bundle up: hat and gloves";
  if (icon === "snow") return "Wear warm boots";
  if (icon === "rain" || icon === "storm") return "Bring an umbrella";
  if (!hasTemp) return null;
  if (tempC <= 0) return "Get your winter coat";
  if (tempC <= 10) return "Get your coat";
  if (tempC <= 18) return "A light jacket will do";
  return "T-shirt weather";
}

/**
 * "~12 min for everyone" (longest trip in the group), or "~8 min away" when alone.
 * @param {number} myTravelMin
 * @param {{ travelMin: number }[]} friends
 */
function travelPart(myTravelMin, friends) {
  const longest = Math.max(myTravelMin, ...friends.map((f) => f.travelMin));
  if (!Number.isFinite(longest)) return null;
  return friends.length > 0 ? `~${longest} min for everyone` : `~${longest} min away`;
}

/**
 * @param {Pick<import("@/types/feed").FeedCardT, "friends" | "weather" | "myTravelMin">} card
 * @returns {string}
 */
export function templateCaption(card) {
  const friends = card.friends ?? [];
  const weather = card.weather ?? { icon: "", tempC: NaN };
  const who = whoPart(friends.map((f) => f.name));
  const sky = weatherPart(weather);
  const tip = clothingTip(weather);
  const travel = travelPart(card.myTravelMin, friends);

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
