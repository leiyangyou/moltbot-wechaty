import type { Wechaty, Contact, Room } from "@juzi/wechaty";

/**
 * Normalize a target ID by stripping wechaty: prefix and trimming.
 */
export function normalizeTargetId(target: string): string {
  return target.replace(/^wechaty:/i, "").trim();
}

/**
 * Check if a target ID represents a room (group chat).
 */
export function isRoomTarget(targetId: string): boolean {
  return targetId.includes("@chatroom") || targetId.includes("oc_");
}

/**
 * Find a room by ID or topic.
 * @throws Error with context if lookup fails
 */
export async function findRoom(bot: Wechaty, targetId: string): Promise<Room | undefined> {
  try {
    let room = await bot.Room.find({ id: targetId });
    if (!room) {
      room = await bot.Room.find({ topic: targetId });
    }
    return room;
  } catch (error) {
    throw new Error(`Failed to find room: ${targetId} - ${String(error)}`);
  }
}

/**
 * Find a contact by ID, name, or alias.
 * @throws Error with context if lookup fails
 */
export async function findContact(bot: Wechaty, targetId: string): Promise<Contact | undefined> {
  try {
    let contact = await bot.Contact.find({ id: targetId });
    if (!contact) {
      contact = await bot.Contact.find({ name: targetId });
    }
    if (!contact) {
      contact = await bot.Contact.find({ alias: targetId });
    }
    return contact;
  } catch (error) {
    throw new Error(`Failed to find contact: ${targetId} - ${String(error)}`);
  }
}

/**
 * Find a recipient (room or contact) by target string.
 * Automatically determines whether to look for a room or contact.
 */
export async function findRecipient(
  bot: Wechaty,
  target: string
): Promise<Contact | Room | undefined> {
  const targetId = normalizeTargetId(target);

  if (isRoomTarget(targetId)) {
    return findRoom(bot, targetId);
  } else {
    return findContact(bot, targetId);
  }
}
