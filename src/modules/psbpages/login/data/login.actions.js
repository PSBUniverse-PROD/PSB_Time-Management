/**
 * Server Actions — login.actions.js
 *
 * Runs on the server. Resolves a username to an email by querying psb_s_user.
 * This allows the login form to accept either email or username.
 */
"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

/**
 * Resolve a username to its associated email address.
 * @param {string} username - The username to look up.
 * @returns {Promise<string|null>} The email if found, or null if not found.
 */
export async function resolveUsernameToEmail(username) {
  const trimmed = String(username || "").trim().toLowerCase();
  if (!trimmed) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("psb_s_user")
    .select("email")
    .ilike("username", trimmed)
    .maybeSingle();

  if (error || !data) return null;
  return data.email;
}