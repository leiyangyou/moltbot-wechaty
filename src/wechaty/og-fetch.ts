/**
 * Open Graph metadata fetcher for link cards
 */

export type OGMetadata = {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url?: string;
};

/**
 * Fetches Open Graph metadata from a URL
 * Returns partial metadata - caller should handle missing fields
 */
export async function fetchOGMetadata(url: string): Promise<OGMetadata> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OpenClaw/1.0; +https://openclaw.ai)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[wechaty] OG fetch failed for ${url}: ${response.status}`);
      return {};
    }

    const html = await response.text();
    return parseOGTags(html, url);
  } catch (error) {
    console.warn(`[wechaty] OG fetch error for ${url}:`, error);
    return {};
  }
}

/**
 * Parse Open Graph meta tags from HTML
 */
function parseOGTags(html: string, sourceUrl: string): OGMetadata {
  const metadata: OGMetadata = {};

  // og:title
  const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (titleMatch) {
    metadata.title = decodeHTMLEntities(titleMatch[1]);
  }

  // Fallback to <title> tag
  if (!metadata.title) {
    const fallbackTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (fallbackTitle) {
      metadata.title = decodeHTMLEntities(fallbackTitle[1].trim());
    }
  }

  // og:description
  const descMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  if (descMatch) {
    metadata.description = decodeHTMLEntities(descMatch[1]);
  }

  // Fallback to meta description
  if (!metadata.description) {
    const fallbackDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    if (fallbackDesc) {
      metadata.description = decodeHTMLEntities(fallbackDesc[1]);
    }
  }

  // og:image
  const imageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (imageMatch) {
    metadata.image = resolveUrl(imageMatch[1], sourceUrl);
  }

  // og:site_name
  const siteMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  if (siteMatch) {
    metadata.siteName = decodeHTMLEntities(siteMatch[1]);
  }

  metadata.url = sourceUrl;

  return metadata;
}

/**
 * Decode HTML entities like &amp; &lt; etc.
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Resolve relative URLs to absolute
 */
function resolveUrl(url: string, base: string): string {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}
