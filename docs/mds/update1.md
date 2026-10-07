# PSBUniverse-core — Admin: add Dealer Master Setup module (table `psb_s_dealermaster`, Geoapify address search)

## Plan
Goal: an admin page to list, add, edit, deactivate and delete dealers, with an address search that fills street, city, state and ZIP.
Approach: copy the structure of the existing Status Setup module (server page → client view → data helpers → server actions, with staged "Save Batch" changes), editing through a modal form. Address search calls Geoapify from a server action, using the same key and response fields the Project Map app already uses; the dealer row stores the result as plain text.
Order: Step 0 checks → create 5 new module files → run `npm run gen:routes` → verify.

## Context
- There is no dealer module in the repo (`src/modules/admin/` contains only `application-setup`, `card-module-setup`, `company-department-setup`, `status-setup`, `user-master-setup`).
- The developer has already created `public.psb_s_dealermaster` manually in Supabase. **Do NOT run any database command.** Columns, for reference:
  `dealer_id` (bigserial PK), `dealer_code` (text, required, unique), `dealer_name` (text, required), `contact_person`, `email`, `phone`, `mobile`, `address_line1`, `address_line2`, `city`, `state`, `postal_code` (all text), `country` (text, NOT NULL, default `'US'` — never send it), `tax_id`, `payment_terms` (text), `credit_limit` (numeric(14,2), ≥ 0), `remarks` (text), `is_active` (boolean, default true), `created_at`, `updated_at` (timestamptz).
- `state` stores the 2-letter code (e.g. `TX`); `city` stores the city name (e.g. `Dallas`). There are no lookup tables.
- Address search uses Geoapify autocomplete, `https://api.geoapify.com/v1/geocode/autocomplete`, with query params `text`, `apiKey`, `limit`. The response is `{ features: [{ properties: { formatted, address_line1, city, state_code, postcode, ... } }] }`. These params and fields are the ones the sibling Project Map app already uses in production (`PSB_ProjectMap/src/modules/project-map/utils/geocoding.js`, outside this repo — do not import from it).
- The key is read from `process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY` (same variable name as Project Map). The developer adds it to `.env.local`; do not create, edit or print `.env.local`.

## Where to look
- `src/modules/admin/status-setup/index.js:1-15` — module definition shape to copy (`module_key: "psbuniverse"`, `group_name: "Administration"`, `order: 140`).
- `src/modules/admin/status-setup/pages/StatusSetupPage.js:1-7` — server page pattern.
- `src/modules/admin/status-setup/pages/StatusSetupView.jsx:24-366` — batch-staging hook this module mirrors; `:397-461` — `TableZ` columns/actions shape; `:463-518` — dialog pattern.
- `src/modules/admin/status-setup/data/statusSetup.data.js:45-140` — shared helper and `executeBatchSave` pattern.
- `src/modules/admin/status-setup/data/statusSetup.actions.js:64-118` — server action pattern using `getSupabaseAdmin`.
- `src/core/supabase/admin.js:6` — `getSupabaseAdmin()` (service-role client, server-only).
- `src/shared/components/ui/index.js:1-28` — exports used: `Button`, `Card`, `Input`, `Modal`, `StatusBadge`, `TableZ`, `toastError`, `toastSuccess`.
- `src/shared/components/ui/controls/Input.js:6-10` — `Input` has no `label` prop; labels are separate `<label className="form-label mb-1">` elements (see `src/modules/admin/company-department-setup/pages/CompanyDepartmentSetupView.jsx:999-1000`).
- `src/shared/components/ui/overlay/Modal.js:5-13` — `Modal` props; extra props such as `size="lg"` pass through (used at `src/modules/admin/application-setup/pages/RoleUsersModal.jsx:138`).
- `src/shared/utils/icons.js:2855` — `"store"` is a valid icon key.
- `scripts/generate-routes.js:463-483` — generates `src/app/<route>/page.js` from each module's `routes`.
- `src/app/globals.css:548-591` — `psb-batch-marker*` classes used for the row markers.

## Scope
- May change (all new files):
  - `src/modules/admin/dealer-master-setup/index.js`
  - `src/modules/admin/dealer-master-setup/pages/DealerMasterSetupPage.js`
  - `src/modules/admin/dealer-master-setup/pages/DealerMasterSetupView.jsx`
  - `src/modules/admin/dealer-master-setup/data/dealerMasterSetup.actions.js`
  - `src/modules/admin/dealer-master-setup/data/dealerMasterSetup.data.js`
  - `src/app/admin/dealer-master-setup/page.js` — created ONLY by `npm run gen:routes`, never by hand.
- Must NOT change: every existing file, including `src/modules/admin/status-setup/**`, `src/shared/**`, `src/core/**`, `scripts/**`, `src/app/rewrites.json`, `package.json`, `.env.local`. No database commands, no package installs.

## Step 0 — Read-only checks
Do not edit anything in this step.
- Confirm `src/modules/admin/dealer-master-setup/` does not exist. If it does, STOP and report.
- Confirm `src/modules/admin/status-setup/index.js` still has `module_key: "psbuniverse"` and `group_name: "Administration"`. If not, STOP and report.
- Confirm no other module `index.js` under `src/modules/admin/` uses `order: 150`. If one does, STOP and report.
- Confirm `src/shared/components/ui/index.js` exports `Button`, `Card`, `Input`, `Modal`, `StatusBadge`, `TableZ`, `toastError`, `toastSuccess`. If any is missing, STOP and report.
- Ask the developer whether `NEXT_PUBLIC_GEOAPIFY_API_KEY` is set in `.env.local` (do not open or print the file). If it is not, still create the files, but skip manual checks 3–5 and say so in the report.
- (Unverified) The Geoapify param `filter=countrycode:us` used in Step 2 is not used by Project Map, so it is unconfirmed. If manual check 3 fails with "Address search failed (400)", STOP and report — do not remove or change the param yourself.
- (Unverified) The column list in Context was supplied by the developer's SQL; it cannot be checked from the repo. If any save later fails with a "column does not exist" error, STOP and report the exact message.

## Steps
All steps create new files given in full. If a target file already exists, STOP and report it. Do not improvise or guess a fix.

### 1. Create `src/modules/admin/dealer-master-setup/index.js`
```js
const dealerMasterSetupModule = {
  key: "dealer-master-setup",
  module_key: "psbuniverse",
  name: "Dealer Master Setup",
  description: "Manage dealer master records.",
  icon: "store",
  group_name: "Administration",
  group_desc: "Tools for organization setup and management.",
  order: 150,
  routes: [
    { path: "/admin/dealer-master-setup", page: "DealerMasterSetupPage" },
  ],
};

export default dealerMasterSetupModule;
```

### 2. Create `src/modules/admin/dealer-master-setup/data/dealerMasterSetup.actions.js`
```js
"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

// ─── Private helpers ───────────────────────────────────────

const DEALER_TABLE = "psb_s_dealermaster";

const REQUIRED_TEXT_FIELDS = { dealer_code: "Dealer code", dealer_name: "Dealer name" };

const OPTIONAL_TEXT_FIELDS = [
  "contact_person",
  "email",
  "phone",
  "mobile",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "postal_code",
  "tax_id",
  "payment_terms",
  "remarks",
];

// Same Geoapify key and endpoint the Project Map app uses for its address search.
const GEOAPIFY_API_KEY = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || "";
const GEOAPIFY_AUTOCOMPLETE_URL = "https://api.geoapify.com/v1/geocode/autocomplete";
const ADDRESS_SEARCH_LIMIT = 10;

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function sanitizeOptionalText(value) {
  const text = normalizeText(value);
  return text === "" ? null : text;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return !(text === "false" || text === "0" || text === "n" || text === "no" || text === "f");
}

function normalizeCreditLimit(value) {
  const text = normalizeText(value);
  if (text === "") return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Credit limit must be a number of 0 or more.");
  return amount;
}

// Geoapify often returns an administrative township ("Marlboro Township") as the city.
function stripTownshipLabel(value) {
  return String(value ?? "").replace(/\s+Township\b/gi, "").replace(/\s{2,}/g, " ").trim();
}

function buildDealerPayloadFromInput(input) {
  const payload = {};

  for (const [field, label] of Object.entries(REQUIRED_TEXT_FIELDS)) {
    if (!hasOwn(input, field)) continue;
    const text = normalizeText(input[field]);
    if (!text) throw new Error(`${label} is required.`);
    payload[field] = text;
  }
  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (hasOwn(input, field)) payload[field] = sanitizeOptionalText(input[field]);
  }
  if (hasOwn(input, "credit_limit")) {
    payload.credit_limit = normalizeCreditLimit(input.credit_limit);
  }
  if (hasOwn(input, "is_active")) {
    payload.is_active = normalizeBoolean(input.is_active);
  }
  return payload;
}

function assertValidPayload(payload, message) {
  if (!payload || Object.keys(payload).length === 0) throw new Error(message);
}

function toDealerError(error, fallback) {
  // 23505 = unique violation (psb_s_dealermaster_dealer_code_key)
  if (error?.code === "23505") return new Error("Dealer code already exists.");
  return new Error(error?.message || fallback);
}

// ─── SERVER ACTIONS (called from client) ───────────────────

export async function loadDealerMasterSetupData() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(DEALER_TABLE)
    .select("*")
    .order("dealer_name", { ascending: true });

  if (error) throw new Error(error.message || "Failed to fetch dealers");
  return { dealers: Array.isArray(data) ? data : [] };
}

export async function searchDealerAddressAction(query) {
  const text = normalizeText(query);
  if (text.length < 3) return [];
  if (!GEOAPIFY_API_KEY) {
    throw new Error("Address search is not configured (missing NEXT_PUBLIC_GEOAPIFY_API_KEY).");
  }

  const url = new URL(GEOAPIFY_AUTOCOMPLETE_URL);
  url.searchParams.set("text", text);
  url.searchParams.set("apiKey", GEOAPIFY_API_KEY);
  url.searchParams.set("limit", String(ADDRESS_SEARCH_LIMIT));
  url.searchParams.set("filter", "countrycode:us");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error(`Address search failed (${response.status}).`);
  const body = await response.json();

  return (Array.isArray(body?.features) ? body.features : []).map((feature) => {
    const props = feature?.properties || {};
    return {
      formatted_address: stripTownshipLabel(props.formatted),
      address_line1: normalizeText(props.address_line1),
      city: stripTownshipLabel(props.city),
      state: normalizeText(props.state_code).toUpperCase(),
      postal_code: normalizeText(props.postcode),
    };
  });
}

export async function createDealerAction(payload) {
  const supabase = getSupabaseAdmin();

  const createPayload = buildDealerPayloadFromInput({
    ...(payload || {}),
    dealer_code: payload?.dealer_code,
    dealer_name: payload?.dealer_name,
    is_active: hasOwn(payload || {}, "is_active") ? payload?.is_active : true,
  });
  assertValidPayload(createPayload, "No valid dealer payload supplied.");

  const { data, error } = await supabase.from(DEALER_TABLE).insert(createPayload).select("*").single();
  if (error) throw toDealerError(error, "Failed to create dealer");
  return data;
}

export async function updateDealerAction(dealerId, updates) {
  const supabase = getSupabaseAdmin();

  const payload = buildDealerPayloadFromInput(updates);
  assertValidPayload(payload, "No valid dealer updates supplied.");
  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from(DEALER_TABLE).update(payload).eq("dealer_id", dealerId).select("*").single();
  if (error) throw toDealerError(error, "Failed to update dealer");
  return data;
}

export async function deactivateDealerAction(dealerId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from(DEALER_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("dealer_id", dealerId)
    .select("*")
    .single();
  if (error) throw new Error(error.message || "Failed to deactivate dealer");
  return { dealerId, deactivated: true };
}

export async function hardDeleteDealerAction(dealerId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from(DEALER_TABLE).delete().eq("dealer_id", dealerId);
  if (error) throw new Error(error.message || "Failed to permanently delete dealer");
  return { dealerId, permanentlyDeleted: true };
}
```

### 3. Create `src/modules/admin/dealer-master-setup/data/dealerMasterSetup.data.js`
```js
/**
 * Dealer Master Setup — Data Layer (client-safe utilities)
 *
 * Pure helpers shared between page and view:
 * - Form field definitions and draft helpers
 * - Model helpers (normalization, display)
 * - Utility functions
 * - Batch save orchestration (via Server Actions)
 */

import {
  createDealerAction,
  updateDealerAction,
  deactivateDealerAction,
  hardDeleteDealerAction,
} from "./dealerMasterSetup.actions.js";

// ─── FORM DEFINITION ───────────────────────────────────────

// addressSearch: true renders the address search box above that section's fields.
export const DEALER_FORM_SECTIONS = [
  {
    title: "Dealer",
    fields: [
      { key: "dealer_code", label: "Dealer Code", col: "col-12 col-md-4", required: true, placeholder: "Enter dealer code" },
      { key: "dealer_name", label: "Dealer Name", col: "col-12 col-md-8", required: true, placeholder: "Enter dealer name" },
    ],
  },
  {
    title: "Contact",
    fields: [
      { key: "contact_person", label: "Contact Person", col: "col-12 col-md-6", placeholder: "Enter contact person" },
      { key: "email", label: "Email", col: "col-12 col-md-6", type: "email", placeholder: "Enter email" },
      { key: "phone", label: "Phone", col: "col-12 col-md-6", placeholder: "Enter phone" },
      { key: "mobile", label: "Mobile", col: "col-12 col-md-6", placeholder: "Enter mobile" },
    ],
  },
  {
    title: "Address",
    addressSearch: true,
    fields: [
      { key: "address_line1", label: "Address Line 1", col: "col-12", placeholder: "Enter address line 1" },
      { key: "address_line2", label: "Address Line 2", col: "col-12", placeholder: "Suite, unit, building (optional)" },
      { key: "city", label: "City", col: "col-12 col-md-5", placeholder: "Enter city" },
      { key: "state", label: "State", col: "col-12 col-md-3", placeholder: "e.g. TX" },
      { key: "postal_code", label: "ZIP Code", col: "col-12 col-md-4", placeholder: "Enter ZIP code" },
    ],
  },
  {
    title: "Business / Tax",
    fields: [
      { key: "tax_id", label: "Tax ID", col: "col-12 col-md-4", placeholder: "Enter tax ID" },
      { key: "payment_terms", label: "Payment Terms", col: "col-12 col-md-4", placeholder: "Enter payment terms" },
      { key: "credit_limit", label: "Credit Limit", col: "col-12 col-md-4", type: "number", placeholder: "0.00" },
      { key: "remarks", label: "Remarks", col: "col-12", textarea: true, placeholder: "Enter remarks (optional)" },
    ],
  },
];

export const DEALER_FIELD_KEYS = DEALER_FORM_SECTIONS.flatMap((section) => section.fields.map((field) => field.key));

export function createEmptyDealerDraft() {
  const draft = {};
  DEALER_FIELD_KEYS.forEach((key) => { draft[key] = ""; });
  return draft;
}

export function createDealerDraftFromRow(row) {
  const draft = {};
  DEALER_FIELD_KEYS.forEach((key) => { draft[key] = String(row?.[key] ?? ""); });
  return draft;
}

export function buildDealerPayloadFromDraft(draft) {
  const payload = {};
  DEALER_FIELD_KEYS.forEach((key) => {
    const text = normalizeText(draft?.[key]);
    payload[key] = text === "" ? null : text;
  });
  return payload;
}

export function isValidCreditLimit(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0;
}

// ─── MODEL HELPERS ─────────────────────────────────────────

export function isDealerActive(dealer) {
  if (dealer?.is_active === false || dealer?.is_active === 0) return false;
  const text = String(dealer?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function mapDealerRow(dealer, index) {
  return {
    ...dealer,
    id: dealer?.dealer_id ?? `dealer-${index}`,
    is_active_bool: isDealerActive(dealer),
  };
}

// ─── UTILITY HELPERS ───────────────────────────────────────

export function isSameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

export function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function removeObjectKey(objectValue, keyToRemove) {
  const normalizedKey = String(keyToRemove ?? "");
  const nextObject = {};
  Object.entries(objectValue || {}).forEach(([key, value]) => {
    if (key !== normalizedKey) {
      nextObject[key] = value;
    }
  });
  return nextObject;
}

export function mergeUpdatePatch(previousPatch, nextPatch) {
  const mergedPatch = { ...(previousPatch || {}) };
  Object.entries(nextPatch || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      mergedPatch[key] = value;
    }
  });
  return mergedPatch;
}

export function appendUniqueId(idList, value) {
  const normalizedValue = String(value ?? "");
  if (!normalizedValue) return Array.isArray(idList) ? [...idList] : [];
  const existing = Array.isArray(idList) ? idList : [];
  if (existing.some((entry) => isSameId(entry, normalizedValue))) return [...existing];
  return [...existing, normalizedValue];
}

export const EMPTY_DIALOG = { kind: null, target: null, nextIsActive: null };
export const TEMP_DEALER_PREFIX = "tmp-dealer-";

export function createTempId(prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isTempDealerId(value) {
  return String(value ?? "").startsWith(TEMP_DEALER_PREFIX);
}

export function createEmptyDealerChanges() {
  return { creates: [], updates: {}, deactivations: [], hardDeletes: [] };
}

// ─── BATCH SAVE (calls Server Actions) ─────────────────────

export async function executeBatchSave(dealerChanges) {
  const deactivatedSet = new Set(
    [...(dealerChanges.deactivations || []), ...(dealerChanges.hardDeletes || [])].map((id) => String(id ?? "")),
  );
  const tempIdMap = new Map();

  for (const createEntry of dealerChanges.creates || []) {
    const created = await createDealerAction(createEntry.payload);
    const createdId = created?.dealer_id;
    if (createdId === undefined || createdId === null || createdId === "") {
      throw new Error("Created dealer response is invalid.");
    }
    tempIdMap.set(String(createEntry.tempId), createdId);
  }

  for (const [dealerId, updates] of Object.entries(dealerChanges.updates || {})) {
    const resolvedDealerId = tempIdMap.get(String(dealerId)) ?? dealerId;
    if (deactivatedSet.has(String(resolvedDealerId))) continue;
    if (isTempDealerId(resolvedDealerId)) continue;
    if (Object.keys(updates || {}).length === 0) continue;
    await updateDealerAction(resolvedDealerId, updates);
  }

  for (const dealerId of dealerChanges.deactivations || []) {
    const resolvedDealerId = tempIdMap.get(String(dealerId)) ?? dealerId;
    if (isTempDealerId(resolvedDealerId)) continue;
    await deactivateDealerAction(resolvedDealerId);
  }

  for (const dealerId of dealerChanges.hardDeletes || []) {
    const resolvedDealerId = tempIdMap.get(String(dealerId)) ?? dealerId;
    if (isTempDealerId(resolvedDealerId)) continue;
    await hardDeleteDealerAction(resolvedDealerId);
  }
}
```

### 4. Create `src/modules/admin/dealer-master-setup/pages/DealerMasterSetupPage.js`
```js
import { loadDealerMasterSetupData } from "../data/dealerMasterSetup.actions.js";
import DealerMasterSetupView from "./DealerMasterSetupView.jsx";

export default async function DealerMasterSetupPage() {
  const { dealers } = await loadDealerMasterSetupData();
  return <DealerMasterSetupView dealers={dealers} />;
}
```

### 5. Create `src/modules/admin/dealer-master-setup/pages/DealerMasterSetupView.jsx`
```jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Modal, StatusBadge, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
import { searchDealerAddressAction } from "../data/dealerMasterSetup.actions.js";
import {
  DEALER_FORM_SECTIONS,
  createEmptyDealerDraft,
  createDealerDraftFromRow,
  buildDealerPayloadFromDraft,
  isValidCreditLimit,
  isSameId,
  compareText,
  normalizeText,
  mapDealerRow,
  removeObjectKey,
  mergeUpdatePatch,
  appendUniqueId,
  EMPTY_DIALOG,
  TEMP_DEALER_PREFIX,
  createTempId,
  isTempDealerId,
  createEmptyDealerChanges,
  executeBatchSave,
} from "../data/dealerMasterSetup.data.js";

const EMPTY_ADDRESS_SEARCH = { query: "", results: [], hasSearched: false };

// ─── HOOK: useDealerMasterSetup ────────────────────────────

function useDealerMasterSetup({ dealers = [] }) {
  const router = useRouter();

  const seedDealers = useMemo(
    () =>
      (Array.isArray(dealers) ? dealers : [])
        .map((dealer, index) => mapDealerRow(dealer, index))
        .sort((left, right) => compareText(left.dealer_name, right.dealer_name)),
    [dealers],
  );

  const [orderedDealers, setOrderedDealers] = useState(seedDealers);
  const [dealerChanges, setDealerChanges] = useState(createEmptyDealerChanges());
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [dealerDraft, setDealerDraft] = useState(createEmptyDealerDraft());
  const [addressSearch, setAddressSearch] = useState(EMPTY_ADDRESS_SEARCH);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const batchActiveRef = useRef(false);
  const addressRequestRef = useRef(0);

  const resetAddressSearch = useCallback(() => {
    addressRequestRef.current += 1;
    setAddressSearch(EMPTY_ADDRESS_SEARCH);
    setIsSearchingAddress(false);
  }, []);

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedDealers(seedDealers);
    setDealerChanges(createEmptyDealerChanges());
    setDialog(EMPTY_DIALOG);
    setDealerDraft(createEmptyDealerDraft());
    resetAddressSearch();
    setIsMutatingAction(false);
    setIsSavingBatch(false);
  }, [resetAddressSearch, seedDealers]);

  // -- computed
  const pendingSummary = useMemo(() => {
    const added = dealerChanges.creates.length;
    const edited = Object.keys(dealerChanges.updates || {}).length;
    const deactivated = dealerChanges.deactivations.length;
    const hardDeleted = (dealerChanges.hardDeletes || []).length;
    return { added, edited, deactivated, hardDeleted, total: added + edited + deactivated + hardDeleted };
  }, [dealerChanges]);

  const hasPendingChanges = pendingSummary.total > 0;

  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedDealerIds = useMemo(
    () => new Set((dealerChanges.deactivations || []).map((id) => String(id ?? ""))),
    [dealerChanges.deactivations],
  );

  const decoratedDealers = useMemo(() => {
    const createdIds = new Set((dealerChanges.creates || []).map((entry) => String(entry?.tempId ?? "")));
    const updatesMap = dealerChanges.updates || {};
    const deactivatedIds = new Set((dealerChanges.deactivations || []).map((entry) => String(entry ?? "")));
    const hardDeletedIds = new Set((dealerChanges.hardDeletes || []).map((entry) => String(entry ?? "")));

    return orderedDealers.map((row) => {
      const id = String(row?.dealer_id ?? "");
      if (hardDeletedIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (deactivatedIds.has(id)) return { ...row, __batchState: "deleted" };
      if (createdIds.has(id)) return { ...row, __batchState: "created" };

      const updates = updatesMap[id];
      if (updates) {
        const hasIsActive = Object.prototype.hasOwnProperty.call(updates, "is_active");
        if (hasIsActive) return { ...row, __batchState: updates.is_active ? "activated" : "deactivated" };
        return { ...row, __batchState: "updated" };
      }
      return { ...row, __batchState: "none" };
    });
  }, [dealerChanges.creates, dealerChanges.deactivations, dealerChanges.hardDeletes, dealerChanges.updates, orderedDealers]);

  // -- address search (Geoapify, via server action)
  const setAddressQuery = useCallback((query) => {
    setAddressSearch((prev) => ({ ...prev, query }));
  }, []);

  const searchAddress = useCallback(async () => {
    const query = normalizeText(addressSearch.query);
    if (query.length < 3) return;

    const requestId = addressRequestRef.current + 1;
    addressRequestRef.current = requestId;
    setIsSearchingAddress(true);
    try {
      const results = await searchDealerAddressAction(query);
      if (addressRequestRef.current !== requestId) return;
      setAddressSearch((prev) => ({ ...prev, results: Array.isArray(results) ? results : [], hasSearched: true }));
    } catch (error) {
      if (addressRequestRef.current !== requestId) return;
      setAddressSearch((prev) => ({ ...prev, results: [], hasSearched: false }));
      toastError(error?.message || "Address search failed. Type the address instead.");
    } finally {
      if (addressRequestRef.current === requestId) setIsSearchingAddress(false);
    }
  }, [addressSearch.query]);

  const applyAddressResult = useCallback((result) => {
    setDealerDraft((prev) => ({
      ...prev,
      address_line1: result?.address_line1 || prev.address_line1,
      city: result?.city || "",
      state: result?.state || "",
      postal_code: result?.postal_code || "",
    }));
    setAddressSearch({ query: result?.formatted_address || "", results: [], hasSearched: false });
  }, []);

  // -- dialog actions
  const closeDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog(EMPTY_DIALOG);
  }, [isMutatingAction, isSavingBatch]);

  const openAddDealerDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setDealerDraft(createEmptyDealerDraft());
    resetAddressSearch();
    setDialog({ kind: "add-dealer", target: null, nextIsActive: true });
  }, [isMutatingAction, isSavingBatch, resetAddressSearch]);

  const openEditDealerDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setDealerDraft(createDealerDraftFromRow(row));
    resetAddressSearch();
    setDialog({ kind: "edit-dealer", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch, resetAddressSearch]);

  const openToggleDealerDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const dealerId = String(row?.dealer_id ?? "");
    if (pendingDeactivatedDealerIds.has(dealerId)) {
      setDealerChanges((prev) => ({
        ...prev,
        deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, dealerId)),
      }));
      toastSuccess("Dealer deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-dealer", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [isMutatingAction, isSavingBatch, pendingDeactivatedDealerIds]);

  const openDeactivateDealerDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog({ kind: "deactivate-dealer", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const stageHardDeleteDealer = useCallback((row) => {
    const dealerId = String(row?.dealer_id ?? "");
    if (!dealerId || isMutatingAction || isSavingBatch) return;

    if (isTempDealerId(dealerId)) {
      setOrderedDealers((prev) => prev.filter((d) => !isSameId(d?.dealer_id, dealerId)));
      setDealerChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, dealerId)),
        updates: removeObjectKey(prev.updates, dealerId),
      }));
      toastSuccess("Staged dealer removed.", "Batching");
      return;
    }

    setDealerChanges((prev) => ({
      ...prev,
      deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, dealerId)),
      updates: removeObjectKey(prev.updates, String(dealerId)),
      hardDeletes: appendUniqueId(prev.hardDeletes || [], dealerId),
    }));
    toastSuccess("Dealer deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  const unstageHardDeleteDealer = useCallback((row) => {
    const dealerId = String(row?.dealer_id ?? "");
    if (!dealerId || isMutatingAction || isSavingBatch) return;
    setDealerChanges((prev) => ({
      ...prev,
      hardDeletes: (prev.hardDeletes || []).filter((id) => !isSameId(id, dealerId)),
    }));
    toastSuccess("Dealer deletion un-staged.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  // -- batch actions
  const handleCancelBatch = useCallback(() => {
    if (isMutatingAction || isSavingBatch || !hasPendingChanges) return;
    batchActiveRef.current = false;
    setOrderedDealers(seedDealers);
    setDealerChanges(createEmptyDealerChanges());
    setDialog(EMPTY_DIALOG);
    setDealerDraft(createEmptyDealerDraft());
    resetAddressSearch();
    toastSuccess("Batch changes canceled.", "Batching");
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, resetAddressSearch, seedDealers]);

  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isSavingBatch || isMutatingAction) return;
    setIsSavingBatch(true);
    setIsMutatingAction(true);
    try {
      await executeBatchSave(dealerChanges);
      setDealerChanges(createEmptyDealerChanges());
      batchActiveRef.current = false;
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally {
      setIsMutatingAction(false);
      setIsSavingBatch(false);
    }
  }, [dealerChanges, hasPendingChanges, isMutatingAction, isSavingBatch, pendingSummary.total, router]);

  // -- submit handlers
  const submitDealerForm = useCallback(() => {
    const isEdit = dialog?.kind === "edit-dealer";
    const target = dialog?.target;
    if (isEdit && !target?.dealer_id) { toastError("Invalid dealer."); return; }

    const payload = buildDealerPayloadFromDraft(dealerDraft);
    if (!payload.dealer_code) { toastError("Dealer code is required."); return; }
    if (!payload.dealer_name) { toastError("Dealer name is required."); return; }
    if (payload.credit_limit !== null && !isValidCreditLimit(payload.credit_limit)) {
      toastError("Credit limit must be a number of 0 or more.");
      return;
    }
    const isDuplicateCode = orderedDealers.some(
      (dealer) => !isSameId(dealer?.dealer_id, target?.dealer_id) && compareText(dealer?.dealer_code, payload.dealer_code) === 0,
    );
    if (isDuplicateCode) { toastError("Dealer code already exists."); return; }

    if (!isEdit) {
      const tempDealerId = createTempId(TEMP_DEALER_PREFIX);
      setOrderedDealers((prev) => [
        ...prev,
        mapDealerRow({ ...payload, dealer_id: tempDealerId, is_active: true }, prev.length),
      ]);
      setDealerChanges((prev) => ({
        ...prev,
        creates: [...prev.creates, { tempId: tempDealerId, payload: { ...payload, is_active: true } }],
      }));
      setDialog(EMPTY_DIALOG);
      setDealerDraft(createEmptyDealerDraft());
      toastSuccess("Dealer staged for Save Batch.", "Batching");
      return;
    }

    const dealerId = target.dealer_id;
    setOrderedDealers((prev) =>
      prev.map((dealer, index) => {
        if (!isSameId(dealer?.dealer_id, dealerId)) return dealer;
        return mapDealerRow({ ...dealer, ...payload }, index);
      }),
    );
    setDealerChanges((prev) => {
      if (isTempDealerId(dealerId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, dealerId)) return entry;
            return { ...entry, payload: { ...entry.payload, ...payload } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(dealerId)]: mergeUpdatePatch(prev.updates?.[String(dealerId)], payload),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    setDealerDraft(createEmptyDealerDraft());
    toastSuccess("Dealer edit staged for Save Batch.", "Batching");
  }, [dealerDraft, dialog?.kind, dialog?.target, orderedDealers]);

  const submitToggleDealer = useCallback(() => {
    const row = dialog?.target;
    if (!row?.dealer_id) { toastError("Invalid dealer."); return; }
    const dealerId = row.dealer_id;
    const nextIsActive = Boolean(dialog?.nextIsActive);
    setOrderedDealers((prev) =>
      prev.map((dealer, index) => {
        if (!isSameId(dealer?.dealer_id, dealerId)) return dealer;
        return mapDealerRow({ ...dealer, is_active: nextIsActive }, index);
      }),
    );
    setDealerChanges((prev) => {
      if (isTempDealerId(dealerId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, dealerId)) return entry;
            return { ...entry, payload: { ...entry.payload, is_active: nextIsActive } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(dealerId)]: mergeUpdatePatch(prev.updates?.[String(dealerId)], { is_active: nextIsActive }),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(nextIsActive ? "Dealer enabled — staged for Save Batch." : "Dealer disabled — staged for Save Batch.", "Batching");
  }, [dialog?.nextIsActive, dialog?.target]);

  const submitDeactivateDealer = useCallback(() => {
    const row = dialog?.target;
    if (!row?.dealer_id) { toastError("Invalid dealer."); return; }
    const dealerId = row.dealer_id;
    if (isTempDealerId(dealerId)) {
      setOrderedDealers((prev) => prev.filter((dealer) => !isSameId(dealer?.dealer_id, dealerId)));
      setDealerChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((entry) => !isSameId(entry?.tempId, dealerId)),
        updates: removeObjectKey(prev.updates, String(dealerId)),
      }));
      setDialog(EMPTY_DIALOG);
      toastSuccess("Staged dealer removed.", "Batching");
      return;
    }
    setDealerChanges((prev) => ({
      ...prev,
      deactivations: appendUniqueId(prev.deactivations, dealerId),
    }));
    setDialog(EMPTY_DIALOG);
    toastSuccess("Dealer deactivation staged for Save Batch.", "Batching");
  }, [dialog?.target]);

  return {
    decoratedDealers, dialog, dealerDraft, isSavingBatch, isMutatingAction,
    pendingSummary, hasPendingChanges, pendingDeactivatedDealerIds,
    addressSearch, isSearchingAddress, setAddressQuery, searchAddress, applyAddressResult,
    setDealerDraft, closeDialog, openAddDealerDialog, openEditDealerDialog,
    openToggleDealerDialog, openDeactivateDealerDialog, stageHardDeleteDealer, unstageHardDeleteDealer,
    handleCancelBatch, handleSaveBatch, submitDealerForm, submitToggleDealer, submitDeactivateDealer,
  };
}

// ─── SUB-COMPONENTS ────────────────────────────────────────

function displayText(value) {
  return normalizeText(value) || "--";
}

function DealerHeader({ hasPendingChanges, pendingSummary, isSavingBatch, isMutatingAction, handleSaveBatch, handleCancelBatch, openAddDealerDialog }) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <h4 className="mb-0">Dealer Master Setup</h4>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {hasPendingChanges ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "#856404", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "999px", padding: "0.25rem 0.7rem", lineHeight: 1.4 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#d39e00", flexShrink: 0 }} />
            {pendingSummary.total} pending
          </span>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSavingBatch} disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleSaveBatch}>
          Save Batch
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleCancelBatch}>
          Cancel Batch
        </Button>
        <Button type="button" size="sm" variant="success" disabled={isSavingBatch || isMutatingAction} onClick={openAddDealerDialog}>
          Add Dealer
        </Button>
      </div>
    </div>
  );
}

function DealerTable({ decoratedDealers, isMutatingAction, isSavingBatch, pendingDeactivatedDealerIds, openEditDealerDialog, openToggleDealerDialog, openDeactivateDealerDialog, stageHardDeleteDealer, onUndoBatchAction }) {
  const columns = useMemo(
    () => [
      {
        key: "dealer_code", label: "Dealer Code", width: "15%", sortable: true,
        render: (row) => {
          const batchState = String(row?.__batchState || "");
          let markerText = "";
          let markerClass = "";
          switch (batchState) {
            case "hardDeleted": markerText = "Deleted"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "deleted": markerText = "Deactivated"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "created": markerText = "New"; markerClass = "psb-batch-marker psb-batch-marker-new"; break;
            case "updated": markerText = "Edited"; markerClass = "psb-batch-marker psb-batch-marker-edited"; break;
            case "activated": markerText = "Activated"; markerClass = "psb-batch-marker psb-batch-marker-activated"; break;
            case "deactivated": markerText = "Deactivated"; markerClass = "psb-batch-marker psb-batch-marker-deactivated"; break;
            default: break;
          }
          return (
            <span>
              {displayText(row?.dealer_code)}
              {markerText ? <span className={markerClass}>{markerText}</span> : null}
            </span>
          );
        },
      },
      { key: "dealer_name", label: "Dealer Name", width: "24%", sortable: true, render: (row) => displayText(row?.dealer_name) },
      { key: "contact_person", label: "Contact Person", width: "17%", sortable: true, render: (row) => displayText(row?.contact_person) },
      { key: "phone", label: "Phone", width: "13%", sortable: true, render: (row) => displayText(row?.phone) },
      { key: "city", label: "City", width: "13%", sortable: true, render: (row) => displayText(row?.city) },
      { key: "state", label: "State", width: "8%", sortable: true, render: (row) => displayText(row?.state) },
      {
        key: "is_active_bool", label: "Active", width: "10%", sortable: true, align: "center",
        render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />,
      },
    ],
    [],
  );

  const actions = useMemo(
    () => [
      { key: "edit-dealer", label: "Edit", type: "secondary", icon: "pen", disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openEditDealerDialog(row) },
      { key: "restore-dealer", label: "Restore", type: "secondary", icon: "rotate-left", visible: (row) => !Boolean(row?.is_active_bool) || pendingDeactivatedDealerIds.has(String(row?.dealer_id ?? "")), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openToggleDealerDialog(row) },
      { key: "deactivate-dealer", label: "Deactivate", type: "secondary", icon: "ban", visible: (row) => Boolean(row?.is_active_bool) && !pendingDeactivatedDealerIds.has(String(row?.dealer_id ?? "")), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openDeactivateDealerDialog(row) },
      { key: "delete-dealer", label: "Delete", type: "danger", icon: "trash", confirm: true, confirmMessage: (row) => `Permanently delete ${row?.dealer_name || "this dealer"}? This action cannot be undone.`, disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => stageHardDeleteDealer(row) },
    ],
    [isMutatingAction, isSavingBatch, openDeactivateDealerDialog, openEditDealerDialog, openToggleDealerDialog, pendingDeactivatedDealerIds, stageHardDeleteDealer],
  );

  return (
    <div className="row g-3 align-items-start">
      <div className="col-12">
        <Card title="Dealers" subtitle="Dealer master records.">
          <TableZ columns={columns} data={decoratedDealers} rowIdKey="dealer_id" actions={actions} onUndoBatchAction={onUndoBatchAction} emptyMessage="No dealers found." />
        </Card>
      </div>
    </div>
  );
}

function DealerAddressSearch({ addressSearch, isSearchingAddress, setAddressQuery, onSearch, onSelect, isBusy }) {
  const canSearch = normalizeText(addressSearch.query).length >= 3 && !isSearchingAddress && !isBusy;

  return (
    <div className="mb-2">
      <label className="form-label mb-1">Find Address</label>
      <div className="d-flex gap-2">
        <Input
          value={addressSearch.query}
          onChange={(e) => setAddressQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (canSearch) onSearch();
          }}
          placeholder="Search a US address, then pick a result"
          disabled={isBusy}
        />
        <Button type="button" size="sm" variant="secondary" loading={isSearchingAddress} disabled={!canSearch} onClick={onSearch}>
          Search
        </Button>
      </div>
      {addressSearch.results.length > 0 ? (
        <div className="list-group mt-2" style={{ maxHeight: 220, overflowY: "auto" }}>
          {addressSearch.results.map((result, index) => (
            <button key={`${result.formatted_address}-${index}`} type="button" className="list-group-item list-group-item-action" disabled={isBusy} onClick={() => onSelect(result)}>
              <div>{result.formatted_address || result.address_line1}</div>
              <small className="text-muted">{[result.city, result.state, result.postal_code].filter(Boolean).join(", ")}</small>
            </button>
          ))}
        </div>
      ) : null}
      {addressSearch.results.length === 0 && addressSearch.hasSearched && !isSearchingAddress ? (
        <div className="form-text">No addresses found. You can type the address below.</div>
      ) : null}
    </div>
  );
}

function DealerDialog({ dialog, dealerDraft, isMutatingAction, isSavingBatch, addressSearch, isSearchingAddress, setAddressQuery, searchAddress, applyAddressResult, setDealerDraft, closeDialog, submitDealerForm, submitToggleDealer, submitDeactivateDealer }) {
  const dialogTitle = useMemo(() => {
    const kind = dialog?.kind;
    if (kind === "add-dealer") return "Add Dealer";
    if (kind === "edit-dealer") return "Edit Dealer";
    if (kind === "toggle-dealer") return dialog?.nextIsActive ? "Enable Dealer" : "Disable Dealer";
    if (kind === "deactivate-dealer") return "Deactivate Dealer";
    return "Dealer";
  }, [dialog?.kind, dialog?.nextIsActive]);

  if (!dialog?.kind) return null;
  const isBusy = isMutatingAction || isSavingBatch;
  const isForm = dialog.kind === "add-dealer" || dialog.kind === "edit-dealer";

  return (
    <Modal show onHide={closeDialog} title={dialogTitle} size={isForm ? "lg" : undefined}>
      {isForm ? (
        <div>
          {DEALER_FORM_SECTIONS.map((section) => (
            <div key={section.title} className="mb-3">
              <h6 className="mb-2">{section.title}</h6>
              {section.addressSearch ? (
                <DealerAddressSearch
                  addressSearch={addressSearch}
                  isSearchingAddress={isSearchingAddress}
                  setAddressQuery={setAddressQuery}
                  onSearch={searchAddress}
                  onSelect={applyAddressResult}
                  isBusy={isBusy}
                />
              ) : null}
              <div className="row g-2">
                {section.fields.map((field) => (
                  <div key={field.key} className={field.col}>
                    <label className="form-label mb-1">{field.label}{field.required ? " *" : ""}</label>
                    <Input
                      {...(field.textarea ? { as: "textarea", rows: 2 } : { type: field.type || "text" })}
                      value={dealerDraft[field.key]}
                      onChange={(e) => setDealerDraft((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      disabled={isBusy}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.kind === "add-dealer" ? "success" : "primary"} size="sm" loading={isBusy} disabled={isBusy} onClick={submitDealerForm}>
              {dialog.kind === "add-dealer" ? "Add" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "toggle-dealer" ? (
        <div>
          <p className="mb-3">{dialog.nextIsActive ? `Enable dealer "${dialog.target?.dealer_name || "--"}"?` : `Disable dealer "${dialog.target?.dealer_name || "--"}"?`}</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.nextIsActive ? "primary" : "secondary"} size="sm" loading={isBusy} disabled={isBusy} onClick={submitToggleDealer}>
              {dialog.nextIsActive ? "Enable" : "Disable"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "deactivate-dealer" ? (
        <div>
          <p className="mb-3">Deactivate dealer <strong>&quot;{dialog.target?.dealer_name || "--"}&quot;</strong>? This action will be staged for Save Batch.</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant="warning" size="sm" loading={isBusy} disabled={isBusy} onClick={submitDeactivateDealer}>Deactivate</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// ─── MAIN VIEW (default export) ────────────────────────────

export default function DealerMasterSetupView({ dealers }) {
  const hook = useDealerMasterSetup({ dealers });

  return (
    <main className="container py-4">
      <DealerHeader
        hasPendingChanges={hook.hasPendingChanges}
        pendingSummary={hook.pendingSummary}
        isSavingBatch={hook.isSavingBatch}
        isMutatingAction={hook.isMutatingAction}
        handleSaveBatch={hook.handleSaveBatch}
        handleCancelBatch={hook.handleCancelBatch}
        openAddDealerDialog={hook.openAddDealerDialog}
      />
      <DealerTable
        decoratedDealers={hook.decoratedDealers}
        isMutatingAction={hook.isMutatingAction}
        isSavingBatch={hook.isSavingBatch}
        pendingDeactivatedDealerIds={hook.pendingDeactivatedDealerIds}
        openEditDealerDialog={hook.openEditDealerDialog}
        openToggleDealerDialog={hook.openToggleDealerDialog}
        openDeactivateDealerDialog={hook.openDeactivateDealerDialog}
        stageHardDeleteDealer={hook.stageHardDeleteDealer}
        onUndoBatchAction={hook.unstageHardDeleteDealer}
      />
      <DealerDialog
        dialog={hook.dialog}
        dealerDraft={hook.dealerDraft}
        isMutatingAction={hook.isMutatingAction}
        isSavingBatch={hook.isSavingBatch}
        addressSearch={hook.addressSearch}
        isSearchingAddress={hook.isSearchingAddress}
        setAddressQuery={hook.setAddressQuery}
        searchAddress={hook.searchAddress}
        applyAddressResult={hook.applyAddressResult}
        setDealerDraft={hook.setDealerDraft}
        closeDialog={hook.closeDialog}
        submitDealerForm={hook.submitDealerForm}
        submitToggleDealer={hook.submitToggleDealer}
        submitDeactivateDealer={hook.submitDeactivateDealer}
      />
    </main>
  );
}
```

### 6. Generate the route wrapper
Run `npm run gen:routes`. Expected output includes `WRITE src\app\admin\dealer-master-setup\page.js`. Do not hand-write or edit that file. If the script reports `ERROR loading` for any module, STOP and report.

## Verify
- Lint: `npm run lint` → 0 errors in the 5 new files; warnings no higher than before the change.
- Build: `npm run build` → 0 errors (only if `.env.local` is configured; otherwise report that it was skipped).
- Grep:
  - `grep -rn "psb_s_dealermaster" src/` → only in `src/modules/admin/dealer-master-setup/data/dealerMasterSetup.actions.js`.
  - `grep -rn "geoapify" src/` → only in that same actions file.
  - `grep -rn "countriesnow\|state_province" src/` → no matches.
  - `git status --short` → only the 6 new files listed in Scope; no modified files.
- Manual (no DB/data changes — never click **Save Batch**):
  1. `npm run dev`, open `/admin/dealer-master-setup` → page renders with heading "Dealer Master Setup" and "No dealers found." (or the existing rows).
  2. Click **Add Dealer** → large modal with four sections: Dealer, Contact, Address, Business / Tax. The Address section starts with a "Find Address" box and a disabled **Search** button.
  3. Type `1500 Marilla St Dallas` and press Enter → a list of US address results appears.
  4. Click a Dallas result → Address Line 1, City (`Dallas`), State (`TX`) and ZIP Code fill in, and the result list closes.
  5. Change the City by hand → the edit is kept (the fields are not locked).
  6. Click **Add** with code and name empty → toast "Dealer code is required."
  7. Enter code `TEST01`, name `Test Dealer`, click **Add** → row appears with a "New" marker, City `Dallas`, State `TX`, and the header shows "1 pending".
  8. Click **Cancel Batch** → the row disappears and the pending badge is gone.

## Report back
- Step 0 findings (including whether the Geoapify key is configured)
- Output of `npm run gen:routes`
- Lint and build summaries
- Any file that already existed (step number + path)
- Result of each manual check, especially 3 and 4