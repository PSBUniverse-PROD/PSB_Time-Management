import "server-only";
import { getSupabaseAdmin } from "@/core/supabase/admin";
import { listDealerLinks } from "@/core/dealer/dealerLinks";

/**
 * Where each application's dealer-linked records live, and how to show one.
 *
 * psb_m_dealerlink only says "record X of app Y belongs to dealer Z". This
 * file is what lets the dealer portal read that record live from the app's
 * own table, so dealers always see current data and nothing is copied.
 *
 * To make another app's records appear for dealers:
 *   1. In that app, call linkRecordToDealer() from core/dealer/dealerLinks.
 *   2. Add one entry below, keyed by the app's module_key.
 * No database change is needed.
 *
 * Each entry: appLabel, recordLabel, table, idColumn, select (only columns a
 * dealer may see), and toRecord(row) → { title, status, location, reference,
 * sortDate, dateText, amountText, details: [[label, value], ...] }.
 */

function text(value) {
  return String(value ?? "").trim();
}

/** "2026-10-02T14:30:00" → "Oct 2, 2026". Calendar date only, no time-zone shift. */
function dateText(value) {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "medium" });
}

function moneyText(value) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "";
}

export const DEALER_RECORD_SOURCES = {
  "project-map": {
    appLabel: "Project Map",
    recordLabel: "Project",
    table: "proj_t_projects",
    idColumn: "id",
    // Payment details, paid-sheet notes and internal project notes are left out on purpose.
    select:
      "id, client_name, formatted_address, address_line_1, city, state, state_code, postal_code, " +
      "invoice_number, dimension, project_subtotal, order_received_at, " +
      "scheduled_project_start, scheduled_project_end, install_start, install_end, " +
      "proj_s_project_status!proj_t_projects_status_id_fkey(status_name), " +
      "proj_s_building_categories!proj_t_projects_building_category_id_fkey(building_category_name), " +
      "proj_s_permit_status!proj_t_projects_permit_status_id_fkey(status_name), " +
      "proj_s_welcome_call_status!proj_t_projects_welcome_call_status_id_fkey(status_name)",
    toRecord(row) {
      const address =
        text(row.formatted_address) ||
        [row.address_line_1, row.city, row.state, row.postal_code].map(text).filter(Boolean).join(", ");
      return {
        title: text(row.client_name) || "Project",
        status: text(row.proj_s_project_status?.status_name),
        location: [row.city, row.state_code].map(text).filter(Boolean).join(", "),
        reference: text(row.invoice_number),
        sortDate: text(row.order_received_at),
        dateText: dateText(row.order_received_at),
        amountText: moneyText(row.project_subtotal),
        details: [
          ["Customer", text(row.client_name)],
          ["Address", address],
          ["Building category", text(row.proj_s_building_categories?.building_category_name)],
          ["Description", text(row.dimension)],
          ["Invoice #", text(row.invoice_number)],
          ["Project subtotal", moneyText(row.project_subtotal)],
          ["Order received", dateText(row.order_received_at)],
          ["Scheduled start", dateText(row.scheduled_project_start)],
          ["Scheduled end", dateText(row.scheduled_project_end)],
          ["Install start", dateText(row.install_start)],
          ["Install end", dateText(row.install_end)],
          ["Permit status", text(row.proj_s_permit_status?.status_name)],
          ["Welcome call", text(row.proj_s_welcome_call_status?.status_name)],
        ],
      };
    },
  },
};

/**
 * Every record linked to one dealer, across all registered applications, read
 * live from each application's own table. Newest first.
 *
 * Links to an application with no entry above, or to a record that no longer
 * exists, are skipped. A failing source is logged and skipped so one app's
 * problem never hides the others.
 */
export async function loadDealerRecords(dealerId) {
  const links = await listDealerLinks(dealerId);

  const idsByModule = new Map();
  for (const link of links) {
    if (!DEALER_RECORD_SOURCES[link.module_key]) continue;
    if (!idsByModule.has(link.module_key)) idsByModule.set(link.module_key, []);
    idsByModule.get(link.module_key).push(link.record_id);
  }

  const supabase = getSupabaseAdmin();
  const groups = await Promise.all(
    Array.from(idsByModule.entries()).map(async ([moduleKey, recordIds]) => {
      const source = DEALER_RECORD_SOURCES[moduleKey];
      const { data, error } = await supabase.from(source.table).select(source.select).in(source.idColumn, recordIds);
      if (error) {
        console.error(`loadDealerRecords ${moduleKey}:`, error.message);
        return [];
      }
      return (data || []).map((row) => ({
        key: `${moduleKey}:${row[source.idColumn]}`,
        moduleKey,
        appLabel: source.appLabel,
        recordLabel: source.recordLabel,
        ...source.toRecord(row),
      }));
    }),
  );

  return groups.flat().sort((left, right) => String(right.sortDate).localeCompare(String(left.sortDate)));
}
