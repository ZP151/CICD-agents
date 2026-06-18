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
      <SettingsRow title="Theme">
        <SegmentedChoice<AppTheme>
          value={theme}
          onChange={onThemeChange}
          options={[
            { label: "System", value: "system" },
            { label: "Dark", value: "dark" },
            { label: "Light", value: "light" },
          ]}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
