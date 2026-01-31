import type { ChannelGroupContext, GroupToolPolicyConfig } from "openclaw/plugin-sdk";

import type { CoreConfig } from "./types.js";

export function resolveWechatyGroupRequireMention(params: ChannelGroupContext): boolean {
  const cfg = params.cfg as CoreConfig;

  // Extract room ID from groupId (may have wechaty: or room: prefix)
  const rawGroupId = params.groupId?.trim() ?? "";
  let roomId = rawGroupId;
  const lower = roomId.toLowerCase();
  if (lower.startsWith("wechaty:")) {
    roomId = roomId.slice("wechaty:".length).trim();
  }
  if (lower.startsWith("room:")) {
    roomId = roomId.slice("room:".length).trim();
  }

  // Check if this specific room/group has a configuration
  const wechatyConfig = cfg.channels?.wechaty;
  if (!wechatyConfig) {
    return true; // Default to requiring mention
  }

  // Check if there's a room-specific config (Wechaty uses groups array, not config objects)
  // For now, we just use the channel-level groupRequireMention setting
  const defaultGroupRequireMention = cfg.channels?.defaults?.groupRequireMention ?? true;
  return wechatyConfig.groupRequireMention ?? defaultGroupRequireMention;
}

export function resolveWechatyGroupToolPolicy(
  params: ChannelGroupContext,
): GroupToolPolicyConfig | undefined {
  // Wechaty doesn't have per-room tool policies yet
  // Return undefined to use default behavior
  return undefined;
}
