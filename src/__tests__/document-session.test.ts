import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDocumentSession } from "../hooks/useDocumentSession";

describe("src/hooks/useDocumentSession.ts", () => {
  it("initializes empty and manages session updates with dirty tracking", async () => {
    const { result } = renderHook(() => useDocumentSession());

    expect(result.current.session).toBeNull();
    expect(result.current.isDirty).toBe(false);

    // Open a session
    act(() => {
      result.current.openSession({
        chapterId: "chap-1",
        absolutePath: "/test/path.md",
        fileName: "path.md",
        baseUrl: "file:///test/",
        source: "# Hello World",
        diskVersion: { size: 13, mtimeMs: 1000 },
        writable: true,
      });
    });

    expect(result.current.session).not.toBeNull();
    expect(result.current.session?.source).toBe("# Hello World");
    expect(result.current.isDirty).toBe(false);

    // Update source
    act(() => {
      result.current.updateSource("# Hello World Edit");
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.session?.source).toBe("# Hello World Edit");

    // Discard changes
    act(() => {
      result.current.discardChanges();
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.session?.source).toBe("# Hello World");

    // Close session
    act(() => {
      result.current.closeSession();
    });

    expect(result.current.session).toBeNull();
    expect(result.current.isDirty).toBe(false);
  });
});
