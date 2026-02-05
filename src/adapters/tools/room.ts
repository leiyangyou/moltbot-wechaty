import { Type, type TLiteral, type TUnion } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import { getActiveWechatyBot } from "../../wechaty/registry.js";
import {
  getRoomDetailsWechaty,
  getRoomMembersWechaty,
  createRoomWechaty,
  setRoomAnnounceWechaty,
  getRoomQRCodeWechaty,
} from "../../wechaty/operations/room.js";

/** All available operations for this tool */
const ALL_OPERATIONS = ["get", "members", "create", "set_announce", "qrcode"] as const;
type OperationType = (typeof ALL_OPERATIONS)[number];

/**
 * Creates the wechaty_room agent tool for room/group management operations.
 *
 * Supports operations:
 * - get: Get room details (id, topic, avatar, announce, memberCount, ownerId)
 * - members: List room members with optional query filter
 * - create: Create new room with members array and optional topic
 * - set_announce: Set/clear room announcement
 * - qrcode: Get room invite QR code
 *
 * @param enabledOperations - Optional list of enabled operations. If undefined, all operations are enabled.
 */
export function createWechatyRoomTool(enabledOperations?: string[]): ChannelAgentTool {
  const operations = enabledOperations
    ? ALL_OPERATIONS.filter((op) => enabledOperations.includes(op))
    : [...ALL_OPERATIONS];

  if (operations.length === 0) {
    throw new Error("wechaty_room tool requires at least one enabled operation");
  }

  // Build dynamic operation union type
  const opLiterals = operations.map((op) => Type.Literal(op)) as [TLiteral<string>, ...TLiteral<string>[]];
  const opUnion: TUnion<[TLiteral<string>, ...TLiteral<string>[]]> = Type.Union(opLiterals, {
    description: `The operation to perform: ${operations.join(", ")}`,
  });

  // Build description based on enabled operations
  const opDescriptions: Record<OperationType, string> = {
    get: "'get' retrieves room details (id, topic, announce, memberCount, ownerId, avatar)",
    members: "'members' lists room members with optional query filter",
    create: "'create' creates a new room with specified members and optional topic",
    set_announce: "'set_announce' sets or clears room announcement (empty string to clear)",
    qrcode: "'qrcode' gets room invite QR code (not all puppets support this)",
  };
  const descParts = operations.map((op) => opDescriptions[op]);
  const description = `Manage Wechaty rooms/groups. Operations: ${descParts.join(". ")}.`;

  // Build parameters object - only include params for enabled operations
  const params: Record<string, any> = {
    operation: opUnion,
    accountId: Type.Optional(
      Type.String({
        description: "Account ID if using multi-account setup",
      })
    ),
  };

  // roomId is needed for get, members, set_announce, qrcode
  const needsRoomId = operations.some((op) => ["get", "members", "set_announce", "qrcode"].includes(op));
  if (needsRoomId) {
    params.roomId = Type.Optional(
      Type.String({
        description: "Room ID (xxx@chatroom or oc_xxx). Required for get, members, set_announce, qrcode",
      })
    );
  }

  if (operations.includes("create")) {
    params.members = Type.Optional(
      Type.Array(Type.String(), {
        description: "Array of contact IDs to add to new room. Required for create (min 2)",
      })
    );
    params.topic = Type.Optional(
      Type.String({
        description: "Room topic/name. Optional for create operation",
      })
    );
  }

  if (operations.includes("members")) {
    params.query = Type.Optional(
      Type.String({
        description: "Filter query for members operation (search by name/alias)",
      })
    );
  }

  if (operations.includes("set_announce")) {
    params.announce = Type.Optional(
      Type.String({
        description: "Announcement text for set_announce. Empty string clears announcement",
      })
    );
  }

  return {
    label: "Wechaty Room",
    name: "wechaty_room",
    description,
    parameters: Type.Object(params),
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
        operation: OperationType;
        roomId?: string;
        members?: string[];
        topic?: string;
        query?: string;
        announce?: string;
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

          case "qrcode": {
            if (!roomId?.trim()) {
              return {
                isError: true,
                content: [{ type: "text", text: "roomId is required for 'qrcode' operation" }],
              };
            }
            const qrcode = await getRoomQRCodeWechaty(roomId.trim(), opts);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    operation: "qrcode",
                    roomId: roomId.trim(),
                    qrcode,
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
                  text: `Unknown operation: ${operation}. Valid operations: ${operations.join(", ")}`,
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
