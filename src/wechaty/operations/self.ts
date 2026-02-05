import type { Wechaty } from "@juzi/wechaty";
import { getActiveWechatyBot } from "../registry.js";

export type WechatySelfOpts = {
  accountId?: string;
  bot?: Wechaty;
};

function requireBot(opts?: WechatySelfOpts): Wechaty {
  const bot = opts?.bot ?? getActiveWechatyBot(opts?.accountId);
  if (!bot) {
    throw new Error(
      `Wechaty bot not initialized${opts?.accountId ? ` for account: ${opts.accountId}` : ""}`
    );
  }
  return bot;
}

export type SelfProfile = {
  id: string;
  name: string;
  avatar?: string;
  signature?: string;
};

/**
 * Get the bot's own profile information.
 * Uses bot.currentUser for basic info and puppet methods for extended data.
 */
export async function getSelfProfileWechaty(
  opts?: WechatySelfOpts
): Promise<SelfProfile> {
  const bot = requireBot(opts);

  const currentUser = bot.currentUser;
  if (!currentUser) {
    throw new Error("Bot not logged in - no current user available");
  }

  const profile: SelfProfile = {
    id: currentUser.id,
    name: currentUser.name(),
  };

  // Try to get avatar URL
  try {
    const avatarFileBox = await currentUser.avatar();
    if (avatarFileBox) {
      // FileBox may have a remoteUrl property for URL-based file boxes
      const fileBoxAny = avatarFileBox as any;
      if (fileBoxAny.remoteUrl) {
        profile.avatar = fileBoxAny.remoteUrl;
      } else if (typeof fileBoxAny.toDataURL === "function") {
        // Convert to data URL as fallback
        profile.avatar = await fileBoxAny.toDataURL();
      }
    }
  } catch (error) {
    console.warn(`Failed to get avatar: ${String(error)}`);
  }

  // Try to get signature via WCF puppet method if available
  try {
    const puppet = bot.puppet as any;
    if (typeof puppet.contactSelfSignature === "function") {
      const signature = await puppet.contactSelfSignature();
      if (signature) {
        profile.signature = signature;
      }
    }
  } catch (error) {
    console.warn(`Failed to get signature: ${String(error)}`);
  }

  return profile;
}

/**
 * Get the bot's personal QR code.
 * Only available on WeChatFerry-based puppets.
 */
export async function getSelfQRCodeWechaty(
  opts?: WechatySelfOpts
): Promise<string> {
  const bot = requireBot(opts);

  const puppet = bot.puppet as any;
  if (typeof puppet.contactSelfQRCode !== "function") {
    throw new Error(
      "QR code retrieval not supported by this puppet. " +
        "Only available on WeChatFerry-based puppets."
    );
  }

  try {
    const qrcode = await puppet.contactSelfQRCode();
    return qrcode;
  } catch (error) {
    console.error(`Failed to get self QR code: ${String(error)}`);
    throw error;
  }
}

export type SetSelfProfileParams = {
  name?: string;
  signature?: string;
  avatar?: string;
};

export type SetSelfProfileResult = {
  updated: string[];
  failed: Array<{ field: string; error: string }>;
};

/**
 * Update the bot's profile information.
 * Only available on WeChatFerry-based puppets.
 *
 * @param params - Fields to update (name, signature, avatar)
 * @param opts - Bot selection options
 */
export async function setSelfProfileWechaty(
  params: SetSelfProfileParams,
  opts?: WechatySelfOpts
): Promise<SetSelfProfileResult> {
  const bot = requireBot(opts);
  const puppet = bot.puppet as any;

  const updated: string[] = [];
  const failed: Array<{ field: string; error: string }> = [];

  // Update name if provided
  if (params.name !== undefined) {
    if (typeof puppet.contactSelfName !== "function") {
      failed.push({
        field: "name",
        error: "Name update not supported by this puppet",
      });
    } else {
      try {
        await puppet.contactSelfName(params.name);
        updated.push("name");
      } catch (error) {
        failed.push({
          field: "name",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Update signature if provided
  if (params.signature !== undefined) {
    if (typeof puppet.contactSelfSignature !== "function") {
      failed.push({
        field: "signature",
        error: "Signature update not supported by this puppet",
      });
    } else {
      try {
        await puppet.contactSelfSignature(params.signature);
        updated.push("signature");
      } catch (error) {
        failed.push({
          field: "signature",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Update avatar if provided
  if (params.avatar !== undefined) {
    // Avatar update typically requires a FileBox, which is more complex
    // For now, we note that this is not commonly supported
    failed.push({
      field: "avatar",
      error:
        "Avatar update not yet implemented. " +
        "Use the platform's native settings to change avatar.",
    });
  }

  return { updated, failed };
}
