"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastError, toastSuccess } from "@/shared/components/ui";
import { updateDealerProfileAction } from "../data/dealerPortal.actions";

/**
 * One editable profile panel. `fields` is a list of
 * { key, label, type?, readOnly?, required?, hint?, placeholder? }; read-only
 * fields are shown but never sent.
 */
export default function DealerProfileForm({ section, title, fields, initialValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);

  const editable = fields.filter((field) => !field.readOnly);
  const isDirty = editable.some((field) => (values[field.key] ?? "") !== (initialValues[field.key] ?? ""));

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving || !isDirty) return;
    setSaving(true);
    try {
      const payload = Object.fromEntries(editable.map((field) => [field.key, values[field.key] ?? ""]));
      const result = await updateDealerProfileAction(section, payload);
      if (!result?.success) {
        toastError(result?.error || "Unable to save your changes.", title);
        return;
      }
      toastSuccess("Your changes have been saved.", title);
      router.refresh();
    } catch {
      toastError("Unable to save your changes. Please try again.", title);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="dp-panel" onSubmit={handleSubmit} noValidate>
      <div className="dp-panel-head"><h2>{title}</h2></div>
      <div className="dp-panel-body">
        <div className="dp-form-grid">
          {fields.map((field) => (
            <div className="dp-field" key={field.key}>
              <label htmlFor={`dp-${section}-${field.key}`}>{field.label}</label>
              <input
                id={`dp-${section}-${field.key}`}
                type={field.type || "text"}
                value={values[field.key] ?? ""}
                readOnly={Boolean(field.readOnly)}
                required={Boolean(field.required)}
                placeholder={field.placeholder || ""}
                maxLength={200}
                onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
              />
              {field.hint ? <span className="dp-hint">{field.hint}</span> : null}
            </div>
          ))}
        </div>
      </div>
      <div className="dp-panel-foot">
        <button type="button" className="dp-btn" disabled={saving || !isDirty} onClick={() => setValues(initialValues)}>Cancel</button>
        <button type="submit" className="dp-btn dp-btn-primary" disabled={saving || !isDirty}>{saving ? "Saving..." : "Save changes"}</button>
      </div>
    </form>
  );
}
