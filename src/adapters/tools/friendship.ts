import { Type } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import { getActiveWechatyBot } from "../../wechaty/registry.js";

type FriendshipOperation = "send" | "accept";

/**
 * Creates the wechaty_friendship agent tool for managing friend requests.
 *
 * Operations:
 * - send: Send a friend request to a contact
 * - accept: Accept a pending friend request (requires friendshipId from context)
 */
export function createWechatyFriendshipTool(): ChannelAgentTool {
  return {
    label: "Wechaty Friendship",
    name: "wechaty_friendship",
    description:
      "Manage WeChat friend requests. " +
      "Operations: send (send friend request with hello message), " +
      "accept (accept pending request using FriendshipId from context). " +
      "Note: There is no reject operation - requests expire if not accepted.",
    parameters: Type.Object({
      operation: Type.Union(
        [Type.Literal("send"), Type.Literal("accept")],
        { description: "The operation to perform" }
      ),
      contactId: Type.Optional(
        Type.String({
          description:
            "Contact ID (wxid_xxx) to send friend request to. Required for: send.",
        })
      ),
      friendshipId: Type.Optional(
        Type.String({
          description:
            "Friendship ID from the friend request context (FriendshipId field). Required for: accept.",
        })
      ),
      hello: Type.Optional(
        Type.String({
          description:
            "Hello message to include with friend request. Optional for: send.",
        })
      ),
      accountId: Type.Optional(
        Type.String({
          description: "Account ID if using multi-account setup",
        })
      ),
    }),
    execute: async (_toolCallId, args) => {
      const { operation, contactId, friendshipId, hello, accountId } = args as {
        operation: FriendshipOperation;
        contactId?: string;
        friendshipId?: string;
        hello?: string;
        accountId?: string;
      };

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
            const _exhaustive: never = operation;
            return {
              isError: true,
              content: [{ type: "text", text: `Unknown operation: ${_exhaustive}` }],
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
