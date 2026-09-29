// What floor leaves on everything it posts: words a person can read, so what it says is not taken for another's, and a mark a machine can find, so a visit worked twice posts once.

export type Posting = "review" | "reply";

export function markOf(posting: Posting, visitId: string): string {
  return `<!-- floor-${posting}: ${visitId} -->`;
}

/** The mark leads. The body is an agent's, and nothing an agent writes comes before it. */
export function signed(posting: Posting, visitId: string, body: string): string {
  return `${markOf(posting, visitId)}\n\n${body}\n\n<sub>Posted by floor, visit ${visitId}.</sub>`;
}
