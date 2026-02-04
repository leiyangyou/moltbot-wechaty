import type { Wechaty, Contact, Room } from "@juzi/wechaty";
import { UrlLink } from "@juzi/wechaty";
import { prepareWechatyMedia } from "./media.js";
import { fetchOGMetadata } from "./og-fetch.js";

export type WechatySendOpts = {
  targetId: string;
  text?: string;
  mediaUrl?: string;
  mediaBuffer?: Buffer;
  mediaType?: "image" | "video" | "audio" | "file";
  fileName?: string;
  accountId?: string;
  bot?: Wechaty;
};

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

export async function sendMessageWechaty(
  target: string,
  content: string,
  opts?: Partial<WechatySendOpts>
): Promise<{ messageId?: string }> {
  const bot = opts?.bot ?? getActiveWechatyBot(opts?.accountId);

  if (!bot) {
    throw new Error(
      `Wechaty bot not initialized${opts?.accountId ? ` for account: ${opts.accountId}` : ""}`
    );
  }

  let recipient: Contact | Room | undefined;

  // Parse target - determine if it's a room or contact
  const targetId = target.replace(/^wechaty:/i, "").trim();

  if (targetId.includes("@chatroom") || targetId.includes("oc_")) {
    // Group chat
    try {
      recipient = await bot.Room.find({ id: targetId });
      if (!recipient) {
        // Try finding by topic
        recipient = await bot.Room.find({ topic: targetId });
      }
    } catch (error) {
      throw new Error(`Failed to find room: ${targetId} - ${String(error)}`);
    }
  } else {
    // Direct message - try to find contact
    try {
      // Try by ID first
      recipient = await bot.Contact.find({ id: targetId });
      if (!recipient) {
        // Try by name
        recipient = await bot.Contact.find({ name: targetId });
      }
      if (!recipient) {
        // Try by alias
        recipient = await bot.Contact.find({ alias: targetId });
      }
    } catch (error) {
      throw new Error(`Failed to find contact: ${targetId} - ${String(error)}`);
    }
  }

  if (!recipient) {
    throw new Error(`Recipient not found: ${targetId}`);
  }

  // Send text message
  if (content && content.trim()) {
    await recipient.say(content);
  }

  // Send media if provided
  if (opts?.mediaUrl || opts?.mediaBuffer) {
    try {
      const mediaResult = await prepareWechatyMedia({
        mediaUrl: opts.mediaUrl,
        mediaBuffer: opts.mediaBuffer,
        fileName: opts.fileName,
      });

      if (mediaResult) {
        await recipient.say(mediaResult.fileBox);
      }
    } catch (error) {
      console.error(`Failed to send media: ${String(error)}`);
      // Fallback to URL link if upload fails and it's a URL
      if (opts.mediaUrl && !opts.mediaBuffer) {
        await recipient.say(`📎 ${opts.mediaUrl}`);
      }
    }
  }

  return { messageId: undefined };
}

export async function reactMessageWechaty(
  targetId: string,
  messageId: string,
  emoji: string,
  opts?: { remove?: boolean; accountId?: string; bot?: Wechaty }
): Promise<void> {
  // Note: Wechaty doesn't have native reaction support yet
  // This is a placeholder for future implementation or custom puppet support
  console.warn("Wechaty reactions not yet supported");
}

export type LinkCardParams = {
  url: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
};

/**
 * Send a link card (rich text) via Wechaty UrlLink
 * Auto-fetches Open Graph metadata if title/description/thumbnailUrl not provided
 */
export async function sendLinkCardWechaty(
  target: string,
  card: LinkCardParams,
  opts?: { accountId?: string; bot?: Wechaty }
): Promise<{ messageId?: string }> {
  const bot = opts?.bot ?? getActiveWechatyBot(opts?.accountId);

  if (!bot) {
    throw new Error(
      `Wechaty bot not initialized${opts?.accountId ? ` for account: ${opts.accountId}` : ""}`
    );
  }

  // Fetch OG metadata if any field is missing
  let { title, description, thumbnailUrl } = card;
  if (!title || !description || !thumbnailUrl) {
    const og = await fetchOGMetadata(card.url);
    title = title || og.title || card.url;
    description = description || og.description || "";
    thumbnailUrl = thumbnailUrl || og.image;
  }

  // Find recipient
  const targetId = target.replace(/^wechaty:/i, "").trim();
  let recipient: Contact | Room | undefined;

  if (targetId.includes("@chatroom") || targetId.includes("oc_")) {
    recipient = await bot.Room.find({ id: targetId });
    if (!recipient) {
      recipient = await bot.Room.find({ topic: targetId });
    }
  } else {
    recipient = await bot.Contact.find({ id: targetId });
    if (!recipient) {
      recipient = await bot.Contact.find({ name: targetId });
    }
    if (!recipient) {
      recipient = await bot.Contact.find({ alias: targetId });
    }
  }

  if (!recipient) {
    throw new Error(`Recipient not found: ${targetId}`);
  }

  // Create and send UrlLink
  const urlLink = new UrlLink({
    title: title.slice(0, 100), // WeChat title limit
    description: description.slice(0, 300), // WeChat description limit
    url: card.url,
    thumbnailUrl: thumbnailUrl,
  });

  await recipient.say(urlLink);

  return { messageId: undefined };
}
