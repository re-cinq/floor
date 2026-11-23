import { useState, type ChangeEvent } from "react";
import type React from "react";
import type { NodeView } from "@protocol";
import DiskVersionChoice from "./DiskVersionChoice";
import SaveButton from "./SaveButton";
import { CUSTOM, MODEL_GROUPS, isKnownModel } from "./model-choices";
import { isNested, settingText, settingsDraft, typedSettings, type Settings } from "./settings-draft";

export type SaveSettings = (settings: Settings, version: string) => Promise<unknown>;

/** The agent's settings as a form, one field per setting, saved through the page's connection when asked. */
export default function SettingsEditor({ agent, onSave }: { agent: NonNullable<NodeView["agent"]>; onSave: SaveSettings }) {
  const incoming = { settings: agent.settings, version: agent.version ?? "" };
  const [draft, setDraft] = useState(() => settingsDraft.startDraft(incoming));
  const received = settingsDraft.receive(draft, incoming);

  if (received !== draft) setDraft(received);

  const { text: edited, seed } = received;
  const choose = (chosen: Settings) => setDraft(settingsDraft.resolve(chosen, incoming));
  const editField = (key: string, text: string) => setDraft(settingsDraft.edit(received, { ...edited, [key]: text }));

  return (
    <>
      {Object.entries(edited).map(([key, value]) => (
        <SettingField key={key} settingKey={key} value={value} isNested={isNested(seed.settings[key])} onEdit={editField} />
      ))}
      <SaveButton label="Save settings" onSave={() => onSave(typedSettings(seed.settings, edited), seed.version)} />
      <DiskVersionChoice
        isPending={settingsDraft.hasDiskVersion(received)}
        onTake={() => settingsDraft.hasDiskVersion(received) && choose(received.onDisk)}
        onKeep={() => choose(edited)}
      />
    </>
  );
}

interface SettingFieldProps {
  settingKey: string;
  value: Parameters<typeof settingText>[0];
  isNested: boolean;
  onEdit: (key: string, text: string) => void;
}

function SettingField({ settingKey, value, isNested: nested, onEdit }: SettingFieldProps) {
  const control = { "aria-label": settingKey, value: settingText(value), onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onEdit(settingKey, event.target.value) };
  const kind = settingKey === "model" ? "model" : nested ? "nested" : "plain";

  return (
    <label>
      <span>{settingKey}</span>
      {controlsByKind[kind](control)}
    </label>
  );
}

type ControlProps = React.JSX.IntrinsicElements["input"] & React.JSX.IntrinsicElements["textarea"] & React.JSX.IntrinsicElements["select"];

const controlsByKind: Record<"model" | "nested" | "plain", (props: ControlProps) => React.JSX.Element> = {
  model: (props) => <ModelSelect {...props} />,
  nested: (props) => <textarea {...props} />,
  plain: (props) => <input {...props} />,
};

function ModelSelect(props: ControlProps) {
  const model = String(props.value);
  const isCustom = !isKnownModel(model);

  return (
    <>
      <select {...props} value={isCustom ? CUSTOM : model}>
        {MODEL_GROUPS.map(({ agent, models }) => (
          <optgroup key={agent} label={agent}>
            {models.map((known) => (
              <option key={known} value={known}>{known}</option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>{CUSTOM}</option>
      </select>
      {isCustom && <input aria-label="Custom model" value={model} onChange={props.onChange} />}
    </>
  );
}
