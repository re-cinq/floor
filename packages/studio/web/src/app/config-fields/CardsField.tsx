import type React from "react";
import RemoveButton from "./RemoveButton";
import type { Property } from "./schema-property";
import { fieldsShownFor } from "./transport-fields";
import { schemaProps, withEntry, type FieldProps } from "./field-props";

type Card = Record<string, unknown>;

interface CardsFieldProps extends FieldProps {
  renderField: (props: FieldProps) => React.JSX.Element | null;
}

/** One card per array item, its fields drawn from the item's properties by the same field table as the form. */
export default function CardsField({ name, value, help, property, renderField, onChange }: CardsFieldProps) {
  const cards = Array.isArray(value) ? (value as Card[]) : [];
  const itemProperties = property?.items?.properties ?? {};
  const change = (next: Card[]) => onChange(next.length === 0 ? undefined : next);

  return (
    <fieldset>
      <legend>{name}</legend>
      <span>{help}</span>
      {cards.map((card, index) => (
        <fieldset key={index}>
          <legend>{`${name} ${index + 1}`}</legend>
          {shownEntries(itemProperties, card).map(([key, itemProperty]) => (
            <div key={key}>{renderField({ ...schemaProps(itemProperty), name: `${name} ${index + 1} ${key}`, value: card[key], onChange: (next) => change(cards.map((current, position) => (position === index ? withEntry(current, key, next) : current))) })}</div>
          ))}
          <RemoveButton name={name} position={index + 1} onRemove={() => change(cards.filter((current, position) => position !== index))} />
        </fieldset>
      ))}
      <button type="button" onClick={() => change([...cards, {}])}>
        Add to {name}
      </button>
    </fieldset>
  );
}

function shownEntries(itemProperties: Record<string, Property>, card: Card) {
  const keys = Object.keys(itemProperties);
  const shown = "transport" in itemProperties ? fieldsShownFor(card, keys) : keys;

  return shown.map((key): [string, Property] => [key, itemProperties[key]]);
}
