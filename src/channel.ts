import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
  type ChannelAccountSnapshot,
  type ChannelGatewayContext,
  type ChannelPlugin,
  type ChannelStatusIssue,
} from "clawdbot/plugin-sdk";

import { wechatyMessageActions } from "./actions.js";
import { WechatyConfigSchema } from "./config-schema.js";
import { resolveWechatyGroupRequireMention, resolveWechatyGroupToolPolicy } from "./group-mentions.js";
import type { CoreConfig } from "./types.js";
import {
  listWechatyAccountIds,
  resolveDefaultWechatyAccountId,
  resolveWechatyAccount,
  type ResolvedWechatyAccount,
} from "./wechaty/accounts.js";
import { probeWechaty } from "./wechaty/probe.js";
import { sendMessageWechaty } from "./wechaty/send.js";
import { monitorWechatyProvider } from "./wechaty/monitor.js";
import { wechatyOnboardingAdapter } from "./onboarding.js";
import { wechatyOutbound } from "./outbound.js";
import { resolveWechatyTargets } from "./resolve-targets.js";
import {
  listWechatyDirectoryGroupsLive,
  listWechatyDirectoryPeersLive,
} from "./directory-live.js";

const meta = {
  id: "wechaty",
  label: "Wechaty",
  selectionLabel: "Wechaty",
  docsPath: "/channels/wechaty",
  docsLabel: "wechaty",
  blurb: "Multi-platform IM support via Wechaty SDK",
  order: 65,
  quickstartAllowFrom: true,
};

function normalizeWechatyMessagingTarget(raw: string): string | undefined {
  let normalized = raw.trim();
  if (!normalized) return undefined;
  const lowered = normalized.toLowerCase();
  if (lowered.startsWith("wechaty:")) {
    normalized = normalized.slice("wechaty:".length).trim();
  }
  return normalized || undefined;
}

export const wechatyPlugin: ChannelPlugin<ResolvedWechatyAccount> = {
  id: "wechaty",
  meta,
  onboarding: wechatyOnboardingAdapter,

  pairing: {
    idLabel: "wechatyId",
    normalizeAllowEntry: (entry) => entry.replace(/^wechaty:/i, "").trim().toLowerCase(),
    notifyApproval: async ({ id }) => {
      await sendMessageWechaty(id, PAIRING_APPROVED_MESSAGE);
    },
  },

  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false, // Not supported yet
    threads: false, // Not supported yet
    polls: false,
    media: true,
    voice: true,
    location: true,
  },

  reload: { configPrefixes: ["channels.wechaty"] },
  configSchema: buildChannelConfigSchema(WechatyConfigSchema),

  config: {
    listAccountIds: (cfg) => listWechatyAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveWechatyAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultWechatyAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "wechaty",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "wechaty",
        accountId,
        clearBaseFields: ["name", "puppet", "puppetOptions"],
      }),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      puppet: account.puppet,
    }),
    resolveAllowFrom: ({ cfg }) =>
      ((cfg as CoreConfig).channels?.wechaty?.dm?.allowFrom ?? []).map((entry) =>
        String(entry)
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => entry.toLowerCase().trim()),
  },

  security: {
    resolveDmPolicy: ({ account }) => ({
      policy: account.config.dm?.policy ?? "pairing",
      allowFrom: (account.config.dm?.allowFrom ?? []).map((entry) => String(entry)),
      policyPath: "channels.wechaty.dm.policy",
      allowFromPath: "channels.wechaty.dm.allowFrom",
      approveHint: formatPairingApproveHint("wechaty"),
      normalizeEntry: (raw) => raw.replace(/^wechaty:/i, "").trim().toLowerCase(),
    }),
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy = (cfg as CoreConfig).channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") return [];
      return [
        "- Wechaty groups: groupPolicy=\"open\" allows any group to trigger (mention-gated). Set channels.wechaty.groupPolicy=\"allowlist\" + channels.wechaty.groups to restrict groups.",
      ];
    },
  },

  groups: {
    resolveRequireMention: resolveWechatyGroupRequireMention,
    resolveToolPolicy: resolveWechatyGroupToolPolicy,
  },

  threading: {
    resolveReplyToMode: ({ cfg }) =>
      (cfg as CoreConfig).channels?.wechaty?.replyToMode ?? "off",
    buildToolContext: ({ context, hasRepliedRef }) => {
      const currentTarget = context.To;
      return {
        currentChannelId: currentTarget?.trim() || undefined,
        currentThreadTs: context.ReplyToId,
        hasRepliedRef,
      };
    },
  },

  messaging: {
    normalizeTarget: normalizeWechatyMessagingTarget,
    targetResolver: {
      looksLikeId: (raw) => {
        console.log("Wechaty targetResolver.looksLikeId:", raw);
        const trimmed = raw.trim();
        if (!trimmed) return false;
        // ID patterns: ou_*, wxid_*, weixin*, or contains @chatroom or oc_ for Feishu rooms
        return (
          /^(wxid_|weixin)/i.test(trimmed) || trimmed.includes("@chatroom") || trimmed.includes("oc_") || trimmed.includes("@")
        );
      },
      hint: "<wechat-id|room-id>",
    },
  },

  directory: {
    self: async () => null,
    listPeers: async ({ cfg, query, limit }) => {
      const peers = await listWechatyDirectoryPeersLive({ cfg, query, limit });
      return peers.map((peer) => ({
        id: peer.id,
        name: peer.name,
      }));
    },
    listGroups: async ({ cfg, query, limit }) => {
      const groups = await listWechatyDirectoryGroupsLive({ cfg, query, limit });
      return groups.map((group) => ({
        id: group.id,
        name: group.name,
      }));
    },
  },

  resolver: {
    resolveTargets: async ({ cfg, inputs, kind, runtime }) => {
      return resolveWechatyTargets({ cfg, inputs, kind, runtime });
    },
  },

  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "wechaty",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      if (!input.puppet) {
        return "Wechaty requires puppet type (e.g., wechaty-puppet-wechat)";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "wechaty",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "wechaty",
            })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            wechaty: {
              ...next.channels?.wechaty,
              enabled: true,
              puppet: input.puppet,
              ...(input.puppetOptions ? { puppetOptions: input.puppetOptions } : {}),
            },
          },
        };
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          wechaty: {
            ...next.channels?.wechaty,
            enabled: true,
            accounts: {
              ...next.channels?.wechaty?.accounts,
              [accountId]: {
                ...next.channels?.wechaty?.accounts?.[accountId],
                enabled: true,
                puppet: input.puppet,
                ...(input.puppetOptions ? { puppetOptions: input.puppetOptions } : {}),
              },
            },
          },
        },
      };
    },
  },

  gateway: {
    startAccount: async (ctx: ChannelGatewayContext<ResolvedWechatyAccount>) => {
      const { account, cfg, abortSignal, log } = ctx;
      log?.info(`[${account.accountId}] starting Wechaty provider (puppet: ${account.puppet})`);
      await monitorWechatyProvider({
        config: cfg as CoreConfig,
        runtime: {
          log: (msg) => log?.info(msg),
          error: (msg) => log?.error?.(msg),
        },
        abortSignal,
        accountId: account.accountId,
      });
    },
  },

  outbound: wechatyOutbound,
  actions: wechatyMessageActions,

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts: ChannelAccountSnapshot[]): ChannelStatusIssue[] => {
      const issues: ChannelStatusIssue[] = [];
      for (const account of accounts) {
        if (!account.configured) {
          issues.push({
            accountId: account.accountId,
            severity: "error",
            message: "Wechaty not configured - set channels.wechaty.puppet",
          });
        }
        if (account.configured && !account.enabled) {
          issues.push({
            accountId: account.accountId,
            severity: "warning",
            message: "Wechaty is disabled - set channels.wechaty.enabled=true",
          });
        }
      }
      return issues;
    },
    buildChannelSummary: ({ snapshot }: { snapshot: ChannelAccountSnapshot }) => ({
      configured: snapshot.configured ?? false,
      puppet: snapshot.puppet ?? "none",
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account }: { account: ResolvedWechatyAccount }) => {
      const result = await probeWechaty({ cfg: {} as CoreConfig, account });
      return {
        ok: result.ok,
        configured: result.configured,
        enabled: result.enabled,
        connected: result.connected,
        loggedIn: result.loggedIn,
        puppet: result.puppet,
        userId: result.userId,
        userName: result.userName,
        issues: result.issues,
      };
    },
    buildAccountSnapshot: ({
      account,
      runtime,
      probe,
    }: {
      account: ResolvedWechatyAccount;
      runtime?: ChannelAccountSnapshot;
      probe?: unknown;
    }): ChannelAccountSnapshot => {
      const configured = account.configured;
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        puppet: account.puppet,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        probe,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
      };
    },
  },
};
