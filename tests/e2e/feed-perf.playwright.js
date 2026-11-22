async (page) => {
  const browser = page.context().browser();
  const run = async (label, throttle) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await ctx.addCookies([{ name: "sq_user", value: "00000000-0000-4000-8000-000000000001", url: "http://localhost:3100" }]);
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    if (throttle) {
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    await p.addInitScript(() => {
      window.__m = { lcp: 0, cls: 0, longTasks: [], lcpEl: "" };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__m.lcp = e.startTime; window.__m.lcpEl = (e.element?.tagName || "") + " " + (e.url || "").slice(-60); } }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.longTasks.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true });
    });
    const bytes = { img: 0, js: 0, other: 0, imgs: [] };
    p.on("response", async (r) => {
      try {
        const len = Number(r.headers()["content-length"] ?? (await r.body()).length);
        const t = r.request().resourceType();
        if (t === "image") { bytes.img += len; bytes.imgs.push([Math.round(len / 1024), r.url().slice(-50)]); }
        else if (t === "script") bytes.js += len; else bytes.other += len;
      } catch {}
    });
    const t0 = Date.now();
    await p.goto("http://localhost:3100/feed", { waitUntil: "load" });
    await p.locator("section[data-card-id]").first().waitFor({ timeout: 30000 });
    const firstCardMs = Date.now() - t0;
    await p.waitForTimeout(2500);
    const load = await p.evaluate(() => ({ lcp: Math.round(window.__m.lcp), lcpEl: window.__m.lcpEl, cls: +window.__m.cls.toFixed(4), longTasks: window.__m.longTasks.slice() }));
    // Snap through 20 cards with the keyboard (same pager as touch), sampling frame gaps.
    await p.evaluate(() => {
      window.__frames = [];
      let last = performance.now();
      const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 100000) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      window.__m.longTasks = [];
    });
    for (let i = 0; i < 20; i++) { await p.keyboard.press("ArrowDown"); await p.waitForTimeout(520); }
    const scroll = await p.evaluate(() => {
      const f = window.__frames.slice(5);
      const dropped = f.filter((d) => d > 34).length;
      const el = [...document.querySelectorAll("main[aria-label=Suggestions]")].find((m) => m.clientHeight > 0);
      return { frames: f.length, over34ms: dropped, worstFrameMs: Math.round(Math.max(...f)), longTasks: window.__m.longTasks.slice(), index: Math.round(el.scrollTop / el.clientHeight) };
    });
    await ctx.close();
    bytes.imgs.sort((a, b) => b[0] - a[0]);
    return { label, firstCardMs, ...load, scroll, kb: { img: Math.round(bytes.img / 1024), js: Math.round(bytes.js / 1024), other: Math.round(bytes.other / 1024) }, biggestImgs: bytes.imgs.slice(0, 4) };
  };
  const a = await run("fast (no throttling)", false);
  const b = await run("phone: 4x CPU, 9 Mbps / 150 ms", true);
  return JSON.stringify([a, b], null, 1);
}
