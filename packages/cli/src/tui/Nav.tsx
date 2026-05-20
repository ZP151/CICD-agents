import React from "react";
import { Box, Text } from "ink";

export interface NavItem {
  key: string;
  label: string;
}

interface NavProps {
  items: NavItem[];
  active: string;
}

export const Nav: React.FC<NavProps> = ({ items, active }) => (
  <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="gray">
    <Text bold>cicd-agent</Text>
    <Box marginTop={1} flexDirection="column">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Text key={item.key} color={isActive ? "cyan" : "white"}>
            {isActive ? "> " : "  "}
            {item.label}
          </Text>
        );
      })}
    </Box>
    <Box marginTop={1}>
      <Text dimColor>Tab to navigate, q to quit</Text>
    </Box>
  </Box>
);
