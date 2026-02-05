import { Type } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import { getActiveWechatyBot } from "../../wechaty/registry.js";
import {
  getRoomDetailsWechaty,
  getRoomMembersWechaty,
  createRoomWechaty,
  setRoomAnnounceWechaty,
} from "../../wechaty/operations/room.js";

/**
 * Creates the wechaty_room agent tool for room/group management operations.
 *
 * Supports operations:
 * - get: Get room details (id, topic, avatar, announce, memberCount, ownerId)
 * - members: List room members with optional query filter
 * - create: Create new room with members array and optional topic
 * - set_announce: Set/clear room announcement
 */
export function createWechatyRoomTool(): ChannelAgentTool {
  return {
    label: "Wechaty Room",
    name: "wechaty_room",
    description:
      "Manage Wechaty rooms/groups. Operations: " +
      "'get' retrieves room details (id, topic, announce, memberCount, ownerId, avatar). " +
      "'members' lists room members with optional query filter. " +
      "'create' creates a new room with specified members and optional topic. " +
      "'set_announce' sets or clears room announcement (empty string to clear).",
    parameters: Type.Object({
      operation: Type.Union(
        [
          Type.Literal("get"),
          Type.Literal("members"),
          Type.Literal("create"),
          Type.Literal("set_announce"),
        ],
        {
          description: "The operation to perform: get, members, create, or set_announce",
        }
      ),
      roomId: Type.Optional(
        Type.String({
          description: "Room ID (xxx@chatroom or oc_xxx). Required for get, members, set_announce",
        })
      ),
      members: Type.Optional(
        Type.Array(Type.String(), {
          description: "Array of contact IDs to add to new room. Required for create (min 2)",
        })
      ),
      topic: Type.Optional(
        Type.String({
          description: "Room topic/name. Optional for create operation",
        })
      ),
      query: Type.Optional(
        Type.String({
          description: "Filter query for members operation (search by name/alias)",
        })
      ),
      announce: Type.Optional(
        Type.String({
          description: "Announcement text for set_announce. Empty string clears announcement",
        })
      ),
      accountId: Type.Optional(
        Type.String({
          description: "Account ID if using multi-account setup",
        })
      ),
    }),
    execute: async (_toolCallId, args) => {
      const {
        operation,
        roomId,
        members,
        topic,
        query,
        announce,
        accountId,
      } = args as {
        operation: "get" | "members" | "create" | "set_announce";
        roomId?: string;
        members?: string[];
        topic?: string;
        query?: string;
        announce?: string;
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

      const opts = { accountId, bot };

      try {
        switch (operation) {
          case "get": {
            if (!roomId?.trim()) {
              return {
                isError: true,
                content: [{ type: "text", text: "roomId is required for 'get' operation" }],
              };
            }
            const details = await getRoomDetailsWechaty(roomId.trim(), opts);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ ok: true, ...details }),
                },
              ],
            };
          }

          case "members": {
            if (!roomId?.trim()) {
              return {
                isError: true,
                content: [{ type: "text", text: "roomId is required for 'members' operation" }],
              };
            }
            const memberList = await getRoomMembersWechaty(
              roomId.trim(),
              query?.trim(),
              opts
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    roomId: roomId.trim(),
                    memberCount: memberList.length,
                    members: memberList,
                  }),
                },
              ],
            };
          }

          case "create": {
            if (!members || members.length < 2) {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: "members array with at least 2 contact IDs is required for 'create' operation",
                  },
                ],
              };
            }
            const result = await createRoomWechaty(members, topic?.trim(), opts);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ ok: true, ...result }),
                },
              ],
            };
          }

          case "set_announce": {
            if (!roomId?.trim()) {
              return {
                isError: true,
                content: [
                  { type: "text", text: "roomId is required for 'set_announce' operation" },
                ],
              };
            }
            if (announce === undefined) {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: "announce parameter is required for 'set_announce' operation (use empty string to clear)",
                  },
                ],
              };
            }
            await setRoomAnnounceWechaty(roomId.trim(), announce, opts);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    roomId: roomId.trim(),
                    announce: announce,
                    action: announce ? "set" : "cleared",
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
                  text: `Unknown operation: ${operation}. Valid operations: get, members, create, set_announce`,
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
