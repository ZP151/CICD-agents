import React, { useEffect, useState } from "react";
import fs from "node:fs";
import path from "node:path";
import { Box, Text } from "ink";
import { detectRepoKind, suggestProfileFor, type RepoKind } from "../init.js";

const HINTS: Record<RepoKind, string> = {
  python: "python-api",
  dotnet: "dotnet-api",
  node: "node-web",
  unknown: "default",
};

export const InitWizard: React.FC = () => {
  const cwd = process.cwd();
  const [kind, setKind] = useState<RepoKind>("unknown");
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    setKind(detectRepoKind(cwd));
    setHasConfig(fs.existsSync(path.join(cwd, ".cicd-agent", "profile.yaml")));
  }, [cwd]);

  return (
    <Box flexDirection="column">
      <Text bold>Init wizard</Text>
      <Text>cwd: {cwd}</Text>
      <Text>
        detected: <Text color="cyan">{kind}</Text>
        {"  "}suggested profile: <Text color="green">{HINTS[kind]}</Text>
      </Text>
      <Text>
        existing config: {hasConfig ? <Text color="green">yes</Text> : <Text color="yellow">no</Text>}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Next steps:</Text>
        <Text>  1) dev-agent init --profile {suggestProfileFor(kind)}</Text>
        <Text>  2) dev-agent configure-pat</Text>
        <Text>  3) dev-agent submit-pipeline --profile {suggestProfileFor(kind)}</Text>
      </Box>
    </Box>
  );
};
