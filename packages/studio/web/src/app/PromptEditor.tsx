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

  if (!isOpen) return <ClosedPrompt label={label} onOpen={() => setIsOpen(true)}>{children}</ClosedPrompt>;

  return (
    <>
      <textarea aria-label={label} value={text} onChange={(event) => setDraft(editText(draft, event.target.value))} />
      <div data-actions="">
        {text !== seed.prompt && <SaveButton label={`Save ${label.toLowerCase()}`} onSave={() => onSave(text, seed.version)} />}
        <button type="button" onClick={cancel}>Cancel</button>
        <DiskVersionChoice isPending={hasDiskVersion(draft)} onTake={() => hasDiskVersion(draft) && choose(draft.onDisk)} onKeep={() => choose(text)} />
      </div>
    </>
  );
}

/** The prompt as read, with the button that opens it for editing. */
function ClosedPrompt({ label, onOpen, children }: { label: string; onOpen: () => void; children?: ReactNode }) {
  return (
    <>
      {children}
      <div data-actions="">
        <button type="button" onClick={onOpen}>{`Edit ${label.toLowerCase()}`}</button>
      </div>
    </>
  );
}
