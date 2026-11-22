// QA perf: per endpoint → cold (first call after a restart), warm p50/p95/max over 30 sequential calls,
// 10 concurrent calls, response size, and Supabase requests per call (counted from the local Kong access log).
// Local stack only (no network latency to Supabase: real numbers on Vercel are higher). Usage:
//   node scripts/qa-perf.mjs [label]  → qa/results/perf-<label>.json
import { execSync } from "node:child_process";
import fs from "node:fs";
import { qaSession } from "./qa-session.mjs";
import { localAdmin, qaId, QA } from "./qa-local.mjs";

const BASE = "http://localhost:3100";
const label = process.argv[2] ?? "run";
const db = localAdmin(".env.local");
const me = qaId(QA.user, 4);
const { header } = await qaSession(4);

// A plan of mine for the plan routes (created once, QA data).
const { data: myPlan } = await db.from("plan_members").select("plan_id").eq("user_id", me).limit(1).single();
const planId = myPlan?.plan_id;
const ENDPOINTS = [
  ["GET", "/api/feed?seed=1"],
  ["GET", "/api/feed?seed=1&cursor=1:10"],
  ["POST", "/api/search", { query: "something cheap tomorrow night" }],
  ["GET", "/api/plans"],
  ["GET", `/api/plans/${planId}`],
  ["GET", `/api/plans/${planId}/booking`],
  ["GET", `/api/plans/${planId}/photos`],
  ["GET", `/api/plans/${planId}/locations`],
  ["GET", "/api/memories"],
  ["GET", "/api/me"],
  ["GET", "/api/friends"],
  ["GET", "/api/users"],
  ["GET", "/api/users?q=qa"],
  ["POST", "/api/interactions", { placeId: "10000000-0000-4000-8000-000000000001", slotStart: "2026-11-25T15:00:00.000Z", action: "save" }],
];

const kongLines = () => Number(execSync("docker logs supabase_kong_CodeJam 2>&1 | wc -l", { shell: "bash" }).toString().trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function hit([method, path, body]) {
  const t = performance.now();
  const res = await fetch(BASE + path, {
    method,
    headers: { cookie: header, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const buf = await res.arrayBuffer();
  return { ms: performance.now() - t, status: res.status, bytes: buf.byteLength, timing: res.headers.get("server-timing") };
}
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};

const results = [];
for (const ep of ENDPOINTS) {
  const before = kongLines();
  const cold = await hit(ep);
  await sleep(400);
  const queries = kongLines() - before;
  const warm = [];
  for (let i = 0; i < 30; i++) warm.push((await hit(ep)).ms);
  const t = performance.now();
  const conc = await Promise.all(Array.from({ length: 10 }, () => hit(ep)));
  const concWall = performance.now() - t;
  results.push({
    endpoint: `${ep[0]} ${ep[1].replace(planId ?? "-", "[id]")}`,
    status: cold.status,
    coldMs: Math.round(cold.ms),
    p50: pct(warm, 50),
    p95: pct(warm, 95),
    max: Math.round(Math.max(...warm)),
    conc10p95: pct(conc.map((c) => c.ms), 95),
    conc10WallMs: Math.round(concWall),
    kb: +(cold.bytes / 1024).toFixed(1),
    supabaseRequests: queries,
    serverTiming: cold.timing,
  });
  console.log(results.at(-1));
}
fs.mkdirSync("qa/results", { recursive: true });
fs.writeFileSync(`qa/results/perf-${label}.json`, JSON.stringify(results, null, 1));
