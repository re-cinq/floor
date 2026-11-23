import type { NodeView } from "@protocol";
import LabelledList from "./LabelledList";
import PlaceholdersTable from "./PlaceholdersTable";
import PromptEditor, { type SavePrompt } from "./PromptEditor";
import { promptPieces } from "./prompt-pieces";

/** The inspector's Prompt panel: the prompt with each placeholder marked by its state, their table, and the needs it never uses. */
export default function PromptPanel({ node: { agent, placeholders }, onSave }: { node: NodeView; onSave?: SavePrompt }) {
  const rows = placeholders?.placeholders ?? [];

  return (
    <>
      {onSave && <PromptEditor agent={agent} onSave={onSave} />}
      <PromptText agent={agent} rows={rows} />
      <PlaceholdersTable rows={rows} />
      <LabelledList label="Needs the prompt never uses" entries={placeholders?.unused ?? []} />
    </>
  );
}

function PromptText({ agent, rows }: { agent: NodeView["agent"]; rows: Parameters<typeof promptPieces>[1] }) {
  return (
    <p>
      {promptPieces(agent?.prompt ?? "", rows).map((piece, index) =>
        "text" in piece ? (
          piece.text
        ) : (
          <mark key={index} data-state={piece.row.state}>
            {`{${piece.placeholder}}`}
          </mark>
        ),
      )}
    </p>
  );
}
