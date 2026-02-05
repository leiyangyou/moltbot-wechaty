import { Type, type TLiteral, type TUnion } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import { getActiveWechatyBot } from "../../wechaty/registry.js";
import {
  getSelfProfileWechaty,
  getSelfQRCodeWechaty,
  setSelfProfileWechaty,
} from "../../wechaty/operations/self.js";

/** All available operations for this tool */
const ALL_OPERATIONS = ["get", "qrcode", "set"] as const;
type OperationType = (typeof ALL_OPERATIONS)[number];

/**
 * Creates the wechaty_self agent tool for bot profile operations.
 *
 * Supports three operations:
 * - get: Get bot profile (id, name, avatar, signature)
 * - qrcode: Get bot's personal QR code
 * - set: Update bot profile (name, signature)
 *
 * Note: QR code and profile updates only work with WeChatFerry-based puppets.
 *
 * @param enabledOperations - Optional list of enabled operations. If undefined, all operations are enabled.
 */
export function createWechatySelfTool(enabledOperations?: string[]): ChannelAgentTool {
  const operations = enabledOperations
    ? ALL_OPERATIONS.filter((op) => enabledOperations.includes(op))
    : [...ALL_OPERATIONS];

  if (operations.length === 0) {
    throw new Error("wechaty_self tool requires at least one enabled operation");
  }

  // Build dynamic operation union type
  const opLiterals = operations.map((op) => Type.Literal(op)) as [TLiteral<string>, ...TLiteral<string>[]];
  const opUnion: TUnion<[TLiteral<string>, ...TLiteral<string>[]]> = Type.Union(opLiterals, {
    description: `Operation to perform: ${operations.map((op) => `'${op}'`).join(", ")}`,
  });

  // Build description based on enabled operations
  const opDescriptions: Record<OperationType, string> = {
    get: "'get' (profile info)",
    qrcode: "'qrcode' (personal QR code)",
    set: "'set' (update profile)",
  };
  const descParts = operations.map((op) => opDescriptions[op]);
  const description =
    `Get or update the bot's profile information. Operations: ${descParts.join(", ")}. ` +
    "Some operations only work with WeChatFerry-based puppets.";

  // Build parameters object - only include params for enabled operations
  const params: Record<string, any> = {
    operation: opUnion,
    accountId: Type.Optional(
      Type.String({
        description: "Account ID if using multi-account setup",
      })
    ),
  };

  if (operations.includes("set")) {
    params.name = Type.Optional(
      Type.String({
        description: "New display name (only for 'set' operation)",
      })
    );
    params.signature = Type.Optional(
      Type.String({
        description: "New signature/status (only for 'set' operation)",
      })
    );
    params.avatar = Type.Optional(
      Type.String({
        description: "New avatar URL (only for 'set' operation, limited support)",
      })
    );
  }

  return {
    label: "Wechaty Self",
    name: "wechaty_self",
    description,
    parameters: Type.Object(params),
    execute: async (_toolCallId, args) => {
      const { operation, name, signature, avatar, accountId } = args as {
        operation: OperationType;
        name?: string;
        signature?: string;
        avatar?: string;
        accountId?: string;
      };

      // Check if operation is enabled
      if (!operations.includes(operation)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Operation '${operation}' is not enabled. Available operations: ${operations.join(", ")}`,
            },
          ],
        };
      }

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
                  text: `Unknown operation: ${operation}. Use ${operations.map((o) => `'${o}'`).join(", ")}.`,
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
