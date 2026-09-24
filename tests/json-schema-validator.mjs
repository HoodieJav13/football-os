/**
 * A small JSON Schema (draft 2020-12) validator, written by hand so the
 * repository takes on no dependency for one contract test.
 *
 * It implements exactly the keywords `docs/export-format.schema.json` uses:
 * `$ref` (local JSON pointers only), `type`, `const`, `enum`, `properties`,
 * `required`, `additionalProperties`, `items`, `prefixItems`, `minItems`,
 * `maxItems`, `minimum`, `maximum`, `exclusiveMinimum`, `minLength`,
 * `pattern`, `allOf`, `anyOf`, `oneOf`, and `not`. `format` is an annotation
 * and is not checked; the schema carries a `pattern` wherever the format
 * matters. Any other keyword is ignored, which is what the specification
 * prescribes for unknown keywords -- but it also means a keyword added to the
 * schema without being added here silently checks nothing, so
 * `tests/export-format.test.mjs` asserts that every keyword in the schema is
 * one of the supported set.
 */

export const SUPPORTED_KEYWORDS = new Set([
  "$schema", "$id", "$ref", "$defs", "title", "description", "examples", "format",
  "type", "const", "enum", "properties", "required", "additionalProperties",
  "items", "prefixItems", "minItems", "maxItems",
  "minimum", "maximum", "exclusiveMinimum", "minLength", "pattern",
  "allOf", "anyOf", "oneOf", "not",
]);

const typeOf = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

const matchesType = (value, type) => {
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeOf(value) === type;
};

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function resolveRef(ref, root) {
  if (!ref.startsWith("#/")) throw new Error(`Only local $ref pointers are supported, got ${ref}`);
  return ref
    .slice(2)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((node, token) => {
      if (node === undefined || !(token in node)) throw new Error(`Unresolvable $ref ${ref}`);
      return node[token];
    }, root);
}

/**
 * @returns {{path: string, message: string}[]} every failed check, with the
 *   JSON pointer of the offending value. Empty means valid.
 */
export function validate(value, schema, root = schema, path = "") {
  const errors = [];
  const fail = (message) => errors.push({ path: path || "/", message });

  if (schema === true) return errors;
  if (schema === false) { fail("no value is allowed here"); return errors; }

  if (schema.$ref) {
    errors.push(...validate(value, resolveRef(schema.$ref, root), root, path));
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      fail(`expected ${types.join(" | ")}, got ${typeOf(value)}`);
    }
  }
  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    fail(`expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum !== undefined && !schema.enum.some((option) => deepEqual(option, value))) {
    fail(`expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(`expected at least ${schema.minLength} characters`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) {
      fail(`${JSON.stringify(value)} does not match /${schema.pattern}/`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`expected >= ${schema.minimum}, got ${value}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`expected <= ${schema.maximum}, got ${value}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      fail(`expected > ${schema.exclusiveMinimum}, got ${value}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(`expected at least ${schema.minItems} items, got ${value.length}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      fail(`expected at most ${schema.maxItems} items, got ${value.length}`);
    }
    const prefixCount = schema.prefixItems?.length ?? 0;
    value.forEach((item, index) => {
      const itemSchema = index < prefixCount ? schema.prefixItems[index] : schema.items;
      if (itemSchema !== undefined) errors.push(...validate(item, itemSchema, root, `${path}/${index}`));
    });
  }

  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) fail(`missing required property "${key}"`);
    }
    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (key in value) errors.push(...validate(value[key], propertySchema, root, `${path}/${key}`));
    }
    if (schema.additionalProperties !== undefined) {
      for (const key of Object.keys(value)) {
        if (schema.properties && key in schema.properties) continue;
        errors.push(...validate(value[key], schema.additionalProperties, root, `${path}/${key}`));
      }
    }
  }

  for (const subschema of schema.allOf ?? []) {
    errors.push(...validate(value, subschema, root, path));
  }
  if (schema.anyOf && !schema.anyOf.some((subschema) => validate(value, subschema, root, path).length === 0)) {
    fail("matched none of the anyOf alternatives");
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((subschema) => validate(value, subschema, root, path).length === 0).length;
    if (matches !== 1) fail(`expected exactly one oneOf alternative to match, ${matches} did`);
  }
  if (schema.not && validate(value, schema.not, root, path).length === 0) {
    fail("matched a forbidden schema");
  }

  return errors;
}

/** Every keyword used anywhere in a schema document, for the coverage assertion. */
export function keywordsIn(schema, found = new Set()) {
  if (Array.isArray(schema)) {
    schema.forEach((item) => keywordsIn(item, found));
  } else if (schema && typeof schema === "object") {
    for (const [key, child] of Object.entries(schema)) {
      found.add(key);
      // `properties` and `$defs` hold user-named keys, not keywords.
      if (key === "properties" || key === "$defs") {
        Object.values(child).forEach((item) => keywordsIn(item, found));
      } else if (key !== "enum" && key !== "const" && key !== "required" && key !== "examples") {
        keywordsIn(child, found);
      }
    }
  }
  return found;
}
