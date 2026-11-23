import { useState } from "react";
import type { NodeView } from "@protocol";

export type SavePrompt = (prompt: string) => Promise<unknown>;

/** The agent's prompt as an editable text, saved through the page's connection when asked. */
export default function PromptEditor({ agent, onSave }: { agent: NodeView["agent"]; onSave: SavePrompt }) {
  const [text, setText] = useState(agent?.prompt ?? "");
  const [refusal, setRefusal] = useState("");

  const save = () => {
    void onSave(text).then(
      () => setRefusal(""),
      (error: Error) => setRefusal(error.message),
    );
  };

  return (
    <>
      <textarea aria-label="Prompt" value={text} onChange={(event) => setText(event.target.value)} />
      <button type="button" onClick={save}>
        Save prompt
      </button>
      {refusal && <p role="alert">{refusal}</p>}
    </>
  );
}
