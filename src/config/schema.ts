import { z } from "zod";

const allowFromEntry = z.union([z.string(), z.number()]);

const puppetOptionsSchema = z
  .object({
    // Feishu credentials
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    domain: z.enum(["feishu", "lark"]).or(z.string()).optional(),
    // Generic puppet credentials
    token: z.string().optional(),
    authority: z.string().optional(),
    tls: z
      .object({
        disable: z.boolean().optional(),
      })
      .optional(),
  })
  .catchall(z.any());

const dmSchema = z
  .object({
    policy: z.enum(["open", "pairing", "allowlist"]).optional(),
    allowFrom: z.array(allowFromEntry).optional(),
  })
  .optional();

/**
 * Schema for QR code notification configuration.
 * When the bot needs login (QR code scan), send notification to another channel.
 */
const qrcodeNotifySchema = z
  .object({
    /** Target channel to send QR code notification (e.g., "telegram", "discord", "slack") */
    channel: z.string(),
    /** Target address in the notification channel (e.g., "telegram:123456") */
    to: z.string(),
    /** Whether to send the QR code as an image (default: false, sends URL only) */
    sendImage: z.boolean().optional(),
  })
  .optional();

const accountSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  puppet: z.string().optional(),
  puppetOptions: z.record(z.string(), z.any()).optional(),
  dm: dmSchema,
  groupPolicy: z.enum(["open", "allowlist", "disabled"]).optional(),
  groups: z.array(z.string()).optional(),
  groupAllowFrom: z.array(allowFromEntry).optional(),
  groupRequireMention: z.boolean().optional(),
  autoAcceptFriend: z.boolean().optional(),
  qrcodeNotify: qrcodeNotifySchema,
});

export const WechatyConfigSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  puppet: z.literal("wechaty-puppet-feishu").or(z.string()).optional(),
  puppetOptions: puppetOptionsSchema.optional(),
  dm: dmSchema,
  groupPolicy: z.enum(["open", "allowlist", "disabled"]).optional(),
  groups: z.array(z.string()).optional(),
  groupAllowFrom: z.array(allowFromEntry).optional(),
  groupRequireMention: z.boolean().optional(),
  autoAcceptFriend: z.boolean().optional(),
  replyToMode: z.enum(["off", "all", "direct"]).optional(),
  mediaMaxMb: z.number().positive().optional(),
  qrcodeNotify: qrcodeNotifySchema,
  accounts: z.record(z.string(), accountSchema).optional(),
});
