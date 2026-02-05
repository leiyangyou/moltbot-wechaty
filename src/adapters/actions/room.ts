import type { CallToolResult } from "openclaw/plugin-sdk";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk";
import {
  addParticipantWechaty,
  leaveGroupWechaty,
  removeRoomMemberWechaty,
  renameGroupWechaty,
  setGroupIconWechaty,
} from "../../wechaty/operations/room.js";
import { prepareWechatyMedia } from "../../wechaty/utils/media.js";

/**
 * Handle addParticipant action for adding members to group chats
 * Uses standard OpenClaw schema: to/target = room, participant = contact to add
 */
export async function handleAddParticipantAction(
  params: Record<string, unknown>,
  accountId?: string | null
): Promise<CallToolResult> {
  const roomId =
    readStringParam(params, "to") ??
    readStringParam(params, "target") ??
    readStringParam(params, "roomId"); // fallback for backwards compat
  const participant =
    readStringParam(params, "participant") ??
    readStringParam(params, "contactId"); // fallback for backwards compat

  if (!roomId) {
    return jsonResult({
      ok: false,
      error: "addParticipant requires 'to' or 'target' parameter (room ID)",
    });
  }

  if (!participant) {
    return jsonResult({
      ok: false,
      error: "addParticipant requires 'participant' parameter (contact ID to add)",
    });
  }

  try {
    await addParticipantWechaty(roomId, participant, {
      accountId: accountId ?? undefined,
    });

    return jsonResult({
      ok: true,
      roomId,
      participant,
    });
  } catch (error) {
    return jsonResult({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to add participant to room",
    });
  }
}

/**
 * Handle leaveGroup action
 */
export async function handleLeaveGroupAction(
  params: Record<string, unknown>,
  accountId?: string | null
): Promise<CallToolResult> {
  // Standard schema uses `to` with aliases chatGuid/chatIdentifier/chatId
  const roomId =
    readStringParam(params, "to") ??
    readStringParam(params, "chatId") ??
    readStringParam(params, "chatGuid") ??
    readStringParam(params, "chatIdentifier");

  if (!roomId) {
    return jsonResult({
      ok: false,
      error: "leaveGroup action requires a target (to, chatId, chatGuid, or chatIdentifier)",
    });
  }

  try {
    await leaveGroupWechaty(roomId, {
      accountId: accountId ?? undefined,
    });

    return jsonResult({
      ok: true,
      left: roomId,
    });
  } catch (error) {
    return jsonResult({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to leave group",
    });
  }
}

/**
 * Handle removeParticipant action for removing members from group chats
 * Standard schema: to/chatGuid/chatIdentifier/chatId for room, address/participant for contact
 */
export async function handleRemoveParticipantAction(
  params: Record<string, unknown>,
  accountId?: string | null
): Promise<CallToolResult> {
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

/**
 * Handle renameGroup action for renaming group chat topic
 * Standard schema: to/chatGuid/chatIdentifier/chatId for room, name for new topic
 */
export async function handleRenameGroupAction(
  params: Record<string, unknown>,
  accountId?: string | null
): Promise<CallToolResult> {
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

/**
 * Handle setGroupIcon action for setting group avatar
 */
export async function handleSetGroupIconAction(
  params: Record<string, unknown>,
  accountId?: string | null
): Promise<CallToolResult> {
  const roomId =
    typeof params.roomId === "string"
      ? params.roomId.trim()
      : typeof params.to === "string"
        ? params.to.trim()
        : typeof params.target === "string"
          ? params.target.trim()
          : "";

  if (!roomId) {
    return {
      isError: true,
      content: [{ type: "text", text: "setGroupIcon action requires a roomId, to, or target." }],
    };
  }

  // Accept various parameter names for the image
  const imageUrl =
    typeof params.imageUrl === "string"
      ? params.imageUrl.trim()
      : typeof params.url === "string"
        ? params.url.trim()
        : typeof params.mediaUrl === "string"
          ? params.mediaUrl.trim()
          : "";

  const imageBuffer =
    params.imageBuffer instanceof Buffer
      ? params.imageBuffer
      : params.buffer instanceof Buffer
        ? params.buffer
        : params.mediaBuffer instanceof Buffer
          ? params.mediaBuffer
          : undefined;

  if (!imageUrl && !imageBuffer) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "setGroupIcon action requires an image. Provide imageUrl, url, mediaUrl, or imageBuffer/buffer.",
        },
      ],
    };
  }

  try {
    const mediaResult = await prepareWechatyMedia({
      mediaUrl: imageUrl || undefined,
      mediaBuffer: imageBuffer,
      fileName: typeof params.fileName === "string" ? params.fileName : undefined,
    });

    if (!mediaResult) {
      return {
        isError: true,
        content: [{ type: "text", text: "Failed to prepare image for group icon." }],
      };
    }

    await setGroupIconWechaty(roomId, mediaResult.fileBox, {
      accountId: accountId ?? undefined,
    });

    return jsonResult({
      ok: true,
      roomId,
      iconSet: true,
    });
  } catch (error) {
    return jsonResult({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to set group icon",
    });
  }
}
