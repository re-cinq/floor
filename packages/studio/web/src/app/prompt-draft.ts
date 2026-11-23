export interface PromptSeed {
  prompt: string;
  version: string;
}

/** The prompt being edited: the seed it started from, the edited text, and a disk version awaiting a choice. */
export interface PromptDraft {
  seed: PromptSeed;
  text: string;
  onDisk: string;
}

export function startDraft(seed: PromptSeed): PromptDraft {
  return { seed, text: seed.prompt, onDisk: "" };
}

export function hasEdits(draft: PromptDraft): boolean {
  return draft.text !== draft.seed.prompt;
}

/** The same draft when nothing changed; otherwise the new prompt, or a pending choice when edits are unsaved. */
export function receivePrompt(draft: PromptDraft, incoming: PromptSeed): PromptDraft {
  if (incoming.prompt === draft.seed.prompt) return draft;
  if (!hasEdits(draft)) return startDraft(incoming);

  return { ...draft, seed: { ...draft.seed, prompt: incoming.prompt }, onDisk: incoming.prompt };
}

export function editText(draft: PromptDraft, text: string): PromptDraft {
  return { ...draft, text };
}

export function resolveDisk(chosenText: string, incoming: PromptSeed): PromptDraft {
  return { seed: incoming, text: chosenText, onDisk: "" };
}
