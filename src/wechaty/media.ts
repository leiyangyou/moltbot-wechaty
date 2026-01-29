import type { Message } from "@juzi/wechaty";
import { FileBox } from "@juzi/file-box";
import fs from "fs";
import path from "path";
import os from "os";
import type { ClawdbotConfig } from "clawdbot/plugin-sdk";
import { getWechatyRuntime } from "../runtime.js";

export type WechatyMediaInfo = {
  path: string;
  contentType?: string;
  placeholder: string;
};

/**
 * Infer placeholder text based on Wechaty message type.
 */
function inferPlaceholder(messageType: number): string {
  switch (messageType) {
    case 3:
      return "<media:image>";
    case 4:
      return "<media:audio>";
    case 6:
      return "<media:video>";
    case 15:
      return "<media:document>";
    default:
      return "<media:file>";
  }
}

/**
 * Download media from a Wechaty message and save to disk using core's saveMediaBuffer.
 * Similar to Feishu's resolveFeishuMediaList().
 */
export async function resolveWechatyMediaList(params: {
  cfg: ClawdbotConfig;
  message: Message;
  maxBytes: number;
  log?: (msg: string) => void;
}): Promise<WechatyMediaInfo[]> {
  const { message, maxBytes, log } = params;
  const messageType = message.type();

  // Only process media message types
  // 3=image, 4=voice/audio, 6=video, 15=file
  const mediaTypes = [3, 4, 6, 15];
  if (!mediaTypes.includes(messageType)) {
    return [];
  }

  const out: WechatyMediaInfo[] = [];
  const core = getWechatyRuntime();

  try {
    // Get FileBox from message
    const fileBox = await message.toFileBox();
    if (!fileBox) {
      log?.(`wechaty: failed to get FileBox from message`);
      return [];
    }

    // Create temp file to save the media
    const tempDir = path.join(os.tmpdir(), "wechaty-media");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const originalName = fileBox.name || `media-${timestamp}`;
    const tempPath = path.join(tempDir, `${timestamp}-${originalName}`);

    // Save FileBox to temp file
    await fileBox.toFile(tempPath);

    // Read buffer from temp file
    const buffer = await fs.promises.readFile(tempPath);

    // Detect mime type
    let contentType = await core.media.detectMime({ buffer });

    // Save to disk using core's saveMediaBuffer
    const saved = await core.channel.media.saveMediaBuffer(
      buffer,
      contentType,
      "inbound",
      maxBytes,
      originalName,
    );

    out.push({
      path: saved.path,
      contentType: saved.contentType,
      placeholder: inferPlaceholder(messageType),
    });

    log?.(`wechaty: downloaded ${inferPlaceholder(messageType)} media, saved to ${saved.path}`);

    // Clean up temp file
    await fs.promises.unlink(tempPath).catch(() => {});
  } catch (err) {
    log?.(`wechaty: failed to download media: ${String(err)}`);
  }

  return out;
}

/**
 * Build media payload for inbound context.
 * Similar to Feishu's buildFeishuMediaPayload().
 */
export function buildWechatyMediaPayload(
  mediaList: WechatyMediaInfo[],
): {
  MediaPath?: string;
  MediaType?: string;
  MediaUrl?: string;
  MediaPaths?: string[];
  MediaUrls?: string[];
  MediaTypes?: string[];
} {
  const first = mediaList[0];
  const mediaPaths = mediaList.map((media) => media.path);
  const mediaTypes = mediaList.map((media) => media.contentType).filter(Boolean) as string[];
  return {
    MediaPath: first?.path,
    MediaType: first?.contentType,
    MediaUrl: first?.path,
    MediaPaths: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaUrls: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
  };
}

/**
 * Check if a string is a local file path (not a URL)
 */
function isLocalPath(urlOrPath: string): boolean {
  // Starts with / or ~ or drive letter (Windows)
  if (urlOrPath.startsWith("/") || urlOrPath.startsWith("~") || /^[a-zA-Z]:/.test(urlOrPath)) {
    return true;
  }
  // Try to parse as URL - if it fails or has no protocol, it's likely a local path
  try {
    const url = new URL(urlOrPath);
    return url.protocol === "file:";
  } catch {
    return true; // Not a valid URL, treat as local path
  }
}

/**
 * Prepare media for sending via Wechaty.
 * Handles URLs, local paths, and buffers.
 */
export async function prepareWechatyMedia(params: {
  mediaUrl?: string;
  mediaBuffer?: Buffer;
  fileName?: string;
}): Promise<{ fileBox: any; fileName: string } | null> {
  const { mediaUrl, mediaBuffer, fileName } = params;

  try {
    let buffer: Buffer;
    let name: string;

    if (mediaBuffer) {
      buffer = mediaBuffer;
      name = fileName ?? `file-${Date.now()}`;
    } else if (mediaUrl) {
      if (isLocalPath(mediaUrl)) {
        // Local file path - read directly
        const filePath = mediaUrl.startsWith("~")
          ? mediaUrl.replace("~", process.env.HOME ?? "")
          : mediaUrl.replace("file://", "");

        if (!fs.existsSync(filePath)) {
          throw new Error(`Local file not found: ${filePath}`);
        }
        buffer = fs.readFileSync(filePath);
        name = fileName ?? path.basename(filePath);
      } else {
        // Remote URL - fetch
        const response = await fetch(mediaUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch media from URL: ${response.status}`);
        }
        buffer = Buffer.from(await response.arrayBuffer());
        name = fileName ?? (path.basename(new URL(mediaUrl).pathname) || `file-${Date.now()}`);
      }
    } else {
      return null;
    }

    // Create FileBox from buffer
    const fileBox = FileBox.fromBuffer(buffer, name);

    return { fileBox, fileName: name };
  } catch (error) {
    console.error(`Error preparing media for Wechaty: ${String(error)}`);
    return null;
  }
}
