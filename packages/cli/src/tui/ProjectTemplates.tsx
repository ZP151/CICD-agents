import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { loadProjectTemplates, type ProjectTemplate } from "@mergepilot/core";

export const ProjectTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const all = loadProjectTemplates();
      setTemplates(Object.values(all));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return (
    <Box flexDirection="column">
      <Text bold>Project templates</Text>
      {error && <Text color="red">{error}</Text>}
      {templates.length === 0 ? (
        <Text dimColor>(no project templates loaded)</Text>
      ) : (
        templates.map((p) => (
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
          Edit packages/core/config/project-templates.yaml directly for now. These templates
          provide build/test defaults; Project Links map repositories to Azure DevOps.
        </Text>
      </Box>
    </Box>
  );
};
