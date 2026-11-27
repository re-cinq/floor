export type Produced = Record<string, string>;

export type PastedFiles = Record<string, { pasted: string }>;

export interface ReportField {
  name: string;
  kind: "value" | "file";
  required: boolean;
}

export interface StandInAnswer {
  outcome: string;
  produced: Produced;
  files: PastedFiles;
}

export type ReportOutcome = (answer: StandInAnswer) => void;

export type SendEvent = (event: string, payload: Record<string, unknown>) => void;

export type ReportVisit = (visit: string, answer: StandInAnswer) => void;

export function refusalOf(fields: Pick<ReportField, "name" | "required">[], produced: Produced): string | undefined {
  const missing = fields.find((field) => field.required && !produced[field.name]);

  return missing && `${missing.name} is required`;
}
