/**
 * Configuration for QR code login notifications.
 * When the bot needs login (QR code scan), send notification to another channel.
 */
export type QrcodeNotifyConfig = {
  /** Target channel to send QR code notification (e.g., "telegram", "discord", "slack") */
  channel: string;
  /** Target address in the notification channel (e.g., "telegram:123456") */
  to: string;
  /** Whether to send the QR code as an image (default: false, sends URL only) */
  sendImage?: boolean;
};

// CoreConfig extends the full OpenClawConfig with Wechaty-specific channel config
export type CoreConfig = {
  channels?: {
    wechaty?: WechatyChannelConfig;
    defaults?: {
      groupPolicy?: "open" | "allowlist" | "disabled";
      groupRequireMention?: boolean;
    };
  };
  session?: {
    store?: string;
  };
  messages?: {
    ackReaction?: string;
    ackReactionScope?: string;
  };
  [key: string]: unknown;
};

/**
 * Configuration for agent tools.
 * Allows whitelist/blacklist control of which tools are exposed.
 */
export type WechatyToolsConfig = {
  /** Whitelist: only enable these tools (takes precedence over blacklist) */
  enable?: string[];
  /** Blacklist: disable these tools (ignored if enable is set) */
  disable?: string[];
};

export type WechatyChannelConfig = {
  enabled?: boolean;
  name?: string;
  puppet?: string;
  puppetOptions?: Record<string, unknown>;
  dm?: {
    enabled?: boolean;
    policy?: "open" | "pairing" | "allowlist" | "disabled";
    allowFrom?: Array<string | number>;
  };
  groupPolicy?: "open" | "allowlist" | "disabled";
  groups?: Array<string>;
  groupAllowFrom?: Array<string | number>;
  groupRequireMention?: boolean;
  autoAcceptFriend?: boolean;
  replyToMode?: "off" | "all" | "direct";
  qrcodeNotify?: QrcodeNotifyConfig;
  tools?: WechatyToolsConfig;
  accounts?: Record<string, WechatyAccountConfig>;
};

export type WechatyAccountConfig = {
  enabled?: boolean;
  name?: string;
  puppet?: string;
  puppetOptions?: Record<string, unknown>;
  dm?: {
    enabled?: boolean;
    policy?: "open" | "pairing" | "allowlist" | "disabled";
    allowFrom?: Array<string | number>;
  };
  groupPolicy?: "open" | "allowlist" | "disabled";
  groups?: Array<string>;
  groupAllowFrom?: Array<string | number>;
  groupRequireMention?: boolean;
  autoAcceptFriend?: boolean;
  qrcodeNotify?: QrcodeNotifyConfig;
  tools?: WechatyToolsConfig;
};

export type WechatyMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "voice"
  | "file"
  | "url"
  | "location"
  | "contact"
  | "unknown";

export type MentionedUser = {
  id: string;
  name?: string;
};

export type WechatyMessageContext = {
  channelId: "wechaty";
  accountId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  text?: string;
  messageType: WechatyMessageType;
  chatType: "direct" | "group";
  roomId?: string;
  roomTopic?: string;
  mentionSelf?: boolean;
  mentionedUsers?: MentionedUser[];
  timestamp?: number;
};
