import type React from "react";
import { answerParts } from "./answer-parts";

type Fields = Record<string, unknown>;

/** The agent's final answer: its words as paragraphs, and any JSON in it laid out field by field, each list item its own block. */
export default function RunAnswer({ text }: { text: string }) {
  return (
    <section aria-label="Answer" data-answer="">
      <h4>Answer</h4>
      {answerParts(text).map((part, index) => (part.kind === "text" ? <p key={index}>{part.text}</p> : <JsonValue key={index} value={part.value} />))}
    </section>
  );
}

function JsonValue({ value }: { value: unknown }): React.JSX.Element {
  if (Array.isArray(value)) return <JsonList entries={value} />;

  return isFields(value) ? <JsonFields fields={value} /> : <>{String(value)}</>;
}

function JsonFields({ fields }: { fields: Fields }) {
  return (
    <dl>
      {Object.entries(fields).map(([key, value]) => [
        <dt key={`${key}-term`}>{key}</dt>,
        <dd key={`${key}-value`}>
          <JsonValue value={value} />
        </dd>,
      ])}
    </dl>
  );
}

/** A list item of plain values reads as one line, `path a.ts · line 3`; any other item as its own fields. */
function JsonList({ entries }: { entries: unknown[] }) {
  return (
    <ol>
      {entries.map((entry, index) => (
        <li key={index}>{isFlat(entry) ? flatLine(entry) : <JsonValue value={entry} />}</li>
      ))}
    </ol>
  );
}

function flatLine(fields: Fields): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(" · ");
}

function isFlat(value: unknown): value is Fields {
  return isFields(value) && Object.values(value).every((field) => typeof field !== "object" || field === null);
}

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
