import type { LastTest, TestPreviewFields } from "@/socket/studio-connection";

type Entered = TestPreviewFields["entered"];

export function workspaceAfterLast(current: string, last: LastTest): string {
  return current || last.workspace;
}

export function enteredAfterLast(current: Entered, last: LastTest): Entered {
  return Object.keys(current).length ? current : last.entered;
}
