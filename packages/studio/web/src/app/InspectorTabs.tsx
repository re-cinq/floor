import { useId, useState, type ReactNode } from "react";

export type InspectorTab = "Station" | "Events" | "Prompt" | "Settings";

/** The tab the address names and how a press records a new one there. */
export interface TabChoice {
  tab: string | undefined;
  choose(tab: InspectorTab): void;
}

type TargetIndex = (count: number, current: number) => number;

const nextWrapping: TargetIndex = (count, current) => (current + 1) % count;
const previousWrapping: TargetIndex = (count, current) => (current - 1 + count) % count;
const first: TargetIndex = () => 0;
const last: TargetIndex = (count) => count - 1;

const KEY_TARGETS: Partial<Record<string, TargetIndex>> = { ArrowRight: nextWrapping, ArrowLeft: previousWrapping, Home: first, End: last };

/** A tablist over the given tabs and the selected tab's panel; the address's tab when given a choice, else the last pressed, or the first when that is not offered. */
export default function InspectorTabs({ tabs, panels, tabChoice }: { tabs: InspectorTab[]; tabChoice?: TabChoice; panels: Partial<Record<InspectorTab, ReactNode>> }) {
  const idPrefix = useId();
  const [pressedTab, setPressedTab] = useState<InspectorTab>();
  const selectedTab = selectTab(tabs, tabChoice ? tabChoice.tab : pressedTab);
  const tabId = (tabName: InspectorTab) => `${idPrefix}-${tabName}`;
  const pressTab = (tabName: InspectorTab) => { setPressedTab(tabName); tabChoice?.choose(tabName); };

  const pressKey = (key: string, currentTab: InspectorTab) => {
    const targetIndex = KEY_TARGETS[key];
    if (!targetIndex) return;
    const nextTab = tabs[targetIndex(tabs.length, tabs.indexOf(currentTab))];
    pressTab(nextTab);
    document.getElementById(tabId(nextTab))?.focus();
  };

  return (
    <>
      <div role="tablist" onKeyDown={(event) => selectedTab && pressKey(event.key, selectedTab)}>
        {tabs.map((tabName) => (
          <button key={tabName} id={tabId(tabName)} type="button" role="tab" aria-selected={tabName === selectedTab} onClick={() => pressTab(tabName)}>
            {tabName}
          </button>
        ))}
      </div>
      {selectedTab && <div role="tabpanel" aria-labelledby={tabId(selectedTab)}>{panels[selectedTab]}</div>}
    </>
  );
}

/** The pressed tab when offered, otherwise the first tab. */
function selectTab(tabs: InspectorTab[], pressedTab: string | undefined): InspectorTab | undefined {
  return tabs.find((tabName) => tabName === pressedTab) ?? tabs.at(0);
}
