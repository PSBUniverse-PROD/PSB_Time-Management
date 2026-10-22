import "server-only";
import { getSupabaseAdmin } from "@/core/supabase/admin";

/**
 * Dealer links (psb_m_dealerlink): "this record in this app belongs to that dealer".
 *
 * These are plain server-only functions, NOT server actions. Call them from
 * your module's own server actions, after the module has done its own checks
 * (who is signed in, whether they may edit the record).
 *
 * Only the link is stored: dealer_id + module_key + record_id. A record's
 * details (name, status, amounts) are never copied here; whoever shows them
 * reads them live from the module's own table, so they are always current.
 *
 * A record has at most one dealer. Linking a record again replaces its dealer.
 */

export const DEALER_LINK_TABLE = "psb_m_dealerlink";
const DEALER_TABLE = "psb_s_dealermaster";
const APPLICATION_TABLE = "psb_s_application";
const RECORD_ID_MAX_LENGTH = 100;

function requireModuleKey(moduleKey) {
  const key = String(moduleKey ?? "").trim();
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error("A valid module key is required.");
  return key;
}

function requireRecordId(recordId) {
  const id = String(recordId ?? "").trim();
  if (!id || id.length > RECORD_ID_MAX_LENGTH) throw new Error("A valid record id is required.");
  return id;
}

/** Active dealers for a picker, by name: [{ dealer_id, dealer_code, dealer_name }]. */
export async function listDealersForPicker() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(DEALER_TABLE)
    .select("dealer_id, dealer_code, dealer_name")
    .eq("is_active", true)
    .order("dealer_name", { ascending: true });
  if (error) throw new Error(error.message || "Failed to load dealers");
  return data || [];
}

/**
 * The dealer one record is linked to, or null.
 * Returns { dealer_id, dealer_code, dealer_name, is_active }.
 */
export async function getDealerLink({ moduleKey, recordId }) {
  const supabase = getSupabaseAdmin();
  const { data: link, error } = await supabase
    .from(DEALER_LINK_TABLE)
    .select("dealer_id")
    .eq("module_key", requireModuleKey(moduleKey))
    .eq("record_id", requireRecordId(recordId))
    .maybeSingle();
  if (error) throw new Error(error.message || "Failed to load the dealer link");
  if (!link) return null;

  const { data: dealer, error: dealerError } = await supabase
    .from(DEALER_TABLE)
    .select("dealer_id, dealer_code, dealer_name, is_active")
    .eq("dealer_id", link.dealer_id)
    .maybeSingle();
  if (dealerError) throw new Error(dealerError.message || "Failed to load the linked dealer");
  return dealer || null;
}

/**
 * Links a record to a dealer, replacing any dealer it was linked to before.
 * The dealer must exist and be active, and the module key must belong to an
 * active application. Returns the dealer: { dealer_id, dealer_code, dealer_name }.
 *
 * @param {{ moduleKey: string, recordId: string|number, dealerId: string|number, userId?: number|null }} params
 *   userId is the signed-in staff user (psb_s_user.user_id), for the audit column.
 */
export async function linkRecordToDealer({ moduleKey, recordId, dealerId, userId = null }) {
  const key = requireModuleKey(moduleKey);
  const id = requireRecordId(recordId);
  const supabase = getSupabaseAdmin();

  const [{ data: application }, { data: dealer }] = await Promise.all([
    supabase.from(APPLICATION_TABLE).select("app_id").eq("module_key", key).eq("is_active", true).maybeSingle(),
    supabase.from(DEALER_TABLE).select("dealer_id, dealer_code, dealer_name, is_active").eq("dealer_id", dealerId).maybeSingle(),
  ]);
  if (!application) throw new Error(`Unknown application "${key}".`);
  if (!dealer) throw new Error("That dealer does not exist.");
  if (dealer.is_active === false) throw new Error("That dealer is not active.");

  const { error } = await supabase
    .from(DEALER_LINK_TABLE)
    .upsert(
      { dealer_id: dealer.dealer_id, module_key: key, record_id: id, created_by: userId ?? null },
      { onConflict: "module_key,record_id" },
    );
  if (error) throw new Error(error.message || "Failed to link the dealer");

  return { dealer_id: dealer.dealer_id, dealer_code: dealer.dealer_code, dealer_name: dealer.dealer_name };
}

/** Removes a record's dealer link. Does nothing if it has none. */
export async function unlinkRecordFromDealer({ moduleKey, recordId }) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from(DEALER_LINK_TABLE)
    .delete()
    .eq("module_key", requireModuleKey(moduleKey))
    .eq("record_id", requireRecordId(recordId));
  if (error) throw new Error(error.message || "Failed to remove the dealer link");
}

/**
 * Every record linked to one dealer, across all applications:
 * [{ module_key, record_id }]. Used by the dealer portal, which then reads
 * each record live from its own table.
 */
export async function listDealerLinks(dealerId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(DEALER_LINK_TABLE)
    .select("module_key, record_id")
    .eq("dealer_id", dealerId);
  if (error) throw new Error(error.message || "Failed to load dealer links");
  return data || [];
}
