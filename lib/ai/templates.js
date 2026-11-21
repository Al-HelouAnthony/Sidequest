/**
 * Template caption: used when Claude is slow, fails, or returns invalid JSON.
 * Owner: Mhammad. Must never throw and never return an empty string.
 *
 * @param {Pick<import("@/types/feed").FeedCardT, "friends" | "weather" | "myTravelMin">} card
 * @returns {string}
 */
export function templateCaption(card) {
  const names = card.friends.map((f) => f.name);
  const who =
    names.length === 0
      ? "You're free"
      : names.length === 1
        ? `You and ${names[0]} are both free`
        : `You, ${names.slice(0, -1).join(", ")} and ${names.at(-1)} are all free`;
  const sky =
    card.weather.icon === "rain" || card.weather.icon === "storm"
      ? "it's a cozy indoor pick"
      : card.weather.icon === "sun"
        ? "it's sunny"
        : `it's ${card.weather.tempC}°C`;
  const maxTravel = Math.max(card.myTravelMin, ...card.friends.map((f) => f.travelMin));
  return `${who}, ${sky}, and it's ~${maxTravel} min for everyone.`;
}
