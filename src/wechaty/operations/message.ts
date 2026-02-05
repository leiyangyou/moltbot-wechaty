import type { Wechaty } from "@juzi/wechaty";
import { getActiveWechatyBot } from "../registry.js";

export type WechatyMessageOpts = {
  accountId?: string;
  bot?: Wechaty;
};

function requireBot(opts?: WechatyMessageOpts): Wechaty {
  const bot = opts?.bot ?? getActiveWechatyBot(opts?.accountId);
  if (!bot) {
    throw new Error(
      `Wechaty bot not initialized${opts?.accountId ? ` for account: ${opts.accountId}` : ""}`
    );
  }
  return bot;
}

/**
 * Recall (unsend) a message by ID.
 * Returns true if successful, false otherwise.
 */
export async function recallMessageWechaty(
  messageId: string,
  opts?: WechatyMessageOpts
): Promise<boolean> {
  const bot = requireBot(opts);

  try {
    const success = await bot.puppet.messageRecall(messageId);
    return success;
  } catch (error) {
    console.error(`Failed to recall message ${messageId}: ${String(error)}`);
    throw error;
  }
}

/**
 * React to a message with an emoji.
 * Note: Wechaty doesn't have native reaction support yet.
 * This is a placeholder for future implementation or custom puppet support.
 */
export async function reactMessageWechaty(
  _targetId: string,
  _messageId: string,
  _emoji: string,
  _opts?: WechatyMessageOpts & { remove?: boolean }
): Promise<void> {
  console.warn("Wechaty reactions not yet supported");
}
