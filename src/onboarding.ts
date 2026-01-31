import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  ClawdbotConfig,
  DmPolicy,
  WizardPrompter,
} from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, formatDocsLink, promptAccountId } from "openclaw/plugin-sdk";

import type { CoreConfig } from "./types.js";
import {
  isWechatyAccountConfigured,
  listWechatyAccountIds,
  resolveDefaultWechatyAccountId,
  resolveWechatyAccount,
} from "./wechaty/accounts.js";

const channel = "wechaty" as const;

function setWechatyDmPolicy(cfg: ClawdbotConfig, dmPolicy: DmPolicy): ClawdbotConfig {
  const coreConfig = cfg as CoreConfig;
  return {
    ...cfg,
    channels: {
      ...coreConfig.channels,
      wechaty: {
        ...coreConfig.channels?.wechaty,
        dm: {
          ...coreConfig.channels?.wechaty?.dm,
          policy: dmPolicy,
        },
      },
    },
  };
}

async function noteWechatyHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "Wechaty supports multiple platforms via puppets:",
      "• Feishu: Official Feishu/Lark bot integration",
      "• Custom puppets: Use any Wechaty-compatible puppet provider",
      "",
      "You'll need credentials from your chosen puppet provider.",
      `Docs: ${formatDocsLink("/channels/wechaty", "channels/wechaty")}`,
    ].join("\n"),
    "Wechaty setup",
  );
}

async function promptWechatyAllowFrom(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<ClawdbotConfig> {
  const { cfg, prompter, accountId } = params;
  const coreConfig = cfg as CoreConfig;
  const resolved = resolveWechatyAccount({ cfg: coreConfig, accountId });
  const existingAllowFrom = resolved.config.dm?.allowFrom ?? [];

  await prompter.note(
    [
      "Enter Wechaty user IDs to allow (one per line or comma-separated).",
      "Format: Feishu IDs (e.g., ou__xxx), room IDs (e.g., oc_xxx)",
      "You can find user IDs in gateway logs when they message you.",
    ].join("\n"),
    "Wechaty allowlist",
  );

  const parseInput = (value: string) =>
    value
      .split(/[\n,;]+/g)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const entry = await prompter.text({
    message: "Wechaty allowFrom (user IDs)",
    placeholder: "ou_xxx, oc_xxx",
    initialValue: existingAllowFrom.length > 0 ? String(existingAllowFrom[0]) : undefined,
    validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
  });

  const ids = parseInput(String(entry));
  const merged = [
    ...existingAllowFrom.map((item) => String(item).trim()).filter(Boolean),
    ...ids,
  ];
  const unique = [...new Set(merged)];

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...coreConfig.channels,
        wechaty: {
          ...coreConfig.channels?.wechaty,
          enabled: true,
          dm: {
            ...coreConfig.channels?.wechaty?.dm,
            policy: "allowlist",
            allowFrom: unique,
          },
        },
      },
    };
  }

  return {
    ...cfg,
    channels: {
      ...coreConfig.channels,
      wechaty: {
        ...coreConfig.channels?.wechaty,
        enabled: true,
        accounts: {
          ...coreConfig.channels?.wechaty?.accounts,
          [accountId]: {
            ...coreConfig.channels?.wechaty?.accounts?.[accountId],
            enabled: coreConfig.channels?.wechaty?.accounts?.[accountId]?.enabled ?? true,
            dm: {
              policy: "allowlist",
              allowFrom: unique,
            },
          },
        },
      },
    },
  };
}

async function promptWechatyAllowFromForAccount(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<ClawdbotConfig> {
  const coreConfig = params.cfg as CoreConfig;
  const resolvedAccountId = params.accountId ?? resolveDefaultWechatyAccountId(coreConfig);
  return promptWechatyAllowFrom({
    cfg: params.cfg,
    prompter: params.prompter,
    accountId: resolvedAccountId,
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Wechaty",
  channel,
  policyKey: "channels.wechaty.dm.policy",
  allowFromKey: "channels.wechaty.dm.allowFrom",
  getCurrent: (cfg) => {
    const coreConfig = cfg as CoreConfig;
    return coreConfig.channels?.wechaty?.dm?.policy ?? "pairing";
  },
  setPolicy: (cfg, policy) => setWechatyDmPolicy(cfg, policy),
  promptAllowFrom: promptWechatyAllowFromForAccount,
};

export const wechatyOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,

  getStatus: async ({ cfg }) => {
    const coreConfig = cfg as CoreConfig;
    const configured = listWechatyAccountIds(coreConfig).some((accountId) =>
      isWechatyAccountConfigured(coreConfig, accountId),
    );

    let puppetLabel = "not configured";
    if (configured) {
      try {
        const account = resolveWechatyAccount({
          cfg: coreConfig,
          accountId: resolveDefaultWechatyAccountId(coreConfig),
        });
        if (account.puppet === "wechaty-puppet-feishu") {
          puppetLabel = "configured · Feishu";
        } else {
          puppetLabel = `configured · ${account.puppet}`;
        }
      } catch {
        // ignore
      }
    }

    return {
      channel,
      configured,
      statusLines: [`Wechaty: ${puppetLabel}`],
      selectionHint: configured ? puppetLabel : "multi-platform IM",
      quickstartScore: configured ? 1 : 3,
    };
  },

  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
  }: {
    cfg: ClawdbotConfig;
    prompter: WizardPrompter;
    accountOverrides: Partial<Record<string, string>>;
    shouldPromptAccountIds: boolean;
  }) => {
    const coreConfig = cfg as CoreConfig;
    await noteWechatyHelp(prompter);

    // Handle account ID selection
    const wechatyOverride = accountOverrides.wechaty?.trim();
    const defaultWechatyAccountId = resolveDefaultWechatyAccountId(coreConfig);
    let wechatyAccountId = wechatyOverride ?? defaultWechatyAccountId;

    if (shouldPromptAccountIds && !wechatyOverride) {
      wechatyAccountId = await promptAccountId({
        cfg,
        prompter,
        label: "Wechaty",
        currentId: wechatyAccountId,
        listAccountIds: (config: ClawdbotConfig) => listWechatyAccountIds(config as CoreConfig),
        defaultAccountId: defaultWechatyAccountId,
      });
    }

    let next = cfg as CoreConfig;
    const isDefaultAccount = wechatyAccountId === DEFAULT_ACCOUNT_ID;

    // Check existing configuration
    let existingAccount;
    try {
      existingAccount = resolveWechatyAccount({ cfg: next, accountId: wechatyAccountId });
    } catch {
      // No existing config
    }

    // Prompt for puppet type
    const existingPuppet = existingAccount?.puppet;
    const puppetChoices = [
      {
        value: "wechaty-puppet-feishu" as const,
        label: "Feishu/Lark",
        hint: "Official Feishu bot integration",
      },
      {
        value: "custom" as const,
        label: "Custom puppet",
        hint: "Use any Wechaty puppet",
      },
    ];

    const puppetChoice = (await prompter.select({
      message: "Select Wechaty puppet",
      options: puppetChoices,
      initialValue: existingPuppet === "wechaty-puppet-feishu" ? "wechaty-puppet-feishu" : "custom",
    })) as "wechaty-puppet-feishu" | "custom";

    let puppet: string;
    if (puppetChoice === "custom") {
      puppet = String(
        await prompter.text({
          message: "Enter puppet package name",
          placeholder: "wechaty-puppet-custom",
          initialValue: existingPuppet && existingPuppet !== "wechaty-puppet-feishu" ? existingPuppet : undefined,
          validate: (value: unknown) => (value?.toString().trim() ? undefined : "Required"),
        }),
      ).trim();
    } else {
      puppet = puppetChoice;
    }

    // Collect credentials based on puppet type
    let puppetOptions: Record<string, unknown> = {};

    if (puppet === "wechaty-puppet-feishu") {
      await prompter.note(
        [
          "Feishu bot setup:",
          "1. Create a bot at https://open.feishu.cn/",
          "2. Get your App ID and App Secret from bot settings",
          "3. Configure bot permissions and event subscriptions",
          `Docs: ${formatDocsLink("/channels/wechaty", "channels/wechaty")}`,
        ].join("\n"),
        "Feishu credentials",
      );

      const existingOpts = existingAccount?.puppetOptions as
        | { appId?: string; appSecret?: string; domain?: string }
        | undefined;

      const appId = await prompter.text({
        message: "Feishu App ID",
        placeholder: "cli_a1234567890abcde",
        initialValue: existingOpts?.appId,
        validate: (value: unknown) => (value?.toString().trim() ? undefined : "Required"),
      });

      const appSecret = await prompter.text({
        message: "Feishu App Secret",
        initialValue: existingOpts?.appSecret,
        validate: (value: unknown) => (value?.toString().trim() ? undefined : "Required"),
      });

      const domain = (await prompter.select({
        message: "Feishu domain",
        options: [
          { value: "feishu", label: "Feishu (China)", hint: "Default" },
          { value: "lark", label: "Lark (International)" },
        ],
        initialValue: existingOpts?.domain ?? "feishu",
      })) as "feishu" | "lark";

      puppetOptions = {
        appId: String(appId).trim(),
        appSecret: String(appSecret).trim(),
        domain,
      };
    } else {
      // Custom puppet - ask for options as JSON
      await prompter.note(
        [
          "Custom puppet setup:",
          "Enter puppet options as a JSON object (e.g., {\"token\": \"xxx\"})",
          "Leave empty to skip puppet-specific options.",
          `Docs: ${formatDocsLink("/channels/wechaty", "channels/wechaty")}`,
        ].join("\n"),
        "Custom puppet options",
      );

      const existingOpts = existingAccount?.puppetOptions;
      const initialValue = existingOpts ? JSON.stringify(existingOpts, null, 2) : undefined;

      const optionsInput = await prompter.text({
        message: "Puppet options (JSON)",
        placeholder: '{"token": "your_token_here"}',
        initialValue,
      });

      const trimmed = String(optionsInput || "").trim();
      if (trimmed) {
        try {
          puppetOptions = JSON.parse(trimmed);
        } catch (err) {
          await prompter.note("Invalid JSON, skipping puppet options", "Warning");
          puppetOptions = {};
        }
      } else {
        puppetOptions = {};
      }
    }

    // Update config with puppet and credentials
    if (isDefaultAccount) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          wechaty: {
            ...next.channels?.wechaty,
            enabled: true,
            puppet,
            puppetOptions,
          },
        },
      };
    } else {
      next = {
        ...next,
        channels: {
          ...next.channels,
          wechaty: {
            ...next.channels?.wechaty,
            enabled: true,
            accounts: {
              ...next.channels?.wechaty?.accounts,
              [wechatyAccountId]: {
                ...next.channels?.wechaty?.accounts?.[wechatyAccountId],
                enabled: true,
                puppet,
                puppetOptions,
              },
            },
          },
        },
      };
    }

    // Optional: Configure group policy
    const configureGroups = await prompter.confirm({
      message: "Configure group message settings now?",
      initialValue: false,
    });

    if (configureGroups) {
      const groupPolicy = (await prompter.select({
        message: "Group message policy",
        options: [
          { value: "allowlist", label: "Allowlist (specific groups only)", hint: "Recommended" },
          { value: "open", label: "Open (all groups, @mention required)" },
          { value: "disabled", label: "Disabled (ignore groups)" },
        ],
        initialValue: existingAccount?.config.groupPolicy ?? "allowlist",
      })) as "allowlist" | "open" | "disabled";

      if (isDefaultAccount) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            wechaty: {
              ...next.channels?.wechaty,
              groupPolicy,
            },
          },
        };
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            wechaty: {
              ...next.channels?.wechaty,
              accounts: {
                ...next.channels?.wechaty?.accounts,
                [wechatyAccountId]: {
                  ...next.channels?.wechaty?.accounts?.[wechatyAccountId],
                  groupPolicy,
                },
              },
            },
          },
        };
      }
    }

    // Optional: Configure auto-accept friend
    const configureAutoAccept = await prompter.confirm({
      message: "Auto-accept friend requests?",
      initialValue: existingAccount?.config.autoAcceptFriend ?? false,
    });

    if (isDefaultAccount) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          wechaty: {
            ...next.channels?.wechaty,
            autoAcceptFriend: configureAutoAccept,
          },
        },
      };
    } else {
      next = {
        ...next,
        channels: {
          ...next.channels,
          wechaty: {
            ...next.channels?.wechaty,
            accounts: {
              ...next.channels?.wechaty?.accounts,
              [wechatyAccountId]: {
                ...next.channels?.wechaty?.accounts?.[wechatyAccountId],
                autoAcceptFriend: configureAutoAccept,
              },
            },
          },
        },
      };
    }

    return { cfg: next as ClawdbotConfig, accountId: wechatyAccountId };
  },

  dmPolicy,

  disable: (cfg: ClawdbotConfig) => {
    const coreConfig = cfg as CoreConfig;
    return {
      ...cfg,
      channels: {
        ...coreConfig.channels,
        wechaty: { ...coreConfig.channels?.wechaty, enabled: false },
      },
    } as ClawdbotConfig;
  },
};
