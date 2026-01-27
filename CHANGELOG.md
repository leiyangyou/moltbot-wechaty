# Changelog

All notable changes to the Wechaty channel plugin will be documented in this file.

## [Unreleased] - 2026-01-27

### Fixed

- **Directory and Target Resolution**: Updated directory and target resolution to match SDK interfaces
  - **BREAKING**: Changed `listWechatyDirectoryPeersLive` and `listWechatyDirectoryGroupsLive` signatures
    - Now accept `{ cfg, query?, limit? }` parameters instead of `{ accountId? }`
    - Return `ChannelDirectoryEntry[]` with standard `{ kind: "user" | "group", id, name?, handle? }` structure
    - Removed custom `WechatyDirectoryPeer` and `WechatyDirectoryGroup` types
    - Added query filtering support (matches name, alias, ID for contacts; matches topic, ID for rooms)
    - Added limit support (default 100)
    - Removed console.error logging in production code
  - **BREAKING**: Changed `resolveWechatyTargets` signature to match SDK pattern
    - Now accepts `{ cfg, inputs: string[], kind: ChannelResolveKind, runtime?: RuntimeEnv }` instead of `{ accountId?, query? }`
    - Returns `ChannelResolveResult[]` with standard `{ input, resolved, id?, name?, note? }` structure
    - Supports batch resolution of multiple inputs
    - Uses `runtime?.error` for error logging instead of console.error
    - Implements best-match logic (exact match on name/handle/ID, otherwise first match)
  - Aligned with Matrix, Telegram, and other mature channel plugins

- **Outbound Adapter Interface**: Completely refactored outbound adapter to match SDK standard
  - **BREAKING**: Replaced simple `sendMessage`/`reactMessage` with full ChannelOutboundAdapter interface
  - Added `deliveryMode: "direct"` for direct message delivery
  - Added `chunker` function using runtime text chunking utilities
  - Added `chunkerMode: "markdown"` for proper markdown text chunking
  - Added `textChunkLimit: 4000` to match Wechaty message size limits
  - **BREAKING**: Replaced `sendMessage` with separate `sendText` and `sendMedia` methods
    - `sendText` accepts `{ to, text, deps, replyToId, threadId }` and returns `{ channel, messageId }`
    - `sendMedia` accepts `{ to, text, mediaUrl, deps, replyToId, threadId }` and returns `{ channel, messageId }`
  - Added `sendPoll` method (throws error as Wechaty doesn't support polls yet)
  - Removed `reactMessage` (reactions not supported by Wechaty)
  - Now properly integrates with Clawdbot's text chunking and message dispatch pipeline

- **Group Mentions Interface Alignment**: Fixed `resolveWechatyGroupRequireMention` to match SDK interface
  - **BREAKING**: Changed function signature from custom `{ cfg, account }` to standard `ChannelGroupContext`
  - Now accepts `ChannelGroupContext` parameter like other channel plugins (Matrix, Telegram, etc.)
  - Properly extracts and normalizes group IDs with `wechaty:` and `room:` prefix handling
  - Falls back to channel-level and default `groupRequireMention` settings
  - Updated `resolveWechatyGroupToolPolicy` to return `GroupToolPolicyConfig | undefined` (standard SDK type)
  - Removed debug console.log statement
  - Aligns with how Matrix and other mature plugins handle group mention requirements

- **Code Cleanup**: Removed diagnostic logging from production code
  - Removed verbose step-by-step logging in `handleWechatyMessage()`
  - Kept essential error logging with stack traces for debugging
  - Cleaner, production-ready code

- **Type Safety and Configuration**: Fixed TypeScript compilation errors and type definitions
  - Enhanced `CoreConfig` type to include `session`, `messages`, and other core config properties
  - Added `enabled` field to DM configuration for disabling DM handling
  - Added `disabled` as valid policy option for DM config
  - Fixed all implicit `any` type errors in callback functions
  - Added proper type annotations for `onRecordError`, `deliver`, and `onError` callbacks
  - All TypeScript compilation errors resolved

- **Message Processing Integration**: Completely rewrote message handling to integrate with Clawdbot's agent routing system
  - **BREAKING**: Removed unused `setWechatyMessageHandler()` and `messageHandler` pattern
  - Created `handleWechatyMessage()` function with full agent routing integration
  - Integrated `core.channel.routing.resolveAgentRoute()` for proper agent selection
  - Added `core.channel.session.resolveStorePath()` for session management
  - Added `core.channel.reply.formatAgentEnvelope()` for message envelope formatting
  - Added `core.channel.reply.finalizeInboundContext()` for context standardization
  - Added `core.channel.session.recordInboundSession()` for session tracking
  - Added `core.channel.reply.dispatchReplyWithBufferedBlockDispatcher()` for agent dispatch
  - Created `deliverWechatyReply()` function for sending agent responses back to Wechaty
  - Messages now flow through complete Clawdbot pipeline: receive → route → process → reply
  - Added `statusSink` support for tracking inbound/outbound message timestamps

- **Session and Context Management**: Full integration with Clawdbot's session system
  - Sessions are now properly created and tracked across conversations
  - Context payloads include all required fields (Provider, Surface, ChatType, etc.)
  - Session keys properly resolve based on chat type (DM vs group)
  - Message history and timestamps are tracked correctly
  - Supports `updateLastRoute` for DM conversations

- **Command Authorization**: Added proper command authorization for group chats
  - Commands from unauthorized users are blocked in groups
  - Uses `core.channel.commands.isCommandAuthorized()` for validation
  - Mention gating with bypass support via `resolveMentionGatingWithBypass()`

- **Reply Delivery**: Implemented complete reply pipeline
  - Replies are sent to the correct target (room for groups, user for DMs)
  - Text is properly extracted from agent payload
  - Supports buffered block dispatcher for streaming/chunked responses
  - Error handling with detailed logging for delivery failures
  - Tracks outbound message timestamps via statusSink

- **Policy Enforcement and Allowlist Matching**: Completely refactored message filtering to align with project standards
  - Replaced simple string matching with robust allowlist resolution (`resolveWechatyAllowListMatch()`)
  - Added support for multiple match types: wildcard (`*`), direct ID, and display name matching
  - Implemented pairing store integration - merges config `allowFrom` with runtime pairing approvals
  - Added automatic pairing request generation with notification messages for DM policy
  - Enhanced group filtering with wildcard support and room topic/name matching (`resolveWechatyGroupConfig()`)
  - Added `groupAllowFrom` support for user-level filtering within groups
  - Improved DM enabled check - now respects `dm.enabled` configuration

- **Logging and Observability**: Enhanced diagnostic logging throughout message processing
  - Added detailed verbose logging for all policy decisions (allow/deny with reasoning)
  - Logs include match metadata showing which allowlist entry matched and match type
  - Added inbound message preview logging (first 200 chars)
  - All logs follow consistent format: `Wechaty: <action> <context> (<metadata>)`

- **Pairing Flow**: Implemented complete pairing request workflow
  - Generates pairing codes via `channel.pairing.upsertPairingRequest()`
  - Sends formatted pairing notification to users with approval instructions
  - Prevents duplicate pairing messages for existing requests
  - Pairing notifications include proper command syntax for approval

- **Group Policy Improvements**: Enhanced group message filtering logic
  - Now uses `channels.defaults.groupPolicy` as fallback when channel-specific policy not set
  - Wildcard (`*`) support in group allowlists for "allow all groups" mode
  - Room matching supports both room IDs and room topics/names
  - Separate handling for room-level and user-level filtering in groups

- **Status Adapter Implementation**: Fixed plugin registration and runtime status tracking by implementing missing status adapter methods
  - Added `defaultRuntime` configuration with proper initial state (accountId, running, timestamps, error tracking)
  - Added `collectStatusIssues()` to surface configuration and state issues in status output
  - Added `buildChannelSummary()` to construct channel-level status summaries
  - Renamed `probe()` to `probeAccount()` and fixed parameter types to match SDK interface
  - Added `buildAccountSnapshot()` to construct complete account state snapshots for status tracking

- **Setup Adapter Implementation**: Plugin now supports CLI-based configuration and onboarding
  - Added `resolveAccountId()` for account ID normalization
  - Added `applyAccountName()` to apply account names to config section
  - Added `validateInput()` to validate setup inputs (ensures puppet field is provided)
  - Added `applyAccountConfig()` to write configuration to config file with proper account handling

- **Gateway Context**: Fixed gateway startup integration
  - Updated `startAccount()` parameter type from generic object to `ChannelGatewayContext<ResolvedWechatyAccount>`
  - Added proper logging integration via gateway context
  - Fixed account information propagation to monitor provider

- **Type Safety**: Added missing type imports from plugin SDK
  - `ChannelAccountSnapshot` - for runtime state tracking
  - `ChannelGatewayContext` - for gateway lifecycle methods
  - `ChannelStatusIssue` - for status issue reporting
  - `migrateBaseNameToDefaultAccount` - for account config migration
  - `resolveMentionGatingWithBypass` - for mention detection with bypass support

### Technical Notes

- **Architecture**: Message flow now follows standard Clawdbot pattern
  - Inbound: Wechaty → shouldProcessMessage → handleWechatyMessage → resolveAgentRoute → dispatchReplyWithBufferedBlockDispatcher → Agent
  - Outbound: Agent → deliver callback → deliverWechatyReply → sendMessageWechaty → Wechaty
- Monitor implementation follows patterns from mature plugins (Matrix, Telegram, Discord, GoogleChat)
- Allowlist resolution aligns with SDK `AllowlistMatch<T>` type pattern
- Message filtering uses async/await for pairing store access
- Configuration merging supports both static config and dynamic pairing approvals
- Plugin now conforms to the standard ChannelPlugin interface as defined in `src/channels/plugins/types.plugin.ts`
- All changes passed TypeScript type checking and build validation
- Status tracking now integrates properly with Clawdbot's gateway status system
- Messages are no longer dropped silently - they're fully processed through the agent pipeline

## [2026.1.25] - 2026-01-26

### Added

- Initial release of Wechaty channel plugin
- Support for two puppet providers:
  - **Feishu** - Direct integration with Feishu/Lark platform
  - **Bot Service** - Cloud service for WeChat and other platforms
- Direct message (DM) support with three security policies:
  - Pairing mode (require approval)
  - Allowlist mode (predefined users)
  - Open mode (anyone)
- Group chat support with mention detection
- Configurable group policies (allowlist, open, disabled)
- Media message support (images, videos, audio, files)
- Auto-accept friend requests (optional)
- Multi-account support
- Contact and group directory listing
- QR code login flow (for Juzi Bot Service)
- Credential-based authentication (for Feishu)
- Message routing and filtering
- CLI onboarding wizard
- Status probe and health checks
- Comprehensive documentation

### Technical Details

- Built as a Clawdbot channel plugin using the plugin SDK
- Event-driven architecture with Wechaty bot lifecycle management
- Robust error handling and logging
- Type-safe configuration with TypeBox schema validation
- Follows Clawdbot plugin patterns (similar to Matrix, BlueBubbles)
- Puppet-specific credential handling (appId/appSecret for Feishu, token for Juzi)

### Known Limitations

- Reactions not supported (Wechaty limitation)
- Threading not supported (Wechaty limitation)
- Feishu requires app registration in Feishu Open Platform

### Resources

- [Wechaty Documentation](https://wechaty.js.org/)
- [Puppet Providers](https://wechaty.js.org/docs/puppet-providers/)
- [Clawdbot Documentation](https://docs.clawd.bot)
