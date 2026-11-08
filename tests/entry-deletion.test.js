import test from "node:test";
import assert from "node:assert/strict";
import { deleteEntry, reviewerDeleteEntry } from "../lib/entry-deletion.js";
import { PHOTO_CLEANUP_FAILURE, retryPhotoCleanup } from "../lib/entry-photo-cleanup.js";
import { cleanupDiagnostic } from "../lib/entry-cleanup-diagnostics.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ID = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
const BUCKET_URL = "https://archive.example.test/storage/v1/object/public/photos/";
const PHOTO_PATH = `${OWNER}/photo-123.png`;
const row = { id: ID, owner: OWNER, image: BUCKET_URL + PHOTO_PATH };

function mockClient(options = {}) {
  const calls = { loads: [], filters: [], deletes: 0, references: [], removals: [], storage: 0, events: [], retryChecks: 0 };
  const client = {
    auth: { async getUser() {
      if (options.authThrows) throw new Error("PRIVATE AUTH ERROR");
      return { data: { user: options.user === undefined ? { id: OWNER } : options.user }, error: options.authError };
    } },
    from(table) {
      assert.equal(table, "entries");
      return {
        delete() {
          calls.deletes++;
          const request = {
            eq(column, value) { calls.filters.push([column, value]); return request; },
            is(column, value) { calls.filters.push([column, value]); return request; },
            select(columns) { assert.equal(columns, "id, owner"); return request; },
            async maybeSingle() {
              if (options.deleteThrows) throw new Error("PRIVATE DELETE ERROR");
              calls.events.push("deleted-row-response");
              return { data: options.zeroRows ? null : options.deletedRow || options.row || row, error: options.deleteError };
            },
          };
          return request;
        },
        select(columns) {
          const filters = [];
          const request = {
            eq(column, value) { filters.push([column, value]); return request; },
            async maybeSingle() {
              if (columns === "id, owner, image") {
                calls.loads.push(filters); calls.events.push("capture-photo");
                if (options.loadThrows) throw new Error("PRIVATE LOAD ERROR");
                return { data: options.missingEntry ? null : options.row || row, error: options.loadError };
              }
              assert.equal(columns, "id"); assert.deepEqual(filters, [["id", ID]]);
              calls.retryChecks++;
              return { data: options.entryExists ? { id: ID } : null, error: options.retryCheckError };
            },
            like(column, pattern) {
              assert.equal(columns, "id"); assert.equal(column, "image"); calls.references.push(pattern);
              return { async limit(count) {
                assert.equal(count, 1); calls.events.push("reference-check");
                if (options.referenceThrows) throw new Error("PRIVATE REFERENCE ERROR");
                return { data: options.references ?? [], error: options.referenceError };
              } };
            },
          };
          return request;
        },
      };
    },
    storage: { from(bucket) {
      calls.storage++; assert.equal(bucket, "photos");
      return {
        getPublicUrl(path) {
          if (options.urlThrows) throw new Error("PRIVATE URL ERROR");
          return { data: { publicUrl: encodeURI(BUCKET_URL + path) } };
        },
        async remove(paths) {
          calls.removals.push(...paths); calls.events.push("photo-removal");
          if (options.removeThrows) throw new Error("PRIVATE STORAGE ERROR");
          return { data: options.removed === undefined ? paths.map((name) => ({ name })) : options.removed, error: options.removeError };
        },
      };
    } },
  };
  return { client, calls };
}

test("captures the photo before deleting by UUID and owner, then removes only the relative object path", async () => {
  const { client, calls } = mockClient();
  const result = await deleteEntry(client, ID, OWNER);
  assert.equal(result.deleted, true);
  assert.equal(result.cleanup.status, "removed");
  assert.equal(result.warning, "");
  assert.deepEqual(calls.loads, [[["id", ID], ["owner", OWNER]]]);
  assert.deepEqual(calls.filters, [["id", ID], ["owner", OWNER], ["image", row.image]]);
  assert.deepEqual(calls.removals, [PHOTO_PATH]);
  assert.deepEqual(calls.events, ["capture-photo", "deleted-row-response", "reference-check", "photo-removal"]);
});

test("invalid UUIDs never issue an entry read, deletion or cleanup", async () => {
  for (const id of ["entry-title", "", null, undefined]) {
    const { client, calls } = mockClient();
    assert.equal((await deleteEntry(client, id, OWNER)).deleted, false);
    assert.equal(calls.loads.length, 0); assert.equal(calls.deletes, 0); assert.equal(calls.storage, 0);
  }
});

test("uppercase UUID input is normalized for both capture and deletion", async () => {
  const { client, calls } = mockClient();
  assert.equal((await deleteEntry(client, ID.toUpperCase(), OWNER)).deleted, true);
  assert.deepEqual(calls.loads[0][0], ["id", ID]);
  assert.deepEqual(calls.filters[0], ["id", ID]);
});

test("another account, signed-out account or failed auth cannot read, delete or clean a photo", async () => {
  for (const options of [{ user: null }, { user: { id: OTHER } }, { authError: { message: "PRIVATE AUTH ERROR" } }, { authThrows: true }]) {
    const { client, calls } = mockClient(options);
    const result = await deleteEntry(client, ID, OWNER);
    assert.equal(result.deleted, false);
    assert.equal(calls.loads.length, 0); assert.equal(calls.deletes, 0); assert.equal(calls.storage, 0);
    assert.ok(!result.error.includes("PRIVATE"));
  }
});

test("a missing, unreadable or differently owned entry is not deleted", async () => {
  for (const options of [{ missingEntry: true }, { loadError: { message: "PRIVATE LOAD ERROR" } }, { loadThrows: true }, { row: { ...row, owner: OTHER } }, { row: { ...row, id: OTHER } }]) {
    const { client, calls } = mockClient(options);
    const result = await deleteEntry(client, ID, OWNER);
    assert.equal(result.deleted, false); assert.equal(calls.deletes, 0); assert.equal(calls.storage, 0);
    assert.ok(!result.error.includes("PRIVATE"));
  }
});

test("zero deleted rows, RLS errors and network failures never report success or remove a photo", async () => {
  for (const options of [{ zeroRows: true }, { deleteError: { code: "42501", message: "PRIVATE DATABASE ERROR" } }, { deleteThrows: true }, { deletedRow: { ...row, id: OTHER } }, { deletedRow: { ...row, owner: OTHER } }]) {
    const { client, calls } = mockClient(options);
    const result = await deleteEntry(client, ID, OWNER);
    assert.equal(result.deleted, false); assert.equal(calls.storage, 0);
    assert.ok(!result.error.includes("PRIVATE"));
  }
});

test("deletion protects the captured photo against concurrent replacement", async () => {
  const { client, calls } = mockClient({ zeroRows: true });
  const result = await deleteEntry(client, ID, OWNER);
  assert.deepEqual(calls.filters.at(-1), ["image", row.image]);
  assert.equal(result.deleted, false); assert.equal(calls.removals.length, 0);
});

test("local /images assets are not passed to Storage", async () => {
  for (const image of ["/images/music.jpg", "/images/ចម្រៀង.png"]) {
    const { client, calls } = mockClient({ row: { ...row, image } });
    const result = await deleteEntry(client, ID, OWNER);
    assert.equal(result.deleted, true); assert.equal(result.cleanup.status, "not-needed");
    assert.equal(result.warning, ""); assert.equal(calls.storage, 0); assert.equal(calls.removals.length, 0);
  }
});

test("external origins and other buckets are never cleaned up", async () => {
  for (const image of ["https://external.example.test/image.jpg", BUCKET_URL.replace("archive.example.test", "other.example.test") + PHOTO_PATH, BUCKET_URL.replace("/photos/", "/avatars/") + PHOTO_PATH]) {
    const { client, calls } = mockClient({ row: { ...row, image } });
    const result = await deleteEntry(client, ID, OWNER);
    assert.equal(result.cleanup.status, "not-needed"); assert.equal(calls.removals.length, 0);
  }
});

test("valid object names are decoded to relative paths, including underscores, spaces and Khmer", async () => {
  for (const path of [`${OWNER}/my_photo.png`, `${OWNER}/photo 123.png`, `${OWNER}/ចម្រៀង.png`, `${OWNER}/folder/photo.png`]) {
    const { client, calls } = mockClient({ row: { ...row, image: encodeURI(BUCKET_URL + path) } });
    const result = await deleteEntry(client, ID, OWNER);
    assert.equal(result.cleanup.status, "removed"); assert.deepEqual(calls.removals, [path]);
  }
});

test("other owners and ambiguous paths fail cleanup with the exact required message", async () => {
  for (const image of [BUCKET_URL + OTHER + "/photo.png", BUCKET_URL + OWNER + "/photo%2f123.png", BUCKET_URL + OWNER + "/photo%25123.png", BUCKET_URL + OWNER + "/"]) {
    const { client, calls } = mockClient({ row: { ...row, image } });
    const result = await deleteEntry(client, ID, OWNER);
    assert.equal(result.deleted, true); assert.equal(result.warning, PHOTO_CLEANUP_FAILURE);
    assert.equal(calls.removals.length, 0);
  }
});

test("shared references preserve the photo and retain a snapshot for retries", async () => {
  const image = row.image + "?download=1";
  const { client, calls } = mockClient({ row: { ...row, image }, references: [{ id: OTHER }] });
  const result = await deleteEntry(client, ID, OWNER);
  assert.equal(result.deleted, true); assert.equal(result.warning, PHOTO_CLEANUP_FAILURE);
  assert.deepEqual(result.cleanup.snapshot, { ...row, image }); assert.equal(calls.removals.length, 0);
});

test("reference check failures preserve photos and cannot report cleanup success", async () => {
  for (const options of [{ referenceError: { message: "PRIVATE ERROR" } }, { referenceThrows: true }, { urlThrows: true }]) {
    const { client, calls } = mockClient(options);
    const result = await deleteEntry(client, ID, OWNER);
    assert.equal(result.deleted, true); assert.equal(result.warning, PHOTO_CLEANUP_FAILURE);
    assert.equal(calls.removals.length, 0);
  }
});

test("null errors with empty or mismatched deleted-object arrays still mean cleanup failed", async () => {
  for (const options of [{ removeError: { message: "PRIVATE STORAGE ERROR" } }, { removeThrows: true }, { removed: [] }, { removed: null }, { removed: [{ name: `${OTHER}/other.png` }] }]) {
    const { client } = mockClient(options);
    const result = await deleteEntry(client, ID, OWNER);
    assert.equal(result.deleted, true); assert.equal(result.warning, "Entry deleted, but the photo could not be removed.");
    assert.equal(result.cleanup.status, "failed"); assert.deepEqual(result.cleanup.snapshot, row);
  }
});

test("entries with no image do not trigger Storage cleanup", async () => {
  for (const image of [null, "", "   "]) {
    const { client, calls } = mockClient({ row: { ...row, image } });
    const result = await deleteEntry(client, ID, OWNER);
    assert.equal(result.deleted, true); assert.equal(result.warning, ""); assert.equal(calls.storage, 0);
  }
});

test("retry rechecks auth and entry absence, then removes only the captured photo", async () => {
  const { client, calls } = mockClient();
  const result = await retryPhotoCleanup(client, row);
  assert.equal(result.status, "removed"); assert.equal(calls.retryChecks, 1);
  assert.equal(calls.deletes, 0); assert.deepEqual(calls.removals, [PHOTO_PATH]);
});

test("retry cannot run as another account, while an entry exists, or when checks fail", async () => {
  for (const options of [{ user: { id: OTHER } }, { user: null }, { entryExists: true }, { retryCheckError: { message: "PRIVATE ERROR" } }, { references: [{ id: OTHER }] }]) {
    const { client, calls } = mockClient(options);
    const result = await retryPhotoCleanup(client, row);
    assert.equal(result.status, "failed"); assert.equal(result.warning, PHOTO_CLEANUP_FAILURE);
    assert.equal(calls.deletes, 0); assert.equal(calls.removals.length, 0);
  }
});

test("retry never claims success for an empty Storage result", async () => {
  const { client, calls } = mockClient({ removed: [] });
  const result = await retryPhotoCleanup(client, row);
  assert.equal(result.status, "failed"); assert.equal(result.warning, PHOTO_CLEANUP_FAILURE);
  assert.equal(calls.deletes, 0);
});

test("temporary diagnostics redact credentials and exclude session/header/metadata objects", (t) => {
  const originalMode = process.env.NODE_ENV;
  const logger = t.mock.method(console, "log", () => {});
  const privateValue = ["sensitive", "diagnostic", "value"].join("-");
  const tokenLike = [
    Buffer.from('{"alg":"none"}').toString("base64url"),
    Buffer.from('{"purpose":"diagnostic"}').toString("base64url"),
    "test-signature",
  ].join(".");
  try {
    process.env.NODE_ENV = "development";
    cleanupDiagnostic("remove-response", {
      path: PHOTO_PATH,
      imageUrl: `${row.image}?token=${privateValue}#${privateValue}`,
      data: [{ id: ID, name: PHOTO_PATH, metadata: { value: privateValue }, access_token: privateValue }],
      error: {
        name: "StorageError", status: 403,
        message: `Bearer ${tokenLike}; apikey=${privateValue}; https://example.test/object?token=${privateValue}`,
        session: { access_token: privateValue }, originalError: { headers: { authorization: privateValue } },
      },
      session: { access_token: privateValue },
    });
    const output = JSON.stringify(logger.mock.calls[0].arguments);
    assert.ok(output.includes(PHOTO_PATH));
    assert.ok(output.includes("[redacted]"));
    assert.ok(!output.includes(privateValue));
    assert.ok(!output.includes(tokenLike));
    assert.ok(!output.includes("access_token"));
    assert.ok(!output.includes("originalError"));
    assert.ok(!output.includes("metadata"));
  } finally {
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
  }
});

test("temporary diagnostics are disabled outside development", (t) => {
  const originalMode = process.env.NODE_ENV;
  const logger = t.mock.method(console, "log", () => {});
  try {
    process.env.NODE_ENV = "production";
    cleanupDiagnostic("remove-request", { path: PHOTO_PATH });
    assert.equal(logger.mock.calls.length, 0);
  } finally {
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
  }
});

test("a reviewer deletes another contributor's entry, then removes that contributor's photo", async () => {
  const { client, calls } = mockClient({ user: { id: OTHER } });
  const result = await reviewerDeleteEntry(client, ID);
  assert.equal(result.deleted, true);
  assert.equal(result.cleanup.status, "removed");
  assert.deepEqual(calls.loads, [[["id", ID]]]);
  assert.deepEqual(calls.filters, [["id", ID], ["image", row.image]]);
  assert.deepEqual(calls.removals, [PHOTO_PATH]);
});

test("reviewer delete: zero rows (not a reviewer), errors or a bad id never report success or remove a photo", async () => {
  for (const options of [{ zeroRows: true }, { deleteError: { code: "42501", message: "PRIVATE DATABASE ERROR" } }, { deleteThrows: true }, { missingEntry: true }, { loadThrows: true }]) {
    const { client, calls } = mockClient(options);
    const result = await reviewerDeleteEntry(client, ID);
    assert.equal(result.deleted, false); assert.equal(calls.removals.length, 0);
    assert.ok(!result.error.includes("PRIVATE"));
  }
  const { client, calls } = mockClient();
  assert.equal((await reviewerDeleteEntry(client, "not-an-id")).deleted, false);
  assert.equal(calls.loads.length, 0); assert.equal(calls.deletes, 0);
});
