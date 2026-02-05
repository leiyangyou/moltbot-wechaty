import type { Wechaty, Contact } from "@juzi/wechaty";
import { getActiveWechatyBot } from "../registry.js";
import { normalizeTargetId, findRoom, findContact } from "../utils/recipient-lookup.js";

export type WechatyOperationOpts = {
  accountId?: string;
  bot?: Wechaty;
};

export type RoomDetails = {
  id: string;
  topic: string;
  announce: string;
  memberCount: number;
  ownerId: string | null;
  avatar: string | null;
};

export type RoomMemberInfo = {
  id: string;
  name: string;
  alias: string | null;
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

/**
 * Get room details (id, topic, announce, memberCount, ownerId, avatar).
 */
export async function getRoomDetailsWechaty(
  roomId: string,
  opts?: WechatyOperationOpts
): Promise<RoomDetails> {
  const bot = requireBot(opts);
  const normalizedRoomId = normalizeTargetId(roomId);

  const room = await findRoom(bot, normalizedRoomId);
  if (!room) {
    throw new Error(`Room not found: ${normalizedRoomId}`);
  }

  try {
    const topic = await room.topic();
    const announce = await room.announce();
    const members = await room.memberAll();
    const owner = room.owner();

    let avatar: string | null = null;
    try {
      const avatarFileBox = await room.avatar();
      if (avatarFileBox) {
        avatar = await avatarFileBox.toDataURL();
      }
    } catch {
      // Avatar not available on all platforms
    }

    return {
      id: room.id,
      topic,
      announce,
      memberCount: members.length,
      ownerId: owner?.id ?? null,
      avatar,
    };
  } catch (error) {
    throw new Error(`Failed to get room details: ${String(error)}`);
  }
}

/**
 * List room members with optional query filter.
 */
export async function getRoomMembersWechaty(
  roomId: string,
  query?: string,
  opts?: WechatyOperationOpts
): Promise<RoomMemberInfo[]> {
  const bot = requireBot(opts);
  const normalizedRoomId = normalizeTargetId(roomId);

  const room = await findRoom(bot, normalizedRoomId);
  if (!room) {
    throw new Error(`Room not found: ${normalizedRoomId}`);
  }

  try {
    let members: Contact[];
    if (query) {
      // Try to find members by name/alias query
      members = await room.memberAll(query);
      if (members.length === 0) {
        // Fallback: get all members and filter
        const allMembers = await room.memberAll();
        const lowerQuery = query.toLowerCase();
        members = allMembers.filter((m) => {
          const name = m.name().toLowerCase();
          return name.includes(lowerQuery) || m.id.toLowerCase().includes(lowerQuery);
        });
      }
    } else {
      members = await room.memberAll();
    }

    const results: RoomMemberInfo[] = [];
    for (const member of members) {
      const alias = await room.alias(member);
      results.push({
        id: member.id,
        name: member.name(),
        alias: alias ?? null,
      });
    }

    return results;
  } catch (error) {
    throw new Error(`Failed to get room members: ${String(error)}`);
  }
}

/**
 * Create a new room with specified members and optional topic.
 */
export async function createRoomWechaty(
  memberIds: string[],
  topic?: string,
  opts?: WechatyOperationOpts
): Promise<{ roomId: string; topic: string }> {
  const bot = requireBot(opts);

  if (memberIds.length < 2) {
    throw new Error("Creating a room requires at least 2 members");
  }

  const contacts: Contact[] = [];
  for (const memberId of memberIds) {
    const normalized = normalizeTargetId(memberId);
    const contact = await findContact(bot, normalized);
    if (!contact) {
      throw new Error(`Contact not found: ${normalized}`);
    }
    contacts.push(contact);
  }

  try {
    const room = await bot.Room.create(contacts, topic);
    const finalTopic = await room.topic();

    return {
      roomId: room.id,
      topic: finalTopic,
    };
  } catch (error) {
    throw new Error(`Failed to create room: ${String(error)}`);
  }
}

/**
 * Set or clear room announcement.
 * Pass empty string to clear the announcement.
 */
export async function setRoomAnnounceWechaty(
  roomId: string,
  announce: string,
  opts?: WechatyOperationOpts
): Promise<void> {
  const bot = requireBot(opts);
  const normalizedRoomId = normalizeTargetId(roomId);

  const room = await findRoom(bot, normalizedRoomId);
  if (!room) {
    throw new Error(`Room not found: ${normalizedRoomId}`);
  }

  try {
    await room.announce(announce);
  } catch (error) {
    throw new Error(
      `Failed to set room announcement: ${String(error)}. Ensure the bot has admin permissions.`
    );
  }
}
