import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { loadProfiles, type Profile } from "@cicd-agent/core";

export const ProfileEditor: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const all = loadProfiles();
      setProfiles(Object.values(all));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return (
    <Box flexDirection="column">
      <Text bold>Profiles</Text>
      {error && <Text color="red">{error}</Text>}
      {profiles.length === 0 ? (
        <Text dimColor>(no profiles loaded)</Text>
      ) : (
        profiles.map((p) => (
          <Box key={p.name} flexDirection="column" marginTop={1}>
            <Text color="cyan">{p.name}</Text>
            <Text>  build: {p.build.command || "(none)"}</Text>
            <Text>  test : {p.test.command || "(none)"}</Text>
            <Text>
              ado  : {p.azure_devops.organization || "?"}/{p.azure_devops.project || "?"}/
              {p.azure_devops.repository || "?"} (target={p.azure_devops.default_target_branch})
            </Text>
          </Box>
        ))
      )}
      <Box marginTop={1}>
        <Text dimColor>
          Edit packages/core/config/profiles.yaml directly for now; an in-TUI editor
          ships in the next iteration.
        </Text>
      </Box>
    </Box>
  );
};
