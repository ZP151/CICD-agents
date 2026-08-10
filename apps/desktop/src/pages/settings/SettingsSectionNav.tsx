export const settingsSectionLinks = [
  { id: "settings-appearance", label: "Appearance" },
  { id: "settings-system", label: "System" },
  { id: "settings-account", label: "Account" },
  { id: "settings-additional-models", label: "Additional Models" },
  { id: "settings-capabilities", label: "Capabilities" },
  { id: "settings-diagnostics", label: "Diagnostics" },
] as const;
export type SettingsSectionId = (typeof settingsSectionLinks)[number]["id"];

/**
 * A compact local selector. It deliberately changes the visible settings
 * panel rather than duplicating a long-page table of contents.
 */
export function SettingsSectionNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: SettingsSectionId;
  onSectionChange: (section: SettingsSectionId) => void;
}): JSX.Element {
  return (
    <nav aria-label="Settings sections" className="settings-section-nav">
      {settingsSectionLinks.map((section) => (
        <button
          key={section.id}
          type="button"
          aria-pressed={section.id === activeSection}
          className="settings-section-nav-button"
          data-active={section.id === activeSection ? "true" : "false"}
          onClick={() => onSectionChange(section.id)}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}
