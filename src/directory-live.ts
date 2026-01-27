import type { ChannelDirectoryEntry } from "clawdbot/plugin-sdk";

import { getActiveWechatyBot } from "./wechaty/send.js";
import { resolveDefaultWechatyAccountId } from "./wechaty/accounts.js";
import type { CoreConfig } from "./types.js";

function normalizeQuery(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

export async function listWechatyDirectoryPeersLive(params: {
  cfg: unknown;
  query?: string | null;
  limit?: number | null;
}): Promise<ChannelDirectoryEntry[]> {
  const query = normalizeQuery(params.query);
  const cfg = params.cfg as CoreConfig;
  const accountId = resolveDefaultWechatyAccountId(cfg);
  const bot = getActiveWechatyBot(accountId);

  if (!bot || !bot.isLoggedIn) {
    return [];
  }

  try {
    const contacts = await bot.Contact.findAll();
    const peers: ChannelDirectoryEntry[] = [];
    const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : 100;

    for (const contact of contacts) {
      if (contact.self()) continue;

      const name = contact.name();
      const alias = await contact.alias();
      const displayName = alias || name;

      // Filter by query if provided
      if (query) {
        const matchesName = name.toLowerCase().includes(query);
        const matchesAlias = alias?.toLowerCase().includes(query);
        const matchesId = contact.id.toLowerCase().includes(query);

        if (!matchesName && !matchesAlias && !matchesId) {
          continue;
        }
      }

      peers.push({
        kind: "user",
        id: contact.id,
        name: displayName,
        handle: displayName ? `@${displayName}` : undefined,
      } satisfies ChannelDirectoryEntry);

      if (peers.length >= limit) break;
    }

    return peers;
  } catch (error) {
    // Return empty array on error - no console.error in production code
    return [];
  }
}

export async function listWechatyDirectoryGroupsLive(params: {
  cfg: unknown;
  query?: string | null;
  limit?: number | null;
}): Promise<ChannelDirectoryEntry[]> {
  const query = normalizeQuery(params.query);
  const cfg = params.cfg as CoreConfig;
  const accountId = resolveDefaultWechatyAccountId(cfg);
  const bot = getActiveWechatyBot(accountId);

  if (!bot || !bot.isLoggedIn) {
    return [];
  }

  try {
    const rooms = await bot.Room.findAll();
    const groups: ChannelDirectoryEntry[] = [];
    const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : 100;

    for (const room of rooms) {
      const topic = await room.topic();

      // Filter by query if provided
      if (query) {
        const matchesTopic = topic.toLowerCase().includes(query);
        const matchesId = room.id.toLowerCase().includes(query);

        if (!matchesTopic && !matchesId) {
          continue;
        }
      }

      groups.push({
        kind: "group",
        id: room.id,
        name: topic,
        handle: `#${topic}`,
      } satisfies ChannelDirectoryEntry);

      if (groups.length >= limit) break;
    }

    return groups;
  } catch (error) {
    // Return empty array on error - no console.error in production code
    return [];
  }
}
