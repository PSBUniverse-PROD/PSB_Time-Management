"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchSelect, toastError, toastSuccess } from "@/shared/components/ui";
import { loadUsCitiesByStateAction } from "@/modules/admin/dealer-master-setup/data/dealerMasterSetup.actions.js";
import { updateDealerProfileAction } from "../data/dealerPortal.actions";

const TITLE = "Business address";
const KEYS = ["address_line1", "address_line2", "state", "city", "postal_code"];

/** Keeps a value that is not in the loaded list selectable (older free-text entries). */
function withCurrent(options, current) {
  if (!current || options.some((option) => option.value === current)) return options;
  return [{ value: current, label: current }, ...options];
}

/**
 * Address form with State → City → ZIP pickers. Choosing a state loads its
 * cities; choosing a city narrows the ZIP codes.
 */
export default function DealerAddressForm({ initialValues, states }) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [cities, setCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [saving, setSaving] = useState(false);

  const stateCode = values.state || "";

  useEffect(() => {
    if (!stateCode) {
      setCities([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingCities(true);
    loadUsCitiesByStateAction(stateCode)
      .then((rows) => { if (!cancelled) setCities(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setCities([]); })
      .finally(() => { if (!cancelled) setLoadingCities(false); });
    return () => { cancelled = true; };
  }, [stateCode]);

  const stateOptions = useMemo(
    () => withCurrent((states || []).map((state) => ({ value: state.code, label: `${state.name} (${state.code})` })), stateCode),
    [states, stateCode],
  );
  const cityOptions = useMemo(
    () => withCurrent(cities.map((row) => ({ value: row.city, label: row.city })), values.city || ""),
    [cities, values.city],
  );
  const zipOptions = useMemo(() => {
    const match = cities.find((row) => row.city === values.city);
    return withCurrent((match?.zips || []).map((zip) => ({ value: zip, label: zip })), values.postal_code || "");
  }, [cities, values.city, values.postal_code]);

  const isDirty = KEYS.some((key) => (values[key] ?? "") !== (initialValues[key] ?? ""));

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving || !isDirty) return;
    setSaving(true);
    try {
      const payload = Object.fromEntries(KEYS.map((key) => [key, values[key] ?? ""]));
      const result = await updateDealerProfileAction("address", payload);
      if (!result?.success) {
        toastError(result?.error || "Unable to save your changes.", TITLE);
        return;
      }
      toastSuccess("Your changes have been saved.", TITLE);
      router.refresh();
    } catch {
      toastError("Unable to save your changes. Please try again.", TITLE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="dp-panel" onSubmit={handleSubmit} noValidate>
      <div className="dp-panel-head"><h2>{TITLE}</h2></div>
      <div className="dp-panel-body">
        <div className="dp-form-grid">
          <div className="dp-field is-full">
            <label htmlFor="dp-address-line1">Address line 1</label>
            <input id="dp-address-line1" type="text" maxLength={200} value={values.address_line1 ?? ""} onChange={(event) => setValues((prev) => ({ ...prev, address_line1: event.target.value }))} />
          </div>
          <div className="dp-field is-full">
            <label htmlFor="dp-address-line2">Address line 2</label>
            <input id="dp-address-line2" type="text" maxLength={200} placeholder="Suite, unit, building (optional)" value={values.address_line2 ?? ""} onChange={(event) => setValues((prev) => ({ ...prev, address_line2: event.target.value }))} />
          </div>
          <div className="dp-field">
            <label htmlFor="dp-address-state">State</label>
            <SearchSelect
              id="dp-address-state"
              options={stateOptions}
              value={stateCode || null}
              onChange={(value) => setValues((prev) => ({ ...prev, state: value ?? "", city: "", postal_code: "" }))}
              placeholder="Select a state"
              searchPlaceholder="Search states..."
            />
          </div>
          <div className="dp-field">
            <label htmlFor="dp-address-city">City</label>
            <SearchSelect
              id="dp-address-city"
              options={cityOptions}
              value={values.city || null}
              onChange={(value) => setValues((prev) => ({ ...prev, city: value ?? "", postal_code: "" }))}
              placeholder={!stateCode ? "Pick a state first" : loadingCities ? "Loading cities..." : "Select a city"}
              searchPlaceholder="Search cities..."
              disabled={!stateCode || loadingCities}
            />
          </div>
          <div className="dp-field">
            <label htmlFor="dp-address-zip">ZIP code</label>
            <SearchSelect
              id="dp-address-zip"
              options={zipOptions}
              value={values.postal_code || null}
              onChange={(value) => setValues((prev) => ({ ...prev, postal_code: value ?? "" }))}
              placeholder={values.city ? "Select a ZIP code" : "Pick a city first"}
              searchPlaceholder="Search ZIP codes..."
              disabled={!values.city}
            />
          </div>
          <div className="dp-field">
            <label htmlFor="dp-address-country">Country</label>
            <input id="dp-address-country" type="text" value={initialValues.country ?? "US"} readOnly />
          </div>
        </div>
      </div>
      <div className="dp-panel-foot">
        <button type="button" className="dp-btn" disabled={saving || !isDirty} onClick={() => setValues(initialValues)}>Cancel</button>
        <button type="submit" className="dp-btn dp-btn-primary" disabled={saving || !isDirty}>{saving ? "Saving..." : "Save changes"}</button>
      </div>
    </form>
  );
}
