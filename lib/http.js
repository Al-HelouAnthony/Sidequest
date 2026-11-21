/** Small helpers so every route handler validates and errors the same way. */
import { z } from "zod";

/**
 * @param {number} status
 * @param {string} error
 * @param {unknown} [details]
 */
export function jsonError(status, error, details) {
  return Response.json(details === undefined ? { error } : { error, details }, { status });
}

/**
 * Parse a JSON body with a Zod schema. Returns either { data } or { response } (a 400).
 * Usage:  const { data, response } = await parseBody(request, Schema); if (response) return response;
 * @template {z.ZodType} T
 * @param {Request} request
 * @param {T} schema
 * @returns {Promise<{ data: z.infer<T>, response?: undefined } | { data?: undefined, response: Response }>}
 */
export async function parseBody(request, schema) {
  let raw;
  try {
    raw = await request.json();
  } catch {
    return { response: jsonError(400, "Body must be valid JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { response: jsonError(400, "Invalid request", z.treeifyError(parsed.error)) };
  return { data: parsed.data };
}
