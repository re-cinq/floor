import { useId } from "react";
import type React from "react";

interface FieldFrameProps {
  name: string;
  caption?: string;
  help?: string;
  children: (helpId: string) => React.ReactNode;
}

/** Labels a control with its key and keeps the help text outside the label, tied to the control by aria-describedby. */
export default function FieldFrame({ name, caption = name, help, children }: FieldFrameProps) {
  const helpId = useId();

  return (
    <>
      <label>
        <span>{caption}</span>
        {children(helpId)}
      </label>
      <span id={helpId}>{help}</span>
    </>
  );
}
