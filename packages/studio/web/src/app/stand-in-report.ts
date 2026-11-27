export type Produced = Record<string, string>;

export type SuppliedFiles = Record<string, { pasted: string } | { picked: string }>;

export interface ReportField {
  name: string;
  kind: "value" | "file";
  required: boolean;
}

export interface StandInAnswer {
  outcome: string;
  produced: Produced;
  files: SuppliedFiles;
}

export type ReportOutcome = (answer: StandInAnswer) => void;

export type SendEvent = (event: string, payload: Record<string, unknown>) => void;

export type ReportVisit = (visit: string, answer: StandInAnswer) => void;

export function refusalOf(fields: Pick<ReportField, "name" | "required">[], entered: Produced, picked: Produced = {}): string | undefined {
  const doubled = fields.find((field) => entered[field.name] && picked[field.name]);
  if (doubled) return `${doubled.name}: paste its contents or give a file on disk, not both`;

  const missing = fields.find((field) => field.required && !(entered[field.name] || picked[field.name]));

  return missing && `${missing.name} is required`;
}

export function producedOf(fields: ReportField[], entered: Produced): Produced {
  return Object.fromEntries(fields.filter((field) => field.kind === "value" && entered[field.name]).map(({ name }) => [name, entered[name]]));
}

export function filesOf(fields: ReportField[], entered: Produced, picked: Produced): SuppliedFiles {
  const supplied = (name: string) => (picked[name] ? { picked: picked[name] } : { pasted: entered[name] });

  return Object.fromEntries(fields.filter((field) => field.kind === "file" && (entered[field.name] || picked[field.name])).map(({ name }) => [name, supplied(name)]));
}
