import type { ChannelMessageActionAdapter } from "clawdbot/plugin-sdk";

/**
 * Wechaty message actions
 * Note: Most actions are not supported by Wechaty yet
 */
export const wechatyMessageActions: ChannelMessageActionAdapter = {
  supportedActions: [],

  async executeAction() {
    // No actions supported yet
    throw new Error("Message actions not supported for Wechaty");
  },
};
