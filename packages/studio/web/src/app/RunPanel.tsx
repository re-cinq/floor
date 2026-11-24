import { useState } from "react";
import type { NodeNeed, NodeView } from "@protocol";
import type {
  RunFrame,
  RunFrameListener,
  RunPreviewResult,
  RunReadResult,
  RunStartResult,
} from "@/socket/studio-connection";
import RunResult from "./RunResult";
import RunTranscript from "./RunTranscript";
import { useFixture } from "./use-fixture";
import { useRun } from "./use-run";

/** What a run is given: a value for each need, the folder and the permission the agent works under. */
export interface RunFields {
  fixture: Record<string, string>;
  folder: string;
  permission: "acceptEdits" | "bypass";
}

/** Previews a run of the node's station for the given fields. */
export type PreviewRun = (fields: RunFields) => Promise<RunPreviewResult>;

/** Starts, cancels and follows the runs of the node's station. */
export interface RunControls {
  start: (fields: RunFields) => Promise<RunStartResult>;
  cancel: (run: string) => Promise<unknown>;
  follow: (listener: RunFrameListener) => () => void;
  read: (run: string, after: number) => Promise<RunReadResult>;
  /** The run the address keeps, and the means to keep another there. */
  current?: string;
  keep?: (run: string) => void;
  /** Told the edge a run took, when it ended with one. */
  onEnded?: (edge: { from: string; to: string; on: string }) => void;
}

/** Reads and writes the need values kept for the node's station. */
export interface FixtureStore {
  read: () => Promise<{ needs: Record<string, string> }>;
  write: (needs: Record<string, string>) => Promise<unknown>;
}

const PERMISSION_LABELS: [RunFields["permission"], string][] = [
  ["acceptEdits", "acceptEdits"],
  ["bypass", "bypass, as in the pod"],
];

export type { RunFrame };

/** The inspector's Run panel: a value for each need, the folder, and the preview of what a run would do. */
export default function RunPanel({ node, onPreview, runs, fixtures }: { node: NodeView; onPreview?: PreviewRun; runs?: RunControls; fixtures?: FixtureStore }) {
  const fixture = useFixture(fixtures);
  const { values } = fixture;
  const [folder, setFolder] = useState("");
  const [permission, setPermission] = useState<RunFields["permission"]>("acceptEdits");
  const [preview, setPreview] = useState<RunPreviewResult>();
  const run = useRun(runs);
  const fields: RunFields = { fixture: values, folder, permission };

  return (
    <>
      {node.needs.map((need) => (
        <TextField key={need.name} label={needLabel(need)} value={values[need.name] ?? ""} onChange={(value) => fixture.change(need.name, value)} />
      ))}
      <TextField label="Folder" value={folder} onChange={setFolder} />
      <PermissionChoice value={permission} onChange={setPermission} />
      <RunActions {...runActions({ fixture, fields, onPreview, setPreview, runs, run })} />
      {run.lines.length > 0 && <RunTranscript lines={run.lines} />}
      {run.ended && <RunResult ended={run.ended} raises={node.events.raises} />}
      {preview && <PreviewView preview={preview} />}
    </>
  );
}

interface RunActionsInput {
  fixture: { save(): void };
  fields: RunFields;
  onPreview?: PreviewRun;
  setPreview: (preview: RunPreviewResult) => void;
  runs?: RunControls;
  run: { isRunning: boolean; start(fields: RunFields): void; cancel(): void };
}

/** What each button does: both save the typed needs first; Cancel only while a run is going. */
function runActions({ fixture, fields, onPreview, setPreview, runs, run }: RunActionsInput) {
  const saved = (then: () => void) => () => {
    fixture.save();
    then();
  };

  return {
    onPreview: onPreview && saved(() => void onPreview(fields).then(setPreview)),
    onRun: runs && saved(() => run.start(fields)),
    onCancel: run.isRunning ? run.cancel : undefined,
  };
}

/** Preview and Run side by side, and Cancel while a run is going. */
function RunActions({ onPreview, onRun, onCancel }: { onPreview?: () => void; onRun?: () => void; onCancel?: () => void }) {
  return (
    <div data-actions="">
      <button type="button" disabled={!onPreview} onClick={onPreview}>
        Preview
      </button>
      <button type="button" disabled={!onRun} onClick={onRun}>
        Run
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function PermissionChoice({
  value,
  onChange,
}: {
  value: RunFields["permission"];
  onChange: (permission: RunFields["permission"]) => void;
}) {
  return (
    <fieldset role="radiogroup">
      <legend>Permission</legend>
      {PERMISSION_LABELS.map(([permission, label]) => (
        <label key={permission}>
          <input
            type="radio"
            name="permission"
            checked={value === permission}
            onChange={() => onChange(permission)}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function PreviewView({ preview }: { preview: RunPreviewResult }) {
  return (
    <>
      <section aria-label="Rendered prompt" style={{ whiteSpace: "pre-wrap" }}>
        {preview.prompt}
      </section>
      <section aria-label="Command">
        <code>{commandLine(preview.command)}</code>
      </section>
      {preview.blockers.length > 0 && (
        <section aria-label="Blockers">
          <ul>
            {preview.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function commandLine(command: string[]): string {
  return command.map(quoted).join(" ");
}

function quoted(argument: string): string {
  return argument.includes(" ") ? `"${argument}"` : argument;
}

const NEED_LABELS: Record<NodeNeed["kind"], (need: NodeNeed) => string> = {
  value: (need) => need.name,
  file: (need) => `${need.name} (file to copy to ${need.path ?? need.name})`,
  git: (need) => `${need.name} (checkout to link at ${need.path ?? need.name})`,
};

function needLabel(need: NodeNeed): string {
  return NEED_LABELS[need.kind](need);
}
