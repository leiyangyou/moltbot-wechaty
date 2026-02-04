# Design: forwardMsg Tool for Wechaty Channel

## Summary

Add a `wechaty_forward` agent tool that forwards messages by ID to another contact or room, leveraging WeChatFerry's native `forwardMsg` API.

## Background

- WeChatFerry (WCF) supports native message forwarding via `forwardMsg(id, receiver)`
- The `wechaty-puppet-wcferry` puppet exposes this as `puppet.messageForward(conversationId, messageId)`
- WCF stores messages in SQLite, so historical messages can be forwarded (not limited to LRU cache)
- Agents receive `MessageSid` in their context for each inbound message

## Design Decision: Tool vs Action

**Chosen: Tool (`agentTools`)**

| Approach | Pros | Cons |
|----------|------|------|
| Action | Standard pattern | Requires adding to OpenClaw core's `CHANNEL_MESSAGE_ACTION_NAMES` |
| Tool | Full schema, no core changes, channel-specific | Separate tool name |

Since `forwardMsg` is WCF-specific (not universal across channels), a standalone tool is cleaner.

## Implementation

### 1. Create tool factory in `src/agent-tools/forward.ts`

```typescript
import { Type } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import { getActiveWechatyBot } from "../wechaty/send.js";

export function createWechatyForwardTool(): ChannelAgentTool {
  return {
    label: "Wechaty Forward",
    name: "wechaty_forward",
    description:
      "Forward a message by ID to another contact or room. " +
      "Use the MessageSid from the conversation context. " +
      "Only works with WeChatFerry-based puppets.",
    parameters: Type.Object({
      messageId: Type.String({
        description: "The message ID to forward (from context.MessageSid)",
      }),
      target: Type.String({
        description: "Target contact ID (wxid_xxx) or room ID (xxx@chatroom)",
      }),
      accountId: Type.Optional(
        Type.String({
          description: "Account ID if using multi-account setup",
        })
      ),
    }),
    execute: async (_toolCallId, args) => {
      const { messageId, target, accountId } = args as {
        messageId: string;
        target: string;
        accountId?: string;
      };

      const bot = getActiveWechatyBot(accountId);
      if (!bot) {
        return {
          isError: true,
          content: [{ type: "text", text: "No active Wechaty bot found" }],
        };
      }

      try {
        const result = await bot.puppet.messageForward(target, messageId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: true,
                messageId: result ?? undefined,
                forwarded: { from: messageId, to: target },
              }),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to forward message: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  };
}
```

### 2. Register in `src/channel.ts`

```typescript
import { createWechatyForwardTool } from "./agent-tools/forward.js";

export const wechatyPlugin: ChannelPlugin<ResolvedWechatyAccount> = {
  // ... existing config ...

  agentTools: () => [createWechatyForwardTool()],
};
```

### 3. Export from `src/agent-tools/index.ts`

```typescript
export { createWechatyForwardTool } from "./forward.js";
```

## Agent Usage

The agent receives context like:

```json
{
  "MessageSid": "12345678",
  "senderId": "wxid_user123",
  "text": "Please forward this to support"
}
```

Agent can then call:

```json
{
  "tool": "wechaty_forward",
  "args": {
    "messageId": "12345678",
    "target": "wxid_support_admin"
  }
}
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/agent-tools/forward.ts` | Create - tool implementation |
| `src/agent-tools/index.ts` | Create - exports |
| `src/channel.ts` | Modify - add `agentTools` |

## Limitations

- **WCF-only**: Only works with WeChatFerry puppet (other puppets will fail)
- **Message must exist**: WCF must have the message in its SQLite store
- **No content access**: We forward by ID, not by re-sending content

## Future Considerations

- Add `forwardMsg` to OpenClaw core's action list for cross-channel support
- Add fallback: if native forward fails, try re-sending content (requires caching message content)
