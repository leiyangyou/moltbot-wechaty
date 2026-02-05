import type {
  ChannelDirectoryEntry,
  ChannelResolveKind,
  ChannelResolveResult,
  RuntimeEnv,
} from "openclaw/plugin-sdk";

import {
  listWechatyDirectoryGroupsLive,
  listWechatyDirectoryPeersLive,
} from "../../adapters/directory.js";

function pickBestMatch(
  matches: ChannelDirectoryEntry[],
  query: string,
): ChannelDirectoryEntry | undefined {
  if (matches.length === 0) return undefined;
  const normalized = query.trim().toLowerCase();
  if (normalized) {
    const exact = matches.find((match) => {
      const name = match.name?.trim().toLowerCase();
      const handle = match.handle?.trim().toLowerCase();
      const id = match.id.trim().toLowerCase();
      return name === normalized || handle === normalized || id === normalized;
    });
    if (exact) return exact;
  }
  return matches[0];
}

export async function resolveWechatyTargets(params: {
  cfg: unknown;
  inputs: string[];
  kind: ChannelResolveKind;
  runtime?: RuntimeEnv;
}): Promise<ChannelResolveResult[]> {
  const results: ChannelResolveResult[] = [];
  for (const input of params.inputs) {
    const trimmed = input.trim();
    if (!trimmed) {
      results.push({ input, resolved: false, note: "empty input" });
      continue;
    }
    if (params.kind === "user") {
      try {
        const matches = await listWechatyDirectoryPeersLive({
          cfg: params.cfg,
          query: trimmed,
          limit: 5,
        });
        const best = pickBestMatch(matches, trimmed);
        results.push({
          input,
          resolved: Boolean(best?.id),
          id: best?.id,
          name: best?.name,
          note: matches.length > 1 ? "multiple matches; chose first" : undefined,
        });
      } catch (err) {
        params.runtime?.error?.(`wechaty resolve failed: ${String(err)}`);
        results.push({ input, resolved: false, note: "lookup failed" });
      }
      continue;
    }
    try {
      const matches = await listWechatyDirectoryGroupsLive({
        cfg: params.cfg,
        query: trimmed,
        limit: 5,
      });
      const best = pickBestMatch(matches, trimmed);
      results.push({
        input,
        resolved: Boolean(best?.id),
        id: best?.id,
        name: best?.name,
        note: matches.length > 1 ? "multiple matches; chose first" : undefined,
      });
    } catch (err) {
      params.runtime?.error?.(`wechaty resolve failed: ${String(err)}`);
      results.push({ input, resolved: false, note: "lookup failed" });
    }
  }
  return results;
}
