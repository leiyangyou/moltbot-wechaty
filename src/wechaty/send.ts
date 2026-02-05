import type { Wechaty, Contact, Room } from "@juzi/wechaty";
import { UrlLink } from "@juzi/wechaty";
import { prepareWechatyMedia, isEmotionType } from "./media.js";
import { fetchOGMetadata } from "./og-fetch.js";

export type WechatySendOpts = {
  targetId: string;
  text?: string;
  mediaUrl?: string;
  mediaBuffer?: Buffer;
  mediaType?: "image" | "video" | "audio" | "file" | "emotion";
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
        // Detect emotion type from explicit mediaType, filename, or MIME detection
        const isEmotion =
          opts.mediaType === "emotion" ||
          isEmotionType(undefined, mediaResult.fileName);

        if (isEmotion) {
          // Try to send via puppet's emotion API
          const puppet = bot.puppet as any;
          if (typeof puppet.messageSendEmoji === "function") {
            try {
              await puppet.messageSendEmoji(targetId, mediaResult.fileBox);
              return { messageId: undefined };
            } catch (emotionError) {
              console.warn(
                `Emotion send failed, falling back to regular media: ${String(emotionError)}`
              );
              // Fall through to regular say()
            }
          }
        }

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

/**
 * Send an emotion/sticker via Wechaty puppet's messageSendEmoji API.
 * Supported by WeChatFerry and similar puppets.
 *
 * @param target - Target contact or room ID
 * @param emotionFileBox - FileBox containing the emotion/sticker data
 * @param opts - Optional account/bot configuration
 */
export async function sendEmotionWechaty(
  target: string,
  emotionFileBox: any,
  opts?: { accountId?: string; bot?: Wechaty }
): Promise<{ messageId?: string }> {
  const bot = opts?.bot ?? getActiveWechatyBot(opts?.accountId);

  if (!bot) {
    throw new Error(
      `Wechaty bot not initialized${opts?.accountId ? ` for account: ${opts.accountId}` : ""}`
    );
  }

  // Parse target
  const targetId = target.replace(/^wechaty:/i, "").trim();

  // Check if puppet supports messageSendEmoji
  const puppet = bot.puppet as any;
  if (typeof puppet.messageSendEmoji !== "function") {
    // Fallback to regular say() if puppet doesn't support emotions
    console.warn(
      "Puppet does not support messageSendEmoji, falling back to regular media send"
    );
    return sendMessageWechaty(target, "", {
      mediaBuffer: await emotionFileBox.toBuffer?.(),
      mediaType: "image",
      fileName: emotionFileBox.name,
      bot,
    });
  }

  try {
    const msgId = await puppet.messageSendEmoji(targetId, emotionFileBox);
    return { messageId: msgId };
  } catch (error) {
    console.error(`Failed to send emotion: ${String(error)}`);
    throw error;
  }
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

export async function recallMessageWechaty(
  messageId: string,
  opts?: { accountId?: string; bot?: Wechaty }
): Promise<boolean> {
  const bot = opts?.bot ?? getActiveWechatyBot(opts?.accountId);

  if (!bot) {
    throw new Error(
      `Wechaty bot not initialized${opts?.accountId ? ` for account: ${opts.accountId}` : ""}`
    );
  }

  try {
    const success = await bot.puppet.messageRecall(messageId);
    return success;
  } catch (error) {
    console.error(`Failed to recall message ${messageId}: ${String(error)}`);
    throw error;
  }
}

/**
 * Remove a member from a room/group chat.
 * Requires group admin permissions.
 *
 * @param to - The room/group ID (target)
 * @param participant - The contact ID/address to remove
 * @param opts - Optional account/bot configuration
 */
export async function removeRoomMemberWechaty(
  to: string,
  participant: string,
  opts?: { accountId?: string; bot?: Wechaty }
): Promise<void> {
  const bot = opts?.bot ?? getActiveWechatyBot(opts?.accountId);

  if (!bot) {
    throw new Error(
      `Wechaty bot not initialized${opts?.accountId ? ` for account: ${opts.accountId}` : ""}`
    );
  }

  // Normalize target room ID
  const normalizedTo = to.replace(/^wechaty:/i, "").trim();

  // Find the room
  let room: Room | undefined;
  try {
    room = await bot.Room.find({ id: normalizedTo });
    if (!room) {
      room = await bot.Room.find({ topic: normalizedTo });
    }
  } catch (error) {
    throw new Error(`Failed to find room: ${normalizedTo} - ${String(error)}`);
  }

  if (!room) {
    throw new Error(`Room not found: ${normalizedTo}`);
  }

  // Find the participant to remove
  const normalizedParticipant = participant.replace(/^wechaty:/i, "").trim();
  let contact: Contact | undefined;
  try {
    contact = await bot.Contact.find({ id: normalizedParticipant });
    if (!contact) {
      contact = await bot.Contact.find({ name: normalizedParticipant });
    }
    if (!contact) {
      contact = await bot.Contact.find({ alias: normalizedParticipant });
    }
  } catch (error) {
    throw new Error(`Failed to find contact: ${normalizedParticipant} - ${String(error)}`);
  }

  if (!contact) {
    throw new Error(`Contact not found: ${normalizedParticipant}`);
  }

  // Remove the member using puppet.roomDel
  try {
    await bot.puppet.roomDel(room.id, contact.id);
  } catch (error) {
    throw new Error(
      `Failed to remove member from room: ${String(error)}. Ensure the bot has admin permissions.`
    );
  }
}
