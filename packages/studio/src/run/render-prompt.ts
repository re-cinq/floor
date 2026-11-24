// Fills {name} placeholders from run parameters, leaving unknown ones as written; ported from agentcore's prompt.d.
import { placeholderPattern } from "@re-cinq/floor-assembly-lines/placeholder-pattern";

export function renderPrompt(template: string, parameters: Readonly<Record<string, string>>): string {
  return template.replace(placeholderPattern("g"), (token, name: string) =>
    Object.hasOwn(parameters, name) ? parameters[name]! : token,
  );
}
