import * as fs from "fs-extra";
import * as path from "path";
import {
  TestServer,
  TestUser,
} from "../__tests__/TestServer";
import {
  VersionsDataCreate,
  VersionsDataGet,
  VersionsDataListByBook,
} from "../versions/VersionsData";

// Wrap SectionsDataAdd so the rollback test can force a failure (swc's
// getter-based exports cannot be spied on directly).
jest.mock("../sections/SectionsData", () => {
  const actual = jest.requireActual("../sections/SectionsData");
  return {
    ...actual,
    SectionsDataAdd: jest.fn(actual.SectionsDataAdd),
  };
});

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16, 5),
]);

describe("Versions", () => {
  let server: TestServer;
  let user: TestUser;
  let bookId: string;

  const uploadMedia = async () => {
    const res = await server.uploadMedia(
      user.token,
      bookId,
      "pic.png",
      PNG_BYTES,
      "image/png",
    );
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  };

  const addChapter = async (title: string, analysis = "") => {
    const root = await server.getRootSection(user.token, bookId);
    const res = await server.inject("POST", "/api/sections", user.token, {
      bookId,
      parentId: root.id,
      title,
      content: `Content of ${title}`,
    });
    expect(res.statusCode).toBe(201);
    const section = JSON.parse(res.body);
    if (analysis) {
      await server.inject("PUT", `/api/sections/${section.id}`, user.token, {
        analysis,
      });
    }
    return section;
  };

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    const admin = await server.createUser("admin");
    user = await server.createUser("versions-user", "user", admin.token);
    const book = await server.createBook(user.token, "Versioned Book");
    bookId = book.id;
  });

  afterAll(async () => {
    await server.close();
  });

  it("snapshots sections with analysis, properties and section values", async () => {
    await addChapter("Chapter 1", "AI notes v1");
    const media = await uploadMedia();
    const propsRes = await server.inject(
      "GET",
      `/api/properties?bookId=${bookId}`,
      user.token,
    );
    const property = JSON.parse(propsRes.body)[0];
    const sectionsRes = await server.inject(
      "GET",
      `/api/sections?bookId=${bookId}`,
      user.token,
    );
    const section = JSON.parse(sectionsRes.body).find(
      (s: any) => s.title === "Chapter 1",
    );
    await server.inject("PUT", `/api/properties/section/${section.id}`, user.token, {
      propertyId: property.id,
      value: "Chapter",
    });

    const version = await VersionsDataCreate(bookId, "v1", server.config);
    const snapshot = JSON.parse(version.snapshot);
    expect(snapshot.sections).toHaveLength(2);
    const snapshottedChapter = snapshot.sections.find(
      (s: any) => s.title === "Chapter 1",
    );
    expect(snapshottedChapter.analysis).toBe("AI notes v1");
    expect(snapshot.properties).toHaveLength(1);
    expect(snapshot.sectionProperties).toEqual([
      { sectionId: section.id, propertyId: property.id, value: "Chapter" },
    ]);
    expect(snapshot.mediaMeta).toHaveLength(1);
    expect(snapshot.mediaMeta[0].id).toBe(media.id);
    // The version media dir contains the media file.
    const versionFile = path.join(
      server.config.DATA_DIR,
      "media",
      bookId,
      "versions",
      version.id,
      media.id,
      `${media.id}.png`,
    );
    expect(fs.existsSync(versionFile)).toBe(true);
  });

  it("restores sections, AI notes, properties, values and media after edits and deletions", async () => {
    const listed = await VersionsDataListByBook(bookId);
    // The list is metadata-only: the transport JSON carries no snapshot
    // payload, but a size.
    expect(typeof listed[0].size).toBe("number");
    expect(listed[0].toTransportJson().snapshot).toBeUndefined();
    const version = await VersionsDataGet(listed[0].id);
    const before = JSON.parse(version.snapshot);
    const media = before.mediaMeta[0];

    // Destructive edits: add a section, change analysis, change the property
    // value, delete the media and drop an orphan media dir in place.
    await addChapter("Chapter 2");
    const sectionsNow = JSON.parse(
      (await server.inject("GET", `/api/sections?bookId=${bookId}`, user.token))
        .body,
    );
    const chapter1 = sectionsNow.find((s: any) => s.title === "Chapter 1");
    await server.inject("PUT", `/api/sections/${chapter1.id}`, user.token, {
      analysis: "overwritten notes",
    });
    const propertyId = before.properties[0].id;
    await server.inject(
      "PUT",
      `/api/properties/section/${chapter1.id}`,
      user.token,
      { propertyId, value: "Changed" },
    );
    await server.inject(
      "DELETE",
      `/api/books/${bookId}/media/${media.id}`,
      user.token,
    );
    const orphanDir = path.join(
      server.config.DATA_DIR,
      "media",
      bookId,
      "orphan-media-id",
    );
    await fs.mkdirp(orphanDir);

    const restoreRes = await server.inject(
      "POST",
      `/api/books/${bookId}/versions/${version.id}/restore`,
      user.token,
    );
    expect(restoreRes.statusCode).toBe(200);

    const after = JSON.parse(
      (await server.inject("GET", `/api/sections?bookId=${bookId}`, user.token))
        .body,
    );
    expect(after).toHaveLength(2);
    expect(
      after.find((s: any) => s.title === "Chapter 2"),
    ).toBeUndefined();
    const restoredChapter1 = after.find((s: any) => s.title === "Chapter 1");
    expect(restoredChapter1.analysis).toBe("AI notes v1");

    // Property values restored authoritatively
    const values = JSON.parse(
      (
        await server.inject(
          "GET",
          `/api/properties/section/${restoredChapter1.id}`,
          user.token,
        )
      ).body,
    );
    expect(values).toEqual([
      { propertyId, value: "Chapter" },
    ]);

    // Media metadata and file restored; orphan dir removed; version dirs kept
    const mediaList = JSON.parse(
      (
        await server.inject("GET", `/api/books/${bookId}/media`, user.token)
      ).body,
    );
    expect(mediaList).toHaveLength(1);
    expect(mediaList[0].id).toBe(media.id);
    const restoredFile = path.join(
      server.config.DATA_DIR,
      "media",
      bookId,
      media.id,
      `${media.id}.png`,
    );
    expect(fs.existsSync(restoredFile)).toBe(true);
    expect(Buffer.compare(fs.readFileSync(restoredFile), PNG_BYTES)).toBe(0);
    expect(fs.existsSync(orphanDir)).toBe(false);
    expect(fs.existsSync(path.join(server.config.DATA_DIR, "media", bookId, "versions"))).toBe(true);
  });

  it("keeps the current properties when restoring a legacy snapshot", async () => {
    const listed = await VersionsDataListByBook(bookId);
    const version = await VersionsDataGet(listed[0].id);
    const snapshot = JSON.parse(version.snapshot);
    // Simulate a pre-0.12 snapshot: no properties/sectionProperties arrays.
    delete snapshot.properties;
    delete snapshot.sectionProperties;
    await server.exec("UPDATE book_versions SET snapshot = ? WHERE id = ?", [
      JSON.stringify(snapshot),
      version.id,
    ]);

    // A property definition added after the snapshot must survive the restore.
    const newPropRes = await server.inject("POST", "/api/properties", user.token, {
      bookId,
      name: "Extra Property",
      options: ["A"],
    });
    expect(newPropRes.statusCode).toBe(201);

    const restoreRes = await server.inject(
      "POST",
      `/api/books/${bookId}/versions/${version.id}/restore`,
      user.token,
    );
    expect(restoreRes.statusCode).toBe(200);

    const props = JSON.parse(
      (
        await server.inject("GET", `/api/properties?bookId=${bookId}`, user.token)
      ).body,
    );
    const names = props.map((p: any) => p.name);
    expect(names).toContain("Section Types");
    expect(names).toContain("Extra Property");
  });

  it("leaves the database unchanged when the restore fails mid-transaction", async () => {
    const version = (await VersionsDataListByBook(bookId))[0];
    const sectionsBefore = JSON.parse(
      (await server.inject("GET", `/api/sections?bookId=${bookId}`, user.token))
        .body,
    );

    const SectionsData = require("../sections/SectionsData");
    (SectionsData.SectionsDataAdd as jest.Mock).mockImplementationOnce(
      async () => {
        throw new Error("boom");
      },
    );
    const restoreRes = await server.inject(
      "POST",
      `/api/books/${bookId}/versions/${version.id}/restore`,
      user.token,
    );
    expect(restoreRes.statusCode).toBe(500);

    const sectionsAfter = JSON.parse(
      (await server.inject("GET", `/api/sections?bookId=${bookId}`, user.token))
        .body,
    );
    expect(sectionsAfter).toHaveLength(sectionsBefore.length);
    const analysisAfter = sectionsAfter.find(
      (s: any) => s.title === "Chapter 1",
    ).analysis;
    expect(analysisAfter).toBe("AI notes v1");
  });

  it("prunes versions and their media beyond VERSIONS_MAX_PER_BOOK", async () => {
    server.config.VERSIONS_MAX_PER_BOOK = 2;
    await VersionsDataCreate(bookId, "v2", server.config);
    const v3 = await VersionsDataCreate(bookId, "v3", server.config);
    const v4 = await VersionsDataCreate(bookId, "v4", server.config);

    const versions = await VersionsDataListByBook(bookId);
    expect(versions.map((v) => v.versionNumber).sort()).toEqual([3, 4]);
    // v2 exists but v1 was pruned... (v1 was pruned by v3's creation)
    const mediaRoot = path.join(server.config.DATA_DIR, "media", bookId, "versions");
    const remainingDirs = fs.existsSync(mediaRoot)
      ? fs.readdirSync(mediaRoot)
      : [];
    expect(remainingDirs.sort()).toEqual([v3.id, v4.id].sort());
    server.config.VERSIONS_MAX_PER_BOOK = 50;
  });

  it("removes media, version media and the analysis cache when the book is deleted", async () => {
    // Analysis cache file as BookAnalysis would write it.
    const cachePath = path.join(
      server.config.DATA_DIR,
      `book-analysis-${bookId}.json`,
    );
    await fs.writeJson(cachePath, { summary: "cached" });
    expect(fs.existsSync(cachePath)).toBe(true);
    expect(
      fs.existsSync(path.join(server.config.DATA_DIR, "media", bookId)),
    ).toBe(true);

    const delRes = await server.inject(
      "DELETE",
      `/api/books/${bookId}`,
      user.token,
    );
    expect(delRes.statusCode).toBe(200);
    expect(fs.existsSync(cachePath)).toBe(false);
    expect(
      fs.existsSync(path.join(server.config.DATA_DIR, "media", bookId)),
    ).toBe(false);
  });
});
