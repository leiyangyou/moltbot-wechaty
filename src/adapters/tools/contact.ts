import { Type } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import { getActiveWechatyBot } from "../../wechaty/operations/send.js";
import {
  getContactWechaty,
  searchContactByPhoneWechaty,
  searchContactByWeixinWechaty,
  searchContactsByQueryWechaty,
} from "../../wechaty/operations/contact.js";

/**
 * Creates the wechaty_contact agent tool for contact operations.
 *
 * Operations:
 * - get: Get contact details by contactId
 * - search: Search contacts by query (name/alias), phone, or weixin ID
 */
export function createWechatyContactTool(): ChannelAgentTool {
  return {
    label: "Wechaty Contact",
    name: "wechaty_contact",
    description:
      "Get contact information or search for contacts. " +
      "Operations: 'get' retrieves contact details by ID, 'search' finds contacts by name/alias, phone, or weixin ID. " +
      "Only works with WeChatFerry-based puppets.",
    parameters: Type.Object({
      operation: Type.Union([Type.Literal("get"), Type.Literal("search")], {
        description: "Operation: 'get' to retrieve contact by ID, 'search' to find contacts",
      }),
      contactId: Type.Optional(
        Type.String({
          description: "Contact ID (wxid_xxx) for 'get' operation",
        })
      ),
      query: Type.Optional(
        Type.String({
          description: "Search query for name/alias matching (for 'search' operation)",
        })
      ),
      phone: Type.Optional(
        Type.String({
          description: "Phone number to search for (for 'search' operation)",
        })
      ),
      weixin: Type.Optional(
        Type.String({
          description: "Weixin ID to search for (for 'search' operation)",
        })
      ),
      accountId: Type.Optional(
        Type.String({
          description: "Account ID if using multi-account setup",
        })
      ),
    }),
    execute: async (_toolCallId, args) => {
      const { operation, contactId, query, phone, weixin, accountId } = args as {
        operation: "get" | "search";
        contactId?: string;
        query?: string;
        phone?: string;
        weixin?: string;
        accountId?: string;
      };

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
        if (operation === "get") {
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

        if (operation === "search") {
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
            } catch (error) {
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
            } catch (error) {
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
            } catch (error) {
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

        return {
          isError: true,
          content: [{ type: "text", text: `Unknown operation: ${operation}` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Contact operation failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  };
}
