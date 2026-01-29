import type { ChannelOutboundAdapter } from "clawdbot/plugin-sdk";

import { getWechatyRuntime } from "./runtime.js";
import { sendMessageWechaty } from "./wechaty/send.js";

export const wechatyOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: (text, limit) => getWechatyRuntime().channel.text.chunkMarkdownText(text, limit),
  chunkerMode: "markdown",
  textChunkLimit: 4000,
  sendText: async ({ to, text, deps, replyToId, threadId }) => {
    const send = deps?.sendWechaty ?? sendMessageWechaty;
    const result = await send(to, text, {});
    return {
      channel: "wechaty",
      messageId: result.messageId,
    };
  },
  sendMedia: async ({ to, text, mediaUrl, deps, replyToId, threadId }) => {
    const send = deps?.sendWechaty ?? sendMessageWechaty;

    // Send text first if provided
    if (text?.trim()) {
      await send(to, text, {});
    }

    // Upload and send media if URL provided
    if (mediaUrl) {
      try {
        const result = await send(to, "", {
          mediaUrl,
        });
        return {
          channel: "wechaty",
          messageId: result.messageId,
        };
      } catch (err) {
        // Log the error for debugging
        console.error(`[wechaty] sendMedia failed:`, err);
        // Fallback to URL link if upload fails
        const fallbackText = `📎 ${mediaUrl}`;
        const result = await send(to, fallbackText, {});
        return {
          channel: "wechaty",
          messageId: result.messageId,
        };
      }
    }

    // No media URL, just return text result
    const result = await send(to, text ?? "", {});
    return {
      channel: "wechaty",
      messageId: result.messageId,
    };
  },
  sendPoll: async ({ to, poll, threadId }) => {
    // Wechaty doesn't support polls yet
    throw new Error("Wechaty does not support polls");
  },
};
