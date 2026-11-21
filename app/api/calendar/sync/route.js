/**
 * POST /api/calendar/sync → { imported } after pulling Google free/busy into busy_blocks.
 * Owner: Anthony (social phase; Google Cloud project owner). STUB.
 */
import { jsonError } from "@/lib/http";

export async function POST() {
  return jsonError(501, "Calendar sync not implemented yet. Seeded schedules are used.");
}
