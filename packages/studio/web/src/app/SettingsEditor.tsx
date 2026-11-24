import { useState, type ChangeEvent } from "react";
import type React from "react";
import ConfigForm from "./ConfigForm";
import DiskVersionChoice from "./DiskVersionChoice";
import EnvChip from "./EnvChip";
import { envPlaceholder } from "./env-placeholder";
import SaveButton from "./SaveButton";
import { CUSTOM, MODEL_GROUPS, isKnownModel } from "./model-choices";
import { unknownConfigOf, withUnknownConfig } from "./config-split";
import { isNested, parseNested, settingText, typedSettings, type Settings } from "./settings-draft";
import { SETTINGS_SECTIONS, type SettingsSection } from "./settings-sections";
import type { SettingsDraftState } from "./use-settings-draft";

export type SaveSettings = (settings: Settings, version: string) => Promise<unknown>;

/** One settings tab's share of the agent's settings as a form, saved through the page's connection when asked. */
export default function SettingsEditor({ section, draft, onSave, skillNames }: { section: SettingsSection; draft: SettingsDraftState; onSave: SaveSettings; skillNames?: string[] }) {
  const { edited, seed, editField } = draft;
  const [typedYaml, setTypedYaml] = useState("");

  const editConfigYaml = (field: string, text: string) => {
    setTypedYaml(text);
    editField(field, mergedConfigText(edited.config, text));
  };

  const { settings: keys, config: configKeys } = SETTINGS_SECTIONS[section];

  return (
    <>
      {Object.entries(edited).filter(([key]) => keys.includes(key)).map(([key, value]) => (
        <SettingField key={key} settingKey={key} value={key === "config" ? shownConfigText(value, typedYaml) : value} isNested={isNested(seed.settings[key])} seedEnvName={envPlaceholder(settingText(seed.settings[key]))} onEdit={key === "config" ? editConfigYaml : editField} />
      ))}
      <ConfigForm keys={configKeys} skillNames={skillNames} configText={settingText(edited.config)} onChange={(config) => editField("config", settingText(config))} />
      <SaveButton label="Save settings" onSave={() => onSave(typedSettings(seed.settings, edited), seed.version)} />
      <DiskVersionChoice isPending={draft.isDiskPending} onTake={draft.takeDisk} onKeep={draft.keepEdits} />
    </>
  );
}

function shownConfigText(config: unknown, typedYaml: string): unknown {
  const derived = unknownConfigText(config);

  return derived === unknownConfigText(mergedConfigText(config, typedYaml)) ? typedYaml : derived;
}

function unknownConfigText(config: unknown): unknown {
  const parsed = configOf(config);

  return parsed ? settingText(unknownConfigOf(parsed)) : config;
}

function mergedConfigText(config: unknown, yamlText: string): string {
  const unknown = configOf(yamlText) ?? (parseNested(yamlText) === null ? {} : undefined);

  return unknown ? settingText(withUnknownConfig(configOf(config) ?? {}, unknown)) : yamlText;
}

function configOf(text: unknown): Settings | undefined {
  const parsed = typeof text === "string" ? parseNested(text) : text;

  return isNested(parsed) ? (parsed as Settings) : undefined;
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
