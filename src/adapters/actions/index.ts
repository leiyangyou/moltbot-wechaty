import type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelToolSend,
  OpenClawConfig,
} from "openclaw/plugin-sdk";

import { listWechatyAccountIds, resolveWechatyAccount } from "../../wechaty/accounts.js";
import type { CoreConfig } from "../../types.js";

// Import action handlers
import { handleSendCardAction, handleStickerAction } from "./send.js";
import { handleUnsendAction } from "./message.js";
import {
  handleAddParticipantAction,
  handleLeaveGroupAction,
  handleRemoveParticipantAction,
  handleRenameGroupAction,
  handleSetGroupIconAction,
} from "./room.js";

const providerId = "wechaty";

function hasEnabledAccount(cfg: OpenClawConfig): boolean {
  const accountIds = listWechatyAccountIds(cfg as CoreConfig);
  return accountIds.some((accountId) => {
    const account = resolveWechatyAccount({ cfg: cfg as CoreConfig, accountId });
    return account.enabled && account.configured;
  });
}

export const wechatyMessageActions: ChannelMessageActionAdapter = {
  listActions: ({ cfg }) => {
    if (!hasEnabledAccount(cfg)) return [];
    const actions = new Set<ChannelMessageActionName>([
      "sticker",
      "unsend",
      "addParticipant",
      "leaveGroup",
      "removeParticipant",
      "renameGroup",
      "setGroupIcon",
    ]);
    return Array.from(actions);
  },

  supportsButtons: () => false,
  supportsCards: ({ cfg }) => hasEnabledAccount(cfg),

  extractToolSend: ({ args }): ChannelToolSend | null => {
    const action = typeof args.action === "string" ? args.action.trim() : "";
    if (action !== "sendMessage") return null;
    const to = typeof args.to === "string" ? args.to : undefined;
    if (!to) return null;
    const accountId = typeof args.accountId === "string" ? args.accountId.trim() : undefined;
    return { to, accountId };
  },

  handleAction: async ({ action, params, accountId }) => {
    // Handle send action with card parameter (link cards)
    if (action === "send" && params.card) {
      return handleSendCardAction(params, accountId);
    }

    // Handle sticker action for stickers/GIFs
    if (action === "sticker") {
      return handleStickerAction(params, accountId);
    }

    // Handle unsend action for message recall
    if (action === "unsend") {
      return handleUnsendAction(params, accountId);
    }

    // Handle addParticipant action for adding members to group chats
    if (action === "addParticipant") {
      return handleAddParticipantAction(params, accountId);
    }

    // Handle leaveGroup action
    if (action === "leaveGroup") {
      return handleLeaveGroupAction(params, accountId);
    }

    // Handle removeParticipant action for removing members from group chats
    if (action === "removeParticipant") {
      return handleRemoveParticipantAction(params, accountId);
    }

    // Handle renameGroup action for renaming group chat topic
    if (action === "renameGroup") {
      return handleRenameGroupAction(params, accountId);
    }

    // Handle setGroupIcon action for setting group avatar
    if (action === "setGroupIcon") {
      return handleSetGroupIconAction(params, accountId);
    }

    throw new Error(`Action ${action} is not supported for provider ${providerId}.`);
  },
};
