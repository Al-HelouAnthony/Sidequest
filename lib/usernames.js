/**
 * @usernames for the friend search. Owner: Anthony. Pure (no I/O), safe on server and client.
 *
 * Tonight they are COMPUTED from first names (no database column): @anthony, @adel, @maya…
 * The order is stable (users sorted by id), so a person keeps their username as long as the
 * names don't change; a duplicate first name gets a number (@sam, @sam2).
 * After the hackathon: store it in users.username (unique), let people pick it at onboarding.
 */

const MIN = 3;
const MAX = 20;

/** "Léa" → "lea", "Jean-Michel" → "jeanmichel". @param {string} s */
const plain = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * The username a name asks for, before de-duplication: the first name, ASCII, [a-z0-9_], 3–20 chars.
 * @param {string} name
 */
export function usernameBase(name) {
  const first = plain(String(name ?? "").trim().split(/\s+/)[0] ?? "").replace(/[^a-z0-9_]/g, "");
  const base = first.slice(0, MAX);
  return base.length >= MIN ? base : (base + "friend").slice(0, MAX);
}

/**
 * Unique usernames for a set of users: id → username. Stable: sorted by id, first come keeps the
 * plain name, later ones get 2, 3, …
 * @param {{ id: string, name: string }[]} users
 * @returns {Map<string, string>}
 */
export function assignUsernames(users) {
  const taken = new Set();
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const u of [...users].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const base = usernameBase(u.name);
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base.slice(0, MAX - String(n).length)}${n}`;
    taken.add(name);
    out.set(u.id, name);
  }
  return out;
}

/**
 * Does this person match what was typed in the search bar? "@an", "an", "Maya", "lé" all work:
 * username prefix, or the start of any word of the name; case- and accent-insensitive.
 * @param {{ name: string, username: string }} person
 * @param {string} query
 */
export function matchesQuery(person, query) {
  const q = plain(String(query ?? "").trim().replace(/^@+/, ""));
  if (!q) return true;
  if (person.username.startsWith(q)) return true;
  return plain(person.name).split(/[\s'-]+/).some((word) => word.startsWith(q));
}
