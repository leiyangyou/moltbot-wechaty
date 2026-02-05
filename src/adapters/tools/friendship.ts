import { Type, type TLiteral, type TUnion } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import { getActiveWechatyBot } from "../../wechaty/registry.js";

/** All available operations for this tool */
const ALL_OPERATIONS = ["send", "accept"] as const;
type OperationType = (typeof ALL_OPERATIONS)[number];

/**
 * Creates the wechaty_friendship agent tool for managing friend requests.
 *
 * Operations:
 * - send: Send a friend request to a contact
 * - accept: Accept a pending friend request (requires friendshipId from context)
 *
 * @param enabledOperations - Optional list of enabled operations. If undefined, all operations are enabled.
 */
export function createWechatyFriendshipTool(enabledOperations?: string[]): ChannelAgentTool {
  const operations = enabledOperations
    ? ALL_OPERATIONS.filter((op) => enabledOperations.includes(op))
    : [...ALL_OPERATIONS];

  if (operations.length === 0) {
    throw new Error("wechaty_friendship tool requires at least one enabled operation");
  }

  // Build dynamic operation union type
  const opLiterals = operations.map((op) => Type.Literal(op)) as [TLiteral<string>, ...TLiteral<string>[]];
  const opUnion: TUnion<[TLiteral<string>, ...TLiteral<string>[]]> = Type.Union(opLiterals, {
    description: `The operation to perform: ${operations.join(", ")}`,
  });

  // Build description based on enabled operations
  const opDescriptions: Record<OperationType, string> = {
    send: "send (send friend request with hello message)",
    accept: "accept (accept pending request using FriendshipId from context)",
  };
  const descParts = operations.map((op) => opDescriptions[op]);
  const description =
    `Manage WeChat friend requests. Operations: ${descParts.join(", ")}. ` +
    "Note: There is no reject operation - requests expire if not accepted.";

  // Build parameters object - only include params for enabled operations
  const params: Record<string, any> = {
    operation: opUnion,
    accountId: Type.Optional(
      Type.String({
        description: "Account ID if using multi-account setup",
      })
    ),
  };

  if (operations.includes("send")) {
    params.contactId = Type.Optional(
      Type.String({
        description:
          "Contact ID (wxid_xxx) to send friend request to. Required for: send.",
      })
    );
    params.hello = Type.Optional(
      Type.String({
        description:
          "Hello message to include with friend request. Optional for: send.",
      })
    );
  }

  if (operations.includes("accept")) {
    params.friendshipId = Type.Optional(
      Type.String({
        description:
          "Friendship ID from the friend request context (FriendshipId field). Required for: accept.",
      })
    );
  }

  return {
    label: "Wechaty Friendship",
    name: "wechaty_friendship",
    description,
    parameters: Type.Object(params),
    execute: async (_toolCallId, args) => {
      const { operation, contactId, friendshipId, hello, accountId } = args as {
        operation: OperationType;
        contactId?: string;
        friendshipId?: string;
        hello?: string;
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
          case "send": {
            if (!contactId?.trim()) {
              return {
                isError: true,
                content: [{ type: "text", text: "contactId is required for send" }],
              };
            }
            await bot.puppet.friendshipAdd(contactId.trim(), {
              hello: hello?.trim(),
            });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    operation: "send",
                    contactId: contactId.trim(),
                    hello: hello?.trim() ?? null,
                  }),
                },
              ],
            };
          }

          case "accept": {
            if (!friendshipId?.trim()) {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: "friendshipId is required for accept. Get it from the FriendshipId field in the friend request context.",
                  },
                ],
              };
            }
            await bot.puppet.friendshipAccept(friendshipId.trim());
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    operation: "accept",
                    friendshipId: friendshipId.trim(),
                  }),
                },
              ],
            };
          }

          default: {
            return {
              isError: true,
              content: [{ type: "text", text: `Unknown operation: ${operation}` }],
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
