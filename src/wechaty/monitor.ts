import type { Message, Contact, Room, Wechaty } from "@juzi/wechaty";
import type { Friendship } from "@juzi/wechaty/impls";
import {
  formatAllowlistMatchMeta,
  logInboundDrop,
  resolveMentionGatingWithBypass,
  type AllowlistMatch,
} from "clawdbot/plugin-sdk";
import { createWechatyBot, startWechatyBot, stopWechatyBot } from "./bot.js";
import { setActiveWechatyBot, clearActiveWechatyBot } from "./send.js";
import { resolveWechatyAccount, type ResolvedWechatyAccount } from "./accounts.js";
import type { CoreConfig, WechatyMessageContext, WechatyMessageType } from "../types.js";
import { getWechatyRuntime } from "../runtime.js";
import { sendMessageWechaty } from "./send.js";

export type MonitorWechatyOpts = {
  config?: CoreConfig;
  runtime?: {
    log?: (message: string) => void;
    error?: (message: string) => void;
  };
  abortSignal?: AbortSignal;
  accountId?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

function convertMessageType(wechatyType: number): WechatyMessageType {
  // Wechaty message types from wechaty/src/user/message.ts
  const typeMap: Record<number, WechatyMessageType> = {
    0: "unknown",
    1: "text",
    3: "image",
    4: "voice",
    6: "video",
    8: "audio",
    15: "file",
    17: "url",
    18: "location",
    19: "contact",
  };

  return typeMap[wechatyType] || "unknown";
}

/**
 * Normalize allowlist entries
 */
function normalizeAllowListLower(list?: Array<string | number>) {
  return (list ?? []).map((entry) => String(entry).trim().toLowerCase()).filter(Boolean);
}

/**
 * Resolve allowlist match for Wechaty users
 */
type WechatyAllowListMatch = AllowlistMatch<"wildcard" | "id" | "name">;

function resolveWechatyAllowListMatch(params: {
  allowList: string[];
  userId?: string;
  userName?: string;
}): WechatyAllowListMatch {
  const allowList = params.allowList;
  if (allowList.length === 0) return { allowed: false };
  if (allowList.includes("*")) {
    return { allowed: true, matchKey: "*", matchSource: "wildcard" };
  }

  const userId = params.userId?.trim().toLowerCase() ?? "";
  const userName = params.userName?.trim().toLowerCase() ?? "";

  const candidates: Array<{ value: string; source: WechatyAllowListMatch["matchSource"] }> = [
    { value: userId, source: "id" },
    { value: userName, source: "name" },
  ];

  for (const candidate of candidates) {
    if (!candidate.value) continue;
    if (allowList.includes(candidate.value)) {
      return {
        allowed: true,
        matchKey: candidate.value,
        matchSource: candidate.source,
      };
    }
  }

  return { allowed: false };
}

/**
 * Resolve group configuration with wildcard support
 */
function resolveWechatyGroupConfig(params: {
  groups?: Array<string | number>;
  roomId: string;
  roomTopic?: string;
}): { allowed: boolean; matchKey?: string; matchSource?: "direct" | "wildcard" | "name" } {
  const groups = params.groups ?? [];
  if (groups.length === 0) return { allowed: false };

  const normalizedGroups = normalizeAllowListLower(groups);

  // Check for wildcard
  if (normalizedGroups.includes("*")) {
    return { allowed: true, matchKey: "*", matchSource: "wildcard" };
  }

  const normalizedRoomId = params.roomId.trim().toLowerCase();
  const normalizedRoomTopic = params.roomTopic?.trim().toLowerCase() ?? "";

  // Check for direct room ID match
  if (normalizedGroups.includes(normalizedRoomId)) {
    return { allowed: true, matchKey: normalizedRoomId, matchSource: "direct" };
  }

  // Check for room topic/name match
  if (normalizedRoomTopic && normalizedGroups.includes(normalizedRoomTopic)) {
    return { allowed: true, matchKey: normalizedRoomTopic, matchSource: "name" };
  }

  return { allowed: false };
}

async function shouldProcessMessage(
  context: WechatyMessageContext,
  account: ResolvedWechatyAccount,
  cfg: CoreConfig,
  log: (message: string) => void,
): Promise<{ allowed: boolean; pairingCode?: string }> {
  const { chatType, senderId, senderName, roomId, roomTopic, mentionSelf } = context;
  const runtime = getWechatyRuntime();

  // Check DM policy
  if (chatType === "direct") {
    const dmEnabled = account.config.dm?.enabled ?? true;
    const policy = account.config.dm?.policy ?? "pairing";
    const configAllowFrom = account.config.dm?.allowFrom ?? [];

    if (!dmEnabled || policy === "disabled") {
      log(`Wechaty: drop DM (disabled) sender=${senderId}`);
      return { allowed: false };
    }

    if (policy === "open") {
      log(`Wechaty: allow DM (open policy) sender=${senderId}`);
      return { allowed: true };
    }

    // Merge config allowFrom with pairing store allowFrom
    const storeAllowFrom = await runtime.channel.pairing
      .readAllowFromStore("wechaty")
      .catch(() => []);
    const effectiveAllowFrom = normalizeAllowListLower([...configAllowFrom, ...storeAllowFrom]);

    const allowMatch = resolveWechatyAllowListMatch({
      allowList: effectiveAllowFrom,
      userId: senderId,
      userName: senderName,
    });

    const allowMatchMeta = formatAllowlistMatchMeta(allowMatch);

    if (allowMatch.allowed) {
      log(`Wechaty: allow DM sender=${senderId} (${allowMatchMeta})`);
      return { allowed: true };
    }

    // Handle pairing mode
    if (policy === "pairing") {
      const { code, created } = await runtime.channel.pairing.upsertPairingRequest({
        channel: "wechaty",
        id: senderId,
        meta: { name: senderName },
      });

      if (created) {
        log(`Wechaty: pairing request created sender=${senderId} name=${senderName} (${allowMatchMeta})`);
        return { allowed: false, pairingCode: code };
      }

      log(`Wechaty: blocked DM (pairing mode, request exists) sender=${senderId} (${allowMatchMeta})`);
      return { allowed: false };
    }

    // Allowlist mode
    log(`Wechaty: blocked DM (not in allowlist) sender=${senderId} (${allowMatchMeta})`);
    return { allowed: false };
  }

  // Check group policy
  if (chatType === "group") {
    const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
    const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";

    if (groupPolicy === "disabled") {
      log(`Wechaty: drop group message (disabled) room=${roomId}`);
      return { allowed: false };
    }

    const groups = account.config.groups ?? [];
    const groupAllowFrom = account.config.groupAllowFrom ?? [];
    const groupRequireMention = account.config.groupRequireMention ?? true;

    if (groupPolicy === "open") {
      // Open policy: process if mentioned (when groupRequireMention is true)
      if (groupRequireMention && !mentionSelf) {
        log(`Wechaty: drop group message (open, no mention) room=${roomId}`);
        return { allowed: false };
      }
      log(`Wechaty: allow group message (open policy) room=${roomId}`);
      return { allowed: true };
    }

    if (groupPolicy === "allowlist") {
      // Check if room is in allowlist
      const groupMatch = resolveWechatyGroupConfig({
        groups,
        roomId: roomId ?? "",
        roomTopic,
      });

      if (!groupMatch.allowed && groups.length > 0) {
        log(
          `Wechaty: drop group message (room not in allowlist) room=${roomId} topic=${roomTopic}`,
        );
        return { allowed: false };
      }

      // Check if sender is in group allowlist
      if (groupAllowFrom.length > 0) {
        // Merge with pairing store
        const storeAllowFrom = await runtime.channel.pairing
          .readAllowFromStore("wechaty")
          .catch(() => []);
        const effectiveGroupAllowFrom = normalizeAllowListLower([
          ...groupAllowFrom,
          ...storeAllowFrom,
        ]);

        const groupAllowMatch = resolveWechatyAllowListMatch({
          allowList: effectiveGroupAllowFrom,
          userId: senderId,
          userName: senderName,
        });

        if (!groupAllowMatch.allowed) {
          log(
            `Wechaty: drop group message (sender not in groupAllowFrom) sender=${senderId} room=${roomId} (${formatAllowlistMatchMeta(
              groupAllowMatch,
            )})`,
          );
          return { allowed: false };
        }
      }

      // Check mention requirement
      if (groupRequireMention && !mentionSelf) {
        log(`Wechaty: drop group message (mention required) room=${roomId}`);
        return { allowed: false };
      }

      const matchMeta = groupMatch.matchKey
        ? `matchKey=${groupMatch.matchKey} matchSource=${groupMatch.matchSource}`
        : "no match";
      log(`Wechaty: allow group message (allowlist) room=${roomId} (${matchMeta})`);
      return { allowed: true };
    }
  }

  return { allowed: false };
}

/**
 * Handle incoming Wechaty message and route to agent
 */
async function handleWechatyMessage(params: {
  message: Message;
  context: WechatyMessageContext;
  account: ResolvedWechatyAccount;
  config: CoreConfig;
  runtime: { log?: (message: string) => void; error?: (message: string) => void };
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { message, context, account, config, runtime, statusSink } = params;
  const log = runtime.log ?? console.log;
  const logError = runtime.error ?? console.error;

  try {
    const core = getWechatyRuntime();
    const {
      chatType,
      senderId,
      senderName,
      roomId,
      roomTopic,
      text,
      messageId,
      timestamp,
      mentionSelf,
    } = context;

    const isGroup = chatType === "group";
    const isDirect = chatType === "direct";

    // Resolve routing
    const route = core.channel.routing.resolveAgentRoute({
      cfg: config,
      channel: "wechaty",
      accountId: account.accountId,
      peer: {
        kind: isGroup ? "group" : "dm",
        id: isGroup ? roomId ?? senderId : senderId,
      },
    });

    // Prepare message body
    const rawBody = text ?? "";
    const fromLabel = isGroup ? roomTopic || `room:${roomId}` : senderName || `user:${senderId}`;

    // Resolve storage path and envelope formatting
    const storePath = core.channel.session.resolveStorePath(config.session?.store, {
      agentId: route.agentId,
    });

    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
    const previousTimestamp = core.channel.session.readSessionUpdatedAt({
      storePath,
      sessionKey: route.sessionKey,
    });

    const body = core.channel.reply.formatAgentEnvelope({
      channel: "Wechaty",
      from: fromLabel,
      timestamp: timestamp ?? undefined,
      previousTimestamp,
      envelope: envelopeOptions,
      body: rawBody,
    });

    // Check for command authorization in groups
    const { effectiveWasMentioned } = resolveMentionGatingWithBypass({
      channel: "wechaty",
      cfg: config,
      wasMentioned: mentionSelf ?? false,
    });

    const commandAuthorized =
      !isGroup || core.channel.commands.isCommandAuthorized(senderId, config);

    // Finalize context payload
    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: body,
      RawBody: rawBody,
      CommandBody: rawBody,
      From: `wechaty:${senderId}`,
      To: isGroup ? `wechaty:room:${roomId}` : `wechaty:${senderId}`,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: isGroup ? "channel" : "direct",
      ConversationLabel: fromLabel,
      SenderName: senderName || undefined,
      SenderId: senderId,
      WasMentioned: isGroup ? effectiveWasMentioned : undefined,
      CommandAuthorized: commandAuthorized,
      Provider: "wechaty",
      Surface: "wechaty",
      MessageSid: messageId,
      MessageSidFull: messageId,
      ReplyToId: undefined, // Wechaty doesn't have native reply threading
      GroupSubject: isGroup ? roomTopic : undefined,
      OriginatingChannel: "wechaty",
      OriginatingTo: isGroup ? `wechaty:room:${roomId}` : `wechaty:${senderId}`,
      Timestamp: timestamp ?? undefined,
    });

    // Record session
    await core.channel.session.recordInboundSession({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
      updateLastRoute: isDirect
        ? {
            sessionKey: route.mainSessionKey,
            channel: "wechaty",
            to: `wechaty:${senderId}`,
            accountId: route.accountId,
          }
        : undefined,
      onRecordError: (err: Error | unknown) => {
        logError(`Wechaty: failed updating session meta: ${String(err)}`);
      },
    });

    statusSink?.({ lastInboundAt: Date.now() });

    const preview = rawBody.slice(0, 200).replace(/\n/g, "\\n");
    log(
      `Wechaty inbound: ${isGroup ? `room=${roomId}` : `dm=${senderId}`} from=${senderName ?? senderId} preview="${preview}"`,
    );

    // Dispatch to agent and deliver reply
    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: config,
      dispatcherOptions: {
        deliver: async (payload: { text?: string; blocks?: unknown[] }) => {
          await deliverWechatyReply({
            payload,
            message,
            account,
            config,
            runtime,
            core,
            statusSink,
          });
        },
        onError: (err: Error | unknown, info: { kind: string }) => {
          logError(`[${account.accountId}] Wechaty ${info.kind} reply failed: ${String(err)}`);
        },
      },
    });
  } catch (error) {
    logError(`Wechaty: message handling failed: ${String(error)}`);
    if (error instanceof Error && error.stack) {
      logError(`Stack trace: ${error.stack}`);
    }
  }
}

/**
 * Deliver reply to Wechaty
 */
async function deliverWechatyReply(params: {
  payload: { text?: string; blocks?: unknown[] };
  message: Message;
  account: ResolvedWechatyAccount;
  config: CoreConfig;
  runtime: { log?: (message: string) => void; error?: (message: string) => void };
  core: ReturnType<typeof getWechatyRuntime>;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { payload, message, account, runtime, statusSink } = params;
  const logError = runtime.error ?? console.error;

  try {
    const text = payload.text?.trim();
    if (!text) return;

    const from = message.talker();
    const room = message.room();

    // Send to room if it's a group message, otherwise DM
    const targetId = room ? room.id : from.id;

    await sendMessageWechaty(targetId, text, { accountId: account.accountId });

    statusSink?.({ lastOutboundAt: Date.now() });
  } catch (error) {
    logError(`Wechaty: reply delivery failed: ${String(error)}`);
  }
}

export async function monitorWechatyProvider(opts: MonitorWechatyOpts): Promise<void> {
  const { config, runtime, abortSignal, statusSink } = opts;
  const log = runtime?.log ?? console.log;
  const logError = runtime?.error ?? console.error;

  if (!config) {
    throw new Error("Config is required for Wechaty monitor");
  }

  // Resolve account
  const account = resolveWechatyAccount({
    cfg: config,
    accountId: opts.accountId,
  });

  if (!account.enabled) {
    log(`Wechaty account "${account.accountId}" is disabled`);
    return;
  }

  if (!account.configured) {
    throw new Error(`Wechaty account "${account.accountId}" is not configured`);
  }

  log(`Starting Wechaty bot for account: ${account.accountId}`);
  log(`Puppet: ${account.puppet}`);

  let bot: Wechaty | null = null;
  let currentUser: Contact | null = null;

  try {
    bot = createWechatyBot({
      name: `clawdbot-${account.accountId}`,
      puppet: account.puppet,
      puppetOptions: account.puppetOptions,
      runtime: { log, error: logError },

      onLogin: async (user) => {
        currentUser = user;
        setActiveWechatyBot(account.accountId, bot!);
        log(`Wechaty ready for account: ${account.accountId}`);
      },

      onLogout: async () => {
        currentUser = null;
        clearActiveWechatyBot(account.accountId);
      },

      onMessage: async (message: Message) => {
        try {
          // Skip self messages
          if (message.self()) {
            return;
          }

          // Get message details
          const from = message.talker();
          const room = message.room();
          const text = message.text();
          const messageType = convertMessageType(message.type());

          // Check if bot is mentioned in group
          let mentionSelf = false;
          if (room && currentUser) {
           mentionSelf = (await message.mentionSelf());
           const isMentionAll = await message.isMentionAll()
            if(isMentionAll) {
              mentionSelf = false
            }
          }

          // Build context
          const context: WechatyMessageContext = {
            channelId: "wechaty",
            accountId: account.accountId,
            messageId: message.id,
            senderId: from.id,
            senderName: from.name(),
            text: text || undefined,
            messageType,
            chatType: room ? "group" : "direct",
            roomId: room?.id,
            roomTopic: room ? await room.topic() : undefined,
            mentionSelf,
            timestamp: message.date().getTime(),
          };

          // Check if should process
          const processCheck = await shouldProcessMessage(context, account, config, log);

          if (!processCheck.allowed) {
            // If pairing code was generated, send pairing notification
            if (processCheck.pairingCode) {
              try {
                await sendMessageWechaty(
                  from.id,
                  [
                    "Clawdbot: access not configured.",
                    "",
                    `Pairing code: ${processCheck.pairingCode}`,
                    "",
                    "Ask the bot owner to approve with:",
                    `clawdbot pairing approve wechaty ${processCheck.pairingCode}`,
                  ].join("\n"),
                );
              } catch (err) {
                log(`Wechaty: pairing notification failed for ${from.id}: ${String(err)}`);
              }
            }
            return;
          }

          // Route to agent and handle message
          await handleWechatyMessage({
            message,
            context,
            account,
            config,
            runtime: { log, error: logError },
            statusSink,
          });
        } catch (error) {
          logError(`Error processing message: ${String(error)}`);
        }
      },

      onFriendship: async (friendship: Friendship) => {
        try {
          // Auto-accept friend requests if enabled
          if (account.config.autoAcceptFriend) {
            const friendshipType = friendship.type();
            // Type 2 is receive (incoming friend request)
            if (friendshipType === 2) {
              await friendship.accept();
              const contact = friendship.contact();
              log(`Auto-accepted friend request from: ${contact.name()} (${contact.id})`);
            }
          }
        } catch (error) {
          logError(`Error handling friendship: ${String(error)}`);
        }
      },

      onError: async (error) => {
        logError(`Wechaty bot error: ${error.message}`);
      },
    });

    // Start the bot
    await startWechatyBot(bot);
    log(`Wechaty bot started for account: ${account.accountId}`);

    // Wait for abort signal
    if (abortSignal) {
      await new Promise<void>((resolve) => {
        const onAbort = () => {
          log(`Stopping Wechaty bot for account: ${account.accountId}`);
          resolve();
        };
        abortSignal.addEventListener("abort", onAbort, { once: true });
      });
    } else {
      // Keep running indefinitely
      await new Promise<void>(() => {
        // Never resolves
      });
    }
  } finally {
    if (bot) {
      clearActiveWechatyBot(account.accountId);
      await stopWechatyBot(bot);
      log(`Wechaty bot stopped for account: ${account.accountId}`);
    }
  }
}
