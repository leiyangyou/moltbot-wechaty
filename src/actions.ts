import type { ChannelMessageActionAdapter } from "openclaw/plugin-sdk";
import { sendLinkCardWechaty, sendMessageWechaty } from "./wechaty/send.js";

/**
 * Wechaty message actions
 * Supports:
 * - Link cards (rich text) via the "send" action with card parameter
 * - Stickers/GIFs via the "sticker" action with url/mediaUrl parameter
 */
export const wechatyMessageActions: ChannelMessageActionAdapter = {
  listActions: () => ["sticker"],
  supportsCards: () => true,

  handleAction: async (ctx) => {
    // Handle send action with card parameter
    if (ctx.action === "send" && ctx.params.card) {
      const card = ctx.params.card as Record<string, unknown>;
      const to =
        typeof ctx.params.to === "string"
          ? ctx.params.to.trim()
          : typeof ctx.params.target === "string"
            ? ctx.params.target.trim()
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
          { accountId: ctx.accountId ?? undefined }
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
    if (ctx.action === "sticker") {
      const to =
        typeof ctx.params.to === "string"
          ? ctx.params.to.trim()
          : typeof ctx.params.target === "string"
            ? ctx.params.target.trim()
            : "";

      if (!to) {
        return {
          isError: true,
          content: [{ type: "text", text: "sticker action requires a target (to)." }],
        };
      }

      const mediaUrl =
        typeof ctx.params.url === "string"
          ? ctx.params.url.trim()
          : typeof ctx.params.mediaUrl === "string"
            ? ctx.params.mediaUrl.trim()
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
          accountId: ctx.accountId ?? undefined,
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

    // Return null to fall through to default handler for other actions
    return null as never;
  },
};
