import pino from "pino";
import { getSettings } from "./settings.js";

let cached: pino.Logger | null = null;

export function logger(): pino.Logger {
  if (cached) return cached;
  const settings = getSettings();
  cached = pino({
    level: settings.runtimeLogLevel.toLowerCase(),
    base: { service: "cicd-agent" },
    redact: {
      paths: [
        "*.authorization",
        "*.password",
        "*.pat",
        "*.apiKey",
        "headers.authorization",
      ],
      remove: true,
    },
  });
  return cached;
}

export function child(bindings: Record<string, unknown>): pino.Logger {
  return logger().child(bindings);
}
