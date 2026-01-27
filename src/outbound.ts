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
    const result = await send(to, text ?? "", {
      mediaUrl,
    });
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
