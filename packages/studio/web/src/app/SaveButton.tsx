import { useState } from "react";

/** A save button that shows the reason a refused save gave, and clears it once a save goes through. */
export default function SaveButton({ label, onSave }: { label: string; onSave: () => Promise<unknown> }) {
  const [refusal, setRefusal] = useState("");

  const save = () => {
    void onSave().then(
      () => setRefusal(""),
      (error: Error) => setRefusal(error.message),
    );
  };

  return (
    <>
      <button type="button" onClick={save}>
        {label}
      </button>
      {refusal && <p role="alert">{refusal}</p>}
    </>
  );
}
