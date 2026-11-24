import type React from "react";
import type { Property } from "./schema-property";
import { fieldsShownFor } from "./transport-fields";
import { nounOf } from "./item-noun";
import { schemaProps, withEntry, type FieldProps } from "./field-props";

type Card = Record<string, unknown>;

interface CardsFieldProps extends FieldProps {
  renderField: (props: FieldProps) => React.JSX.Element | null;
}

/** One block per array item, separated by a rule, no frame around the list; its fields drawn from the item's properties by the same field table as the form. */
export default function CardsField({ name, value, help, property, renderField, onChange }: CardsFieldProps) {
  const cards = Array.isArray(value) ? (value as Card[]) : [];
  const itemProperties = property?.items?.properties ?? {};
  const change = (next: Card[]) => onChange(next.length === 0 ? undefined : next);

  return (
    <div data-cards="">
      <p>{help}</p>
      {cards.map((card, index) => (
        <section key={index} data-card="" aria-label={`${name} ${index + 1}`}>
          <CardHeader noun={nounOf(name)} card={card} position={index + 1} onRemove={() => change(cards.filter((current, position) => position !== index))} />
          {shownEntries(itemProperties, card).map(([key, itemProperty]) => (
            <div key={key}>{renderField({ ...schemaProps(itemProperty), name: `${name} ${index + 1} ${key}`, caption: key, value: card[key], onChange: (next) => change(cards.map((current, position) => (position === index ? withEntry(current, key, next) : current))) })}</div>
          ))}
        </section>
      ))}
      <button type="button" onClick={() => change([...cards, {}])}>
        Add {nounOf(name)}
      </button>
    </div>
  );
}

function shownEntries(itemProperties: Record<string, Property>, card: Card) {
  const keys = Object.keys(itemProperties);
  const shown = "transport" in itemProperties ? fieldsShownFor(card, keys) : keys;

  return shown.map((key): [string, Property] => [key, itemProperties[key]]);
}

interface CardHeaderProps {
  noun: string;
  card: Card;
  position: number;
  onRemove: () => void;
}

function CardHeader({ noun, card, position, onRemove }: CardHeaderProps) {
  const title = typeof card.name === "string" && card.name !== "" ? card.name : undefined;

  return (
    <div data-card-header="">
      <h3>{title ?? `${noun} ${position}`}</h3>
      <button type="button" aria-label={`Remove ${noun} ${title ?? position}`} onClick={onRemove}>
        Remove {noun}
      </button>
    </div>
  );
}
