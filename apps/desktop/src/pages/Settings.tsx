import { useState } from "react";
import { runtimeUrl } from "../api.js";

export default function Settings(): JSX.Element {
  const [endpoint, setEndpoint] = useState(runtimeUrl);
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Settings</h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-300">Runtime URL</span>
        <input
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
        />
      </label>
      <p className="text-xs text-zinc-500">
        Set <code>VITE_RUNTIME_URL</code> at build time to change the default.
        PAT and Azure OpenAI key are stored in the OS keyring via the CLI;
        the GUI never sees secrets directly.
      </p>
    </div>
  );
}
