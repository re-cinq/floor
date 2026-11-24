import { useState } from "react";
import type { NodeView } from "@protocol";
import { settingsDraft, type Settings } from "./settings-draft";

/** The agent's settings draft with the ways to change it, shared by every settings tab. */
export interface SettingsDraftState {
  edited: Record<string, unknown>;
  seed: { settings: Settings; version: string };
  editField: (key: string, text: string) => void;
  isDiskPending: boolean;
  takeDisk: () => void;
  keepEdits: () => void;
}

/** Holds the settings draft above the tabs, so an edit on one tab survives a switch to another. */
export function useSettingsDraft(agent: NodeView["agent"]): SettingsDraftState {
  const incoming = { settings: agent?.settings ?? {}, version: agent?.version ?? "" };
  const [draft, setDraft] = useState(() => settingsDraft.startDraft(incoming));
  const received = settingsDraft.receive(draft, incoming);

  if (received !== draft) setDraft(received);

  const { text: edited, seed } = received;
  const choose = (chosen: Settings) => setDraft(settingsDraft.resolve(chosen, incoming));

  return {
    edited,
    seed,
    editField: (key, text) => setDraft(settingsDraft.edit(received, { ...edited, [key]: text })),
    isDiskPending: settingsDraft.hasDiskVersion(received),
    takeDisk: () => settingsDraft.hasDiskVersion(received) && choose(received.onDisk),
    keepEdits: () => choose(edited),
  };
}
