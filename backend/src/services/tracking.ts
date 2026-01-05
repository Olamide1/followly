import crypto from 'crypto';
import { pool } from '../database/connection';

/**
 * Sanitize URL for logging - removes query parameters and sensitive data
 * Returns only protocol, domain, and path for security
 */
function sanitizeUrlForLogging(url: string | null | undefined): string {
  if (!url) return '[no url]';
  
  try {
    const urlObj = new URL(url);
    // Return only protocol, hostname, and pathname (no query params, no hash)
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
  } catch {
    // If URL parsing fails, return a hash of the URL instead
    try {
      const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 8);
      return `[url:${hash}]`;
    } catch {
      return '[invalid url]';
    }
  }
}

/**
 * Generate a unique tracking token for an email
 */
export function generateTrackingToken(emailQueueId: number, contactId: number): string {
  const data = `${emailQueueId}:${contactId}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

/**
 * Get the base URL for tracking endpoints (backend API URL)
 */
function getTrackingBaseUrl(): string {
  // In production, use the Heroku app URL or APP_URL env var
  if (process.env.NODE_ENV === 'production') {
    return process.env.APP_URL || process.env.HEROKU_APP_URL || 'https://followly-1a83c23a0be1.herokuapp.com';
  }
  // In development, use localhost
  return process.env.APP_URL || 'http://localhost:3000';
}

/**
 * Generate tracking pixel URL
 */
export function getTrackingPixelUrl(token: string): string {
  const baseUrl = getTrackingBaseUrl();
  return `${baseUrl}/api/tracking/pixel/${token}`;
}

/**
 * Generate click tracking URL
 */
export function getClickTrackingUrl(token: string, originalUrl: string): string {
  const baseUrl = getTrackingBaseUrl();
  const encodedUrl = encodeURIComponent(originalUrl);
  return `${baseUrl}/api/tracking/click/${token}?url=${encodedUrl}`;
}

/**
 * Store tracking token in database for lookup
 */
export async function storeTrackingToken(
  emailQueueId: number,
  contactId: number,
  campaignId: number | null,
  token: string
): Promise<void> {
  await pool.query(
    `INSERT INTO tracking_tokens (email_queue_id, contact_id, campaign_id, token, created_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (token) DO NOTHING`,
    [emailQueueId, contactId, campaignId, token]
  );
}

/**
 * Lookup tracking token and return email info
 */
export async function lookupTrackingToken(token: string): Promise<{
  emailQueueId: number;
  contactId: number;
  campaignId: number | null;
} | null> {
  const result = await pool.query(
    'SELECT email_queue_id, contact_id, campaign_id FROM tracking_tokens WHERE token = $1',
    [token]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    emailQueueId: result.rows[0].email_queue_id,
    contactId: result.rows[0].contact_id,
    campaignId: result.rows[0].campaign_id,
  };
}

/**
 * Record email open event (with deduplication)
 */
export async function recordOpenEvent(
  emailQueueId: number,
  contactId: number,
  campaignId: number | null,
  source: 'webhook' | 'pixel'
): Promise<boolean> {
  // Check if we already have an open event for this email (deduplication)
  const existing = await pool.query(
    `SELECT id FROM email_events 
     WHERE email_queue_id = $1 AND event_type = 'opened'
     LIMIT 1`,
    [emailQueueId]
  );

  if (existing.rows.length > 0) {
    // Update metadata if webhook is more reliable than pixel
    if (source === 'webhook') {
      await pool.query(
        `UPDATE email_events 
         SET metadata = jsonb_build_object('source', 'webhook', 'updated_at', CURRENT_TIMESTAMP)
         WHERE id = $1`,
        [existing.rows[0].id]
      );
    }
    return false; // Already recorded
  }

  // Insert new open event
  await pool.query(
    `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, metadata)
     VALUES ($1, $2, $3, 'opened', jsonb_build_object('source', $4))`,
    [emailQueueId, contactId, campaignId, source]
  );

  console.log(`[Tracking] Successfully inserted open event for emailQueueId: ${emailQueueId}, source: ${source}`);
  return true; // New event recorded
}

/**
 * Record email click event (with deduplication)
 */
export async function recordClickEvent(
  emailQueueId: number,
  contactId: number,
  campaignId: number | null,
  url: string | null,
  source: 'webhook' | 'link'
): Promise<boolean> {
  // Check if we already have a click event for this email+url combination (deduplication)
  const existing = await pool.query(
    `SELECT id FROM email_events 
     WHERE email_queue_id = $1 AND event_type = 'clicked'
     AND (metadata->>'url' = $2 OR $2 IS NULL)
     LIMIT 1`,
    [emailQueueId, url]
  );

  if (existing.rows.length > 0) {
    // Update metadata if webhook is more reliable than link
    if (source === 'webhook') {
      await pool.query(
        `UPDATE email_events 
         SET metadata = jsonb_build_object('source', 'webhook', 'url', $2, 'updated_at', CURRENT_TIMESTAMP)
         WHERE id = $1`,
        [existing.rows[0].id, url]
      );
    }
    return false; // Already recorded
  }

  // Insert new click event
  await pool.query(
    `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, metadata)
     VALUES ($1, $2, $3, 'clicked', jsonb_build_object('source', $4, 'url', $5))`,
    [emailQueueId, contactId, campaignId, source, url]
  );

  console.log(`[Tracking] Successfully inserted click event for emailQueueId: ${emailQueueId}, source: ${source}, url: ${sanitizeUrlForLogging(url)}`);
  return true; // New event recorded
}

/**
 * Add tracking pixel to email HTML
 */
export function addTrackingPixel(htmlContent: string, pixelUrl: string): string {
  // Create 1x1 transparent pixel
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;

  // Try to insert before closing body tag, otherwise append at end
  if (htmlContent.includes('</body>')) {
    return htmlContent.replace('</body>', `${pixel}</body>`);
  }

  return htmlContent + pixel;
}

/**
 * Wrap all links in email HTML with tracking URLs
 */
export function wrapLinksWithTracking(htmlContent: string, token: string): string {
  // Match all href attributes in anchor tags
  // This regex handles various formats: href="url", href='url', href=url
  const linkRegex = /<a\s+([^>]*\s+)?href\s*=\s*["']([^"']+)["']([^>]*)>/gi;

  return htmlContent.replace(linkRegex, (match, before, url, after) => {
    // Skip mailto:, tel:, javascript:, and # links
    if (url.startsWith('mailto:') || 
        url.startsWith('tel:') || 
        url.startsWith('javascript:') || 
        url.startsWith('#') ||
        url.startsWith('{{') || // Skip template variables
        url.includes('/unsubscribe') || // Skip unsubscribe links
        url.includes('/preferences')) {
      return match;
    }

    // Convert relative URLs to absolute if needed
    let absoluteUrl = url;
    if (url.startsWith('/')) {
      // For relative URLs starting with /, we need to determine the appropriate base URL
      // This should typically be the frontend URL, not the backend API URL
      // If it's a relative URL in an email, it's likely meant to be relative to the email domain
      // For now, we'll skip tracking these as they're ambiguous
      // Most email links should be absolute URLs anyway
      return match;
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Relative URL without leading slash - keep as is (will be relative to email domain)
      return match;
    }

    // Generate tracking URL
    const trackingUrl = getClickTrackingUrl(token, absoluteUrl);

    // Reconstruct the anchor tag with tracking URL
    return `<a ${before || ''}href="${trackingUrl}"${after}>`;
  });
}

