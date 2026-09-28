// The one template engine (docs/assembly_run_storage.md, "Templates"): `{name}` over declared names only, logic-less, single-pass.
import { enforce } from "./refusal.js";

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const MAX_VALUE_BYTES = 4096;

export function renderTemplate(template: string, scope: Record<string, unknown>): string {
  const rendered = template.replace(PLACEHOLDER, (placeholder, name: string) => textOf(scope, name));

  enforce(Buffer.byteLength(rendered) <= MAX_VALUE_BYTES, `a rendered value is over ${MAX_VALUE_BYTES} bytes`);

  return rendered;
}

// Own properties only: `{constructor}` must not reach what every object inherits.
function textOf(scope: Record<string, unknown>, name: string): string {
  enforce(Object.hasOwn(scope, name), `a template names {${name}}, which is not there to fill it`);
  const value = scope[name];

  enforce(isScalar(value), `{${name}} is not text, a number or a boolean`);

  return String(value);
}

function isScalar(value: unknown): value is string | number | boolean {
  return ["string", "number", "boolean"].includes(typeof value);
}
