"use client";
/**
 * The signed-in user's id (demo "log in as" cookie or the real session), from GET /api/me.
 * null while loading or if the call fails. Owner: Oscar.
 */
import { useEffect, useState } from "react";
import { MeResponse } from "@/types/api";

/** @returns {string | null} */
export function useMeId() {
  const [id, setId] = useState(/** @type {string | null} */ (null));
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/me", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`me ${r.status}`))))
      .then((j) => setId(MeResponse.parse(j).user.id))
      .catch((e) => !ctrl.signal.aborted && console.warn("[me] /api/me", e));
    return () => ctrl.abort();
  }, []);
  return id;
}
