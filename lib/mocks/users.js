/**
 * MOCK DATA. Same IDs will be reused by scripts/seed.js so mock and real data line up.
 */

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

const avatar = (/** @type {string} */ name) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`;

/** @type {import("@/types/domain").UserT[]} */
export const mockUsers = [
  {
    id: DEMO_USER_ID,
    name: "Sam",
    avatarUrl: avatar("Sam"),
    homeLat: 45.5048, // near McGill
    homeLng: -73.5772,
    interests: ["coffee", "brunch", "views", "live-music", "cheap-eats"],
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Maya",
    avatarUrl: avatar("Maya"),
    homeLat: 45.5225, // Plateau
    homeLng: -73.5822,
    interests: ["coffee", "art", "views"],
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Karim",
    avatarUrl: avatar("Karim"),
    homeLat: 45.5243, // Mile End
    homeLng: -73.6003,
    interests: ["cheap-eats", "bars", "live-music"],
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    name: "Antoine",
    avatarUrl: avatar("Antoine"),
    homeLat: 45.4961, // Concordia / downtown west
    homeLng: -73.5783,
    interests: ["outdoors", "brunch", "museums"],
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    name: "Léa",
    avatarUrl: avatar("Léa"),
    homeLat: 45.4846, // Saint-Henri
    homeLng: -73.5825,
    interests: ["markets", "coffee", "outdoors"],
  },
];

const [, maya, karim, antoine, lea] = mockUsers.map((u) => u.id);

/**
 * The friend graph: [a, b, closeness]. Friendships are directed rows, so each pair is stored
 * both ways below. Everyone has friends (Maya on phone 2 needs a feed), and the non-Sam pairs
 * give each friend's feed some variety.
 * @type {[string, string, number][]}
 */
const pairs = [
  [DEMO_USER_ID, maya, 3],
  [DEMO_USER_ID, karim, 3],
  [DEMO_USER_ID, antoine, 2],
  [DEMO_USER_ID, lea, 1],
  [maya, karim, 3], // Plateau / Mile End neighbours
  [maya, lea, 2],
  [antoine, lea, 2],
];

/**
 * Both directions of every pair (same closeness). The seed (lib/data/seed.js) inserts exactly these rows.
 * @type {import("@/types/domain").FriendshipT[]}
 */
export const mockFriendships = pairs.flatMap(([a, b, closeness]) => [
  { userId: a, friendId: b, closeness },
  { userId: b, friendId: a, closeness },
]);
