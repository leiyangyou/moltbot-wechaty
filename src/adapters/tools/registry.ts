import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import type { WechatyToolsConfig } from "../../types.js";
import { createWechatyMessageTool } from "./message.js";
import { createWechatyContactTool } from "./contact.js";
import { createWechatyRoomTool } from "./room.js";
import { createWechatySelfTool } from "./self.js";
import { createWechatyFriendshipTool } from "./friendship.js";

/**
 * Tool factory function type that accepts optional enabled operations.
 */
export type ToolFactory = (enabledOperations?: string[]) => ChannelAgentTool;

/**
 * Registry of all available operations per tool.
 * Used for validation and filtering.
 */
export const TOOL_OPERATIONS: Record<string, readonly string[]> = {
  wechaty_message: ["forward", "send_contact_card", "history"],
  wechaty_contact: ["get", "search", "list_tags", "add_tag", "remove_tag", "delete_tag", "set_alias"],
  wechaty_room: ["get", "members", "create", "set_announce", "qrcode"],
  wechaty_self: ["get", "qrcode", "set"],
  wechaty_friendship: ["send", "accept"],
} as const;

/**
 * Known puppet types and their capabilities.
 * Used for auto-detecting which tools should be available.
 */
export const PUPPET_CAPABILITIES = {
  // WeChatFerry-based puppets support all WCF-specific tools
  wcf: {
    patterns: ["wcf", "wechatferry", "puppet-wcf"],
    tools: ["wechaty_message", "wechaty_contact", "wechaty_room", "wechaty_self", "wechaty_friendship"],
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
export const TOOL_REGISTRY: Record<string, ToolFactory> = {
  wechaty_message: createWechatyMessageTool,
  wechaty_contact: createWechatyContactTool,
  wechaty_room: createWechatyRoomTool,
  wechaty_self: createWechatySelfTool,
  wechaty_friendship: createWechatyFriendshipTool,
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
 * Parse a tool entry that may include operation (e.g., "wechaty_message.history")
 */
export function parseToolEntry(entry: string): { tool: string; operation?: string } {
  const dotIndex = entry.indexOf(".");
  if (dotIndex === -1) {
    return { tool: entry };
  }
  return {
    tool: entry.slice(0, dotIndex),
    operation: entry.slice(dotIndex + 1),
  };
}

/**
 * Result of resolving enabled tools with their operations.
 */
export type ResolvedToolConfig = {
  tool: string;
  /** If undefined, all operations are enabled */
  enabledOperations?: string[];
};

/**
 * Resolve which tools and operations to expose based on puppet type and config.
 *
 * Supports both tool-level and operation-level filtering:
 * - "wechaty_message" - enables/disables entire tool
 * - "wechaty_message.history" - enables/disables specific operation
 *
 * Priority:
 * 1. If tools.enable is set, use whitelist (only those tools/operations)
 * 2. If tools.disable is set, filter out blacklisted tools/operations
 * 3. Otherwise, auto-detect based on puppet capabilities
 */
export function resolveEnabledTools(params: {
  puppet: string;
  toolsConfig?: WechatyToolsConfig;
}): ResolvedToolConfig[] {
  const { puppet, toolsConfig } = params;

  // Priority 1: Explicit whitelist
  if (toolsConfig?.enable && toolsConfig.enable.length > 0) {
    return resolveWhitelist(toolsConfig.enable);
  }

  // Get base tools from puppet capabilities
  const baseTools = getToolsForPuppet(puppet);
  if (baseTools.length === 0) {
    return [];
  }

  // Start with all operations enabled for each tool
  let resolved: ResolvedToolConfig[] = baseTools.map((tool) => ({ tool }));

  // Priority 2: Apply blacklist
  if (toolsConfig?.disable && toolsConfig.disable.length > 0) {
    resolved = applyBlacklist(resolved, toolsConfig.disable);
  }

  return resolved;
}

/**
 * Resolve whitelist entries into tool configs.
 */
function resolveWhitelist(entries: string[]): ResolvedToolConfig[] {
  const toolOps = new Map<string, Set<string>>();
  const toolsWithAllOps = new Set<string>();

  for (const entry of entries) {
    const { tool, operation } = parseToolEntry(entry);

    // Skip invalid tools
    if (!(tool in TOOL_REGISTRY)) continue;

    if (!operation) {
      // Entire tool enabled
      toolsWithAllOps.add(tool);
    } else {
      // Specific operation enabled
      const validOps = TOOL_OPERATIONS[tool];
      if (validOps?.includes(operation)) {
        if (!toolOps.has(tool)) {
          toolOps.set(tool, new Set());
        }
        toolOps.get(tool)!.add(operation);
      }
    }
  }

  const result: ResolvedToolConfig[] = [];

  // Add tools with all operations enabled
  for (const tool of toolsWithAllOps) {
    result.push({ tool });
    toolOps.delete(tool); // Remove from specific ops map
  }

  // Add tools with specific operations
  for (const [tool, ops] of toolOps) {
    if (!toolsWithAllOps.has(tool)) {
      result.push({ tool, enabledOperations: Array.from(ops) });
    }
  }

  return result;
}

/**
 * Apply blacklist to resolved tool configs.
 */
function applyBlacklist(
  configs: ResolvedToolConfig[],
  blacklist: string[]
): ResolvedToolConfig[] {
  const disabledTools = new Set<string>();
  const disabledOps = new Map<string, Set<string>>();

  for (const entry of blacklist) {
    const { tool, operation } = parseToolEntry(entry);

    if (!operation) {
      // Entire tool disabled
      disabledTools.add(tool);
    } else {
      // Specific operation disabled
      if (!disabledOps.has(tool)) {
        disabledOps.set(tool, new Set());
      }
      disabledOps.get(tool)!.add(operation);
    }
  }

  const result: ResolvedToolConfig[] = [];

  for (const config of configs) {
    // Skip entirely disabled tools
    if (disabledTools.has(config.tool)) continue;

    const toolDisabledOps = disabledOps.get(config.tool);
    if (!toolDisabledOps || toolDisabledOps.size === 0) {
      // No operations disabled for this tool
      result.push(config);
    } else {
      // Filter out disabled operations
      const allOps = TOOL_OPERATIONS[config.tool] ?? [];
      const currentOps = config.enabledOperations ?? [...allOps];
      const filteredOps = currentOps.filter((op) => !toolDisabledOps.has(op));

      if (filteredOps.length > 0) {
        result.push({ tool: config.tool, enabledOperations: filteredOps });
      }
      // If no operations left, don't include the tool
    }
  }

  return result;
}

/**
 * Create tool instances for the resolved tool configs.
 */
export function createTools(configs: ResolvedToolConfig[]): ChannelAgentTool[] {
  const tools: ChannelAgentTool[] = [];
  for (const config of configs) {
    const factory = TOOL_REGISTRY[config.tool];
    if (factory) {
      tools.push(factory(config.enabledOperations));
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
  const resolvedConfigs = resolveEnabledTools(params);
  return createTools(resolvedConfigs);
}
