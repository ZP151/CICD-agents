import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { RuntimeClient } from "../runtimeClient.js";

interface TaskRow {
  id: string;
  kind: string;
  status: string;
  createdAt: number;
  error?: string;
}

function statusColor(s: string): string {
  if (s === "succeeded") return "green";
  if (s === "failed") return "red";
  if (s === "running") return "cyan";
  if (s === "queued") return "yellow";
  return "white";
}

function formatAge(epochSec: number): string {
  const secs = Math.floor(Date.now() / 1000) - epochSec;
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export const TaskFeed: React.FC<{ client: RuntimeClient }> = ({ client }) => {
  const [error, setError] = useState<string | null>(null);
  const [healthOk, setHealthOk] = useState(false);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const tick = async (): Promise<void> => {
      try {
        const h = (await client.healthz()) as { ok?: boolean; llmConfigured?: boolean };
        if (!cancelled) {
          setHealthOk(Boolean(h.ok));
          setLlmConfigured(Boolean(h.llmConfigured));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setHealthOk(false);
        }
      }

      try {
        const list = await client.listTasks();
        if (!cancelled) {
          setTasks(
            list.map((t) => ({
              id: String(t["id"] ?? ""),
              kind: String(t["kind"] ?? ""),
              status: String(t["status"] ?? ""),
              createdAt: Number(t["createdAt"] ?? 0),
              error: t["error"] ? String(t["error"]) : undefined,
            })),
          );
        }
      } catch {
        // task list failures are non-fatal
      }
    };

    void tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Task feed</Text>
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Text color={healthOk ? "green" : "red"}>{healthOk ? "runtime ok" : "runtime unreachable"}</Text>
        <Text color={llmConfigured ? "green" : "yellow"}>{llmConfigured ? "LLM ready" : "LLM not configured"}</Text>
      </Box>
      {error && <Text color="red">{error}</Text>}

      <Box flexDirection="column" marginTop={1}>
        {tasks.length === 0 ? (
          <Text dimColor>(no tasks yet — use Submit to run one)</Text>
        ) : (
          tasks.map((t) => (
            <Box key={t.id} flexDirection="column" marginBottom={0}>
              <Box gap={2}>
                <Text color={statusColor(t.status)}>{t.status.padEnd(10)}</Text>
                <Text dimColor>{t.id}</Text>
                <Text dimColor>{formatAge(t.createdAt)}</Text>
              </Box>
              {t.error && <Text color="red">  {t.error}</Text>}
            </Box>
          ))
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Refreshes every 5s.</Text>
      </Box>
    </Box>
  );
};
