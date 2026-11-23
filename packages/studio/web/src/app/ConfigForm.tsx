import { useId } from "react";
import type React from "react";
import { z } from "zod";
import { agentConfigSchema } from "@re-cinq/floor-pipeline/agent-config";

interface Property {
  type?: string;
  description?: string;
}

interface FieldProps {
  name: string;
  value: unknown;
  help?: string;
}

const properties: Record<string, Property> = z.toJSONSchema(agentConfigSchema).properties ?? {};

const fieldsByType: Record<string, (props: FieldProps) => React.JSX.Element> = {
  integer: (props) => <NumberField {...props} />,
  number: (props) => <NumberField {...props} />,
};

/** The known keys of an agent's config as a form generated from the floor's schema. */
export default function ConfigForm({ config }: { config: Record<string, unknown> }) {
  const known = Object.keys(config).filter((key) => fieldsByType[properties[key]?.type ?? ""]);

  return known.map((key) => (
    <div key={key}>{fieldsByType[properties[key].type ?? ""]({ name: key, value: config[key], help: properties[key].description })}</div>
  ));
}

function NumberField({ name, value, help }: FieldProps) {
  const helpId = useId();

  return (
    <label>
      <span>{name}</span>
      <input type="number" defaultValue={Number(value)} aria-describedby={helpId} />
      <span id={helpId}>{help}</span>
    </label>
  );
}
