import { Type } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import { getActiveWechatyBot } from "../../wechaty/operations/send.js";

/**
 * Creates the wechaty_forward agent tool for forwarding messages.
 *
 * This tool leverages WeChatFerry's native forwardMsg API to forward
 * messages by ID. The message must exist in WCF's SQLite store.
 */
export function createWechatyForwardTool(): ChannelAgentTool {
  return {
    label: "Wechaty Forward",
    name: "wechaty_forward",
    description:
      "Forward a message by ID to another contact or room. " +
      "Use the MessageSid from the conversation context. " +
      "Only works with WeChatFerry-based puppets.",
    parameters: Type.Object({
      messageId: Type.String({
        description: "The message ID to forward (from context.MessageSid)",
      }),
      target: Type.String({
        description: "Target contact ID (wxid_xxx) or room ID (xxx@chatroom)",
      }),
      accountId: Type.Optional(
        Type.String({
          description: "Account ID if using multi-account setup",
        })
      ),
    }),
    execute: async (_toolCallId, args) => {
      const { messageId, target, accountId } = args as {
        messageId: string;
        target: string;
        accountId?: string;
      };

      if (!messageId?.trim()) {
        return {
          isError: true,
          content: [{ type: "text", text: "messageId is required" }],
        };
      }

      if (!target?.trim()) {
        return {
          isError: true,
          content: [{ type: "text", text: "target is required" }],
        };
      }

      const bot = getActiveWechatyBot(accountId);
      if (!bot) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: accountId
                ? `No active Wechaty bot found for account: ${accountId}`
                : "No active Wechaty bot found",
            },
          ],
        };
      }

      try {
        const result = await bot.puppet.messageForward(target.trim(), messageId.trim());
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: true,
                messageId: result ?? undefined,
                forwarded: { from: messageId.trim(), to: target.trim() },
              }),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to forward message: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  };
}
