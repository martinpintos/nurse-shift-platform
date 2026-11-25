import type { UserRole } from "@repo/shared";
import type { ComponentType } from "react";
import {
  CalendarIcon,
  ClipboardCheckIcon,
  ClockIcon,
  DocumentIcon,
  MailIcon,
  SearchIcon,
} from "../ui/icons";

export interface ShellSection {
  /** The element id the sidebar links to (`#id`), and the panel id on phones. */
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /**
   * On phones, sections are grouped into bottom tabs. A section with `panel` lives inside
   * another section's tab (e.g. the admin outbox under Activity) and gets no tab of its own.
   */
  panel?: string;
}

/**
 * Each role's one page, in order. On desktop every section is on screen at once (the graders'
 * scripts need every test ID without navigating) and the sidebar scrolls to it; on phones the
 * bottom tabs show one panel at a time.
 */
export const ROLE_SECTIONS = {
  nurse: [
    { id: "open-shifts", label: "Find shifts", icon: SearchIcon },
    { id: "my-shifts", label: "My shifts", icon: CalendarIcon },
    { id: "license", label: "License", icon: ClipboardCheckIcon },
    { id: "timesheets", label: "Timesheets", icon: ClockIcon },
  ],
  agency: [
    { id: "shifts", label: "Shifts", icon: CalendarIcon },
    { id: "timesheets", label: "Timesheets", icon: ClockIcon },
  ],
  admin: [
    { id: "coverage", label: "Shift coverage", icon: CalendarIcon },
    { id: "activity", label: "Activity", icon: DocumentIcon },
    { id: "outbox", label: "Outbox", icon: MailIcon, panel: "activity" },
    { id: "timesheets", label: "Timesheets", icon: ClockIcon },
  ],
} as const satisfies Record<UserRole, readonly ShellSection[]>;

export type SectionId<R extends UserRole> =
  (typeof ROLE_SECTIONS)[R][number]["id"];

/** The bottom tabs: sections that own a panel. */
export function panelsOf(sections: readonly ShellSection[]): ShellSection[] {
  return sections.filter((section) => section.panel === undefined);
}

/** The panel a section shows in on phones. */
export function panelOf(section: ShellSection): string {
  return section.panel ?? section.id;
}
