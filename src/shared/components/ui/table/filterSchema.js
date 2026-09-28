const FILTER_TYPES = {
  text: "text",
  select: "select",
  date: "date",
  daterange: "daterange",
};

const ALLOWED_FILTER_TYPES = new Set(Object.values(FILTER_TYPES));

function ensure(condition, message) {
  if (!condition) {
    throw new Error(`[TableFilterSchema] ${message}`);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOption(option) {
  if (isPlainObject(option)) {
    return {
      label: String(option.label ?? option.value ?? ""),
      value: option.value,
    };
  }

  return {
    label: String(option),
    value: option,
  };
}

export const TABLE_FILTER_TYPES = Object.freeze({
  TEXT: FILTER_TYPES.text,
  SELECT: FILTER_TYPES.select,
  DATE: FILTER_TYPES.date,
  DATERANGE: FILTER_TYPES.daterange,
});

export function createFilterConfig(definitions = []) {
  ensure(Array.isArray(definitions), "filter definitions must be an array.");

  const usedKeys = new Set();

  return definitions.map((definition, index) => {
    ensure(isPlainObject(definition), `filter at index ${index} must be an object.`);

    const key = String(definition.key || "").trim();
    ensure(key !== "", `filter at index ${index} is missing key.`);
    ensure(!usedKeys.has(key), `filter key \"${key}\" is duplicated.`);
    usedKeys.add(key);

    const label = String(definition.label || key).trim();
    ensure(label !== "", `filter \"${key}\" is missing label.`);

    const rawType = String(definition.type || FILTER_TYPES.text).trim().toLowerCase();
    ensure(ALLOWED_FILTER_TYPES.has(rawType), `filter \"${key}\" has unsupported type \"${rawType}\".`);

    const normalizedFilter = {
      ...definition,
      key,
      label,
      type: rawType,
    };

    if (rawType === FILTER_TYPES.select) {
      const options = Array.isArray(definition.options) ? definition.options : [];
      normalizedFilter.options = options.map((option) => normalizeOption(option));
    }

    return normalizedFilter;
  });
}
