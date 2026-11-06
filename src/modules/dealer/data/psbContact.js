import "server-only";
import { getSupabaseAdmin } from "@/core/supabase/admin";

// PSB's contact details for the dealer module ("Your PSB contact", and the
// "Email support" button in the error window) come from Company Setup
// (psb_s_company), found by its unique short name. Change this to use
// another company's contact details.
const PSB_CONTACT_SHORT_NAME = "PSB";

/** PSB's name, email and phone, or null when the row is missing. */
export async function loadPsbContact() {
  const { data, error } = await getSupabaseAdmin()
    .from("psb_s_company")
    .select("comp_name, comp_email, comp_phone")
    .eq("short_name", PSB_CONTACT_SHORT_NAME)
    .maybeSingle();
  if (error) {
    console.error("loadPsbContact:", error.message);
    return null;
  }
  if (!data) return null;
  return { name: data.comp_name || "", email: data.comp_email || "", phone: data.comp_phone || "" };
}
