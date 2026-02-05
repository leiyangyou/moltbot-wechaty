import type { CallToolResult } from "openclaw/plugin-sdk";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk";
import { recallMessageWechaty } from "../../wechaty/operations/message.js";

/**
 * Handle unsend action for message recall
 */
export async function handleUnsendAction(
  params: Record<string, unknown>,
  accountId?: string | null
): Promise<CallToolResult> {
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
