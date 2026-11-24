/** A name held in several listed groups is read from the group listed last; the earlier ones are left out, not refused. */
export function withoutEarlierGroups<Entry extends { group: string | undefined }>(entries: readonly Entry[], groups: readonly string[], nameOf: (entry: Entry) => string): Entry[] {
  const rankOf = (group: string | undefined) => (group === undefined ? -1 : groups.indexOf(group));

  return entries.filter((entry) => rankOf(entry.group) < 0 || !entries.some((other) => nameOf(other) === nameOf(entry) && rankOf(other.group) > rankOf(entry.group)));
}
