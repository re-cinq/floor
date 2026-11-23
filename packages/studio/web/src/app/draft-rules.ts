/** A value being edited: the seed it started from, the edited value, and a disk version awaiting a choice. */
export interface Draft<Seed extends { version: string }, Value> {
  seed: Seed;
  text: Value;
  onDisk: Value | undefined;
}

/** The rules for drafting any edited value, given how to read it from a seed and how to tell two apart. */
export function draftRules<Seed extends { version: string }, Value>(
  valueOf: (seed: Seed) => Value,
  isEqual: (left: Value, right: Value) => boolean,
) {
  const startDraft = (seed: Seed): Draft<Seed, Value> => ({ seed, text: valueOf(seed), onDisk: undefined });
  const hasEdits = (draft: Draft<Seed, Value>): boolean => !isEqual(draft.text, valueOf(draft.seed));

  /** The same draft when nothing changed; otherwise the new value, or a pending choice when edits are unsaved. */
  const receive = (draft: Draft<Seed, Value>, incoming: Seed): Draft<Seed, Value> => {
    if (isEqual(valueOf(incoming), valueOf(draft.seed))) return draft;
    if (!hasEdits(draft)) return startDraft(incoming);

    return { ...draft, seed: { ...incoming, version: draft.seed.version }, onDisk: valueOf(incoming) };
  };

  const hasDiskVersion = (draft: Draft<Seed, Value>): draft is Draft<Seed, Value> & { onDisk: Value } => draft.onDisk !== undefined;
  const edit = (draft: Draft<Seed, Value>, text: Value): Draft<Seed, Value> => ({ ...draft, text });
  const resolve = (chosen: Value, incoming: Seed): Draft<Seed, Value> => ({ seed: incoming, text: chosen, onDisk: undefined });

  return { startDraft, hasEdits, hasDiskVersion, receive, edit, resolve };
}
