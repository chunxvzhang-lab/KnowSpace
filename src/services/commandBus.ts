import { getCommand, listCommands, type CommandDescriptor } from "../core/commands";

/**
 * The command bus: handlers bound to the registry ids, executed by every entry
 * point (palette `>` mode, global keybindings, Electron menu — and whatever
 * comes next: plugin commands in v3.0 register here too, which is exactly why
 * the bus exists as a stable seam).
 *
 * A module singleton on purpose, like the stores: actions are window-global
 * semantics, not component state. `reset()` exists for tests.
 *
 * The failure modes are loud on purpose:
 * - registering an id that is not in `core/commands.ts` throws (typo guard —
 *   a handler nobody can execute is a silent dead end);
 * - executing an id without a handler throws (a key that silently does nothing
 *   is the exact "silent failure" class the guide's rule 10 warns about).
 */

export type CommandHandler = () => void;

class CommandBus {
  private handlers = new Map<string, CommandHandler>();

  /** Binds a handler. Returns the unregister function. */
  register(id: string, handler: CommandHandler): () => void {
    if (!getCommand(id)) {
      throw new Error(
        `[commandBus] cannot register "${id}": not in src/core/commands.ts. ` +
          `Add the descriptor there first — the registry is the single source of truth.`,
      );
    }
    if (this.handlers.has(id)) {
      throw new Error(`[commandBus] "${id}" is already registered — one handler per command.`);
    }
    this.handlers.set(id, handler);
    return () => {
      this.handlers.delete(id);
    };
  }

  execute(id: string): void {
    const handler = this.handlers.get(id);
    if (!handler) {
      throw new Error(
        `[commandBus] no handler for "${id}". ` +
          `Either the command is registered too early or its handler was never bound in useCommandRegistrations.`,
      );
    }
    handler();
  }

  hasHandler(id: string): boolean {
    return this.handlers.has(id);
  }

  /** Commands that currently have a live handler. */
  listExecutable(): CommandDescriptor[] {
    return listCommands().filter((c) => this.handlers.has(c.id));
  }

  /** Test isolation only. */
  reset(): void {
    this.handlers.clear();
  }
}

export const commandBus = new CommandBus();
