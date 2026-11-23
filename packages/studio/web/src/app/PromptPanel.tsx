import { useId, type ReactNode } from "react";
import type { NodeView } from "@protocol";
import LabelledList from "./LabelledList";
import PlaceholdersTable from "./PlaceholdersTable";
import PromptEditor, { type SavePrompt } from "./PromptEditor";
import { promptPieces } from "./prompt-pieces";
import { unwrapParagraphs } from "./unwrap-paragraphs";

/** The inspector's Prompt panel: the placeholder check first, then each prompt file once, with its placeholders marked by state. */
export default function PromptPanel({ node: { agent, placeholders, extra }, onSave, onSaveExtra }: { node: NodeView; onSave?: SavePrompt; onSaveExtra?: SavePrompt }) {
  const rows = placeholders?.placeholders ?? [];

  return (
    <>
      <PlaceholdersTable rows={rows} />
      <LabelledList label="Needs the prompt never uses" entries={placeholders?.unused ?? []} />
      <AgentPromptEditor agent={agent} rows={rows} onSave={onSave} />
      <ExtraPromptEditor extra={extra} onSave={onSaveExtra} />
    </>
  );
}

function AgentPromptEditor({ agent, rows, onSave }: { agent: NodeView["agent"]; rows: PromptRows; onSave?: SavePrompt }) {
  if (!agent) return null;

  const promptText = <PromptText agent={agent} rows={rows} />;

  return <PromptFile file={agent.file}>{onSave ? <AgentEditor agent={agent} onSave={onSave}>{promptText}</AgentEditor> : promptText}</PromptFile>;
}

function AgentEditor({ agent, onSave, children }: { agent: NodeView["agent"]; onSave: SavePrompt; children: ReactNode }) {
  return (
    <PromptEditor label="Prompt" incoming={{ prompt: unwrapParagraphs(agent?.prompt ?? ""), version: agent?.version ?? "" }} onSave={unwrappedSave(onSave)}>
      {children}
    </PromptEditor>
  );
}

function ExtraPromptEditor({ extra, onSave }: { extra: NodeView["extra"]; onSave?: SavePrompt }) {
  if (!extra || !onSave) return null;

  return (
    <PromptFile file={extra.file}>
      <PromptEditor label="Extra prompt" incoming={{ prompt: unwrapParagraphs(extra.text), version: extra.version }} onSave={unwrappedSave(onSave)}>
        <p>{unwrapParagraphs(extra.text)}</p>
      </PromptEditor>
    </PromptFile>
  );
}

function unwrappedSave(onSave: SavePrompt): SavePrompt {
  return (text, version) => onSave(unwrapParagraphs(text), version);
}

function PromptFile({ file, children }: { file?: string; children: ReactNode }) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId}>{file}</h3>
      {children}
    </section>
  );
}

type PromptRows = Parameters<typeof promptPieces>[1];

function PromptText({ agent, rows }: { agent: NodeView["agent"]; rows: PromptRows }) {
  return (
    <p>
      {promptPieces(unwrapParagraphs(agent?.prompt ?? ""), rows).map((piece, index) =>
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
