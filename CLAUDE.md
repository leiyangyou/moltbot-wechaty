# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Wechaty channel plugin for Clawdbot** (also known as Openclaw), enabling multi-platform instant messaging support through Wechaty's puppet system. The plugin acts as a bridge between Clawdbot's agent system and various IM platforms (Feishu/Lark, Matrix, WeChat Official Account, etc.).

**Key Architecture Concepts:**
- **Plugin Pattern**: Implements Clawdbot's `ChannelPlugin` interface to extend the bot framework
- **Puppet System**: Uses Wechaty's puppet architecture to support multiple IM platforms through swappable puppet implementations
- **Runtime Injection**: The plugin receives a Clawdbot runtime object at registration, which is stored globally for access throughout the codebase
- **Account-based**: Supports multiple accounts per channel with separate configurations and bot instances

## Commands

### Development
```bash
# Run test bot with specific puppet configuration
npm run start:test

# Run with ts-node directly (for custom configurations)
node --loader ts-node/esm example/bot-test.ts
```

### Testing
No formal test suite is currently defined. Manual testing is done via `npm run start:test`.

## Architecture

### Entry Point and Registration Flow

1. **index.ts**: Plugin registration entry point
   - Exports the plugin object with `id`, `name`, `description`, `configSchema`, and `register` function
   - The `register` function receives `ClawdbotPluginApi` and calls `setWechatyRuntime()` to store it globally
   - Registers the channel plugin via `api.registerChannel({ plugin: wechatyPlugin })`

2. **src/runtime.ts**: Global runtime storage
   - Stores and retrieves the Clawdbot runtime API reference
   - Used throughout the codebase to access Clawdbot services (pairing, session, routing, etc.)

### Core Channel Implementation

**src/channel.ts** - Main plugin definition implementing `ChannelPlugin<ResolvedWechatyAccount>`:
- **Configuration Schema**: Uses Zod schema from `config-schema.ts` with multi-account support
- **Security Policies**: DM policies (`open`, `pairing`, `allowlist`) and group policies (`open`, `allowlist`, `disabled`)
- **Pairing System**: Implements pairing flow for DM approval with code generation
- **Directory Services**: User and group lookup via `directory-live.ts`
- **Gateway**: Bot lifecycle management via `monitorWechatyProvider()`

### Message Flow

**Inbound (src/wechaty/monitor.ts)**:
1. Wechaty bot receives message via event listener (`onMessage`)
2. `shouldProcessMessage()` checks DM/group policies and pairing status
3. **Media Resolution**: For media messages (image, video, audio, file), `resolveWechatyMediaList()` is called
   - Downloads media from message using `message.toFileBox()`
   - Saves to temp directory
   - Uses `core.media.detectMime()` to detect MIME type
   - Uses `core.channel.media.saveMediaBuffer()` to save to disk (same pattern as Feishu)
   - Returns `WechatyMediaInfo[]` with path, contentType, placeholder
4. `buildWechatyMediaPayload()` constructs media payload with MediaPath, MediaUrl, MediaType etc.
5. Context is built with sender info, message type, room details, and mention detection
6. Message is routed to appropriate agent via `core.channel.routing.resolveAgentRoute()`
7. Envelope formatting applied via `core.channel.reply.formatAgentEnvelope()`
8. Media payload spread into context via `...mediaPayload` in `finalizeInboundContext()`
9. Session is recorded and message dispatched to agent
10. Agent response is delivered via `deliverWechatyReply()`

**Outbound (src/outbound.ts, src/wechaty/send.ts)**:
1. Clawdbot calls `sendText` or `sendMedia` from outbound adapter
2. For `sendMedia`, text is sent first if provided
3. Media is prepared using `prepareWechatyMedia()` which handles:
   - Remote URLs: fetches and converts to buffer
   - Local paths: reads file (supports `~` and `file://`)
   - Buffers: direct use
4. Creates FileBox from buffer
5. Message is sent via `sendMessageWechaty(target, text, opts)` with optional `mediaUrl` or `mediaBuffer`
6. Target is parsed to determine if it's a room (contains `@chatroom` or `oc_`) or contact
7. Bot instance is retrieved from `activeBots` map by accountId
8. Recipient lookup via `bot.Room.find()` or `bot.Contact.find()`
9. Text message sent via `recipient.say(content)`
10. Media sent via `recipient.say(fileBox)` using FileBox
11. Fallback to URL link if media upload fails

### Bot Lifecycle

**src/wechaty/bot.ts** - Bot factory:
- `createWechatyBot(opts)`: Creates a Wechaty bot with puppet configuration
- Handles different puppet types (Feishu, Matrix, Official Account, Puppet Service)
- Sets up event listeners: `scan`, `login`, `logout`, `message`, `friendship`, `room-join`, `error`
- QR code login support via `qrcode-terminal`

**src/wechaty/monitor.ts** - Bot monitoring:
- `monitorWechatyProvider()`: Main entry point for starting and managing a bot instance
- Resolves account configuration and creates bot
- Registers bot in `activeBots` map on login
- Processes incoming messages and handles pairing flow
- Auto-accepts friend requests if `autoAcceptFriend` is enabled
- Listens for abort signal to gracefully stop bot

### Configuration Structure

Configuration lives under `channels.wechaty` in Clawdbot config:

```typescript
channels:
  wechaty:
    enabled: boolean
    name?: string
    puppet: string  // e.g., "wechaty-puppet-feishu", "@juzi/wechaty-puppet-service"
    puppetOptions?: {
      // Feishu
      appId?: string
      appSecret?: string
      domain?: "feishu" | "lark"
      // Puppet Service
      token?: string
      authority?: string
      tls?: { disable: boolean }
    }
    dm?: {
      policy: "open" | "pairing" | "allowlist" | "disabled"
      allowFrom?: Array<string | number>
    }
    groupPolicy: "open" | "allowlist" | "disabled"
    groups?: string[]  // Group allowlist (IDs or names)
    groupAllowFrom?: Array<string | number>  // User allowlist within groups
    groupRequireMention?: boolean  // Default: true
    autoAcceptFriend?: boolean
    replyToMode: "off" | "all" | "direct"
    accounts?: {
      [accountId]: {
        // Same fields as top level
      }
    }
```

**Multi-Account Support**: Top-level config serves as the default account. Additional accounts defined in `accounts` object.

### Key Files

- **src/actions.ts**: Message action adapter (currently no actions supported)
- **src/config-schema.ts**: Zod schema for configuration validation
- **src/directory-live.ts**: Directory lookup for users and groups
- **src/group-mentions.ts**: Group mention detection and policy resolution
- **src/onboarding.ts**: Plugin onboarding adapter
- **src/resolve-targets.ts**: Target resolution for sending messages
- **src/types.ts**: TypeScript type definitions
- **src/wechaty/accounts.ts**: Account configuration resolution
- **src/wechaty/format.ts**: Message formatting utilities
- **src/wechaty/probe.ts**: Connection health check
- **src/wechaty/media.ts**: Media file handling (download, upload, prepare)
  - `resolveWechatyMediaList()`: Downloads media from incoming messages, uses core.channel.media.saveMediaBuffer()
  - `buildWechatyMediaPayload()`: Builds media payload with MediaPath, MediaUrl, MediaType fields
  - `prepareWechatyMedia()`: Prepares media from URL/path/buffer for sending, creates FileBox

## Important Implementation Details

### Message Type Conversion
Wechaty message types are converted to internal types in `convertMessageType()` in monitor.ts:
- 1 → text, 3 → image, 4 → voice, 6 → video, 8 → audio, 15 → file, 17 → url, 18 → location, 19 → contact

### Media File Handling

**Pattern follows Feishu plugin best practices:**

**Receiving Media**:
1. Media message types detected: 3 (image), 4 (voice/audio), 6 (video), 15 (file)
2. `resolveWechatyMediaList()` called for media messages:
   - Gets FileBox from `message.toFileBox()`
   - Saves to temp directory first
   - Reads buffer from temp file
   - Uses `core.media.detectMime({ buffer })` to detect MIME type
   - Uses `core.channel.media.saveMediaBuffer()` to save to permanent storage
   - Returns `WechatyMediaInfo[]` with path, contentType, placeholder
3. `buildWechatyMediaPayload()` constructs payload with:
   - `MediaPath`: first media file path
   - `MediaUrl`: same as MediaPath (local file path)
   - `MediaType`: MIME type of first media
   - `MediaPaths`: array of all media paths (for multiple media)
   - `MediaUrls`: same as MediaPaths
   - `MediaTypes`: array of all MIME types
4. Media payload spread into context via `...mediaPayload`
5. Placeholder text: `<media:image>`, `<media:audio>`, `<media:video>`, `<media:document>`

**Sending Media**:
1. `prepareWechatyMedia()` handles three input types:
   - Remote URLs: fetches with `fetch()` and converts to buffer
   - Local paths: reads file (supports `~` home expansion and `file://` protocol)
   - Buffers: direct use
2. Creates FileBox from buffer using `FileBox.fromBuffer()`
3. FileBox sent via `recipient.say(fileBox)`
4. If sending fails, falls back to sending URL as text: `📎 [url]`

**Key Differences from Initial Implementation**:
- Uses Clawdbot's built-in `core.channel.media.saveMediaBuffer()` instead of custom storage
- Uses `core.media.detectMime()` for MIME detection instead of manual mapping
- Follows the same payload structure as Feishu (MediaPath, MediaUrl, MediaType, etc.)
- Temp files are cleaned up after copying to permanent storage
- Supports multiple media files in future (array fields)

### Configuration
- `channels.wechaty.mediaMaxMb`: Max media file size in MB (default: 30MB)

### Target ID Patterns
- **Rooms**: Contains `@chatroom` or `oc_` (Feishu room prefix)
- **Contacts**: WeChat IDs start with `wxid_` or `weixin`, or contain `@`
- **Target normalization**: Strips `wechaty:` prefix and trims

### Active Bot Management
Bots are stored in a Map keyed by accountId in `src/wechaty/send.ts`:
- `setActiveWechatyBot()`: Called on login
- `getActiveWechatyBot()`: Retrieves bot for sending (defaults to first bot if accountId is "default")
- `clearActiveWechatyBot()`: Called on logout

### Pairing Flow
1. Unauthorized DM arrives with `policy: "pairing"`
2. `upsertPairingRequest()` creates pairing request and generates code
3. User receives pairing notification with code
4. Admin approves via `clawdbot pairing approve wechaty <code>`
5. User added to allowFrom store, future messages allowed

### Mention Detection
In group messages, `message.mentionSelf()` checks if bot was @mentioned. Special handling for `@all` mentions (treated as not mentioning the bot specifically) in monitor.ts:527-531.

## Common Pitfalls

1. **Runtime not initialized**: Ensure `setWechatyRuntime()` is called during plugin registration before any code tries to access `getWechatyRuntime()`
2. **Puppet instantiation**: Different puppets require different instantiation patterns (see `createWechatyBot()` in bot.ts)
3. **Target resolution**: Room IDs vs contact IDs have different patterns; always check for `@chatroom` or `oc_` to differentiate
4. **Account resolution**: Top-level config is the default account; separate accounts use the `accounts` object
5. **AbortSignal handling**: Bot monitor waits on abort signal; without it, bot runs indefinitely
6. **Media handling**: Always use `core.channel.media.saveMediaBuffer()` and `core.media.detectMime()` from runtime - don't implement custom storage
7. **FileBox compatibility**: Different puppet implementations may have varying support for FileBox - test thoroughly with your target platform
8. **Temp file cleanup**: Temp files created during media download are automatically cleaned up after copying to permanent storage

## Dependencies

Key external packages:
- `@juzi/wechaty`: Core Wechaty SDK (fork with additional features)
- `@juzi/wechaty-puppet`: Puppet base classes
- `@juzi/wechaty-puppet-service`: Puppet service client
- `wechaty-puppet-feishu`: Feishu/Lark puppet
- `wechaty-puppet-matrix`: Matrix protocol puppet
- `wechaty-puppet-official-account`: WeChat Official Account puppet
- `qrcode-terminal`: QR code display for login
- `zod`: Configuration schema validation
- `clawdbot`: The bot framework (peer dependency)
