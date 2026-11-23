import { type ReactNode, useState } from "react";
import DiskVersionChoice from "./DiskVersionChoice";
import SaveButton from "./SaveButton";
import { type PromptSeed, editText, hasDiskVersion, receivePrompt, resolveDisk, startDraft } from "./prompt-draft";

export type SavePrompt = (prompt: string, version: string) => Promise<unknown>;

/** A prompt text as an editable draft under its label, saved through the page's connection when asked. */
export default function PromptEditor({ label, incoming, onSave, children }: { label: string; incoming: PromptSeed; onSave: SavePrompt; children?: ReactNode }) {
  const [draft, setDraft] = useState(() => startDraft(incoming));
  const received = receivePrompt(draft, incoming);

  if (received !== draft) setDraft(received);

  const [isOpen, setIsOpen] = useState(false);
  const { text, seed } = draft;
  const choose = (chosenText: string) => setDraft(resolveDisk(chosenText, incoming));

  const cancel = () => {
    setDraft(startDraft(incoming));
    setIsOpen(false);
  };

  if (!isOpen)
    return (
      <>
        {children}
        <button type="button" onClick={() => setIsOpen(true)}>{`Edit ${label.toLowerCase()}`}</button>
      </>
    );

  return (
    <>
      <textarea aria-label={label} value={text} onChange={(event) => setDraft(editText(draft, event.target.value))} />
      {text !== seed.prompt && <SaveButton label={`Save ${label.toLowerCase()}`} onSave={() => onSave(text, seed.version)} />}
      <button type="button" onClick={cancel}>Cancel</button>
      <DiskVersionChoice isPending={hasDiskVersion(draft)} onTake={() => hasDiskVersion(draft) && choose(draft.onDisk)} onKeep={() => choose(text)} />
    </>
  );
}
