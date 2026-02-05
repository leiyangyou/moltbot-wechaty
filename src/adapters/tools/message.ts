import { Type, type TLiteral, type TUnion } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import {
  forwardMessageWechaty,
  sendContactCardWechaty,
} from "../../wechaty/operations/message.js";
import { getActiveWechatyBot } from "../../wechaty/operations/send.js";

/**
 * Message type mapping for filtering history
 */
const MESSAGE_TYPE_MAP: Record<string, number> = {
  text: 1,
  image: 3,
  voice: 34,
  video: 43,
  emoji: 47,
  location: 48,
  link: 49,
  file: 49, // Files are also type 49 with different subtype
  voip: 50,
  system: 10000,
};

/** All available actions for this tool */
const ALL_ACTIONS = ["forward", "send_contact_card", "history"] as const;
type ActionType = (typeof ALL_ACTIONS)[number];

/**
 * Creates the wechaty_message agent tool for message operations.
 *
 * Supports:
 * - forward: Forward a message by ID to another contact or room (WCF messageForward)
 * - send_contact_card: Send a contact card to a target (WCF messageSendContact)
 * - history: Query chat history from WCF's SQLite database (WCF-only)
 *
 * @param enabledOperations - Optional list of enabled operations. If undefined, all operations are enabled.
 */
export function createWechatyMessageTool(enabledOperations?: string[]): ChannelAgentTool {
  const actions = enabledOperations
    ? ALL_ACTIONS.filter((a) => enabledOperations.includes(a))
    : [...ALL_ACTIONS];

  if (actions.length === 0) {
    throw new Error("wechaty_message tool requires at least one enabled operation");
  }

  // Build dynamic action union type
  const actionLiterals = actions.map((a) => Type.Literal(a)) as [TLiteral<string>, ...TLiteral<string>[]];
  const actionUnion: TUnion<[TLiteral<string>, ...TLiteral<string>[]]> = Type.Union(actionLiterals, {
    description: `The action to perform: ${actions.map((a) => `'${a}'`).join(", ")}`,
  });

  // Build description based on enabled actions
  const actionDescriptions: Record<ActionType, string> = {
    forward: "forward messages",
    send_contact_card: "send contact cards",
    history: "query history",
  };
  const descParts = actions.map((a) => actionDescriptions[a]);
  const description =
    `Perform message operations: ${descParts.join(", ")}. ` +
    "Only works with WeChatFerry-based puppets.";

  // Build parameters object - only include params for enabled actions
  const params: Record<string, any> = {
    action: actionUnion,
    accountId: Type.Optional(
      Type.String({
        description: "Account ID if using multi-account setup",
      })
    ),
  };

  // Add parameters for forward/send_contact_card
  if (actions.includes("forward") || actions.includes("send_contact_card")) {
    params.target = Type.Optional(
      Type.String({
        description: "Target contact ID (wxid_xxx) or room ID (xxx@chatroom). Required for forward/send_contact_card.",
      })
    );
  }

  if (actions.includes("forward")) {
    params.messageId = Type.Optional(
      Type.String({
        description:
          "The message ID to forward (from context.MessageSid). Required for 'forward' action.",
      })
    );
  }

  if (actions.includes("send_contact_card")) {
    params.contactId = Type.Optional(
      Type.String({
        description:
          "The contact ID (wxid_xxx) to share. Required for 'send_contact_card' action.",
      })
    );
  }

  // Add history parameters
  if (actions.includes("history")) {
    params.conversationId = Type.Optional(
      Type.String({
        description:
          "[history] Contact ID (wxid_xxx) or room ID (xxx@chatroom) to query. Required for 'history' action.",
      })
    );
    params.keyword = Type.Optional(
      Type.String({ description: "[history] Filter messages containing this text" })
    );
    params.messageType = Type.Optional(
      Type.String({
        description:
          "[history] Filter by message type: text, image, voice, video, emoji, location, link, file",
      })
    );
    params.startTime = Type.Optional(
      Type.Number({
        description: "[history] Start timestamp in seconds (Unix epoch)",
      })
    );
    params.endTime = Type.Optional(
      Type.Number({
        description: "[history] End timestamp in seconds (Unix epoch)",
      })
    );
    params.limit = Type.Optional(
      Type.Number({
        description: "[history] Maximum number of messages to return (default: 50, max: 200)",
      })
    );
  }

  return {
    label: "Wechaty Message",
    name: "wechaty_message",
    description,
    parameters: Type.Object(params),
    execute: async (_toolCallId, args) => {
      const {
        action,
        target,
        messageId,
        contactId,
        conversationId,
        keyword,
        messageType,
        startTime,
        endTime,
        limit,
        accountId,
      } = args as {
        action: ActionType;
        target?: string;
        messageId?: string;
        contactId?: string;
        conversationId?: string;
        keyword?: string;
        messageType?: string;
        startTime?: number;
        endTime?: number;
        limit?: number;
        accountId?: string;
      };

      // Check if action is enabled
      if (!actions.includes(action)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Action '${action}' is not enabled. Available actions: ${actions.join(", ")}`,
            },
          ],
        };
      }

      if (action === "forward") {
        if (!target?.trim()) {
          return {
            isError: true,
            content: [{ type: "text", text: "target is required for forward action" }],
          };
        }
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
            target.trim(),
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
      }

      if (action === "send_contact_card") {
        if (!target?.trim()) {
          return {
            isError: true,
            content: [{ type: "text", text: "target is required for send_contact_card action" }],
          };
        }
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
            target.trim(),
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
                  sent: { contactId: contactId.trim(), to: target.trim() },
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

      if (action === "history") {
        return executeHistory({
          conversationId,
          keyword,
          messageType,
          startTime,
          endTime,
          limit,
          accountId,
        });
      }

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown action: ${action}. Supported actions: ${actions.join(", ")}`,
          },
        ],
      };
    },
  };
}

/**
 * Execute the history action
 */
async function executeHistory(params: {
  conversationId?: string;
  keyword?: string;
  messageType?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  accountId?: string;
}): Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }> {
  const { conversationId, keyword, messageType, startTime, endTime, limit, accountId } = params;

  if (!conversationId?.trim()) {
    return {
      isError: true,
      content: [{ type: "text", text: "conversationId is required for history action" }],
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

  // Access the underlying WCF agent
  const puppet = bot.puppet as any;
  const agent = puppet?.agent;

  if (!agent || typeof agent.getHistoryMessageList !== "function") {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "History action requires WeChatFerry puppet. This puppet does not support getHistoryMessageList.",
        },
      ],
    };
  }

  try {
    const effectiveLimit = Math.min(Math.max(limit ?? 50, 1), 200);
    const typeFilter = messageType ? MESSAGE_TYPE_MAP[messageType.toLowerCase()] : undefined;

    // Build the filter function for Knex query builder
    const filter = (sql: any) => {
      // Keyword filter (search in StrContent)
      if (keyword?.trim()) {
        sql.where("MSG.StrContent", "like", `%${keyword.trim()}%`);
      }

      // Message type filter
      if (typeFilter !== undefined) {
        sql.where("MSG.Type", typeFilter);
      }

      // Time range filters (CreateTime is in seconds)
      if (startTime !== undefined) {
        sql.where("MSG.CreateTime", ">=", startTime);
      }
      if (endTime !== undefined) {
        sql.where("MSG.CreateTime", "<=", endTime);
      }

      // Apply limit
      sql.limit(effectiveLimit);
    };

    const messages = agent.getHistoryMessageList(conversationId.trim(), filter);

    // Format results for readability
    const formatted = messages.map((msg: any) => ({
      id: msg.msgSvrId?.toString() || msg.localId?.toString(),
      type: msg.type,
      subType: msg.subType,
      content: msg.strContent?.substring(0, 500), // Truncate long content
      sender: msg.talkerWxid,
      isSender: msg.isSender === 1,
      timestamp: msg.createTime,
      date: msg.createTime ? new Date(msg.createTime * 1000).toISOString() : undefined,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: true,
            conversationId: conversationId.trim(),
            count: formatted.length,
            messages: formatted,
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
          text: `Failed to query history: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
