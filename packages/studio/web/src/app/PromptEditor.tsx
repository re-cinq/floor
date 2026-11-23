import { useState } from "react";
import type { NodeView } from "@protocol";
import DiskVersionChoice from "./DiskVersionChoice";
import SaveButton from "./SaveButton";
import { editText, hasDiskVersion, receivePrompt, resolveDisk, startDraft } from "./prompt-draft";

export type SavePrompt = (prompt: string, version: string) => Promise<unknown>;

/** The agent's prompt as an editable text, saved through the page's connection when asked. */
export default function PromptEditor({ agent, onSave }: { agent: NodeView["agent"]; onSave: SavePrompt }) {
  const incoming = { prompt: promptOf(agent), version: versionOf(agent) };
  const [draft, setDraft] = useState(() => startDraft(incoming));
  const received = receivePrompt(draft, incoming);

  if (received !== draft) setDraft(received);

  const { text, seed } = draft;
  const choose = (chosenText: string) => setDraft(resolveDisk(chosenText, incoming));

  return (
    <>
      <textarea aria-label="Prompt" value={text} onChange={(event) => setDraft(editText(draft, event.target.value))} />
      <SaveButton label="Save prompt" onSave={() => onSave(text, seed.version)} />
      <DiskVersionChoice isPending={hasDiskVersion(draft)} onTake={() => hasDiskVersion(draft) && choose(draft.onDisk)} onKeep={() => choose(text)} />
    </>
  );
}

function promptOf(agent: NodeView["agent"]): string {
  return agent?.prompt ?? "";
}

function versionOf(agent: NodeView["agent"]): string {
  return agent?.version ?? "";
}
