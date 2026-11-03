import type { Section, SectionType } from "../stores/sections";

export interface SectionTypeOption {
  value: SectionType;
  label: string;
  icon: string;
}

export const SECTION_TYPE_OPTIONS: SectionTypeOption[] = [
  { value: "text", label: "Text", icon: "bi bi-file-text" },
  { value: "container", label: "Container", icon: "bi bi-folder" },
  { value: "media", label: "Media", icon: "bi bi-image" },
];

export interface SectionTypeChoice extends SectionTypeOption {
  disabled: boolean;
  reason: string;
}

/**
 * Whether each structural type can be selected for the section, mirroring the
 * server rules: the root stays a container and a container with children must
 * be emptied before it becomes text or media.
 */
export function sectionTypeChoices(
  section: Pick<Section, "type" | "parentId"> | null | undefined,
  childCount: number,
): SectionTypeChoice[] {
  return SECTION_TYPE_OPTIONS.map((option) => {
    if (!section) {
      return { ...option, disabled: false, reason: "" };
    }
    if (section.parentId === null && option.value !== "container") {
      return {
        ...option,
        disabled: true,
        reason: "The root section must stay a container",
      };
    }
    if (
      section.type === "container" &&
      option.value !== "container" &&
      childCount > 0
    ) {
      return {
        ...option,
        disabled: true,
        reason: "Move or delete the sub-sections first",
      };
    }
    return { ...option, disabled: false, reason: "" };
  });
}

export function sectionTypeIcon(type: SectionType | string): string {
  return (
    SECTION_TYPE_OPTIONS.find((option) => option.value === type)?.icon ||
    "bi bi-file-text"
  );
}
