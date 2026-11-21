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

/** @type {import("@/types/domain").FriendshipT[]} */
export const mockFriendships = [
  { userId: DEMO_USER_ID, friendId: mockUsers[1].id, closeness: 3 },
  { userId: DEMO_USER_ID, friendId: mockUsers[2].id, closeness: 3 },
  { userId: DEMO_USER_ID, friendId: mockUsers[3].id, closeness: 2 },
  { userId: DEMO_USER_ID, friendId: mockUsers[4].id, closeness: 1 },
];
