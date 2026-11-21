/**
 * Text normalizer shared by search (lib/ai/search.js) and the specific terms (lib/ai/searchTerms.js).
 * Lowercase, no accents, words separated by single spaces, padded with spaces so `includes(" word ")`
 * only matches whole words. Hyphens become spaces ("cheap-eats" → "cheap eats", "Notre-Dame" → "notre dame").
 * @param {string} text
 */
export function normalize(text) {
  const plain = String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return ` ${plain.replace(/[^a-z0-9]+/g, " ").trim()} `;
}
