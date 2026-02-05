import type { CallToolResult } from "openclaw/plugin-sdk";
import { sendMessageWechaty, sendLinkCardWechaty } from "../../wechaty/operations/send.js";

/**
 * Handle send action with card parameter (link cards)
 */
export async function handleSendCardAction(
  params: Record<string, unknown>,
  accountId?: string | null
): Promise<CallToolResult> {
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

/**
 * Handle sticker action for stickers/GIFs
 */
export async function handleStickerAction(
  params: Record<string, unknown>,
  accountId?: string | null
): Promise<CallToolResult> {
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
