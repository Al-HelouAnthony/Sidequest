/**
 * G6a: `Server-Timing` header for API routes, so where the time goes shows up in the browser's
 * Network tab (Timing) and in `curl -i`. Owner: Anthony. Server-only, no dependencies.
 *
 *   const timing = new ServerTiming();
 *   const ctx = await timing.measure("load", () => loadContext(...));
 *   return Response.json(body, { headers: { "Server-Timing": timing.header() } });
 *   // → Server-Timing: load;dur=142, engine;dur=38, captions;dur=801, total;dur=984
 */
export class ServerTiming {
  constructor() {
    this.t0 = performance.now();
    /** @type {[string, number][]} */
    this.entries = [];
  }

  /**
   * Run `fn`, record how long it took under `name` (also when it throws), return its result.
   * @template T
   * @param {string} name  a token (letters, digits, - and _), e.g. "load"
   * @param {() => T | Promise<T>} fn
   * @returns {Promise<T>}
   */
  async measure(name, fn) {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.entries.push([name, performance.now() - start]);
    }
  }

  /** @returns {string} e.g. "load;dur=142, engine;dur=38, total;dur=190" */
  header() {
    const all = [...this.entries, ["total", performance.now() - this.t0]];
    return all.map(([name, ms]) => `${name.replace(/[^\w-]/g, "_")};dur=${Math.round(Number(ms))}`).join(", ");
  }
}
