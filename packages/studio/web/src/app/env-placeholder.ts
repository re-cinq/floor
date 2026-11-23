const WHOLE_PLACEHOLDER = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

/** The environment variable a whole-value `${NAME}` setting is filled from, if the value is one. */
export function envPlaceholder(value: string): string | undefined {
  return WHOLE_PLACEHOLDER.exec(value)?.[1];
}
