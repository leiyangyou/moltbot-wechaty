import type { Wechaty } from "@juzi/wechaty";

/**
 * Registry for active Wechaty bot instances, keyed by accountId.
 */
const activeBots = new Map<string, Wechaty>();

export function setActiveWechatyBot(accountId: string, bot: Wechaty): void {
  activeBots.set(accountId, bot);
}

export function getActiveWechatyBot(accountId?: string): Wechaty | undefined {
  if (!accountId || accountId === "default") {
    // Return first bot if no account specified
    const firstBot = activeBots.values().next();
    return firstBot.done ? undefined : firstBot.value;
  }
  return activeBots.get(accountId);
}

export function clearActiveWechatyBot(accountId: string): void {
  activeBots.delete(accountId);
}
