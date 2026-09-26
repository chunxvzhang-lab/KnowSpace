import { useEffect, useLayoutEffect, useRef } from "react";
import type { CommandId } from "../core/commands";
import { listCommands } from "../core/commands";
import { commandBus, type CommandHandler } from "../services/commandBus";

export type CommandHandlers = Partial<Record<CommandId, CommandHandler>>;

/**
 * Binds the app's action implementations to the command bus, once per mount.
 *
 * This is THE place where "document.save" means `saveSession` and nothing else
 * is allowed to re-wire it — the palette, the keyboard and the menu all reach
 * the same handler through `commandBus.execute`.
 *
 * Handlers are dispatched through a ref that is refreshed every render, so a
 * command registered once never closes over a stale callback (the same
 * mirror-ref mechanism useGlobalShortcuts documents). Registering per mount
 * instead of per render keeps the bus free of unregister/register churn.
 *
 * A command without a handler is a silent no-op — exactly the failure class
 * the guide forbids — so missing bindings are reported at mount, not discovered
 * when a user presses a dead key.
 */
export function useCommandRegistrations(handlers: CommandHandlers): void {
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const missing = listCommands().filter((c) => !latest.current[c.id]);
    if (missing.length > 0) {
      console.error(
        `[useCommandRegistrations] commands without a handler (they will throw if invoked): ` +
          missing.map((c) => c.id).join(", "),
      );
    }

    const unregister = listCommands().map((c) =>
      commandBus.register(c.id, () => latest.current[c.id]?.()),
    );
    return () => unregister.forEach((fn) => fn());
  }, []);
}
