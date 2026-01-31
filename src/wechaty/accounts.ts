import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";
import type { CoreConfig, WechatyAccountConfig, WechatyChannelConfig } from "../types.js";

export type ResolvedWechatyAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  puppet: string;
  puppetOptions?: Record<string, unknown>;
  config: WechatyAccountConfig;
};

export function listWechatyAccountIds(cfg: CoreConfig): string[] {
  const wechatyConfig = cfg.channels?.wechaty;
  if (!wechatyConfig) return [];

  const accountIds = new Set<string>();

  // Check base config
  if (wechatyConfig.puppet) {
    accountIds.add(DEFAULT_ACCOUNT_ID);
  }

  // Check accounts section
  if (wechatyConfig.accounts) {
    for (const id of Object.keys(wechatyConfig.accounts)) {
      accountIds.add(normalizeAccountId(id));
    }
  }

  return Array.from(accountIds);
}

export function resolveDefaultWechatyAccountId(cfg: CoreConfig): string {
  const ids = listWechatyAccountIds(cfg);
  return ids.length > 0 ? ids[0] : DEFAULT_ACCOUNT_ID;
}

export function resolveWechatyAccount(params: {
  cfg: CoreConfig;
  accountId?: string;
}): ResolvedWechatyAccount {
  const { cfg, accountId } = params;
  const wechatyConfig = cfg.channels?.wechaty;

  const resolvedId = accountId ? normalizeAccountId(accountId) : DEFAULT_ACCOUNT_ID;

  // If no config exists at all, return a minimal unconfigured account
  if (!wechatyConfig) {
    return {
      accountId: resolvedId,
      name: undefined,
      enabled: false,
      configured: false,
      puppet: "",
      puppetOptions: undefined,
      config: {
        enabled: false,
        dm: {
          policy: "pairing",
          allowFrom: [],
        },
        groupPolicy: "allowlist",
        groups: [],
        groupAllowFrom: [],
        groupRequireMention: true,
        autoAcceptFriend: false,
      },
    };
  }

  // Get account-specific config
  const accountConfig = wechatyConfig.accounts?.[resolvedId];

  // Merge base config with account config
  const mergedConfig: WechatyAccountConfig = {
    enabled: accountConfig?.enabled ?? wechatyConfig.enabled ?? true,
    name: accountConfig?.name ?? wechatyConfig.name,
    puppet: accountConfig?.puppet ?? wechatyConfig.puppet,
    puppetOptions: {
      ...wechatyConfig.puppetOptions,
      ...accountConfig?.puppetOptions,
    },
    dm: {
      policy: accountConfig?.dm?.policy ?? wechatyConfig.dm?.policy ?? "pairing",
      allowFrom: accountConfig?.dm?.allowFrom ?? wechatyConfig.dm?.allowFrom ?? [],
    },
    groupPolicy: accountConfig?.groupPolicy ?? wechatyConfig.groupPolicy ?? "allowlist",
    groups: accountConfig?.groups ?? wechatyConfig.groups ?? [],
    groupAllowFrom:
      accountConfig?.groupAllowFrom ?? wechatyConfig.groupAllowFrom ?? [],
    groupRequireMention:
      accountConfig?.groupRequireMention ?? wechatyConfig.groupRequireMention ?? true,
    autoAcceptFriend:
      accountConfig?.autoAcceptFriend ?? wechatyConfig.autoAcceptFriend ?? false,
  };

  const puppet = mergedConfig.puppet || "";
  const configured = Boolean(puppet);

  return {
    accountId: resolvedId,
    name: mergedConfig.name,
    enabled: mergedConfig.enabled ?? true,
    configured,
    puppet,
    puppetOptions: mergedConfig.puppetOptions,
    config: mergedConfig,
  };
}

export function isWechatyAccountConfigured(cfg: CoreConfig, accountId?: string): boolean {
  try {
    const account = resolveWechatyAccount({ cfg, accountId });
    return account.configured;
  } catch {
    return false;
  }
}
