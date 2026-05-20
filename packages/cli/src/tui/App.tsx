import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { RuntimeClient } from "../runtimeClient.js";
import { Nav, type NavItem } from "./Nav.js";
import { TaskFeed } from "./TaskFeed.js";
import { ProfileEditor } from "./ProfileEditor.js";
import { InitWizard } from "./InitWizard.js";
import { SubmitForm } from "./SubmitForm.js";

interface AppProps {
  client: RuntimeClient;
  initialView?: string;
}

const ITEMS: NavItem[] = [
  { key: "feed", label: "Task feed" },
  { key: "submit", label: "Submit" },
  { key: "profiles", label: "Profiles" },
  { key: "init", label: "Init wizard" },
];

export const App: React.FC<AppProps> = ({ client, initialView = "feed" }) => {
  const { exit } = useApp();
  const [active, setActive] = useState(initialView);

  // Tab cycles through nav items; arrow keys are reserved for panel-internal use.
  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) exit();
    if (key.tab) {
      const idx = ITEMS.findIndex((i) => i.key === active);
      setActive(ITEMS[(idx + 1) % ITEMS.length]!.key);
    }
  });

  return (
    <Box flexDirection="row" width={100}>
      <Box width={28}>
        <Nav items={ITEMS} active={active} />
      </Box>
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        {active === "feed" && <TaskFeed client={client} />}
        {active === "submit" && <SubmitForm client={client} />}
        {active === "profiles" && <ProfileEditor />}
        {active === "init" && <InitWizard />}
        {!ITEMS.find((i) => i.key === active) && <Text dimColor>(empty)</Text>}
      </Box>
    </Box>
  );
};
