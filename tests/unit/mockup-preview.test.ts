import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mockupPreviewPlugin } from "../../artifacts/mockup-sandbox/mockupPreviewPlugin";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function sandbox() {
  const root = await mkdtemp(path.join(tmpdir(), "lumen-mockup-preview-"));
  roots.push(root);
  const plugin = mockupPreviewPlugin();
  const configure = plugin.configResolved;
  const build = plugin.buildStart;
  if (typeof configure !== "function" || typeof build !== "function") {
    throw new Error(
      "The preview plugin must expose its configuration and build hooks.",
    );
  }
  configure.call({} as never, { root } as never);
  return {
    root,
    async generate() {
      await build.call({} as never, {} as never);
      return readFile(
        path.join(root, "src/.generated/mockup-components.ts"),
        "utf8",
      );
    },
    async file(relativePath: string) {
      const filename = path.join(root, relativePath);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(
        filename,
        "export default function Preview() { return null; }\n",
      );
    },
  };
}

describe("mockup preview discovery", () => {
  it("generates usable imports for nested previews while excluding private and hidden entries", async () => {
    const fixture = await sandbox();
    const directory = "src/components/mockups";
    for (const filename of [
      "Home.tsx",
      "nested folder/Details.tsx",
      "_Private.tsx",
      "nested folder/_Helper.tsx",
      "_internal/PrivatePage.tsx",
      "nested folder/_internal/AnotherPrivatePage.tsx",
      ".Hidden.tsx",
      ".hidden/HiddenPage.tsx",
      "nested folder/.hidden/HiddenNestedPage.tsx",
      "utility.ts",
    ])
      await fixture.file(`${directory}/${filename}`);
    await fixture.file("src/components/Outside.tsx");
    await mkdir(path.join(fixture.root, directory, "NotAComponent.tsx"));
    await symlink("Home.tsx", path.join(fixture.root, directory, "Linked.tsx"));

    const source = await fixture.generate();
    for (const filename of [
      "Home.tsx",
      "nested folder/Details.tsx",
      "Linked.tsx",
    ]) {
      expect(source).toContain(
        `"./components/mockups/${filename}": () => import("../components/mockups/${filename}")`,
      );
    }
    expect(source.match(/\(\) => import\(/g)).toHaveLength(3);
    expect(source).not.toMatch(
      /Private|Helper|Hidden|utility|Outside|NotAComponent/,
    );
    expect(source).not.toContain(fixture.root);
  });

  it("handles a missing mockup directory and refreshes after previews are added or removed", async () => {
    const fixture = await sandbox();
    const emptySource = await fixture.generate();
    expect(emptySource).toContain("export const modules: ModuleMap = {");
    expect(emptySource).not.toContain("=> import(");

    await fixture.file("src/components/mockups/Added.tsx");
    expect(await fixture.generate()).toContain(
      'import("../components/mockups/Added.tsx")',
    );
    await rm(path.join(fixture.root, "src/components/mockups/Added.tsx"));
    expect(await fixture.generate()).toBe(emptySource);
  });
});
