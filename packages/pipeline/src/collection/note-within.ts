// The note naming the lines left undrawn, cut to fit the room left in a comment.

const NOTE_LEAD =
  "These lines changed too, but their graphs would not fit in one comment: ";
const SEPARATOR = ", ";

export function noteWithin(ids: string[], room: number): string[] {
  if (ids.length === 0) return [];
  const tags = ids.map((id) => `\`${id}\``);

  return [`${NOTE_LEAD}${listOf(tags, room - NOTE_LEAD.length)}`, ""];
}

function listOf(tags: string[], listRoom: number): string {
  const whole = `${tags.join(SEPARATOR)}.`;
  if (whole.length <= listRoom) return whole;
  const listedCount = fittingCountOf(tags, listRoom);
  const leftOut = tags.length - listedCount;
  if (listedCount === 0) return `${leftOut} more.`;

  return `${tags.slice(0, listedCount).join(SEPARATOR)}${moreOf(leftOut)}`;
}

function fittingCountOf(tags: string[], listRoom: number): number {
  let listedCount = 0;
  let used = 0;

  for (const [index, tag] of tags.entries()) {
    used += tag.length + (index > 0 ? SEPARATOR.length : 0);
    if (used > listRoom) break;
    const leftOut = tags.length - index - 1;
    if (used + moreOf(leftOut).length <= listRoom) listedCount = index + 1;
  }

  return listedCount;
}

function moreOf(leftOut: number): string {
  return ` and ${leftOut} more.`;
}
