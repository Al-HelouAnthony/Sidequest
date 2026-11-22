async (page) => {
  // Onboarding click-through as a QA user with no interests yet (__COOKIES__ from scripts/qa-session.mjs).
  const B = "http://localhost:3100";
  const COOKIES = __COOKIES__;
  const ctx = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addCookies(COOKIES.map((c) => ({ name: c.name, value: c.value, url: B })));
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const log = [];
  const t0 = Date.now();
  const where = async () => p.getByRole("progressbar").getAttribute("aria-valuetext");
  const cont = () => p.locator("main button").filter({ hasText: /Continue|Finish|Done|Let's|Start|Go to/ }).last();
  await p.goto(B + "/onboarding");
  await p.waitForTimeout(900);
  log.push("1: " + (await where()));
  await cont().click();
  await p.waitForTimeout(500);
  log.push("2: " + (await where()));
  await p.getByRole("textbox").first().fill("H2X 1Y4");
  await p.waitForTimeout(300);
  await cont().click();
  await p.waitForTimeout(1500);
  log.push("3: " + (await where()));
  const chips = p.locator("main button[aria-pressed]");
  log.push("interest chips: " + (await chips.count()));
  for (let i = 0; i < 5; i++) await chips.nth(i).click();
  await cont().click();
  await p.waitForTimeout(1500);
  log.push("4: " + (await where()));
  await cont().click();
  await p.waitForURL(/\/feed/, { timeout: 15000 }).catch(() => {});
  log.push("ended on " + p.url().replace(B, "") + " after " + (Date.now() - t0) + " ms");
  await p.screenshot({ path: "c:/Users/Anthony/Documents/MyProjects/CodeJam/qa/screenshots/onboarding-done.png" });
  await ctx.close();
  return log.join("\n") + (errs.length ? "\nerrors: " + errs.join(" | ") : "");
}
