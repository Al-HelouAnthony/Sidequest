async (page) => {
  // The 2-minute demo (PLAN §8), two phones: Sam (organizer) and Maya. Run after `node scripts/qa-demo-reset.mjs`.
  // RUN is replaced with the run number before running (trace → qa/demo-run-RUN.zip).
  const RUN = "__RUN__";
  const B = "http://localhost:3100";
  const ROOT = "c:/Users/Anthony/Documents/MyProjects/CodeJam";
  const SAM = "00000000-0000-4000-8000-000000000001";
  const MAYA = "00000000-0000-4000-8000-000000000002";
  const browser = page.context().browser();
  const phone = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addCookies([{ name: "sq_user", value: who, url: B }]);
    return ctx;
  };
  const S = await phone(SAM);
  const M = await phone(MAYA);
  await S.tracing.start({ screenshots: true, snapshots: true });
  const ps = await S.newPage();
  const pm = await M.newPage();
  const errors = [];
  for (const p of [ps, pm]) p.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
  const log = [];
  const step = async (name, fn) => {
    const t = Date.now();
    try {
      const note = await fn();
      log.push(`✓ ${name} (${Date.now() - t} ms)${note ? ` ${note}` : ""}`);
    } catch (e) {
      log.push(`✗ ${name}: ${String(e.message).split("\n")[0].slice(0, 160)}`);
      throw e;
    }
  };
  const current = async () =>
    ps.evaluate(() => {
      const el = [...document.querySelectorAll("main[aria-label=Suggestions]")].find((m) => m.clientHeight > 0);
      const i = Math.round(el.scrollTop / el.clientHeight);
      const sec = el.querySelectorAll("section")[i];
      const chip = sec?.querySelector("button[aria-label^='Details about']");
      return { category: chip?.textContent?.trim() ?? "", text: sec?.textContent ?? "", id: sec?.dataset.cardId ?? "", name: chip?.getAttribute("aria-label")?.replace("Details about ", "") ?? "" };
    });
  try {
    await pm.goto(`${B}/feed`);
    await step("1. Feed opens: what + when + who + reason", async () => {
      await ps.goto(`${B}/feed`);
      await ps.locator("section[data-card-id]").first().waitFor({ timeout: 20000 });
      const c = await current();
      if (!/\d:\d\d/.test(c.text)) throw new Error("no time on the card");
      if (!/min/.test(c.text)) throw new Error("no travel time on the card");
      return `"${c.name}" · ${c.category}`;
    });
    await step("2. Why am I seeing this?", async () => {
      await ps.getByRole("button", { name: "Why am I seeing this?" }).first().click();
      await ps.locator("dialog[open]").waitFor({ timeout: 5000 });
      const txt = await ps.locator("dialog[open]").innerText();
      await ps.keyboard.press("Escape");
      await ps.locator("dialog[open]").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
      return `sheet shows ${(txt.match(/\d+%|\d\.\d+/g) ?? []).length} numbers`;
    });
    let skipped = 0;
    await step("3. Skip 3 bars", async () => {
      for (let i = 0; i < 60 && skipped < 3; i++) {
        const c = await current();
        if (/^bar/i.test(c.category)) {
          await ps.getByRole("button", { name: `Skip ${c.name}` }).first().click();
          skipped++;
          await ps.waitForTimeout(700);
        } else {
          await ps.keyboard.press("ArrowDown");
          await ps.waitForTimeout(420);
        }
      }
      if (skipped < 3) throw new Error(`only ${skipped} bars found`);
      return `${skipped} skipped`;
    });
    await step("4. Refresh → no bars in the top 10", async () => {
      await ps.getByRole("button", { name: /Refresh/ }).first().click();
      await ps.waitForTimeout(2500);
      const cats = await ps.evaluate(() =>
        [...document.querySelectorAll("main[aria-label=Suggestions] section[data-card-id]")].slice(0, 10).map((s) => s.querySelector("button[aria-label^='Details about']")?.textContent?.trim() ?? ""),
      );
      const bars = cats.filter((c) => /^bar/i.test(c)).length;
      if (bars > 0) throw new Error(`${bars} bars still in the top 10: ${cats.join(",")}`);
      return `top 10: ${cats.join(", ")}`;
    });
    let planUrl = "";
    let tInvite = 0;
    await step("5a. Let's go on a card with Maya → invite sent", async () => {
      for (let i = 0; i < 30; i++) {
        const c = await current();
        if (/Maya/.test(c.text)) break;
        await ps.keyboard.press("ArrowDown");
        await ps.waitForTimeout(420);
      }
      const sec = ps.locator(`section[data-card-id="${(await current()).id}"]`);
      await sec.getByRole("slider").or(sec.getByLabel(/Let's go/)).first().focus();
      await ps.keyboard.press("Enter");
      const send = ps.getByRole("button", { name: /Send invite to/ });
      await send.waitFor({ timeout: 8000 });
      tInvite = Date.now();
      await send.click();
      await ps.waitForURL(/\/plans\/[0-9a-f-]{36}/, { timeout: 10000 });
      planUrl = ps.url();
      return planUrl.split("/plans/")[1].slice(0, 8);
    });
    await step("5b. Maya's phone gets the invite live (no refresh)", async () => {
      await pm.getByText(/invited you/i).first().waitFor({ timeout: 10000 });
      return `${Date.now() - tInvite} ms after Send`;
    });
    await step("5c. Maya: I'm in → confirmed on both phones", async () => {
      await pm.goto(planUrl);
      await pm.getByRole("button", { name: /I'm in/i }).click();
      const t = Date.now();
      await Promise.all([pm.getByText(/confirmed/i).first().waitFor({ timeout: 10000 }), ps.getByText(/confirmed/i).first().waitFor({ timeout: 10000 })]);
      return `Sam saw it ${Date.now() - t} ms later`;
    });
    await step("6. Search: something cheap with Maya tomorrow night", async () => {
      await ps.goto(`${B}/feed`);
      await ps.locator("section[data-card-id]").first().waitFor({ timeout: 20000 });
      await ps.getByRole("button", { name: /search/i }).first().click();
      const box = ps.locator("dialog[open] input, dialog[open] textarea").first();
      await box.fill("something cheap with Maya tomorrow night");
      await box.press("Enter");
      await ps.getByRole("button", { name: /Edit search/ }).waitFor({ timeout: 10000 });
      const summary = await ps.getByRole("button", { name: /Edit search/ }).getAttribute("aria-label");
      const n = await ps.locator("main[aria-label=Suggestions] section[data-card-id]").count();
      return `${summary} · ${n} cards`;
    });
  } finally {
    await S.tracing.stop({ path: `${ROOT}/qa/demo-run-${RUN}.zip` });
    await ps.screenshot({ path: `${ROOT}/qa/screenshots/demo-run-${RUN}-end.png` }).catch(() => {});
    await S.close();
    await M.close();
  }
  return log.join("\n") + (errors.length ? `\npage errors: ${errors.join(" | ")}` : "");
}
