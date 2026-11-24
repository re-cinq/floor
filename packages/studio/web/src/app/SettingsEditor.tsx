import { useState, type ChangeEvent } from "react";
import type React from "react";
import type { NodeView } from "@protocol";
import ConfigForm from "./ConfigForm";
import DiskVersionChoice from "./DiskVersionChoice";
import EnvChip from "./EnvChip";
import { envPlaceholder } from "./env-placeholder";
import SaveButton from "./SaveButton";
import { CUSTOM, MODEL_GROUPS, isKnownModel } from "./model-choices";
import { isNested, settingText, settingsDraft, typedSettings, type Settings } from "./settings-draft";

export type SaveSettings = (settings: Settings, version: string) => Promise<unknown>;

/** The agent's settings as a form, one field per setting, saved through the page's connection when asked. */
export default function SettingsEditor({ agent, onSave, skillNames }: { agent: NonNullable<NodeView["agent"]>; onSave: SaveSettings; skillNames?: string[] }) {
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
        <SettingField key={key} settingKey={key} value={value} isNested={isNested(seed.settings[key])} seedEnvName={envPlaceholder(settingText(seed.settings[key]))} onEdit={editField} />
      ))}
      <ConfigForm skillNames={skillNames} configText={settingText(edited.config)} onChange={(config) => editField("config", settingText(config))} />
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
  seedEnvName?: string;
  onEdit: (key: string, text: string) => void;
}

function SettingField({ settingKey, value, isNested: nested, seedEnvName, onEdit }: SettingFieldProps) {
  const control = { "aria-label": settingKey, value: settingText(value), onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onEdit(settingKey, event.target.value) };
  const envName = envPlaceholder(settingText(value));
  const kind = kindOf({ settingKey, envName, nested, seedEnvName });

  return (
    <label>
      <span>{settingKey}</span>
      {controlsByKind[kind]({ ...control, envName, seedEnvName, onOverride: () => onEdit(settingKey, ""), onRestore: () => onEdit(settingKey, `\${${seedEnvName}}`) })}
    </label>
  );
}

type Kind = keyof typeof controlsByKind;

function kindOf({ settingKey, envName, nested, seedEnvName }: { settingKey: string; envName?: string; nested: boolean; seedEnvName?: string }): Kind {
  if (envName) return "env";
  if (settingKey === "model") return "model";
  if (nested) return "nested";

  return seedEnvName ? "restorable" : "plain";
}

type ControlProps = React.JSX.IntrinsicElements["input"] & React.JSX.IntrinsicElements["textarea"] & React.JSX.IntrinsicElements["select"] & { envName?: string; onOverride?: () => void; seedEnvName?: string; onRestore?: () => void };

const controlsByKind: Record<"env" | "model" | "nested" | "plain" | "restorable", (props: ControlProps) => React.JSX.Element> = {
  env: (props) => <EnvChip {...props} />,
  model: (props) => <ModelSelect {...props} />,
  nested: (props) => <textarea {...props} />,
  plain: (props) => <input {...props} />,
  restorable: ({ seedEnvName, onRestore, ...props }) => (
    <>
      <input {...props} />
      <button type="button" aria-label={`Use env: ${seedEnvName}`} onClick={onRestore}>Use env: {seedEnvName}</button>
    </>
  ),
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
