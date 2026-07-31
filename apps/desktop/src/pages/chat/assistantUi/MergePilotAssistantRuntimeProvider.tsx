import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { PropsWithChildren } from "react";
import type { Bubble } from "../chat.types.js";
import { toAssistantUiThreadMessage } from "./mergepilotThreadMessages.js";

const ignoreComposerSubmit = async () => undefined;

/**
 * Makes the live MergePilot transcript available to assistant-ui primitives.
 *
 * Existing renderers remain in place during this migration. This provider is
 * deliberately read-only: sending, approvals, and cancellation continue to
 * use the established MergePilot handlers until their replacements have the
 * same workflow and safety coverage.
 */
export function MergePilotAssistantRuntimeProvider({
  bubbles,
  children,
}: PropsWithChildren<{ bubbles: Bubble[] }>) {
  const runtime = useExternalStoreRuntime({
    messages: bubbles,
    convertMessage: toAssistantUiThreadMessage,
    onNew: ignoreComposerSubmit,
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
