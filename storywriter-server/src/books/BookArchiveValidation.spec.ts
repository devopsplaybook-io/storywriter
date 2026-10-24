import {
  ARCHIVE_JSON_FILES,
  IMPORT_LIMITS,
  ImportValidationError,
  TOLERATED_ARCHIVE_JSON_FILES,
  ValidateArchiveEntries,
  ValidateAttributes,
  ValidateBook,
  ValidateManifest,
  ValidateMediaFiles,
  ValidateMediaMetadata,
  ValidateProperties,
  ValidateSectionProperties,
  ValidateSections,
} from "./BookArchiveValidation";

function file(path: string, size = 10): { path: string; size: number; type: string } {
  return { path, size, type: "File" };
}

function dir(path: string): { path: string; size: number; type: string } {
  return { path, size: 0, type: "Directory" };
}

describe("BookArchiveValidation", () => {
  describe("ValidateArchiveEntries", () => {
    it("accepts the documented file set with media entries", () => {
      const entries = [
        dir("media"),
        ...ARCHIVE_JSON_FILES.map((name) => file(name)),
        ...TOLERATED_ARCHIVE_JSON_FILES.map((name) => file(name)),
        dir("media/m1"),
        file("media/m1/m1.png", 100),
      ];
      const allowed = ValidateArchiveEntries(entries, 5000);
      expect(allowed.size).toBe(
        ARCHIVE_JSON_FILES.length +
          TOLERATED_ARCHIVE_JSON_FILES.length +
          1,
      );
    });

    it("rejects duplicate entry paths", () => {
      expect(() =>
        ValidateArchiveEntries([file("book.json"), file("book.json")], 1000),
      ).toThrow(ImportValidationError);
    });

    it("rejects more entries than the limit", () => {
      const entries = Array.from({ length: IMPORT_LIMITS.MAX_ENTRIES + 1 }, (_, i) =>
        file(`media/m${i}/m${i}.png`),
      );
      expect(() => ValidateArchiveEntries(entries, 1024)).toThrow(
        ImportValidationError,
      );
    });

    it.each([
      ["../evil.png"],
      ["a/../book.json"],
      ["/etc/passwd"],
      ["media\\m1\\m1.png"],
      ["media/m1/m\0.png"],
      ["unknown.json"],
      ["media/m1/sub/inner.png"],
    ])("rejects hostile entry path %j", (path) => {
      expect(() => ValidateArchiveEntries([file(path)], 1024)).toThrow(
        ImportValidationError,
      );
    });

    it("rejects link entries", () => {
      expect(() =>
        ValidateArchiveEntries([
          { path: "media/m1/x.png", size: 1, type: "SymbolicLink" },
        ], 1024),
      ).toThrow(ImportValidationError);
      expect(() =>
        ValidateArchiveEntries([
          { path: "media/m1/x.png", size: 1, type: "Link" },
        ], 1024),
      ).toThrow(ImportValidationError);
    });

    it("rejects unexpected directory entries", () => {
      expect(() =>
        ValidateArchiveEntries([dir("some/dir")], 1024),
      ).toThrow(ImportValidationError);
    });

    it("enforces per-JSON and per-media size limits", () => {
      expect(() =>
        ValidateArchiveEntries(
          [file("book.json", IMPORT_LIMITS.MAX_JSON_FILE + 1)],
          1024,
        ),
      ).toThrow(ImportValidationError);
      expect(() =>
        ValidateArchiveEntries(
          [file("media/m1/m1.png", IMPORT_LIMITS.MAX_MEDIA_FILE + 1)],
          1024,
        ),
      ).toThrow(ImportValidationError);
    });

    it("enforces the total uncompressed size limit", () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        file(`media/m${i}/m${i}.png`, IMPORT_LIMITS.MAX_TOTAL_UNCOMPRESSED / 5),
      );
      expect(() => ValidateArchiveEntries(entries, 1024)).toThrow(
        ImportValidationError,
      );
    });

    it("enforces the gzip ratio limit", () => {
      // 10 MiB of media in a tiny compressed archive
      const entries = [file("media/m1/m1.png", 10 * 1024 * 1024)];
      expect(() => ValidateArchiveEntries(entries, 1024)).toThrow(
        ImportValidationError,
      );
      // The same content in a plausibly-sized archive is fine.
      expect(() =>
        ValidateArchiveEntries(entries, 200 * 1024),
      ).not.toThrow();
    });
  });

  describe("ValidateManifest", () => {
    it("accepts versions 1.0 and 2.0", () => {
      expect(() => ValidateManifest({ version: "1.0" })).not.toThrow();
      expect(() => ValidateManifest({ version: "2.0" })).not.toThrow();
    });

    it.each(["9.9", "0.9", undefined, null, 2])("rejects version %j", (version) => {
      expect(() => ValidateManifest({ version })).toThrow(ImportValidationError);
    });

    it("rejects non-object manifests", () => {
      expect(() => ValidateManifest("1.0")).toThrow(ImportValidationError);
      expect(() => ValidateManifest(null)).toThrow(ImportValidationError);
    });
  });

  describe("ValidateBook", () => {
    it("accepts a valid book", () => {
      expect(() =>
        ValidateBook({ name: "My Book", description: "d", writingGoal: 100 }),
      ).not.toThrow();
    });

    it("rejects an empty or missing name", () => {
      expect(() => ValidateBook({ name: "" })).toThrow(ImportValidationError);
      expect(() => ValidateBook({})).toThrow(ImportValidationError);
      expect(() => ValidateBook({ name: "x".repeat(201) })).toThrow(
        ImportValidationError,
      );
    });

    it("rejects a negative or non-integer writingGoal", () => {
      expect(() => ValidateBook({ name: "b", writingGoal: -1 })).toThrow(
        ImportValidationError,
      );
      expect(() => ValidateBook({ name: "b", writingGoal: 1.5 })).toThrow(
        ImportValidationError,
      );
      expect(() => ValidateBook({ name: "b", writingGoal: 0 })).not.toThrow();
    });
  });

  describe("ValidateSections", () => {
    const mediaIds = new Set(["media-1"]);

    it("returns sections in parent-first order", () => {
      const ordered = ValidateSections(
        [
          { id: "child", parentId: "root", type: "text", title: "Child", orderIndex: 0 },
          { id: "root", parentId: null, type: "container", title: "Root", orderIndex: 0 },
        ],
        mediaIds,
      );
      expect(ordered.map((s) => s.id)).toEqual(["root", "child"]);
    });

    it("rejects duplicate ids", () => {
      expect(() =>
        ValidateSections(
          [
            { id: "a", parentId: null },
            { id: "a", parentId: "a" },
          ],
          mediaIds,
        ),
      ).toThrow(ImportValidationError);
    });

    it("rejects zero and multiple roots", () => {
      expect(() =>
        ValidateSections([{ id: "a", parentId: "ghost" }], mediaIds),
      ).toThrow(/root/);
      expect(() =>
        ValidateSections(
          [
            { id: "a", parentId: null },
            { id: "b", parentId: null },
          ],
          mediaIds,
        ),
      ).toThrow(/root/);
    });

    it("rejects orphan parents and cycles", () => {
      expect(() =>
        ValidateSections([{ id: "a", parentId: "ghost" }, { id: "root", parentId: null }], mediaIds),
      ).toThrow(/parent/);
      expect(() =>
        ValidateSections(
          [
            { id: "root", parentId: null },
            { id: "a", parentId: "b" },
            { id: "b", parentId: "a" },
          ],
          mediaIds,
        ),
      ).toThrow(/cycle/);
    });

    it("rejects unknown types and unknown media references", () => {
      expect(() =>
        ValidateSections([{ id: "a", parentId: null, type: "video" }], mediaIds),
      ).toThrow(ImportValidationError);
      expect(() =>
        ValidateSections(
          [{ id: "a", parentId: null, type: "media", mediaId: "media-404" }],
          mediaIds,
        ),
      ).toThrow(ImportValidationError);
      expect(() =>
        ValidateSections(
          [{ id: "a", parentId: null, type: "media", mediaId: "media-1" }],
          mediaIds,
        ),
      ).not.toThrow();
    });

    it("rejects negative or non-finite orderIndex and oversized titles", () => {
      expect(() =>
        ValidateSections([{ id: "a", parentId: null, orderIndex: -1 }], mediaIds),
      ).toThrow(ImportValidationError);
      expect(() =>
        ValidateSections([
          { id: "a", parentId: null, orderIndex: Number.NaN },
        ], mediaIds),
      ).toThrow(ImportValidationError);
      expect(() =>
        ValidateSections([{ id: "a", parentId: null, title: "x".repeat(501) }], mediaIds),
      ).toThrow(ImportValidationError);
    });
  });

  describe("ValidateProperties", () => {
    it("accepts valid properties and rejects bad ones", () => {
      expect(() =>
        ValidateProperties([{ id: "p1", name: "Type", options: ["Chapter"] }]),
      ).not.toThrow();
      expect(() => ValidateProperties([{ id: "p1" }])).toThrow(
        ImportValidationError,
      );
      expect(() =>
        ValidateProperties([{ id: "p1", name: "n", options: "nope" }]),
      ).toThrow(ImportValidationError);
    });
  });

  describe("ValidateAttributes", () => {
    it("accepts valid attributes and rejects bad ones", () => {
      expect(() =>
        ValidateAttributes([{ id: "a1", title: "Character", content: "..." }]),
      ).not.toThrow();
      expect(() => ValidateAttributes([{ title: "no id" }])).toThrow(
        ImportValidationError,
      );
    });
  });

  describe("ValidateSectionProperties", () => {
    const sectionIds = new Set(["s1"]);
    const propertyIds = new Set(["p1"]);

    it("accepts resolvable references", () => {
      expect(() =>
        ValidateSectionProperties(
          [{ sectionId: "s1", propertyId: "p1", value: "Chapter" }],
          sectionIds,
          propertyIds,
        ),
      ).not.toThrow();
    });

    it("rejects unknown references", () => {
      expect(() =>
        ValidateSectionProperties(
          [{ sectionId: "s404", propertyId: "p1", value: "x" }],
          sectionIds,
          propertyIds,
        ),
      ).toThrow(ImportValidationError);
      expect(() =>
        ValidateSectionProperties(
          [{ sectionId: "s1", propertyId: "p404", value: "x" }],
          sectionIds,
          propertyIds,
        ),
      ).toThrow(ImportValidationError);
    });
  });

  describe("ValidateMediaMetadata", () => {
    it("accepts valid media metadata", () => {
      expect(() =>
        ValidateMediaMetadata([
          {
            id: "m1",
            slug: "pic",
            filename: "m1.png",
            mimeType: "image/png",
            size: 12,
            dateCreated: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ).not.toThrow();
    });

    it("rejects duplicate ids and hostile filenames", () => {
      expect(() =>
        ValidateMediaMetadata([
          { id: "m1", filename: "a.png", mimeType: "image/png", size: 1 },
          { id: "m1", filename: "b.png", mimeType: "image/png", size: 1 },
        ]),
      ).toThrow(ImportValidationError);
      for (const filename of ["../evil.png", "/etc/passwd", "a\\b.png", ".x"]) {
        expect(() =>
          ValidateMediaMetadata([
            { id: "m1", filename, mimeType: "image/png", size: 1 },
          ]),
        ).toThrow(ImportValidationError);
      }
    });

    it("rejects disallowed MIME types", () => {
      expect(() =>
        ValidateMediaMetadata([
          { id: "m1", filename: "m1.html", mimeType: "text/html", size: 1 },
        ]),
      ).toThrow(ImportValidationError);
    });
  });

  describe("ValidateMediaFiles", () => {
    it("requires exactly one matching entry per declared media", () => {
      const entries = new Map([["media/m1/m1.png", 12]]);
      expect(() =>
        ValidateMediaFiles(entries, [
          { id: "m1", filename: "m1.png", size: 12 },
        ]),
      ).not.toThrow();
    });

    it("rejects missing files and size mismatches", () => {
      expect(() =>
        ValidateMediaFiles(new Map(), [{ id: "m1", filename: "m1.png", size: 12 }]),
      ).toThrow(ImportValidationError);
      expect(() =>
        ValidateMediaFiles(new Map([["media/m1/m1.png", 11]]), [
          { id: "m1", filename: "m1.png", size: 12 },
        ]),
      ).toThrow(ImportValidationError);
    });

    it("rejects orphan media entries", () => {
      expect(() =>
        ValidateMediaFiles(
          new Map([
            ["media/m1/m1.png", 1],
            ["media/m2/m2.png", 1],
          ]),
          [{ id: "m1", filename: "m1.png", size: 1 }],
        ),
      ).toThrow(ImportValidationError);
    });
  });
});
