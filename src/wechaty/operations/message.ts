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

/**
 * Forward a message by ID to a target contact or room.
 * Uses WeChatFerry's native messageForward API.
 * @returns The new message ID if available
 */
export async function forwardMessageWechaty(
  target: string,
  messageId: string,
  opts?: WechatyMessageOpts
): Promise<string | void> {
  const bot = requireBot(opts);
  const result = await bot.puppet.messageForward(target, messageId);
  return result ?? undefined;
}

/**
 * Send a contact card to a target contact or room.
 * Uses WeChatFerry's native messageSendContact API.
 * @returns The new message ID if available
 */
export async function sendContactCardWechaty(
  target: string,
  contactId: string,
  opts?: WechatyMessageOpts
): Promise<string | void> {
  const bot = requireBot(opts);
  // WCF puppet method for sending contact cards
  const result = await (bot.puppet as any).messageSendContact(target, contactId);
  return result ?? undefined;
}
