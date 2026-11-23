import { useState } from "react";
import type { NodeView } from "@protocol";
import { editText, receivePrompt, resolveDisk, startDraft } from "./prompt-draft";

export type SavePrompt = (prompt: string, version: string) => Promise<unknown>;

/** The agent's prompt as an editable text, saved through the page's connection when asked. */
export default function PromptEditor({ agent, onSave }: { agent: NodeView["agent"]; onSave: SavePrompt }) {
  const incoming = { prompt: promptOf(agent), version: versionOf(agent) };
  const [draft, setDraft] = useState(() => startDraft(incoming));
  const received = receivePrompt(draft, incoming);

  if (received !== draft) setDraft(received);

  const { text, onDisk, seed } = draft;
  const choose = (chosenText: string) => setDraft(resolveDisk(chosenText, incoming));

  return (
    <>
      <textarea aria-label="Prompt" value={text} onChange={(event) => setDraft(editText(draft, event.target.value))} />
      <SaveButton text={text} version={seed.version} onSave={onSave} />
      <DiskVersionChoice onDisk={onDisk} onTake={() => choose(onDisk)} onKeep={() => choose(text)} />
    </>
  );
}

function DiskVersionChoice({ onDisk, onTake, onKeep }: { onDisk: string; onTake: () => void; onKeep: () => void }) {
  return (
    onDisk && (
      <>
        <button type="button" onClick={onTake}>
          Take the version on disk
        </button>
        <button type="button" onClick={onKeep}>
          Keep my edits
        </button>
      </>
    )
  );
}

function SaveButton({ text, version, onSave }: { text: string; version: string; onSave: SavePrompt }) {
  const [refusal, setRefusal] = useState("");

  const save = () => {
    void onSave(text, version).then(
      () => setRefusal(""),
      (error: Error) => setRefusal(error.message),
    );
  };

  return (
    <>
      <button type="button" onClick={save}>
        Save prompt
      </button>
      {refusal && <p role="alert">{refusal}</p>}
    </>
  );
}

function promptOf(agent: NodeView["agent"]): string {
  return agent?.prompt ?? "";
}

function versionOf(agent: NodeView["agent"]): string {
  return agent?.version ?? "";
}
