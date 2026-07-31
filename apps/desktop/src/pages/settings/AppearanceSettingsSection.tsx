import type { AppTheme } from "../../theme.js";
import { SettingsRow, SettingsSection } from "./SettingsControls.js";

const themeOptions: Array<{ value: AppTheme; label: string; description: string }> = [
  { value: "standard", label: "Standard", description: "Blue + violet" },
  { value: "light", label: "Light", description: "Neutral white" },
  { value: "dark", label: "Dark", description: "Near-black" },
];

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
        description="Standard keeps blue and soft violet cues; light and dark remove ambient tint."
      >
        <div className="theme-choice-grid" role="group" aria-label="Application theme">
          {themeOptions.map((option) => {
            const selected = option.value === theme;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                data-state={selected ? "active" : "inactive"}
                data-theme-option={option.value}
                className="theme-choice-option"
                onClick={() => onThemeChange(option.value)}
              >
                <span className="theme-choice-swatch" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="theme-choice-label">{option.label}</span>
                <span className="theme-choice-description">{option.description}</span>
              </button>
            );
          })}
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
