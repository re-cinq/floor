export const TRANSPORT_FIELDS: Record<string, string[]> = {
  stdio: ["command", "args", "env"],
  http: ["url", "headers_secret", "headers"],
  sse: ["url", "headers_secret", "headers"],
};

/** Keys every card shows, plus the ones its transport lists; a card with no transport shows only the former. */
export function fieldsShownFor(card: Record<string, unknown>, keys: string[]): string[] {
  const transportKeys = Object.values(TRANSPORT_FIELDS).flat();
  const own = TRANSPORT_FIELDS[String(card.transport)] ?? [];

  return keys.filter((key) => !transportKeys.includes(key) || own.includes(key));
}
