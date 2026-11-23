import { useState, type ChangeEvent } from "react";
import type React from "react";
import type { NodeView } from "@protocol";
import ConfigForm from "./ConfigForm";
import DiskVersionChoice from "./DiskVersionChoice";
import { envPlaceholder } from "./env-placeholder";
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
      <ConfigForm config={isNested(seed.settings.config) ? (seed.settings.config as Settings) : {}} />
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
  const envName = envPlaceholder(settingText(value));
  const kind = envName ? "env" : settingKey === "model" ? "model" : nested ? "nested" : "plain";

  return (
    <label>
      <span>{settingKey}</span>
      {controlsByKind[kind]({ ...control, envName, onOverride: () => onEdit(settingKey, "") })}
    </label>
  );
}

type ControlProps = React.JSX.IntrinsicElements["input"] & React.JSX.IntrinsicElements["textarea"] & React.JSX.IntrinsicElements["select"] & { envName?: string; onOverride?: () => void };

const controlsByKind: Record<"env" | "model" | "nested" | "plain", (props: ControlProps) => React.JSX.Element> = {
  env: ({ envName, onOverride }) => (
    <>
      <code>env: {envName}</code>
      <span>Filled in from the host's {envName} when the collection is applied.</span>
      <button type="button" aria-label="Override" onClick={onOverride}>Override</button>
    </>
  ),
  model: (props) => <ModelSelect {...props} />,
  nested: (props) => <textarea {...props} />,
  plain: (props) => <input {...props} />,
};

function ModelSelect(props: ControlProps) {
  const model = String(props.value);
  const isCustom = !isKnownModel(model);

  return (
    <>
      <select {...props} value={isCustom ? "" : model}>
        {MODEL_GROUPS.map(({ agent, models }) => (
          <optgroup key={agent} label={agent}>
            {models.map((known) => (
              <option key={known} value={known}>{known}</option>
            ))}
          </optgroup>
        ))}
        <option value="">{CUSTOM}</option>
      </select>
      {isCustom && <input aria-label="Custom model" value={model} onChange={props.onChange} />}
    </>
  );
}
