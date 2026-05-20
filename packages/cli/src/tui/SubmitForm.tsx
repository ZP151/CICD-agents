import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { RuntimeClient } from "../runtimeClient.js";

type FieldKey = "repo" | "profile" | "targetBranch" | "workItem";

const FIELDS: FieldKey[] = ["repo", "profile", "targetBranch", "workItem"];

const LABELS: Record<FieldKey, string> = {
  repo: "Repo path",
  profile: "Profile",
  targetBranch: "Target branch",
  workItem: "Work item ID",
};

type FormState = "form" | "submitting" | "done";

interface LogLine {
  name: string;
  status: string;
  detail?: string;
}

function statusColor(s: string): string {
  if (s === "ok") return "green";
  if (s === "error") return "red";
  if (s === "warn") return "yellow";
  return "white";
}

export const SubmitForm: React.FC<{ client: RuntimeClient }> = ({ client }) => {
  const [fields, setFields] = useState<Record<FieldKey, string>>({
    repo: process.cwd(),
    profile: "default",
    targetBranch: "main",
    workItem: "",
  });
  const [focusIdx, setFocusIdx] = useState(0);
  const [formState, setFormState] = useState<FormState>("form");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [finalStatus, setFinalStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Up/down arrow field navigation (compatible with TextInput which only uses left/right)
  useInput((_input, key) => {
    if (formState !== "form") return;
    if (key.upArrow) setFocusIdx((f) => Math.max(0, f - 1));
    if (key.downArrow) setFocusIdx((f) => Math.min(FIELDS.length - 1, f + 1));
  });

  const handleSubmit = async (): Promise<void> => {
    setFormState("submitting");
    try {
      const resp = await client.submitPipeline({
        repoPath: fields.repo,
        profile: fields.profile,
        targetBranch: fields.targetBranch || null,
        workItem: fields.workItem || null,
        draft: false,
        autoCreatePr: true,
        triggerPipeline: false,
      });
      setTaskId(resp.taskId);
      const { default: EventSource } = await import("eventsource");
      const es = new EventSource(`${client.baseUrl}/tasks/${resp.taskId}/events`);
      es.addEventListener("step", (ev) => {
        const s = JSON.parse(ev.data) as LogLine;
        setLogs((prev) => [...prev, s]);
      });
      es.addEventListener("done", (ev) => {
        const d = JSON.parse(ev.data) as { status: string; error?: string };
        setFinalStatus(d.status);
        if (d.error) setSubmitError(d.error);
        es.close();
        setFormState("done");
      });
      es.addEventListener("error", () => {
        setFinalStatus("connection error");
        es.close();
        setFormState("done");
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setFormState("done");
    }
  };

  if (formState === "form") {
    return (
      <Box flexDirection="column">
        <Text bold>Submit pipeline</Text>
        <Text dimColor>up/down to navigate fields, Enter to advance, Enter on last field to submit.</Text>
        <Box marginTop={1} flexDirection="column">
          {FIELDS.map((key, idx) => {
            const active = focusIdx === idx;
            return (
              <Box key={key} marginTop={0}>
                <Text color={active ? "cyan" : "white"}>
                  {active ? "> " : "  "}
                  {LABELS[key].padEnd(14)}:{" "}
                </Text>
                {active ? (
                  <TextInput
                    value={fields[key]}
                    onChange={(v) => setFields((prev) => ({ ...prev, [key]: v }))}
                    onSubmit={() => {
                      if (idx < FIELDS.length - 1) {
                        setFocusIdx(idx + 1);
                      } else {
                        void handleSubmit();
                      }
                    }}
                  />
                ) : (
                  <Text>{fields[key] !== "" ? fields[key] : <Text dimColor>(empty)</Text>}</Text>
                )}
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Work item ID is optional. Leave blank to skip.</Text>
        </Box>
      </Box>
    );
  }

  const done = formState === "done";
  const doneColor = finalStatus === "succeeded" ? "green" : "red";

  return (
    <Box flexDirection="column">
      <Text bold>Submit pipeline</Text>
      {taskId && <Text dimColor>task: {taskId}</Text>}
      <Box marginTop={1} flexDirection="column">
        {logs.map((l, i) => (
          <Text key={i}>
            <Text color={statusColor(l.status)}>{l.status.padStart(5)} </Text>
            {l.name}
            {l.detail ? ` - ${l.detail}` : ""}
          </Text>
        ))}
      </Box>
      {!done && <Text color="cyan">running...</Text>}
      {done && finalStatus && <Text color={doneColor}>{finalStatus}</Text>}
      {submitError && <Text color="red">error: {submitError}</Text>}
      {done && <Text dimColor>Press Tab to navigate away.</Text>}
    </Box>
  );
};
