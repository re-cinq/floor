// A `since` or `until` query value as a date; one that is no date is as good as not given.
export function dateOf(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}
