import { describe, expect, it } from "vitest";
import { assignUsernames, matchesQuery, usernameBase } from "./usernames";

describe("usernameBase", () => {
  it("first name, accents stripped, lowercase, [a-z0-9_]", () => {
    expect(usernameBase("Anthony Helou")).toBe("anthony");
    expect(usernameBase("Léa")).toBe("lea");
    expect(usernameBase("Jean-Michel Tremblay")).toBe("jeanmichel");
    expect(usernameBase("Mohammad Majzoub")).toBe("mohammad");
  });

  it("too short or empty → padded / fallback, never under 3 or over 20", () => {
    expect(usernameBase("Al")).toBe("alfriend");
    expect(usernameBase("")).toBe("friend");
    expect(usernameBase("Bartholomew-Maximilian-Alexander").length).toBe(20);
  });
});

describe("assignUsernames", () => {
  const team = [
    { id: "9dd740c1-8454-48c9-892a-8bb514a02d05", name: "Anthony Helou" },
    { id: "69d6c5c7-7754-4e76-8926-70f128b4a07a", name: "Adel Khalife" },
    { id: "2211bd7e-0cf3-450d-9719-ecb344fefdb4", name: "Mohammad Majzoub" },
    { id: "dcfe27f5-9a20-403e-a281-5350a6223387", name: "Oscar Moubarak" },
  ];

  it("our 4 real accounts get their first names", () => {
    const m = assignUsernames(team);
    expect(team.map((u) => m.get(u.id))).toEqual(["anthony", "adel", "mohammad", "oscar"]);
  });

  it("duplicates get numbers, decided by id order (stable whatever the input order)", () => {
    const a = { id: "1", name: "Sam A" };
    const b = { id: "2", name: "Sam B" };
    expect(assignUsernames([b, a])).toEqual(assignUsernames([a, b]));
    expect(assignUsernames([a, b]).get("1")).toBe("sam");
    expect(assignUsernames([a, b]).get("2")).toBe("sam2");
  });

  it("all unique", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i).padStart(3, "0"), name: "Maya" }));
    expect(new Set(assignUsernames(many).values()).size).toBe(30);
  });
});

describe("matchesQuery", () => {
  const lea = { name: "Léa Tremblay", username: "lea" };
  it("username prefix with or without @, any name word, accent-insensitive", () => {
    expect(matchesQuery(lea, "@le")).toBe(true);
    expect(matchesQuery(lea, "LÉA")).toBe(true);
    expect(matchesQuery(lea, "trem")).toBe(true);
    expect(matchesQuery(lea, "ea")).toBe(false); // not a prefix
    expect(matchesQuery(lea, "")).toBe(true);
  });
});
