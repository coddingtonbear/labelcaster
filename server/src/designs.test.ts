import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesignStore, isDesignInput, NAME_PATTERN } from "./designs.js";

describe("NAME_PATTERN", () => {
  it("accepts human names and rejects path shenanigans", () => {
    expect(NAME_PATTERN.test("Pantry jar (large)")).toBe(true);
    expect(NAME_PATTERN.test("cable-tag_v2")).toBe(true);
    expect(NAME_PATTERN.test("../escape")).toBe(false);
    expect(NAME_PATTERN.test(".hidden")).toBe(false);
    expect(NAME_PATTERN.test("a/b")).toBe(false);
    expect(NAME_PATTERN.test("")).toBe(false);
    expect(NAME_PATTERN.test("x".repeat(65))).toBe(false);
  });
});

describe("isDesignInput", () => {
  it("requires positive sizes and a canvas object", () => {
    expect(isDesignInput({ widthPx: 425, heightPx: 76, canvas: {} })).toBe(true);
    expect(isDesignInput({ widthPx: -1, heightPx: 76, canvas: {} })).toBe(false);
    expect(isDesignInput({ widthPx: 425, heightPx: 76 })).toBe(false);
    expect(isDesignInput({ widthPx: 425, heightPx: 76, canvas: "nope" })).toBe(false);
    expect(isDesignInput(null)).toBe(false);
  });
});

describe("DesignStore", () => {
  let dir: string;

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips save/list/load/remove", async () => {
    dir = await mkdtemp(join(tmpdir(), "labelcaster-designs-"));
    const store = new DesignStore(join(dir, "designs")); // not yet existing
    expect(await store.list()).toEqual([]);

    const saved = await store.save("Pantry", {
      widthPx: 425,
      heightPx: 76,
      canvas: { objects: [{ type: "IText", text: "flour" }] },
    });
    expect(saved.updatedAt).toMatch(/^\d{4}-/);

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ name: "Pantry", widthPx: 425, heightPx: 76 });
    expect(listed[0]).not.toHaveProperty("canvas");

    const loaded = await store.load("Pantry");
    expect(loaded?.canvas).toEqual({ objects: [{ type: "IText", text: "flour" }] });

    expect(await store.remove("Pantry")).toBe(true);
    expect(await store.load("Pantry")).toBeNull();
    expect(await store.remove("Pantry")).toBe(false);
  });

  it("overwrites an existing design under the same name", async () => {
    dir = await mkdtemp(join(tmpdir(), "labelcaster-designs-"));
    const store = new DesignStore(dir);
    await store.save("A", { widthPx: 100, heightPx: 76, canvas: {} });
    await store.save("A", { widthPx: 200, heightPx: 76, canvas: {} });
    expect((await store.load("A"))?.widthPx).toBe(200);
    expect(await store.list()).toHaveLength(1);
  });
});
