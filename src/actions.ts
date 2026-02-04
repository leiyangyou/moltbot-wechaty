import type { ChannelMessageActionAdapter } from "openclaw/plugin-sdk";
import { sendLinkCardWechaty } from "./wechaty/send.js";

/**
 * Wechaty message actions
 * Supports link cards (rich text) via the "send" action with card parameter
 */
export const wechatyMessageActions: ChannelMessageActionAdapter = {
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

    // Return null to fall through to default handler for other actions
    return null as never;
  },
};
