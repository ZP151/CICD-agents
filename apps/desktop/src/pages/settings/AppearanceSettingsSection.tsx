import type { AppTheme } from "../../theme.js";
import { SegmentedChoice, SettingsRow, SettingsSection } from "./SettingsControls.js";

export function AppearanceSettingsSection({
  theme,
  onThemeChange,
}: {
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}): JSX.Element {
  return (
    <SettingsSection title="Appearance">
      <SettingsRow
        title="Theme"
        description="Choose a fixed visual mode for MergePilot."
      >
        <SegmentedChoice<AppTheme>
          value={theme}
          onChange={onThemeChange}
          options={[
            { label: "Light", value: "light" },
            { label: "Dark", value: "dark" },
          ]}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
