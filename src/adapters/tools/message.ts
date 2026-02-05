import { Type } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import {
  forwardMessageWechaty,
  sendContactCardWechaty,
} from "../../wechaty/operations/message.js";

/**
 * Creates the wechaty_message agent tool for message operations.
 *
 * Supports:
 * - forward: Forward a message by ID to another contact or room (WCF messageForward)
 * - send_contact_card: Send a contact card to a target (WCF messageSendContact)
 */
export function createWechatyMessageTool(): ChannelAgentTool {
  return {
    label: "Wechaty Message",
    name: "wechaty_message",
    description:
      "Perform message operations: forward messages or send contact cards. " +
      "Only works with WeChatFerry-based puppets.",
    parameters: Type.Object({
      action: Type.Union(
        [Type.Literal("forward"), Type.Literal("send_contact_card")],
        {
          description:
            "The action to perform: 'forward' to forward a message, 'send_contact_card' to share a contact",
        }
      ),
      target: Type.String({
        description: "Target contact ID (wxid_xxx) or room ID (xxx@chatroom)",
      }),
      messageId: Type.Optional(
        Type.String({
          description:
            "The message ID to forward (from context.MessageSid). Required for 'forward' action.",
        })
      ),
      contactId: Type.Optional(
        Type.String({
          description:
            "The contact ID (wxid_xxx) to share. Required for 'send_contact_card' action.",
        })
      ),
      accountId: Type.Optional(
        Type.String({
          description: "Account ID if using multi-account setup",
        })
      ),
    }),
    execute: async (_toolCallId, args) => {
      const { action, target, messageId, contactId, accountId } = args as {
        action: "forward" | "send_contact_card";
        target: string;
        messageId?: string;
        contactId?: string;
        accountId?: string;
      };

      if (!target?.trim()) {
        return {
          isError: true,
          content: [{ type: "text", text: "target is required" }],
        };
      }

      const trimmedTarget = target.trim();

      if (action === "forward") {
        if (!messageId?.trim()) {
          return {
            isError: true,
            content: [
              { type: "text", text: "messageId is required for forward action" },
            ],
          };
        }

        try {
          const result = await forwardMessageWechaty(
            trimmedTarget,
            messageId.trim(),
            { accountId }
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: true,
                  action: "forward",
                  messageId: result ?? undefined,
                  forwarded: { from: messageId.trim(), to: trimmedTarget },
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
      }

      if (action === "send_contact_card") {
        if (!contactId?.trim()) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "contactId is required for send_contact_card action",
              },
            ],
          };
        }

        try {
          const result = await sendContactCardWechaty(
            trimmedTarget,
            contactId.trim(),
            { accountId }
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: true,
                  action: "send_contact_card",
                  messageId: result ?? undefined,
                  sent: { contactId: contactId.trim(), to: trimmedTarget },
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
                text: `Failed to send contact card: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      }

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown action: ${action}. Supported actions: forward, send_contact_card`,
          },
        ],
      };
    },
  };
}
