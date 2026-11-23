// The agent subsystem's `renderPrompt` replaces `{key}` for letters, digits, `_`, `.` and `-`, and leaves what it does not know as it is. A name here must also start with a letter or `_`, as every need does, so `a{3}` and `{}` are not read as placeholders; a JSON object never matches, its braces enclose quotes.
const PLACEHOLDER_SOURCE = String.raw`\{([A-Za-z_][A-Za-z0-9_.-]*)\}`;

/** A fresh `{name}` pattern capturing the name; fresh so a global one's `lastIndex` is never shared. */
export function placeholderPattern(flags = ""): RegExp {
  return new RegExp(PLACEHOLDER_SOURCE, flags);
}
