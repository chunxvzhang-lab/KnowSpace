import { describe, it, expect, beforeEach } from "vitest";
import { COMMANDS, getCommand, listCommands, listPaletteCommands } from "../core/commands";
import { commandBus } from "../services/commandBus";

describe("command registry (core/commands.ts)", () => {
  it("has a healthy, duplicated-free catalogue", () => {
    // A registry smaller than this means the parser of the catalogue itself
    // broke (or someone gutted it) — the same self-check the CSS guards carry.
    expect(COMMANDS.length).toBeGreaterThanOrEqual(25);
    const ids = new Set(COMMANDS.map((c) => c.id));
    expect(ids.size).toBe(COMMANDS.length);
    for (const c of COMMANDS) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.category.length).toBeGreaterThan(0);
      // Namespaced ids keep the taxonomy greppable: "domain.verb".
      expect(c.id).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
    }
  });

  it("lookups cover every id", () => {
    expect(listCommands()).toHaveLength(COMMANDS.length);
    for (const c of COMMANDS) {
      expect(getCommand(c.id)).toBe(c);
    }
    expect(getCommand("nope.nope")).toBeUndefined();
  });

  it("hides only the bindings whose palette entry would be noise", () => {
    const hidden = listPaletteCommands().length;
    expect(hidden).toBeGreaterThan(15);
    expect(listCommands().length).toBeGreaterThanOrEqual(hidden);
  });
});

describe("command bus", () => {
  beforeEach(() => {
    commandBus.reset();
  });

  it("executes a registered handler", () => {
    let ran = 0;
    commandBus.register("document.save", () => {
      ran += 1;
    });
    commandBus.execute("document.save");
    expect(ran).toBe(1);
    expect(commandBus.hasHandler("document.save")).toBe(true);
  });

  it("unregisters on demand", () => {
    const unregister = commandBus.register("document.save", () => {});
    unregister();
    expect(commandBus.hasHandler("document.save")).toBe(false);
  });

  it("throws when registering an id outside the registry (typo guard)", () => {
    expect(() => commandBus.register("documnet.save", () => {})).toThrow(
      /not in src\/core\/commands\.ts/,
    );
  });

  it("throws on double registration — one handler per command", () => {
    commandBus.register("document.save", () => {});
    expect(() => commandBus.register("document.save", () => {})).toThrow(/already registered/);
  });

  it("throws when executing without a handler (no silent dead keys)", () => {
    expect(() => commandBus.execute("document.save")).toThrow(/no handler for "document\.save"/);
  });

  it("listExecutable reflects the live handler set", () => {
    expect(commandBus.listExecutable()).toHaveLength(0);
    const off = commandBus.register("view.read", () => {});
    expect(commandBus.listExecutable().map((c) => c.id)).toEqual(["view.read"]);
    off();
    expect(commandBus.listExecutable()).toHaveLength(0);
  });
});
