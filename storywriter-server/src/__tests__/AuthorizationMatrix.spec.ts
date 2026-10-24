import { TestServer, TestUser } from "./TestServer";

describe("Authorization matrix", () => {
  let server: TestServer;
  let admin: TestUser;
  let owner: TestUser;
  let otherOwner: TestUser;
  let writer: TestUser;
  let reader: TestUser;
  let outsider: TestUser;

  let bookA: { id: string; ownerId: string };
  let bookB: { id: string; ownerId: string };
  const legacyBookId = "legacy-book-no-access";
  const mediaAId = "media-a-0001";
  const mediaBId = "media-b-0001";

  const now = () => new Date().toISOString();

  async function insertSection(
    id: string,
    bookId: string,
    parentId: string | null,
    type = "container",
    title = id,
  ): Promise<void> {
    await server.exec(
      `INSERT INTO sections (id, bookId, parentId, type, title, content, analysis, mediaId, caption, orderIndex, dateCreated, dateUpdated)
       VALUES (?, ?, ?, ?, ?, '', '', NULL, '', 0, ?, ?)`,
      [id, bookId, parentId, type, title, now(), now()],
    );
  }

  async function insertMedia(
    id: string,
    bookId: string,
    slug: string,
  ): Promise<void> {
    await server.exec(
      `INSERT INTO media (id, bookId, slug, filename, mimeType, size, dateCreated)
       VALUES (?, ?, ?, ?, 'image/png', 1, ?)`,
      [id, bookId, slug, `${slug}.png`, now()],
    );
  }

  beforeAll(async () => {
    server = new TestServer();
    await server.init();
    admin = await server.createUser("admin");
    owner = await server.createUser("owner", "user", admin.token);
    otherOwner = await server.createUser("other-owner", "user", admin.token);
    writer = await server.createUser("writer", "user", admin.token);
    reader = await server.createUser("reader", "user", admin.token);
    outsider = await server.createUser("outsider", "user", admin.token);

    bookA = await server.createBook(owner.token, "Book A");
    bookB = await server.createBook(otherOwner.token, "Book B");

    await server.inject("PUT", `/api/books/${bookA.id}/access`, owner.token, {
      userId: writer.id,
      permission: "write",
    });
    await server.inject("PUT", `/api/books/${bookA.id}/access`, owner.token, {
      userId: reader.id,
      permission: "read",
    });

    // Legacy zero-access book straight in the database (pre-0006 semantics).
    await server.exec(
      `INSERT INTO books (id, name, description, dateCreated, writingGoal, ownerId)
       VALUES (?, ?, '', ?, 0, NULL)`,
      [legacyBookId, "Legacy Book", now()],
    );

    await insertMedia(mediaAId, bookA.id, "picture-a");
    await insertMedia(mediaBId, bookB.id, "picture-b");
  });

  afterAll(async () => {
    await server.close();
  });

  describe("book list", () => {
    it("shows only permitted books with the caller's permission", async () => {
      const res = await server.inject("GET", "/api/books", reader.token);
      expect(res.statusCode).toBe(200);
      const books = JSON.parse(res.body);
      expect(books.map((b: any) => b.id)).toEqual([bookA.id]);
      expect(books[0].permission).toBe("read");
      expect(books[0].ownerId).toBe(owner.id);

      const writerRes = await server.inject("GET", "/api/books", writer.token);
      const writerBooks = JSON.parse(writerRes.body);
      expect(writerBooks[0].permission).toBe("write");

      const ownerRes = await server.inject("GET", "/api/books", owner.token);
      const ownerBooks = JSON.parse(ownerRes.body);
      expect(ownerBooks[0].permission).toBe("owner");
    });

    it("hides zero-access legacy books from non-admins and shows them to admins", async () => {
      const outsiderRes = await server.inject(
        "GET",
        "/api/books",
        outsider.token,
      );
      expect(
        JSON.parse(outsiderRes.body).map((b: any) => b.id),
      ).not.toContain(legacyBookId);

      const adminRes = await server.inject("GET", "/api/books", admin.token);
      const adminBooks = JSON.parse(adminRes.body);
      expect(adminBooks.map((b: any) => b.id)).toContain(legacyBookId);
      const legacy = adminBooks.find((b: any) => b.id === legacyBookId);
      expect(legacy.permission).toBe("admin");
    });

    it("requires authentication", async () => {
      const res = await server.inject("GET", "/api/books");
      expect(res.statusCode).toBe(403);
    });
  });

  describe("book detail", () => {
    it("denies unauthenticated and unauthorized users", async () => {
      expect(
        (await server.inject("GET", `/api/books/${bookA.id}`)).statusCode,
      ).toBe(403);
      expect(
        (
          await server.inject(
            "GET",
            `/api/books/${bookA.id}`,
            outsider.token,
          )
        ).statusCode,
      ).toBe(403);
    });

    it("allows readers, writers, owners and admins", async () => {
      for (const [user, permission] of [
        [reader, "read"],
        [writer, "write"],
        [owner, "owner"],
        [admin, "admin"],
      ] as const) {
        const res = await server.inject(
          "GET",
          `/api/books/${bookA.id}`,
          user.token,
        );
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).permission).toBe(permission);
      }
    });

    it("returns 404 for unknown books", async () => {
      const res = await server.inject("GET", "/api/books/missing", admin.token);
      expect(res.statusCode).toBe(404);
    });
  });

  describe("book access list", () => {
    it("is restricted to the owner and admins", async () => {
      expect(
        (
          await server.inject(
            "GET",
            `/api/books/${bookA.id}/access`,
            reader.token,
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await server.inject(
            "GET",
            `/api/books/${bookA.id}/access`,
            writer.token,
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await server.inject(
            "GET",
            `/api/books/${bookA.id}/access`,
            outsider.token,
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (await server.inject("GET", `/api/books/${bookA.id}/access`))
          .statusCode,
      ).toBe(403);

      const ownerRes = await server.inject(
        "GET",
        `/api/books/${bookA.id}/access`,
        owner.token,
      );
      expect(ownerRes.statusCode).toBe(200);
      expect(JSON.parse(ownerRes.body)).toEqual(
        expect.arrayContaining([
          { bookId: bookA.id, userId: owner.id, permission: "write" },
        ]),
      );

      const adminRes = await server.inject(
        "GET",
        `/api/books/${bookA.id}/access`,
        admin.token,
      );
      expect(adminRes.statusCode).toBe(200);
    });
  });

  describe("access management", () => {
    it("rejects non-owners and outsiders", async () => {
      const target = await server.createUser("target", "user", admin.token);
      expect(
        (
          await server.inject(
            "PUT",
            `/api/books/${bookA.id}/access`,
            writer.token,
            { userId: target.id, permission: "read" },
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await server.inject(
            "DELETE",
            `/api/books/${bookA.id}/access/${target.id}`,
            outsider.token,
          )
        ).statusCode,
      ).toBe(403);
    });

    it("lets the owner grant and revoke access", async () => {
      const target = await server.createUser("grantee", "user", admin.token);
      const put = await server.inject(
        "PUT",
        `/api/books/${bookA.id}/access`,
        owner.token,
        { userId: target.id, permission: "read" },
      );
      expect(put.statusCode).toBe(200);
      const del = await server.inject(
        "DELETE",
        `/api/books/${bookA.id}/access/${target.id}`,
        owner.token,
      );
      expect(del.statusCode).toBe(200);
    });

    it("rejects invalid permissions and owner-row changes", async () => {
      expect(
        (
          await server.inject(
            "PUT",
            `/api/books/${bookA.id}/access`,
            owner.token,
            { userId: reader.id, permission: "admin" },
          )
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await server.inject(
            "PUT",
            `/api/books/${bookA.id}/access`,
            owner.token,
            { userId: owner.id, permission: "read" },
          )
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await server.inject(
            "DELETE",
            `/api/books/${bookA.id}/access/${owner.id}`,
            owner.token,
          )
        ).statusCode,
      ).toBe(400);
    });
  });

  describe("book create/update responses", () => {
    it("includes the caller's permission in create and update responses", async () => {
      const created = await server.inject("POST", "/api/books", owner.token, {
        name: "Permission Response Book",
      });
      expect(created.statusCode).toBe(201);
      expect(JSON.parse(created.body).permission).toBe("owner");

      const adminCreated = await server.inject(
        "POST",
        "/api/books",
        admin.token,
        { name: "Admin Created Book" },
      );
      expect(adminCreated.statusCode).toBe(201);
      expect(JSON.parse(adminCreated.body).permission).toBe("admin");

      const ownerUpdate = await server.inject(
        "PUT",
        `/api/books/${bookA.id}`,
        owner.token,
        { description: "updated by owner" },
      );
      expect(ownerUpdate.statusCode).toBe(200);
      expect(JSON.parse(ownerUpdate.body).permission).toBe("owner");

      const writerUpdate = await server.inject(
        "PUT",
        `/api/books/${bookA.id}`,
        writer.token,
        { description: "updated by writer" },
      );
      expect(writerUpdate.statusCode).toBe(200);
      expect(JSON.parse(writerUpdate.body).permission).toBe("write");
    });
  });

  describe("book deletion", () => {
    it("rejects writers and allows the owner and admins", async () => {
      const throwaway = await server.createBook(owner.token, "Throwaway 1");
      await server.inject(
        "PUT",
        `/api/books/${throwaway.id}/access`,
        owner.token,
        { userId: writer.id, permission: "write" },
      );
      const writerDelete = await server.inject(
        "DELETE",
        `/api/books/${throwaway.id}`,
        writer.token,
      );
      expect(writerDelete.statusCode).toBe(403);

      const ownerDelete = await server.inject(
        "DELETE",
        `/api/books/${throwaway.id}`,
        owner.token,
      );
      expect(ownerDelete.statusCode).toBe(200);

      const adminThrowaway = await server.createBook(owner.token, "Throwaway 2");
      const adminDelete = await server.inject(
        "DELETE",
        `/api/books/${adminThrowaway.id}`,
        admin.token,
      );
      expect(adminDelete.statusCode).toBe(200);
    });
  });

  describe("versions", () => {
    let versionA: any;
    let versionB: any;

    beforeAll(async () => {
      const createA = await server.inject(
        "POST",
        `/api/books/${bookA.id}/versions`,
        owner.token,
        { note: "first" },
      );
      expect(createA.statusCode).toBe(201);
      versionA = JSON.parse(createA.body);
      expect(versionA.snapshot).toBeUndefined();

      const createB = await server.inject(
        "POST",
        `/api/books/${bookB.id}/versions`,
        otherOwner.token,
        { note: "other" },
      );
      versionB = JSON.parse(createB.body);
    });

    it("denies outsiders and allows readers", async () => {
      expect(
        (
          await server.inject(
            "GET",
            `/api/books/${bookA.id}/versions`,
            outsider.token,
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (await server.inject("GET", `/api/books/${bookA.id}/versions`))
          .statusCode,
      ).toBe(403);

      const readerList = await server.inject(
        "GET",
        `/api/books/${bookA.id}/versions`,
        reader.token,
      );
      expect(readerList.statusCode).toBe(200);
      const versions = JSON.parse(readerList.body);
      expect(versions.length).toBeGreaterThan(0);
      expect(versions[0].snapshot).toBeUndefined();

      const readerDetail = await server.inject(
        "GET",
        `/api/books/${bookA.id}/versions/${versionA.id}`,
        reader.token,
      );
      expect(readerDetail.statusCode).toBe(200);
      expect(JSON.parse(readerDetail.body).snapshot).toBeUndefined();
    });

    it("exposes the snapshot only through the access-checked endpoint", async () => {
      expect(
        (
          await server.inject(
            "GET",
            `/api/books/${bookA.id}/versions/${versionA.id}/snapshot`,
            outsider.token,
          )
        ).statusCode,
      ).toBe(403);

      const res = await server.inject(
        "GET",
        `/api/books/${bookA.id}/versions/${versionA.id}/snapshot`,
        reader.token,
      );
      expect(res.statusCode).toBe(200);
      expect(typeof JSON.parse(res.body).snapshot).toBe("string");
    });

    it("does not return another book's version through this book", async () => {
      const res = await server.inject(
        "GET",
        `/api/books/${bookA.id}/versions/${versionB.id}`,
        owner.token,
      );
      expect(res.statusCode).toBe(404);
    });

    it("requires write access to create and restore versions", async () => {
      expect(
        (
          await server.inject(
            "POST",
            `/api/books/${bookA.id}/versions`,
            reader.token,
            { note: "nope" },
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await server.inject(
            "POST",
            `/api/books/${bookA.id}/versions/${versionA.id}/restore`,
            reader.token,
          )
        ).statusCode,
      ).toBe(403);
    });
  });

  describe("book analysis", () => {
    it("requires read access", async () => {
      expect(
        (
          await server.inject(
            "GET",
            `/api/books/${bookA.id}/analysis`,
            outsider.token,
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await server.inject(
            "GET",
            `/api/books/${bookA.id}/analysis`,
            reader.token,
          )
        ).statusCode,
      ).toBe(200);
    });
  });

  describe("sections", () => {
    it("creates sections only inside the same book", async () => {
      const rootA = await server.getRootSection(owner.token, bookA.id);
      const rootB = await server.getRootSection(otherOwner.token, bookB.id);

      const sameBook = await server.inject(
        "POST",
        "/api/sections",
        owner.token,
        { bookId: bookA.id, parentId: rootA.id, title: "Chapter 1" },
      );
      expect(sameBook.statusCode).toBe(201);

      const crossBook = await server.inject(
        "POST",
        "/api/sections",
        owner.token,
        { bookId: bookA.id, parentId: rootB.id, title: "Injected" },
      );
      expect(crossBook.statusCode).toBe(400);
    });

    it("rejects missing ids and a media item from another book", async () => {
      const rootA = await server.getRootSection(owner.token, bookA.id);
      expect(
        (
          await server.inject("POST", "/api/sections", owner.token, {
            parentId: rootA.id,
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await server.inject("POST", "/api/sections", owner.token, {
            bookId: bookA.id,
          })
        ).statusCode,
      ).toBe(400);

      const crossMedia = await server.inject(
        "POST",
        "/api/sections",
        owner.token,
        {
          bookId: bookA.id,
          parentId: rootA.id,
          type: "media",
          mediaId: mediaBId,
        },
      );
      expect(crossMedia.statusCode).toBe(400);

      const sameMedia = await server.inject(
        "POST",
        "/api/sections",
        owner.token,
        {
          bookId: bookA.id,
          parentId: rootA.id,
          type: "media",
          mediaId: mediaAId,
        },
      );
      expect(sameMedia.statusCode).toBe(201);
    });

    async function createCopyFixture() {
      const rootA = await server.getRootSection(owner.token, bookA.id);
      const parent = await server.inject(
        "POST",
        "/api/sections",
        owner.token,
        { bookId: bookA.id, parentId: rootA.id, type: "container", title: "Part" },
      );
      const parentBody = JSON.parse(parent.body);
      const child = await server.inject(
        "POST",
        "/api/sections",
        owner.token,
        { bookId: bookA.id, parentId: parentBody.id, title: "Scene" },
      );
      return { rootA, parent: parentBody, child: JSON.parse(child.body) };
    }

    it("copies a subtree inside the same book without AI notes", async () => {
      const { rootA, parent } = await createCopyFixture();
      const analysisSet = await server.inject(
        "PUT",
        `/api/sections/${parent.id}`,
        owner.token,
        { analysis: "AI notes that must not be copied" },
      );
      expect(analysisSet.statusCode).toBe(200);

      const res = await server.inject(
        "POST",
        `/api/sections/${parent.id}/copy`,
        owner.token,
        { targetParentId: rootA.id, orderIndex: 1 },
      );
      expect(res.statusCode).toBe(201);
      const copy = JSON.parse(res.body);
      expect(copy.title).toBe("Part (copy)");
      expect(copy.bookId).toBe(bookA.id);
      // Duplicated sections start with empty AI notes (regenerable content
      // is not copied — see SECTIONS.md).
      expect(copy.analysis).toBe("");

      const children = await server.inject(
        "GET",
        `/api/sections/${copy.id}/children`,
        owner.token,
      );
      expect(JSON.parse(children.body).map((s: any) => s.title)).toEqual([
        "Scene (copy)",
      ]);
    });

    it("rejects cross-book, self/descendant and root copies", async () => {
      const { rootA, parent } = await createCopyFixture();
      const rootB = await server.getRootSection(otherOwner.token, bookB.id);

      const crossBook = await server.inject(
        "POST",
        `/api/sections/${parent.id}/copy`,
        owner.token,
        { targetParentId: rootB.id, orderIndex: 0 },
      );
      expect(crossBook.statusCode).toBe(400);

      const intoDescendant = await server.inject(
        "POST",
        `/api/sections/${parent.id}/copy`,
        owner.token,
        { targetParentId: parent.id, orderIndex: 0 },
      );
      expect(intoDescendant.statusCode).toBe(400);

      const rootCopy = await server.inject(
        "POST",
        `/api/sections/${rootA.id}/copy`,
        owner.token,
        { targetParentId: rootA.id, orderIndex: 0 },
      );
      expect(rootCopy.statusCode).toBe(400);

      const missingTarget = await server.inject(
        "POST",
        `/api/sections/${parent.id}/copy`,
        owner.token,
        {},
      );
      expect(missingTarget.statusCode).toBe(400);
    });

    it("filters children by book and never deletes cross-book children", async () => {
      const rootA = await server.getRootSection(owner.token, bookA.id);
      const container = await server.inject(
        "POST",
        "/api/sections",
        owner.token,
        { bookId: bookA.id, parentId: rootA.id, title: "Container" },
      );
      const containerBody = JSON.parse(container.body);
      const child = await server.inject(
        "POST",
        "/api/sections",
        owner.token,
        {
          bookId: bookA.id,
          parentId: containerBody.id,
          title: "Real child",
        },
      );
      const childBody = JSON.parse(child.body);

      // Directly injected cross-book child (bypasses the API on purpose).
      const crossChildId = "cross-book-child";
      await insertSection(crossChildId, bookB.id, containerBody.id);

      const children = await server.inject(
        "GET",
        `/api/sections/${containerBody.id}/children`,
        owner.token,
      );
      expect(children.statusCode).toBe(200);
      expect(JSON.parse(children.body).map((s: any) => s.id)).toEqual([
        childBody.id,
      ]);

      const del = await server.inject(
        "DELETE",
        `/api/sections/${containerBody.id}`,
        owner.token,
      );
      expect(del.statusCode).toBe(200);

      expect(
        (
          await server.inject(
            "GET",
            `/api/sections/${childBody.id}`,
            owner.token,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await server.inject(
            "GET",
            `/api/sections/${crossChildId}`,
            otherOwner.token,
          )
        ).statusCode,
      ).toBe(200);
    });
  });

  describe("properties", () => {
    it("rejects a property from another book", async () => {
      const rootA = await server.getRootSection(owner.token, bookA.id);
      const sectionA = await server.inject(
        "POST",
        "/api/sections",
        owner.token,
        { bookId: bookA.id, parentId: rootA.id, title: "Props section" },
      );
      const sectionBody = JSON.parse(sectionA.body);

      const propertyB = await server.inject(
        "POST",
        "/api/properties",
        otherOwner.token,
        { bookId: bookB.id, name: "Other property" },
      );
      const propertyBBody = JSON.parse(propertyB.body);

      expect(
        (
          await server.inject(
            "PUT",
            `/api/properties/section/${sectionBody.id}`,
            owner.token,
            { propertyId: propertyBBody.id, value: "x" },
          )
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await server.inject(
            "DELETE",
            `/api/properties/section/${sectionBody.id}/${propertyBBody.id}`,
            owner.token,
          )
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await server.inject(
            "PUT",
            `/api/properties/section/${sectionBody.id}`,
            owner.token,
            { value: "x" },
          )
        ).statusCode,
      ).toBe(400);
    });

    it("accepts a property from the same book", async () => {
      const rootA = await server.getRootSection(owner.token, bookA.id);
      const sectionA = await server.inject(
        "POST",
        "/api/sections",
        owner.token,
        { bookId: bookA.id, parentId: rootA.id, title: "Props section 2" },
      );
      const sectionBody = JSON.parse(sectionA.body);

      const properties = await server.inject(
        "GET",
        `/api/properties?bookId=${bookA.id}`,
        owner.token,
      );
      const propertyA = JSON.parse(properties.body)[0];
      expect(propertyA).toBeDefined();

      expect(
        (
          await server.inject(
            "PUT",
            `/api/properties/section/${sectionBody.id}`,
            owner.token,
            { propertyId: propertyA.id, value: "Chapter" },
          )
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await server.inject(
            "DELETE",
            `/api/properties/section/${sectionBody.id}/${propertyA.id}`,
            owner.token,
          )
        ).statusCode,
      ).toBe(200);
    });
  });

  describe("media", () => {
    it("does not serve another book's media through this book", async () => {
      expect(
        (
          await server.inject(
            "GET",
            `/api/books/${bookB.id}/media/${mediaAId}`,
            otherOwner.token,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await server.inject(
            "GET",
            `/api/books/${bookB.id}/media/${mediaAId}/file`,
            otherOwner.token,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await server.inject(
            "DELETE",
            `/api/books/${bookB.id}/media/${mediaAId}`,
            otherOwner.token,
          )
        ).statusCode,
      ).toBe(404);
    });

    it("serves media to users with access and denies outsiders", async () => {
      expect(
        (
          await server.inject(
            "GET",
            `/api/books/${bookA.id}/media/${mediaAId}`,
            owner.token,
          )
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await server.inject(
            "GET",
            `/api/books/${bookA.id}/media/${mediaAId}`,
            outsider.token,
          )
        ).statusCode,
      ).toBe(403);
    });
  });
});
