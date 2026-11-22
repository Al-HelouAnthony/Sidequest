async (page) => {
  const DATA = __DATA__;
  const ROOT = "c:/Users/Anthony/Documents/MyProjects/CodeJam";
  const B = "http://localhost:3100";
  const SAM = "00000000-0000-4000-8000-000000000001";
  const P = DATA.plans;
  const NO_PHOTO = "0b0b0000-0000-4000-8000-000000000001";
  const ONLY = DATA.only || null;
  const S = [
    ["feed", "sam", "/feed"],
    ["feed-why-sheet", "sam", "/feed", async (p) => { await p.getByRole("button", { name: "Why am I seeing this?" }).first().click(); await p.waitForTimeout(600); }],
    ["feed-place-sheet", "sam", "/feed", async (p) => { await p.getByRole("button", { name: /^Details about/ }).first().click(); await p.waitForTimeout(600); }],
    ["feed-search-sheet", "sam", "/feed", async (p) => { await p.getByRole("button", { name: /search/i }).first().click(); await p.waitForTimeout(600); }],
    ["feed-search-long-summary", "sam", "/feed", async (p) => { await p.getByRole("button", { name: /search/i }).first().click(); await p.waitForTimeout(400); const box = p.locator("dialog[open] input, dialog[open] textarea").first(); await box.fill("a".repeat(300)); await box.press("Enter"); await p.waitForTimeout(1500); }],
    ["feed-long-friend-name", "1", "/feed"],
    ["feed-no-photo-card", "4", "/feed", async (p) => { for (let i = 0; i < 40; i++) { const s = p.locator(`section[data-place-id="${NO_PHOTO}"]`).first(); if (await s.count()) { await s.evaluate((el) => { const m = el.closest("main"); m.scrollTop += el.getBoundingClientRect().top - m.getBoundingClientRect().top; }); await p.waitForTimeout(500); return; } await p.keyboard.press("ArrowDown"); await p.waitForTimeout(350); } }],
    ["feed-empty-fully-booked", "6", "/feed"],
    ["feed-empty-zero-friends", "7", "/feed"],
    ["feed-error", "sam", "/feed", null, async (p) => p.route("**/api/feed**", (r) => r.fulfill({ status: 500, body: JSON.stringify({ error: "boom" }), contentType: "application/json" }))],
    ["feed-loading", "sam", "/feed", null, async (p) => p.route("**/api/feed**", async (r) => { await new Promise((res) => setTimeout(res, 8000)); await r.continue().catch(() => {}); }), 1200],
    ["plans-list", "4", "/plans"],
    ["plans-empty", "7", "/plans"],
    ["plan-pending-organizer", "4", `/plans/${P.pending}`],
    ["plan-pending-invitee", "5", `/plans/${P.pending}`],
    ["plan-confirmed", "4", `/plans/${P.confirmed}`],
    ["plan-cancelled", "4", `/plans/${P.cancelled}`],
    ["plan-live-photos-location", "4", `/plans/${P.live}`],
    ["plan-not-member", "7", `/plans/${P.live}`],
    ["plan-not-found", "4", "/plans/00000000-0000-4000-8000-00000000dead"],
    ["plans-preview", "4", "/plans/preview"],
    ["memories", "4", "/memories"],
    ["memories-empty", "7", "/memories"],
    ["memories-viewer", "4", "/memories", async (p) => { await p.getByRole("button", { name: /^Open photo 1/ }).first().click(); await p.waitForTimeout(700); }],
    ["friends-many", "14", "/friends"],
    ["friends-empty", "7", "/friends"],
    ["friends-search", "4", "/friends", async (p) => { const box = p.getByRole("searchbox").or(p.getByPlaceholder(/username|name/i)).first(); await box.fill("qa_"); await p.waitForTimeout(1200); }],
    ["me-long-name", "4", "/me"],
    ["me-missing-avatar", "17", "/me"],
    ["me-broken-avatar", "18", "/me"],
    ["onboarding", "4", "/onboarding"],
    ["login", null, "/login"],
  ].filter((s) => !ONLY || ONLY.includes(s[0]));
  const VPS = [["390x844", 390, 844, 3, true], ["360x740", 360, 740, 3, true], ["1440x900", 1440, 900, 1, false]].filter((v) => !DATA.vps || DATA.vps.includes(v[0]));
  const browser = page.context().browser();
  const results = [];
  for (const [vpName, w, h, dpr, mobile] of VPS) {
    for (const [name, who, path, action, setup, shotAfter] of S) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
      if (who === "sam") await ctx.addCookies([{ name: "sq_user", value: SAM, url: B }]);
      else if (who) await ctx.addCookies(DATA.cookies[who].map((c) => ({ name: c.name, value: c.value, url: B })));
      const p = await ctx.newPage();
      const consoleErr = [];
      const failed = [];
      p.on("console", (m) => { if (m.type() === "error") consoleErr.push(m.text().slice(0, 140)); });
      p.on("pageerror", (e) => consoleErr.push("PAGEERROR " + e.message.slice(0, 140)));
      p.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("/_next/")) failed.push(`${r.status()} ${r.url().replace(B, "").slice(0, 70)}`); });
      try {
        if (setup) await setup(p);
        await p.goto(B + path, { waitUntil: shotAfter ? "commit" : "load", timeout: 30000 });
        await p.waitForTimeout(shotAfter || 1800);
        if (action) await action(p);
        const checks = await p.evaluate(() => {
          const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && r.bottom > 0 && r.top < innerHeight; };
          const overflowX = document.documentElement.scrollWidth > innerWidth + 1;
          const broken = [...document.images].filter((i) => vis(i) && i.complete && i.getAttribute("src") && i.naturalWidth === 0).map((i) => i.getAttribute("src").slice(0, 60));
          const emptySrc = [...document.images].filter((i) => vis(i) && !i.getAttribute("src")).length;
          const small = [...document.querySelectorAll("button, a[href], [role=button], input:not([type=hidden]), select, textarea")]
            .filter((el) => vis(el) && !el.closest("p") && !el.classList.contains("sr-only"))
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter(({ r }) => r.width < 43.5 || r.height < 43.5)
            .map(({ el, r }) => `${el.tagName.toLowerCase()}"${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          const offscreen = [...document.querySelectorAll("h1,h2,h3,p,button,a")].filter((el) => { if (!vis(el)) return false; const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).slice(0, 3).map((el) => el.textContent.trim().slice(0, 30));
          return { overflowX, broken, emptySrc, small: small.slice(0, 6), smallCount: small.length, offscreen };
        });
        let axe = [];
        try {
          await p.addScriptTag({ path: ROOT + "/node_modules/axe-core/axe.min.js" });
          axe = await p.evaluate(async () => {
            const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }, resultTypes: ["violations"] });
            return r.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ").slice(0, 120)}`);
          });
        } catch (e) { axe = ["axe-failed " + String(e.message).slice(0, 60)]; }
        await p.screenshot({ path: `${ROOT}/qa/screenshots/${vpName}/${name}.png` });
        results.push({ vp: vpName, name, ...checks, axe, consoleErr: [...new Set(consoleErr)].slice(0, 3), failed: [...new Set(failed)].slice(0, 4) });
      } catch (e) {
        results.push({ vp: vpName, name, error: String(e.message).slice(0, 160) });
      }
      await ctx.close();
    }
  }
  return JSON.stringify(results);
}
