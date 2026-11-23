/** The fields that say something: what is undefined or empty text is left out, so the view holds no key JSON would drop. */
export function present<Fields extends object>(fields: Fields): Partial<Fields> {
  return Object.fromEntries(Object.entries(fields).filter(([, held]) => held !== undefined && held !== "")) as Partial<Fields>;
}
