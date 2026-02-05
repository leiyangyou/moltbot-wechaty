import { Type, type TLiteral, type TUnion } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import { getActiveWechatyBot } from "../../wechaty/operations/send.js";
import {
  getContactWechaty,
  searchContactByPhoneWechaty,
  searchContactByWeixinWechaty,
  searchContactsByQueryWechaty,
} from "../../wechaty/operations/contact.js";

/** All available operations for this tool */
const ALL_OPERATIONS = ["get", "search", "list_tags", "add_tag", "remove_tag", "delete_tag", "set_alias"] as const;
type OperationType = (typeof ALL_OPERATIONS)[number];

/**
 * Creates the wechaty_contact agent tool for contact operations.
 *
 * Operations:
 * - get: Get contact details by contactId
 * - search: Search contacts by query (name/alias), phone, or weixin ID
 * - list_tags: List all tags or tags for a specific contact
 * - add_tag: Add a contact to a tag (creates tag if needed)
 * - remove_tag: Remove a contact from a tag
 * - delete_tag: Delete a tag entirely
 * - set_alias: Set or clear a contact's alias/remark
 *
 * @param enabledOperations - Optional list of enabled operations. If undefined, all operations are enabled.
 */
export function createWechatyContactTool(enabledOperations?: string[]): ChannelAgentTool {
  const operations = enabledOperations
    ? ALL_OPERATIONS.filter((op) => enabledOperations.includes(op))
    : [...ALL_OPERATIONS];

  if (operations.length === 0) {
    throw new Error("wechaty_contact tool requires at least one enabled operation");
  }

  // Build dynamic operation union type
  const opLiterals = operations.map((op) => Type.Literal(op)) as [TLiteral<string>, ...TLiteral<string>[]];
  const opUnion: TUnion<[TLiteral<string>, ...TLiteral<string>[]]> = Type.Union(opLiterals, {
    description: `The operation to perform: ${operations.join(", ")}`,
  });

  // Build description based on enabled operations
  const opDescriptions: Record<OperationType, string> = {
    get: "'get' (retrieve contact by ID)",
    search: "'search' (find contacts by name/alias, phone, or weixin ID)",
    list_tags: "'list_tags' (list all tags or tags for a contact)",
    add_tag: "'add_tag' (add contact to tag)",
    remove_tag: "'remove_tag' (remove contact from tag)",
    delete_tag: "'delete_tag' (delete tag entirely)",
    set_alias: "'set_alias' (set contact alias/remark)",
  };
  const descParts = operations.map((op) => opDescriptions[op]);
  const description =
    `Manage WeChat contacts. Operations: ${descParts.join(", ")}. ` +
    "Use contactId (wxid_xxx) for contact operations.";

  // Build parameters object - only include params for enabled operations
  const params: Record<string, any> = {
    operation: opUnion,
    accountId: Type.Optional(
      Type.String({
        description: "Account ID if using multi-account setup",
      })
    ),
  };

  // contactId is needed for most operations
  const needsContactId = operations.some((op) =>
    ["get", "list_tags", "add_tag", "remove_tag", "set_alias"].includes(op)
  );
  if (needsContactId) {
    params.contactId = Type.Optional(
      Type.String({
        description:
          "Contact ID (wxid_xxx). Required for: get, add_tag, remove_tag, set_alias. " +
          "Optional for list_tags (omit to list all tags).",
      })
    );
  }

  if (operations.includes("search")) {
    params.query = Type.Optional(
      Type.String({
        description: "Search query for name/alias matching (for 'search' operation)",
      })
    );
    params.phone = Type.Optional(
      Type.String({
        description: "Phone number to search for (for 'search' operation)",
      })
    );
    params.weixin = Type.Optional(
      Type.String({
        description: "Weixin ID to search for (for 'search' operation)",
      })
    );
  }

  // tagId is needed for tag operations
  const needsTagId = operations.some((op) => ["add_tag", "remove_tag", "delete_tag"].includes(op));
  if (needsTagId) {
    params.tagId = Type.Optional(
      Type.String({
        description: "Tag ID or name. Required for: add_tag, remove_tag, delete_tag.",
      })
    );
  }

  if (operations.includes("set_alias")) {
    params.alias = Type.Optional(
      Type.String({
        description:
          "New alias/remark for the contact. Required for set_alias. " +
          "Pass empty string to clear the alias.",
      })
    );
  }

  return {
    label: "Wechaty Contact",
    name: "wechaty_contact",
    description,
    parameters: Type.Object(params),
    execute: async (_toolCallId, args) => {
      const { operation, contactId, query, phone, weixin, tagId, alias, accountId } = args as {
        operation: OperationType;
        contactId?: string;
        query?: string;
        phone?: string;
        weixin?: string;
        tagId?: string;
        alias?: string;
        accountId?: string;
      };

      // Check if operation is enabled
      if (!operations.includes(operation)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Operation '${operation}' is not enabled. Available operations: ${operations.join(", ")}`,
            },
          ],
        };
      }

      // Validate bot availability
      const bot = getActiveWechatyBot(accountId);
      if (!bot) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: accountId
                ? `No active Wechaty bot found for account: ${accountId}`
                : "No active Wechaty bot found",
            },
          ],
        };
      }

      try {
        switch (operation) {
          case "get": {
            if (!contactId?.trim()) {
              return {
                isError: true,
                content: [{ type: "text", text: "contactId is required for 'get' operation" }],
              };
            }

            const contact = await getContactWechaty(contactId.trim(), { bot });
            if (!contact) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({ ok: true, found: false, contactId: contactId.trim() }),
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ ok: true, found: true, contact }),
                },
              ],
            };
          }

          case "search": {
            // Must have at least one search parameter
            if (!query?.trim() && !phone?.trim() && !weixin?.trim()) {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: "At least one search parameter (query, phone, or weixin) is required for 'search' operation",
                  },
                ],
              };
            }

            const results: {
              byPhone?: { contactId: string; found: boolean };
              byWeixin?: { contactId: string; found: boolean };
              byQuery?: Array<{
                id: string;
                name: string;
                alias?: string;
                avatar?: string;
              }>;
            } = {};

            // Search by phone if provided
            if (phone?.trim()) {
              try {
                results.byPhone = await searchContactByPhoneWechaty(phone.trim(), { bot });
              } catch {
                results.byPhone = {
                  contactId: "",
                  found: false,
                };
              }
            }

            // Search by weixin if provided
            if (weixin?.trim()) {
              try {
                results.byWeixin = await searchContactByWeixinWechaty(weixin.trim(), { bot });
              } catch {
                results.byWeixin = {
                  contactId: "",
                  found: false,
                };
              }
            }

            // Search by query (name/alias) if provided
            if (query?.trim()) {
              try {
                const matches = await searchContactsByQueryWechaty(query.trim(), { bot });
                results.byQuery = matches.map((c) => ({
                  id: c.id,
                  name: c.name,
                  alias: c.alias,
                  avatar: c.avatar,
                }));
              } catch {
                results.byQuery = [];
              }
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ ok: true, results }),
                },
              ],
            };
          }

          case "list_tags": {
            // List tags for a contact or all tags
            const tags = contactId
              ? await bot.puppet.tagContactList(contactId.trim())
              : await bot.puppet.tagContactList();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    operation: "list_tags",
                    contactId: contactId?.trim() ?? null,
                    tags,
                  }),
                },
              ],
            };
          }

          case "add_tag": {
            if (!tagId?.trim()) {
              return {
                isError: true,
                content: [{ type: "text", text: "tagId is required for add_tag" }],
              };
            }
            if (!contactId?.trim()) {
              return {
                isError: true,
                content: [{ type: "text", text: "contactId is required for add_tag" }],
              };
            }
            await bot.puppet.tagContactAdd(tagId.trim(), contactId.trim());
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    operation: "add_tag",
                    tagId: tagId.trim(),
                    contactId: contactId.trim(),
                  }),
                },
              ],
            };
          }

          case "remove_tag": {
            if (!tagId?.trim()) {
              return {
                isError: true,
                content: [{ type: "text", text: "tagId is required for remove_tag" }],
              };
            }
            if (!contactId?.trim()) {
              return {
                isError: true,
                content: [{ type: "text", text: "contactId is required for remove_tag" }],
              };
            }
            await bot.puppet.tagContactRemove(tagId.trim(), contactId.trim());
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    operation: "remove_tag",
                    tagId: tagId.trim(),
                    contactId: contactId.trim(),
                  }),
                },
              ],
            };
          }

          case "delete_tag": {
            if (!tagId?.trim()) {
              return {
                isError: true,
                content: [{ type: "text", text: "tagId is required for delete_tag" }],
              };
            }
            await bot.puppet.tagContactDelete(tagId.trim());
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    operation: "delete_tag",
                    tagId: tagId.trim(),
                  }),
                },
              ],
            };
          }

          case "set_alias": {
            if (!contactId?.trim()) {
              return {
                isError: true,
                content: [{ type: "text", text: "contactId is required for set_alias" }],
              };
            }
            if (alias === undefined) {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: "alias is required for set_alias (use empty string to clear)",
                  },
                ],
              };
            }
            // Empty string clears the alias, non-empty sets it
            const newAlias = alias.trim() || null;
            await bot.puppet.contactAlias(contactId.trim(), newAlias);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    operation: "set_alias",
                    contactId: contactId.trim(),
                    alias: newAlias,
                  }),
                },
              ],
            };
          }

          default: {
            return {
              isError: true,
              content: [{ type: "text", text: `Unknown operation: ${operation}` }],
            };
          }
        }
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to execute ${operation}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  };
}
