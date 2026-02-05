import type { Wechaty } from "@juzi/wechaty";
import { impls } from "@juzi/wechaty";
import { prepareWechatyMedia, isEmotionType } from "../utils/media.js";
import { fetchOGMetadata } from "../utils/og-fetch.js";
import { getActiveWechatyBot } from "../registry.js";
import { findRecipient, normalizeTargetId } from "../utils/recipient-lookup.js";

const { UrlLinkImpl: UrlLink } = impls;

// Re-export bot registry functions for backwards compatibility
export {
  setActiveWechatyBot,
  getActiveWechatyBot,
  clearActiveWechatyBot,
} from "../registry.js";

// Re-export room operations for backwards compatibility
export {
  addParticipantWechaty,
  leaveGroupWechaty,
  renameGroupWechaty,
  removeRoomMemberWechaty,
  setGroupIconWechaty,
} from "./room.js";

// Re-export message operations for backwards compatibility
export { recallMessageWechaty, reactMessageWechaty } from "./message.js";

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

function requireBot(opts?: { accountId?: string; bot?: Wechaty }): Wechaty {
  const bot = opts?.bot ?? getActiveWechatyBot(opts?.accountId);
  if (!bot) {
    throw new Error(
      `Wechaty bot not initialized${opts?.accountId ? ` for account: ${opts.accountId}` : ""}`
    );
  }
  return bot;
}

export async function sendMessageWechaty(
  target: string,
  content: string,
  opts?: Partial<WechatySendOpts>
): Promise<{ messageId?: string }> {
  const bot = requireBot(opts);
  const targetId = normalizeTargetId(target);

  const recipient = await findRecipient(bot, target);
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

/**
 * Send an emotion/sticker via Wechaty puppet's messageSendEmoji API.
 * Supported by WeChatFerry and similar puppets.
 */
export async function sendEmotionWechaty(
  target: string,
  emotionFileBox: any,
  opts?: { accountId?: string; bot?: Wechaty }
): Promise<{ messageId?: string }> {
  const bot = requireBot(opts);
  const targetId = normalizeTargetId(target);

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
  const bot = requireBot(opts);

  // Fetch OG metadata if any field is missing
  let { title, description, thumbnailUrl } = card;
  if (!title || !description || !thumbnailUrl) {
    const og = await fetchOGMetadata(card.url);
    title = title || og.title || card.url;
    description = description || og.description || "";
    thumbnailUrl = thumbnailUrl || og.image;
  }

  const recipient = await findRecipient(bot, target);
  if (!recipient) {
    const targetId = normalizeTargetId(target);
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
