import { describe, expect, it } from "vitest";
import { samePath } from "../core/paths";

/**
 * The one comparison the app asks whenever a document can arrive from more than one
 * direction. Six places used to spell it out, and the spellings differed: most
 * remembered to check both sides had a path, two did not.
 */
describe("同一个文件的两个路径", () => {
  it("大小写不同，还是同一个文件", () => {
    // Windows does not distinguish these, so neither may the app: a listing that
    // says `C:\Vault\A.md` and a tab that says `c:\vault\a.md` are one document,
    // and treating them as two is how the same file ends up open twice.
    expect(samePath("C:\\Vault\\A.md", "c:\\vault\\a.md")).toBe(true);
    expect(samePath("/Users/me/Notes/A.md", "/Users/me/notes/a.md")).toBe(true);
  });

  it("不一样的路径不是同一个文件", () => {
    expect(samePath("C:\\Vault\\A.md", "C:\\Vault\\B.md")).toBe(false);
    // Not a prefix match: one file being inside the same folder says nothing.
    expect(samePath("C:\\Vault\\A.md", "C:\\Vault\\A.md.bak")).toBe(false);
  });

  it("缺路径不匹配任何东西 —— 连另一个也缺的都不", () => {
    // The rule that matters most, and the one the two unguarded spellings got
    // wrong: two documents that each have no file are not one document, they are
    // two documents. Saying otherwise opens a new document into somebody else's
    // tab — and it is also what keeps this from throwing on a missing path.
    expect(samePath(undefined, "C:\\Vault\\A.md")).toBe(false);
    expect(samePath("C:\\Vault\\A.md", undefined)).toBe(false);
    expect(samePath(undefined, undefined)).toBe(false);
    expect(samePath(null, null)).toBe(false);
    expect(samePath("", "")).toBe(false);
    expect(samePath("", "C:\\Vault\\A.md")).toBe(false);
  });
});
