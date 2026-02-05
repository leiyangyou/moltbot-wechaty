/**
 * Format text for Wechaty messages
 * Wechaty doesn't support markdown natively, so we convert to plain text
 */
export function formatWechatyText(text: string): string {
  // Remove markdown formatting
  let formatted = text;

  // Remove code blocks
  formatted = formatted.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/```(\w+)?\n?/g, "").replace(/```$/g, "");
  });

  // Remove inline code
  formatted = formatted.replace(/`([^`]+)`/g, "$1");

  // Remove bold
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "$1");
  formatted = formatted.replace(/__([^_]+)__/g, "$1");

  // Remove italic
  formatted = formatted.replace(/\*([^*]+)\*/g, "$1");
  formatted = formatted.replace(/_([^_]+)_/g, "$1");

  // Remove strikethrough
  formatted = formatted.replace(/~~([^~]+)~~/g, "$1");

  // Convert links
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

  return formatted;
}

/**
 * Parse Wechaty target format
 */
export function parseWechatyTarget(
  raw: string
): { type: "contact" | "room"; id: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Remove wechaty: prefix if present
  const cleaned = trimmed.replace(/^wechaty:/i, "").trim();

  // Check if it's a room (contains @chatroom)
  if (cleaned.includes("@chatroom") || cleaned.includes("oc_")) {
    return { type: "room", id: cleaned };
  }

  // Otherwise treat as contact
  return { type: "contact", id: cleaned };
}
