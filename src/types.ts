// CoreConfig extends the full ClawdbotConfig with Wechaty-specific channel config
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
