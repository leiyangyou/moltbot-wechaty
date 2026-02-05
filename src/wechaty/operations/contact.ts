import type { Wechaty } from "@juzi/wechaty";
import { getActiveWechatyBot } from "../registry.js";

export type WechatyContactOpts = {
  accountId?: string;
  bot?: Wechaty;
};

function requireBot(opts?: WechatyContactOpts): Wechaty {
  const bot = opts?.bot ?? getActiveWechatyBot(opts?.accountId);
  if (!bot) {
    throw new Error(
      `Wechaty bot not initialized${opts?.accountId ? ` for account: ${opts.accountId}` : ""}`
    );
  }
  return bot;
}

export type ContactPayload = {
  id: string;
  name: string;
  alias?: string;
  avatar?: string;
  gender?: number;
  signature?: string;
  city?: string;
  province?: string;
  friend?: boolean;
  type?: number;
  phone?: string[];
  corporation?: string;
  title?: string;
  coworker?: boolean;
};

/**
 * Get contact details by contactId using puppet's contactRawPayload API.
 */
export async function getContactWechaty(
  contactId: string,
  opts?: WechatyContactOpts
): Promise<ContactPayload | null> {
  const bot = requireBot(opts);
  const puppet = bot.puppet as any;

  if (typeof puppet.contactRawPayload !== "function") {
    throw new Error("Puppet does not support contactRawPayload");
  }

  try {
    const raw = await puppet.contactRawPayload(contactId);
    if (!raw) return null;

    // Map raw payload to ContactPayload
    // Different puppets may have different field names
    return {
      id: raw.id ?? raw.UserName ?? contactId,
      name: raw.name ?? raw.NickName ?? "",
      alias: raw.alias ?? raw.Alias ?? raw.RemarkName ?? undefined,
      avatar: raw.avatar ?? raw.HeadImgUrl ?? raw.bigHeadImgUrl ?? undefined,
      gender: raw.gender ?? raw.Sex ?? undefined,
      signature: raw.signature ?? raw.Signature ?? undefined,
      city: raw.city ?? raw.City ?? undefined,
      province: raw.province ?? raw.Province ?? undefined,
      friend: raw.friend ?? raw.isFriend ?? undefined,
      type: raw.type ?? raw.ContactType ?? undefined,
      phone: raw.phone ?? raw.phones ?? undefined,
      corporation: raw.corporation ?? raw.Corporation ?? undefined,
      title: raw.title ?? raw.Title ?? undefined,
      coworker: raw.coworker ?? raw.isCoworker ?? undefined,
    };
  } catch (error) {
    console.error(`Failed to get contact ${contactId}: ${String(error)}`);
    throw error;
  }
}

export type ContactSearchResult = {
  contactId: string;
  found: boolean;
};

/**
 * Search for a contact by phone number using puppet's friendshipSearchPhone API.
 */
export async function searchContactByPhoneWechaty(
  phone: string,
  opts?: WechatyContactOpts
): Promise<ContactSearchResult> {
  const bot = requireBot(opts);
  const puppet = bot.puppet as any;

  if (typeof puppet.friendshipSearchPhone !== "function") {
    throw new Error("Puppet does not support friendshipSearchPhone");
  }

  try {
    const contactId = await puppet.friendshipSearchPhone(phone);
    return {
      contactId: contactId ?? "",
      found: !!contactId,
    };
  } catch (error) {
    console.error(`Failed to search contact by phone ${phone}: ${String(error)}`);
    throw error;
  }
}

/**
 * Search for a contact by Weixin ID using puppet's friendshipSearchWeixin API.
 */
export async function searchContactByWeixinWechaty(
  weixin: string,
  opts?: WechatyContactOpts
): Promise<ContactSearchResult> {
  const bot = requireBot(opts);
  const puppet = bot.puppet as any;

  if (typeof puppet.friendshipSearchWeixin !== "function") {
    throw new Error("Puppet does not support friendshipSearchWeixin");
  }

  try {
    const contactId = await puppet.friendshipSearchWeixin(weixin);
    return {
      contactId: contactId ?? "",
      found: !!contactId,
    };
  } catch (error) {
    console.error(`Failed to search contact by weixin ${weixin}: ${String(error)}`);
    throw error;
  }
}

/**
 * Search contacts by name/alias query using Wechaty's Contact.findAll API.
 */
export async function searchContactsByQueryWechaty(
  query: string,
  opts?: WechatyContactOpts
): Promise<ContactPayload[]> {
  const bot = requireBot(opts);

  try {
    // Use Wechaty's high-level Contact API for name/alias search
    const contacts = await bot.Contact.findAll();
    const queryLower = query.toLowerCase();

    const matches = contacts.filter((contact) => {
      const name = contact.name()?.toLowerCase() ?? "";
      const alias = contact.payload?.alias?.toLowerCase() ?? "";
      return name.includes(queryLower) || alias.includes(queryLower);
    });

    // Convert to ContactPayload
    return matches.map((contact) => ({
      id: contact.id,
      name: contact.name() ?? "",
      alias: contact.payload?.alias ?? undefined,
      avatar: contact.payload?.avatar ?? undefined,
      gender: contact.payload?.gender ?? undefined,
      friend: contact.payload?.friend ?? undefined,
      type: contact.payload?.type ?? undefined,
    }));
  } catch (error) {
    console.error(`Failed to search contacts by query "${query}": ${String(error)}`);
    throw error;
  }
}
