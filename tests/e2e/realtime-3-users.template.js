async (page) => {
  const jar = __JAR__; // { "3": cookies, "4": cookies, "5": cookies } from scripts/qa-session.mjs
  const browser = page.context().browser();
  const ctxFor = async (n) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies(jar[n].map((c) => ({ name: c.name, value: c.value, url: "http://localhost:3100" })));
    return ctx;
  };
  const [A, B, C] = await Promise.all([ctxFor(4), ctxFor(5), ctxFor(3)]);
  const [pa, pb, pc] = await Promise.all([A.newPage(), B.newPage(), C.newPage()]);
  const errors = [];
  for (const p of [pa, pb, pc]) p.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 120)));
  await Promise.all([pb.goto("http://localhost:3100/feed"), pc.goto("http://localhost:3100/feed")]);
  await Promise.all([pb.locator("section[data-card-id]").first().waitFor({ timeout: 20000 }), pc.locator("section[data-card-id]").first().waitFor({ timeout: 20000 })]);
  await pb.waitForTimeout(1500);
  const start = new Date(Math.ceil(Date.now() / 3600000) * 3600000 + 3 * 3600000).toISOString();
  const end = new Date(Date.parse(start) + 3600000).toISOString();
  await pa.goto("http://localhost:3100/plans");
  const t0 = Date.now();
  const res = await pa.evaluate(async ([s, e]) => {
    const r = await fetch("/api/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ placeId: "10000000-0000-4000-8000-000000000001", start: s, end: e, inviteeIds: ["0a0a0000-0000-4000-8000-000000000005", "0a0a0000-0000-4000-8000-000000000003"] }) });
    return { status: r.status, json: await r.json() };
  }, [start, end]);
  if (res.status !== 201) return "create failed " + JSON.stringify(res).slice(0, 300);
  const planId = res.json.plan.id;
  await Promise.all([pb.getByText(/invited you/i).first().waitFor({ timeout: 15000 }), pc.getByText(/invited you/i).first().waitFor({ timeout: 15000 })]);
  const inviteMs = Date.now() - t0;
  await Promise.all([pa.goto(`http://localhost:3100/plans/${planId}`), pc.goto(`http://localhost:3100/plans/${planId}`), pb.goto(`http://localhost:3100/plans/${planId}`)]);
  await pb.getByRole("button", { name: /I'm in/i }).waitFor({ timeout: 15000 });
  await pa.waitForTimeout(1500);
  const t1 = Date.now();
  await pb.getByRole("button", { name: /I'm in/i }).click();
  await Promise.all([pa.getByText(/confirmed/i).first().waitFor({ timeout: 15000 }), pc.getByText(/confirmed/i).first().waitFor({ timeout: 15000 })]);
  const rsvpMs = Date.now() - t1;
  await C.setOffline(true);
  await pa.evaluate(async (id) => fetch(`/api/plans/${id}/booking`, { method: "POST" }), planId);
  await pc.waitForTimeout(1000);
  await C.setOffline(false);
  const t2 = Date.now();
  let reconnectMs = -1;
  try { await pc.getByText(/requested/i).first().waitFor({ timeout: 20000 }); reconnectMs = Date.now() - t2; } catch {}
  await pa.screenshot({ path: "c:/Users/Anthony/Documents/MyProjects/CodeJam/qa/screenshots/realtime-organizer.png" });
  await pc.screenshot({ path: "c:/Users/Anthony/Documents/MyProjects/CodeJam/qa/screenshots/realtime-friend-after-reconnect.png" });
  await Promise.all([A.close(), B.close(), C.close()]);
  return JSON.stringify({ planId, inviteMs, rsvpMs, reconnectMs, consoleErrors: [...new Set(errors)].slice(0, 6) });
}
