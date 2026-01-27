import type { ResolvedWechatyAccount } from "./accounts.js";
import type { CoreConfig } from "../types.js";
import { getActiveWechatyBot } from "./send.js";

export type WechatyProbeResult = {
  ok: boolean;
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  loggedIn: boolean;
  puppet?: string;
  userId?: string;
  userName?: string;
  issues?: string[];
};

export async function probeWechaty(params: {
  cfg: CoreConfig;
  account: ResolvedWechatyAccount;
}): Promise<WechatyProbeResult> {
  const { account } = params;
  const issues: string[] = [];

  // Check if configured
  if (!account.configured) {
    issues.push("Wechaty not configured - set channels.wechaty.puppet");
    return {
      ok: false,
      configured: false,
      enabled: account.enabled,
      connected: false,
      loggedIn: false,
      issues,
    };
  }

  // Check if enabled
  if (!account.enabled) {
    issues.push("Wechaty is disabled - set channels.wechaty.enabled=true");
    return {
      ok: false,
      configured: true,
      enabled: false,
      connected: false,
      loggedIn: false,
      puppet: account.puppet,
      issues,
    };
  }

  // Check if bot is running
  const bot = getActiveWechatyBot(account.accountId);
  if (!bot) {
    issues.push("Wechaty bot not running - start the gateway");
    return {
      ok: false,
      configured: true,
      enabled: true,
      connected: false,
      loggedIn: false,
      puppet: account.puppet,
      issues,
    };
  }

  // Check if logged in
  const isLoggedIn = bot.isLoggedIn;
  if (!isLoggedIn) {
    issues.push("Wechaty not logged in - scan QR code to login");
    return {
      ok: false,
      configured: true,
      enabled: true,
      connected: true,
      loggedIn: false,
      puppet: account.puppet,
      issues,
    };
  }

  // Get current user info
  const currentUser = bot.currentUser;
  const userId = currentUser?.id;
  const userName = currentUser?.name();

  return {
    ok: true,
    configured: true,
    enabled: true,
    connected: true,
    loggedIn: true,
    puppet: account.puppet,
    userId,
    userName,
  };
}
