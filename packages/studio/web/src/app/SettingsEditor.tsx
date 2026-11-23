import { useState } from "react";
import type { NodeView } from "@protocol";
import DiskVersionChoice from "./DiskVersionChoice";
import SaveButton from "./SaveButton";
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
      {Object.entries(edited).map(([key, value]) =>
        isNested(seed.settings[key]) ? (
          <textarea key={key} aria-label={key} value={settingText(value)} onChange={(event) => editField(key, event.target.value)} />
        ) : (
          <input key={key} aria-label={key} value={settingText(value)} onChange={(event) => editField(key, event.target.value)} />
        ),
      )}
      <SaveButton label="Save settings" onSave={() => onSave(typedSettings(seed.settings, edited), seed.version)} />
      <DiskVersionChoice
        isPending={settingsDraft.hasDiskVersion(received)}
        onTake={() => settingsDraft.hasDiskVersion(received) && choose(received.onDisk)}
        onKeep={() => choose(edited)}
      />
    </>
  );
}
