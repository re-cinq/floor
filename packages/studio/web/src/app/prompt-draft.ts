import { draftRules, type Draft } from "./draft-rules";

export interface PromptSeed {
  prompt: string;
  version: string;
}

export type PromptDraft = Draft<PromptSeed, string>;

export const { startDraft, hasEdits, hasDiskVersion, receive: receivePrompt, edit: editText, resolve: resolveDisk } = draftRules<PromptSeed, string>(
  (seed) => seed.prompt,
  (left, right) => left === right,
);
