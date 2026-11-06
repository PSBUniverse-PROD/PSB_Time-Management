/**
 * Dealer portal — shared, client-safe definitions.
 */

export function hasText(value) {
  return String(value ?? "").trim() !== "";
}

// `href` is the section of the account page where the dealer fills it in.
export const PROFILE_CHECKLIST = [
  { key: "dealer_name", label: "Company name", href: "#company" },
  { key: "tax_id", label: "Tax ID", href: "#company" },
  { key: "contact_person", label: "Contact person", href: "#contacts" },
  { key: "email", label: "Email", href: "#contacts" },
  { key: "phone", label: "Phone", href: "#contacts" },
  { key: "mobile", label: "Mobile", href: "#contacts" },
  { key: "address_line1", label: "Street address", href: "#address" },
  { key: "state", label: "State", href: "#address" },
  { key: "city", label: "City", href: "#address" },
  { key: "postal_code", label: "ZIP code", href: "#address" },
];

export const COMPANY_FIELDS = [
  { key: "dealer_name", label: "Dealer name", required: true },
  { key: "dealer_code", label: "Dealer code", readOnly: true, hint: "Set by PSB" },
  { key: "tax_id", label: "Tax ID", placeholder: "e.g. 12-3456789", hint: "Used on invoices and tax paperwork" },
  { key: "payment_terms", label: "Payment terms", readOnly: true, hint: "Set by PSB" },
  { key: "credit_limit", label: "Credit limit", readOnly: true, hint: "Set by PSB" },
];

// Company fields in the staff view ("Login as dealer"): the PSB-only fields
// become editable and PSB's internal remarks are shown. Dealers never get this list.
export const STAFF_COMPANY_FIELDS = [
  ...COMPANY_FIELDS.map((field) => {
    if (field.key === "payment_terms") return { ...field, readOnly: false, hint: "PSB only", placeholder: "e.g. Net 30" };
    if (field.key === "credit_limit") return { ...field, readOnly: false, type: "number", hint: "PSB only", placeholder: "0.00" };
    return field;
  }),
  { key: "remarks", label: "Internal remarks", hint: "PSB only, never shown to the dealer", maxLength: 2000 },
];

// Paperwork PSB collects from a dealer. `required` ones appear on the
// "What PSB needs" checklist. Change the list here; keys are stored in
// psb_m_dealerfile.doc_type, so do not rename a key that is already in use.
export const DEALER_DOC_TYPES = [
  { key: "resale_certificate", label: "Resale certificate", required: true },
  { key: "w9", label: "W-9", required: true },
  { key: "business_license", label: "Business license", required: true },
  { key: "insurance_certificate", label: "Certificate of insurance", required: true },
  { key: "other", label: "Other", required: false },
];

// Must match the dealer-files bucket's own limits.
export const DEALER_FILE_ACCEPT = "application/pdf,image/jpeg,image/png";
export const DEALER_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const CONTACT_FIELDS = [
  { key: "contact_person", label: "Contact person" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "mobile", label: "Mobile", type: "tel", hint: "Used for delivery-day calls" },
];
