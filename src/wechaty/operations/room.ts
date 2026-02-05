import type { Wechaty } from "@juzi/wechaty";
import { getActiveWechatyBot } from "../registry.js";
import { normalizeTargetId, findRoom, findContact } from "../utils/recipient-lookup.js";

export type WechatyOperationOpts = {
  accountId?: string;
  bot?: Wechaty;
};

function requireBot(opts?: WechatyOperationOpts): Wechaty {
  const bot = opts?.bot ?? getActiveWechatyBot(opts?.accountId);
  if (!bot) {
    throw new Error(
      `Wechaty bot not initialized${opts?.accountId ? ` for account: ${opts.accountId}` : ""}`
    );
  }
  return bot;
}

/**
 * Add a contact to a room (group chat).
 * Uses puppet.roomAdd() which may trigger an invite for certain group settings.
 */
export async function addParticipantWechaty(
  roomId: string,
  contactId: string,
  opts?: WechatyOperationOpts
): Promise<void> {
  const bot = requireBot(opts);

  try {
    await bot.puppet.roomAdd(roomId, contactId);
  } catch (error) {
    console.error(`Failed to add ${contactId} to room ${roomId}: ${String(error)}`);
    throw error;
  }
}

/**
 * Leave a group chat via Wechaty puppet's roomQuit API.
 */
export async function leaveGroupWechaty(
  roomId: string,
  opts?: WechatyOperationOpts
): Promise<void> {
  const bot = requireBot(opts);
  const normalizedRoomId = normalizeTargetId(roomId);

  try {
    await bot.puppet.roomQuit(normalizedRoomId);
  } catch (error) {
    console.error(`Failed to leave group ${normalizedRoomId}: ${String(error)}`);
    throw error;
  }
}

/**
 * Rename a room/group chat topic.
 * Requires group admin permissions.
 */
export async function renameGroupWechaty(
  roomId: string,
  newTopic: string,
  opts?: WechatyOperationOpts
): Promise<void> {
  const bot = requireBot(opts);
  const normalizedRoomId = normalizeTargetId(roomId);

  const room = await findRoom(bot, normalizedRoomId);
  if (!room) {
    throw new Error(`Room not found: ${normalizedRoomId}`);
  }

  try {
    await bot.puppet.roomTopic(room.id, newTopic);
  } catch (error) {
    throw new Error(
      `Failed to rename room: ${String(error)}. Ensure the bot has admin permissions.`
    );
  }
}

/**
 * Remove a member from a room/group chat.
 * Requires group admin permissions.
 */
export async function removeRoomMemberWechaty(
  to: string,
  participant: string,
  opts?: WechatyOperationOpts
): Promise<void> {
  const bot = requireBot(opts);
  const normalizedTo = normalizeTargetId(to);

  const room = await findRoom(bot, normalizedTo);
  if (!room) {
    throw new Error(`Room not found: ${normalizedTo}`);
  }

  const normalizedParticipant = normalizeTargetId(participant);
  const contact = await findContact(bot, normalizedParticipant);
  if (!contact) {
    throw new Error(`Contact not found: ${normalizedParticipant}`);
  }

  try {
    await bot.puppet.roomDel(room.id, contact.id);
  } catch (error) {
    throw new Error(
      `Failed to remove member from room: ${String(error)}. Ensure the bot has admin permissions.`
    );
  }
}

/**
 * Set a group chat's avatar/icon via Wechaty puppet's roomAvatar API.
 * Requires group admin permissions on most platforms.
 */
export async function setGroupIconWechaty(
  roomId: string,
  fileBox: any,
  opts?: WechatyOperationOpts
): Promise<void> {
  const bot = requireBot(opts);
  const trimmedRoomId = normalizeTargetId(roomId);

  if (!trimmedRoomId) {
    throw new Error("Wechaty setGroupIcon requires roomId");
  }

  try {
    await bot.puppet.roomAvatar(trimmedRoomId, fileBox);
  } catch (error) {
    console.error(`Failed to set group icon for ${trimmedRoomId}: ${String(error)}`);
    throw error;
  }
}
