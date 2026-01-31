# openclaw-wechaty

Wechaty channel plugin for [Clawdbot](https://github.com/openclaw/openclaw).

## Installation

```bash
openclaw plugins install @openclaw-channel/wechaty
```


Or install via npm:

```bash
npm install @openclaw-channel/wechaty
```

#### Required Permissions

| Permission | Scope | Description |
|------------|-------|-------------|
| `contact:user.base:readonly` | User info | Get basic user information |
| `im:message` | Messaging | Send and receive messages |
| `im:message.p2p_msg:readonly` | DM | Read direct messages to bot |
| `im:message.group_at_msg:readonly` | Group | Receive @mention messages in groups |
| `im:message:send_as_bot` | Send | Send messages as the bot |
| `im:resource` | Media | Upload and download images/files |

#### Optional Permissions

| Permission | Scope | Description |
|------------|-------|-------------|
| `im:message.group_msg` | Group | Read all group messages (sensitive) |
| `im:message:readonly` | Read | Get message history |
| `im:message:update` | Edit | Update/edit sent messages |
| `im:message:recall` | Recall | Recall sent messages |
| `im:message.reactions:read` | Reactions | View message reactions |

#### Event Subscriptions ⚠️

> **This is the most commonly missed configuration!** If the bot can send messages but cannot receive them, check this section.

In the Feishu Open Platform console, go to **Events & Callbacks**:

1. **Event configuration**: Select **Long connection** (recommended)
2. **Add event subscriptions**:

| Event | Description |
|-------|-------------|
| `im.message.receive_v1` | Receive messages (required) |
| `im.message.message_read_v1` | Message read receipts |
| `im.chat.member.bot.added_v1` | Bot added to group |
| `im.chat.member.bot.deleted_v1` | Bot removed from group |

3. Ensure the event permissions are approved

```bash
clawdbot config set channels.wechaty.puppet "wechaty-puppet-feishu"
clawdbot config set channels.wechaty.appId "cli_xxxxx"
clawdbot config set channels.wechaty.appSecret "your_app_secret"
clawdbot config set channels.wechaty.enabled true
```

## Configuration Options

```yaml
channels:
  wechaty:
    enabled: true
    puppeet: "wechaty-puppet-feishu"
    appId: "cli_xxxxx"
    appSecret: "secret"
    # Domain: "feishu" (China) or "lark" (International)
    domain: "feishu"
    dmPolicy: "pairing"
    # Group policy: "open" | "allowlist" | "disabled"
    groupPolicy: "allowlist"
    # Require @mention in groups
    requireMention: true
```

```json
"channels" : {
  "wechaty": {
      "puppet": "wechaty-puppet-feishu",
      "enabled": true,
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist",
      "puppetOptions": {
        "appId": "cli_xxxx",
        "appSecret": "ed0xxxxxxxx"
      },
      "autoAcceptFriend": true
    }
}
```

## Features

- WebSocket connection modes
- Direct messages and group chats
- Message replies and quoted message context
- **Media support**: Images, videos, audio, and files (send and receive)
- Automatic media download and storage
- Typing indicator (via emoji reactions)
- Pairing flow for DM approval
- User and group directory lookup

## Media Support

Fully integrated media handling following Clawdbot best practices:

**Supported Media Types**:
- Images (type 3): JPG, PNG, GIF, WebP, etc.
- Voice/Audio (type 4): Voice messages, audio files
- Video (type 6): MP4, MOV, AVI
- Files (type 15): Documents, PDFs, etc.

**Receiving Media**:
- Automatically downloads media from incoming messages
- Uses Clawdbot's `core.channel.media.saveMediaBuffer()` for storage
- MIME type detection via `core.media.detectMime()`
- Media paths included in context as `MediaPath`, `MediaUrl`, `MediaType` etc.

**Sending Media**:
- Send from URLs: `mediaUrl: "https://example.com/image.jpg"`
- Send from local paths: `mediaUrl: "/path/to/file.pdf"` (supports `~` expansion)
- Send from buffers: `mediaBuffer: Buffer.from(...)`
- Automatic fallback to URL link if send fails

**Configuration**:
```yaml
channels:
  wechaty:
    mediaMaxMb: 30  # Max media file size in MB (default: 30)
```

## License

MIT