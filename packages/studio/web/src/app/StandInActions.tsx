import type { TestReadResult } from "@/socket/studio-connection";
import type { ListFolder } from "./PathPicker";
import StandInReportForm from "./StandInReportForm";
import type { ReportOutcome, SendEvent } from "./stand-in-report";

type StandInAction = TestReadResult["actions"][string][number];

export default function StandInActions({ actions, report, sendEvent, listFolder }: { actions: StandInAction[]; report: ReportOutcome; sendEvent: SendEvent; listFolder: ListFolder | undefined }) {
  return actions.map((action) => {
    if (action.kind === "event") return <button key={action.outcome} type="button" onClick={() => sendEvent(action.event, action.payload)}>Send {action.event}</button>;
    if (action.fields.length > 0) return <StandInReportForm key={action.outcome} outcome={action.outcome} fields={action.fields} report={report} listFolder={listFolder} />;

    return (
      <button key={action.outcome} type="button" onClick={() => report({ outcome: action.outcome, produced: {}, files: {} })}>
        {action.outcome}
      </button>
    );
  });
}
