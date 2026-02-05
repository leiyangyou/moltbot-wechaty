import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import type { WechatyToolsConfig } from "../../types.js";
import { createWechatyMessageTool } from "./message.js";
import { createWechatyContactTool } from "./contact.js";
import { createWechatyRoomTool } from "./room.js";
import { createWechatySelfTool } from "./self.js";

/**
 * Known puppet types and their capabilities.
 * Used for auto-detecting which tools should be available.
 */
export const PUPPET_CAPABILITIES = {
  // WeChatFerry-based puppets support all WCF-specific tools
  wcf: {
    patterns: ["wcf", "wechatferry", "puppet-wcf"],
    tools: ["wechaty_message", "wechaty_contact", "wechaty_room", "wechaty_self"],
  },
  // Feishu/Lark puppets - basic tools only
  feishu: {
    patterns: ["feishu", "lark"],
    tools: ["wechaty_contact", "wechaty_room", "wechaty_self"],
  },
  // Matrix puppets - basic tools only
  matrix: {
    patterns: ["matrix"],
    tools: ["wechaty_contact", "wechaty_room", "wechaty_self"],
  },
  // WeChat Official Account puppets - limited support
  officialAccount: {
    patterns: ["official-account", "wechaty-puppet-official-account"],
    tools: ["wechaty_contact", "wechaty_self"],
  },
  // Puppet service (depends on underlying puppet) - user should configure explicitly
  service: {
    patterns: ["@juzi/wechaty-puppet-service", "puppet-service"],
    tools: [], // Unknown capabilities - user should configure explicitly
  },
} as const;

/**
 * All available tools and their factory functions.
 */
export const TOOL_REGISTRY: Record<string, () => ChannelAgentTool> = {
  wechaty_message: createWechatyMessageTool,
  wechaty_contact: createWechatyContactTool,
  wechaty_room: createWechatyRoomTool,
  wechaty_self: createWechatySelfTool,
};

/**
 * Get all available tool names.
 */
export function getAllToolNames(): string[] {
  return Object.keys(TOOL_REGISTRY);
}

/**
 * Detect puppet type from puppet string.
 */
export function detectPuppetType(puppet: string): keyof typeof PUPPET_CAPABILITIES | null {
  const lowered = puppet.toLowerCase();
  for (const [type, config] of Object.entries(PUPPET_CAPABILITIES)) {
    if (config.patterns.some((pattern) => lowered.includes(pattern))) {
      return type as keyof typeof PUPPET_CAPABILITIES;
    }
  }
  return null;
}

/**
 * Get tools supported by a puppet type.
 */
export function getToolsForPuppet(puppet: string): string[] {
  const puppetType = detectPuppetType(puppet);
  if (!puppetType) return [];
  return [...PUPPET_CAPABILITIES[puppetType].tools];
}

/**
 * Check if a specific tool is supported by a puppet.
 */
export function isToolSupportedByPuppet(puppet: string, toolName: string): boolean {
  const supportedTools = getToolsForPuppet(puppet);
  return supportedTools.includes(toolName);
}

/**
 * Resolve which tools to expose based on puppet type and config.
 *
 * Priority:
 * 1. If tools.enable is set, use whitelist (only those tools)
 * 2. If tools.disable is set, filter out blacklisted tools
 * 3. Otherwise, auto-detect based on puppet capabilities
 */
export function resolveEnabledTools(params: {
  puppet: string;
  toolsConfig?: WechatyToolsConfig;
}): string[] {
  const { puppet, toolsConfig } = params;

  // Priority 1: Explicit whitelist
  if (toolsConfig?.enable && toolsConfig.enable.length > 0) {
    // Filter to only valid tool names
    return toolsConfig.enable.filter((name) => name in TOOL_REGISTRY);
  }

  // Get base tools from puppet capabilities
  let enabledTools = getToolsForPuppet(puppet);

  // If no puppet-specific tools detected, don't expose any by default
  // (user can explicitly enable via config)
  if (enabledTools.length === 0) {
    enabledTools = [];
  }

  // Priority 2: Apply blacklist
  if (toolsConfig?.disable && toolsConfig.disable.length > 0) {
    const disabled = new Set(toolsConfig.disable);
    enabledTools = enabledTools.filter((name) => !disabled.has(name));
  }

  return enabledTools;
}

/**
 * Create tool instances for the enabled tool names.
 */
export function createTools(toolNames: string[]): ChannelAgentTool[] {
  const tools: ChannelAgentTool[] = [];
  for (const name of toolNames) {
    const factory = TOOL_REGISTRY[name];
    if (factory) {
      tools.push(factory());
    }
  }
  return tools;
}

/**
 * Main entry point: resolve and create tools for an account.
 */
export function resolveAccountTools(params: {
  puppet: string;
  toolsConfig?: WechatyToolsConfig;
}): ChannelAgentTool[] {
  const enabledToolNames = resolveEnabledTools(params);
  return createTools(enabledToolNames);
}
