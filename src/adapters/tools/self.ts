import { Type } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import { getActiveWechatyBot } from "../../wechaty/registry.js";
import {
  getSelfProfileWechaty,
  getSelfQRCodeWechaty,
  setSelfProfileWechaty,
} from "../../wechaty/operations/self.js";

/**
 * Creates the wechaty_self agent tool for bot profile operations.
 *
 * Supports three operations:
 * - get: Get bot profile (id, name, avatar, signature)
 * - qrcode: Get bot's personal QR code
 * - set: Update bot profile (name, signature)
 *
 * Note: QR code and profile updates only work with WeChatFerry-based puppets.
 */
export function createWechatySelfTool(): ChannelAgentTool {
  return {
    label: "Wechaty Self",
    name: "wechaty_self",
    description:
      "Get or update the bot's profile information. " +
      "Operations: 'get' (profile info), 'qrcode' (personal QR code), 'set' (update profile). " +
      "Some operations only work with WeChatFerry-based puppets.",
    parameters: Type.Object({
      operation: Type.Union(
        [Type.Literal("get"), Type.Literal("qrcode"), Type.Literal("set")],
        {
          description:
            "Operation to perform: 'get' for profile, 'qrcode' for QR code, 'set' to update",
        }
      ),
      name: Type.Optional(
        Type.String({
          description: "New display name (only for 'set' operation)",
        })
      ),
      signature: Type.Optional(
        Type.String({
          description: "New signature/status (only for 'set' operation)",
        })
      ),
      avatar: Type.Optional(
        Type.String({
          description: "New avatar URL (only for 'set' operation, limited support)",
        })
      ),
      accountId: Type.Optional(
        Type.String({
          description: "Account ID if using multi-account setup",
        })
      ),
    }),
    execute: async (_toolCallId, args) => {
      const { operation, name, signature, avatar, accountId } = args as {
        operation: "get" | "qrcode" | "set";
        name?: string;
        signature?: string;
        avatar?: string;
        accountId?: string;
      };

      // Validate bot is available
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
        switch (operation) {
          case "get": {
            const profile = await getSelfProfileWechaty({ bot });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    operation: "get",
                    profile,
                  }),
                },
              ],
            };
          }

          case "qrcode": {
            const qrcode = await getSelfQRCodeWechaty({ bot });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    operation: "qrcode",
                    qrcode,
                  }),
                },
              ],
            };
          }

          case "set": {
            // Validate at least one field is provided
            if (
              name === undefined &&
              signature === undefined &&
              avatar === undefined
            ) {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: "At least one field (name, signature, or avatar) must be provided for 'set' operation",
                  },
                ],
              };
            }

            const result = await setSelfProfileWechaty(
              { name, signature, avatar },
              { bot }
            );

            const hasFailures = result.failed.length > 0;
            const hasSuccesses = result.updated.length > 0;

            return {
              isError: hasFailures && !hasSuccesses,
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: hasSuccesses,
                    operation: "set",
                    updated: result.updated,
                    failed: result.failed,
                  }),
                },
              ],
            };
          }

          default: {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Unknown operation: ${operation}. Use 'get', 'qrcode', or 'set'.`,
                },
              ],
            };
          }
        }
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to execute ${operation}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  };
}
