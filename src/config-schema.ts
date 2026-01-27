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
  accounts: z.record(z.string(), accountSchema).optional(),
});
