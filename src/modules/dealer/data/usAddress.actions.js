"use server";

import zipcodes from "zipcodes-us";

// Offline US ZIP data (zipcodes-us) for the cascading State → City → ZIP dropdowns
// in the dealer portal. Kept in its own file so pages that don't need it never
// load this large package.
// The package has no "list everything" call, so a radius wider than half the
// Earth's circumference (~12,450 miles) is used to pull every ZIP once.
const ALL_ZIPS_CENTER = { latitude: 39.8283, longitude: -98.5795 };
const ALL_ZIPS_RADIUS_MILES = 13000;
let usAddressIndex = null;

function normalizeText(value) {
  return String(value ?? "").trim();
}

/**
 * Builds (once per server process) a lookup of
 * stateCode -> Map(cityName -> ZIP list) from the bundled ZIP data.
 */
function getUsAddressIndex() {
  if (usAddressIndex) return usAddressIndex;

  const index = new Map();
  const allZips = zipcodes.findByRadius(ALL_ZIPS_CENTER.latitude, ALL_ZIPS_CENTER.longitude, ALL_ZIPS_RADIUS_MILES);
  for (const info of allZips) {
    const stateCode = normalizeText(info?.stateCode).toUpperCase();
    const city = normalizeText(info?.placeName);
    const zip = normalizeText(info?.zipCode);
    if (!stateCode || !city || !zip) continue;

    if (!index.has(stateCode)) index.set(stateCode, new Map());
    const cities = index.get(stateCode);
    if (!cities.has(city)) cities.set(city, []);
    cities.get(city).push(zip);
  }

  usAddressIndex = index;
  return index;
}

/**
 * Lists US states for the State dropdown, sorted by name.
 *
 * Returns [] if the ZIP data cannot be read, so the page still renders
 * and the form falls back to plain text inputs.
 */
export async function loadUsStatesAction() {
  try {
    return zipcodes
      .getStates()
      .map((entry) => ({ code: normalizeText(entry?.code).toUpperCase(), name: normalizeText(entry?.name) }))
      .filter((entry) => entry.code && entry.name)
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    console.error("[us-address] Failed to load US states:", error?.message || error);
    return [];
  }
}

/**
 * Lists every city in a state together with its ZIP codes, so the form
 * can cascade State → City → ZIP with a single request per state.
 */
export async function loadUsCitiesByStateAction(stateCode) {
  const code = normalizeText(stateCode).toUpperCase();
  if (!code) return [];

  const cities = getUsAddressIndex().get(code);
  if (!cities) return [];

  return Array.from(cities.entries())
    .map(([city, zips]) => ({ city, zips: Array.from(new Set(zips)).sort() }))
    .sort((left, right) => left.city.localeCompare(right.city));
}
