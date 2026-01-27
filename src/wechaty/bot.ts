import { WechatyBuilder, type Wechaty, type Message, type Contact, type Room, type Friendship} from "@juzi/wechaty";
import qrcodeTerminal from "qrcode-terminal";

/**
 * Wechaty Bot Creation Examples
 *
 * Example 1: Feishu Puppet
 * ================================
 * import { PuppetFeishu } from "wechaty-puppet-feishu";
 *
 * const puppet = new PuppetFeishu({
 *   appId: 'cli_a1234567890abcde',
 *   appSecret: 'your_app_secret_here',
 *   domain: 'feishu', // 'lark' or 'feishu', default is 'feishu'
 * });
 *
 * const bot = WechatyBuilder.build({
 *   name: 'feishu-bot',
 *   puppet,
 * });
 *
 * Example 2: Custom Puppet
 * ==========================================
 * const bot = WechatyBuilder.build({
 *   name: 'my-bot', // Generates xxxx.memory-card.json for session persistence
 *   puppet: 'wechaty-puppet-custom',
 *   puppetOptions: {
 *     token: 'your_token_here',
 *     authority: 'service.example.com',
 *     tls: { disable: true },
 *   },
 * });
 */


export type WechatyBotOptions = {
  name?: string;
  puppet?: string;
  puppetOptions?: Record<string, unknown>;
  onScan?: (qrcode: string, status: number) => void | Promise<void>;
  onLogin?: (user: Contact) => void | Promise<void>;
  onLogout?: (user: Contact) => void | Promise<void>;
  onMessage?: (message: Message) => void | Promise<void>;
  onFriendship?: (friendship: Friendship) => void | Promise<void>;
  onRoomJoin?: (room: Room, inviteeList: Contact[], inviter: Contact) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  runtime?: {
    log?: (message: string) => void;
    error?: (message: string) => void;
  };
};

export function createWechatyBot(opts: WechatyBotOptions): Wechaty {
  const log = opts.runtime?.log ?? console.log;
  const logError = opts.runtime?.error ?? console.error;

  // Build bot configuration based on puppet type
  const botConfig: any = {
    name: opts.name || "clawdbot-wechaty",
  };

  // Handle Feishu puppet (uses PuppetFeishu class directly)
  if (opts.puppet === "wechaty-puppet-feishu" && opts.puppetOptions) {
    // For Feishu, puppetOptions should contain { appId, appSecret }
    // The puppet will be instantiated by Wechaty with the puppetOptions
    botConfig.puppet = new (require("wechaty-puppet-feishu").PuppetFeishu)(opts.puppetOptions);
    botConfig.puppetOptions = opts.puppetOptions;
  } else if (opts.puppet === "@juzi/wechaty-puppet-service") {
    // For custom string-based puppets
    botConfig.puppet = "@juzi/wechaty-puppet-service";
    botConfig.puppetOptions = opts.puppetOptions || {};
  } else if (opts.puppet === "wechaty-puppet-matrix") { 
    botConfig.puppet = new(require("wechaty-puppet-matrix").PuppetMatrix)(opts.puppetOptions || {});
  } else if (opts.puppet === "wechaty-puppet-official-account") {
    botConfig.puppet = new(require("wechaty-puppet-official-account").PuppetOfficialAccount)(opts.puppetOptions || {});
  }

  const bot = WechatyBuilder.build(botConfig);

  // Scan event - display QR code for login
  bot.on("scan", async (qrcode, status) => {
    try {
      if (opts.onScan) {
        await opts.onScan(qrcode, status);
      } else {
        log("\n=== Wechaty Login QR Code ===");
        log(`Status: ${status}`);
        qrcodeTerminal.generate(qrcode, { small: true });
        log(`QR Code URL: https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}\n`);
      }
    } catch (error) {
      logError(`Error handling scan event: ${String(error)}`);
    }
  });

  // Login event
  bot.on("login", async (user) => {
    try {
      log(`✓ Wechaty logged in: ${user.name()} (${user.id})`);
      if (opts.onLogin) {
        await opts.onLogin(user);
      }
    } catch (error) {
      logError(`Error handling login event: ${String(error)}`);
    }
  });

  // Logout event
  bot.on("logout", async (user) => {
    try {
      log(`✗ Wechaty logged out: ${user.name()} (${user.id})`);
      if (opts.onLogout) {
        await opts.onLogout(user);
      }
    } catch (error) {
      logError(`Error handling logout event: ${String(error)}`);
    }
  });

  // Message event
  bot.on("message", async (message) => {
    try {
      if (opts.onMessage) {
        await opts.onMessage(message);
      }
    } catch (error) {
      logError(`Error handling message event: ${String(error)}`);
    }
  });

  // Friendship event
  bot.on("friendship", async (friendship) => {
    try {
      if (opts.onFriendship) {
        await opts.onFriendship(friendship);
      }
    } catch (error) {
      logError(`Error handling friendship event: ${String(error)}`);
    }
  });

  // Room join event
  bot.on("room-join", async (room, inviteeList, inviter) => {
    try {
      if (opts.onRoomJoin) {
        await opts.onRoomJoin(room, inviteeList, inviter);
      }
    } catch (error) {
      logError(`Error handling room-join event: ${String(error)}`);
    }
  });

  // Error event
  bot.on("error", async (error) => {
    try {
      logError(`Wechaty bot error: ${error.message}`);
      if (opts.onError) {
        await opts.onError(error);
      }
    } catch (err) {
      logError(`Error handling error event: ${String(err)}`);
    }
  });

  return bot;
}

export async function startWechatyBot(bot: Wechaty): Promise<void> {
  await bot.start();
}

export async function stopWechatyBot(bot: Wechaty): Promise<void> {
  await bot.stop();
}
