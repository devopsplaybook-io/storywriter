import { describe, expect, it } from "vitest";
import {
  SECTION_TYPE_OPTIONS,
  sectionTypeChoices,
  sectionTypeIcon,
} from "../utils/sectionTypes";

function enabledValues(
  section: { type: string; parentId: string | null },
  childCount: number,
) {
  return sectionTypeChoices(section as never, childCount)
    .filter((choice) => !choice.disabled)
    .map((choice) => choice.value);
}

describe("section type choices", () => {
  it("offers every type for a leaf text section", () => {
    expect(enabledValues({ type: "text", parentId: "p" }, 0)).toEqual([
      "text",
      "container",
      "media",
    ]);
  });

  it("keeps the root a container", () => {
    const choices = sectionTypeChoices(
      { type: "container", parentId: null } as never,
      0,
    );
    expect(choices.filter((c) => !c.disabled).map((c) => c.value)).toEqual([
      "container",
    ]);
    const disabled = choices.filter((c) => c.disabled);
    expect(disabled).toHaveLength(2);
    expect(disabled[0].reason).toMatch(/root/i);
  });

  it("blocks converting a container that still has children", () => {
    expect(enabledValues({ type: "container", parentId: "p" }, 2)).toEqual([
      "container",
    ]);
    expect(enabledValues({ type: "container", parentId: "p" }, 0)).toEqual([
      "text",
      "container",
      "media",
    ]);
  });

  it("offers all types while no section is selected", () => {
    expect(
      sectionTypeChoices(null, 0).every((choice) => !choice.disabled),
    ).toBe(true);
  });
});

describe("section type icons", () => {
  it("maps every known type to an icon", () => {
    for (const option of SECTION_TYPE_OPTIONS) {
      expect(sectionTypeIcon(option.value)).toBe(option.icon);
    }
  });

  it("falls back to the text icon for unknown types", () => {
    expect(sectionTypeIcon("bogus")).toBe("bi bi-file-text");
  });
});
