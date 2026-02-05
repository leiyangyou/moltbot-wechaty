import type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelToolSend,
  OpenClawConfig,
} from "openclaw/plugin-sdk";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk";

import { listWechatyAccountIds, resolveWechatyAccount } from "./wechaty/accounts.js";
import {
  recallMessageWechaty,
  removeRoomMemberWechaty,
  renameGroupWechaty,
  sendLinkCardWechaty,
  sendMessageWechaty,
} from "./wechaty/send.js";
import type { CoreConfig } from "./types.js";

const providerId = "wechaty";

function hasEnabledAccount(cfg: OpenClawConfig): boolean {
  const accountIds = listWechatyAccountIds(cfg as CoreConfig);
  return accountIds.some((accountId) => {
    const account = resolveWechatyAccount({ cfg: cfg as CoreConfig, accountId });
    return account.enabled && account.configured;
  });
}

export const wechatyMessageActions: ChannelMessageActionAdapter = {
  listActions: ({ cfg }) => {
    if (!hasEnabledAccount(cfg)) return [];
    const actions = new Set<ChannelMessageActionName>(["sticker", "unsend", "removeParticipant", "renameGroup"]);
    return Array.from(actions);
  },

  supportsButtons: () => false,
  supportsCards: ({ cfg }) => hasEnabledAccount(cfg),

  extractToolSend: ({ args }): ChannelToolSend | null => {
    const action = typeof args.action === "string" ? args.action.trim() : "";
    if (action !== "sendMessage") return null;
    const to = typeof args.to === "string" ? args.to : undefined;
    if (!to) return null;
    const accountId = typeof args.accountId === "string" ? args.accountId.trim() : undefined;
    return { to, accountId };
  },

  handleAction: async ({ action, params, accountId }) => {
    // Handle send action with card parameter (link cards)
    if (action === "send" && params.card) {
      const card = params.card as Record<string, unknown>;
      const to =
        typeof params.to === "string"
          ? params.to.trim()
          : typeof params.target === "string"
            ? params.target.trim()
            : "";

      if (!to) {
        return {
          isError: true,
          content: [{ type: "text", text: "Card send requires a target (to)." }],
        };
      }

      const url = typeof card.url === "string" ? card.url.trim() : "";
      if (!url) {
        return {
          isError: true,
          content: [{ type: "text", text: "Card requires a url field." }],
        };
      }

      try {
        const result = await sendLinkCardWechaty(
          to,
          {
            url,
            title: typeof card.title === "string" ? card.title : undefined,
            description: typeof card.description === "string" ? card.description : undefined,
            thumbnailUrl: typeof card.thumbnailUrl === "string" ? card.thumbnailUrl : undefined,
          },
          { accountId: accountId ?? undefined }
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: true,
                channel: "wechaty",
                messageId: result.messageId,
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
              text: `Failed to send link card: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }

    // Handle sticker action for stickers/GIFs
    if (action === "sticker") {
      const to =
        typeof params.to === "string"
          ? params.to.trim()
          : typeof params.target === "string"
            ? params.target.trim()
            : "";

      if (!to) {
        return {
          isError: true,
          content: [{ type: "text", text: "sticker action requires a target (to)." }],
        };
      }

      const mediaUrl =
        typeof params.url === "string"
          ? params.url.trim()
          : typeof params.mediaUrl === "string"
            ? params.mediaUrl.trim()
            : "";

      if (!mediaUrl) {
        return {
          isError: true,
          content: [{ type: "text", text: "sticker action requires a url or mediaUrl field." }],
        };
      }

      try {
        const result = await sendMessageWechaty(to, "", {
          mediaUrl,
          mediaType: "emotion",
          accountId: accountId ?? undefined,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: true,
                channel: "wechaty",
                action: "sticker",
                messageId: result.messageId,
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
              text: `Failed to send sticker: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }

    // Handle unsend action for message recall
    if (action === "unsend") {
      const messageId = readStringParam(params, "messageId", { required: true });

      try {
        const success = await recallMessageWechaty(messageId ?? "", {
          accountId: accountId ?? undefined,
        });

        if (!success) {
          return jsonResult({
            ok: false,
            error: "Failed to unsend message - message may be too old or not sent by the bot",
          });
        }

        return jsonResult({
          ok: true,
          messageId,
        });
      } catch (error) {
        return jsonResult({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to unsend Wechaty message",
        });
      }
    }

    // Handle removeParticipant action for removing members from group chats
    // Standard schema: to/chatGuid/chatIdentifier/chatId for room, address/participant for contact
    if (action === "removeParticipant") {
      const roomId =
        readStringParam(params, "to") ??
        readStringParam(params, "chatGuid") ??
        readStringParam(params, "chatIdentifier") ??
        readStringParam(params, "chatId");

      const address =
        readStringParam(params, "address") ?? readStringParam(params, "participant");

      if (!roomId) {
        return jsonResult({
          ok: false,
          error:
            "removeParticipant action requires a target room (to, chatGuid, chatIdentifier, or chatId)",
        });
      }

      if (!address) {
        return jsonResult({
          ok: false,
          error: "removeParticipant action requires an address or participant parameter",
        });
      }

      try {
        await removeRoomMemberWechaty(roomId, address, {
          accountId: accountId ?? undefined,
        });

        return jsonResult({
          ok: true,
          chatId: roomId,
          removed: address,
        });
      } catch (error) {
        return jsonResult({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to remove participant from room",
        });
      }
    }

    // Handle renameGroup action for renaming group chat topic
    // Standard schema: to/chatGuid/chatIdentifier/chatId for room, name for new topic
    if (action === "renameGroup") {
      const roomId =
        readStringParam(params, "to") ??
        readStringParam(params, "chatGuid") ??
        readStringParam(params, "chatIdentifier") ??
        readStringParam(params, "chatId");

      const name = readStringParam(params, "name");

      if (!roomId) {
        return jsonResult({
          ok: false,
          error:
            "renameGroup action requires a target room (to, chatGuid, chatIdentifier, or chatId)",
        });
      }

      if (!name) {
        return jsonResult({
          ok: false,
          error: "renameGroup action requires a name parameter",
        });
      }

      try {
        await renameGroupWechaty(roomId, name, {
          accountId: accountId ?? undefined,
        });

        return jsonResult({
          ok: true,
          chatId: roomId,
          name,
        });
      } catch (error) {
        return jsonResult({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to rename group",
        });
      }
    }

    throw new Error(`Action ${action} is not supported for provider ${providerId}.`);
  },
};
