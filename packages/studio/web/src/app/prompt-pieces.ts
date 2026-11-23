import type { PlaceholderRow } from "@re-cinq/floor-assembly-lines";
import { placeholderPattern } from "@re-cinq/floor-assembly-lines/placeholder-pattern";

export type PromptPiece = { text: string } | { placeholder: string; row: PlaceholderRow };

/** The prompt cut into plain text and the `{name}` placeholders that have a row; a name without one stays text. */
export function promptPieces(prompt: string, rows: readonly PlaceholderRow[]): PromptPiece[] {
  return prompt.split(placeholderPattern()).map((piece, index) => {
    if (index % 2 === 0) return { text: piece };
    const row = rows.find(({ name }) => name === piece);

    return row ? { placeholder: piece, row } : { text: `{${piece}}` };
  });
}
