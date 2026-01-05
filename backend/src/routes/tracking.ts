import { Router, Request, Response } from 'express';
import { lookupTrackingToken, recordOpenEvent, recordClickEvent } from '../services/tracking';
import crypto from 'crypto';

const router = Router();

/**
 * Sanitize URL for logging - removes query parameters and sensitive data
 * Returns only protocol, domain, and path for security
 */
function sanitizeUrlForLogging(url: string | undefined | null): string {
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
 * Tracking pixel endpoint
 * Serves a 1x1 transparent pixel and records the open event
 */
router.get('/pixel/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    console.log(`[Tracking] Pixel request received for token: ${token.substring(0, 8)}...`);

    // Lookup token
    const trackingInfo = await lookupTrackingToken(token);
    
    if (trackingInfo) {
      console.log(`[Tracking] Token found - emailQueueId: ${trackingInfo.emailQueueId}, contactId: ${trackingInfo.contactId}, campaignId: ${trackingInfo.campaignId}`);
      
      // Record open event (with deduplication)
      const recorded = await recordOpenEvent(
        trackingInfo.emailQueueId,
        trackingInfo.contactId,
        trackingInfo.campaignId,
        'pixel'
      );
      
      if (recorded) {
        console.log(`[Tracking] Open event recorded successfully for emailQueueId: ${trackingInfo.emailQueueId}`);
      } else {
        console.log(`[Tracking] Open event already exists (deduplication) for emailQueueId: ${trackingInfo.emailQueueId}`);
      }
    } else {
      console.warn(`[Tracking] Token not found in database: ${token.substring(0, 8)}...`);
    }

    // Return 1x1 transparent PNG pixel
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': pixel.length.toString(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    res.send(pixel);
  } catch (error: any) {
    console.error('[Tracking] Pixel error:', error);
    // Still return pixel even on error to avoid breaking email display
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': pixel.length.toString(),
    });
    res.send(pixel);
  }
});

/**
 * Click tracking endpoint
 * Redirects to original URL and records the click event
 */
router.get('/click/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const { url } = req.query;
    
    console.log(`[Tracking] Click request received for token: ${token.substring(0, 8)}..., url: ${sanitizeUrlForLogging(url as string)}`);

    if (!url || typeof url !== 'string') {
      console.error('[Tracking] Missing URL parameter in click request');
      res.status(400).send('Missing URL parameter');
      return;
    }

    // Decode the original URL
    const originalUrl = decodeURIComponent(url);

    // Lookup token
    const trackingInfo = await lookupTrackingToken(token);
    
    if (trackingInfo) {
      console.log(`[Tracking] Token found - emailQueueId: ${trackingInfo.emailQueueId}, contactId: ${trackingInfo.contactId}, campaignId: ${trackingInfo.campaignId}`);
      
      // Record click event (with deduplication)
      const recorded = await recordClickEvent(
        trackingInfo.emailQueueId,
        trackingInfo.contactId,
        trackingInfo.campaignId,
        originalUrl,
        'link'
      );
      
      if (recorded) {
        console.log(`[Tracking] Click event recorded successfully for emailQueueId: ${trackingInfo.emailQueueId}, url: ${sanitizeUrlForLogging(originalUrl)}`);
      } else {
        console.log(`[Tracking] Click event already exists (deduplication) for emailQueueId: ${trackingInfo.emailQueueId}, url: ${sanitizeUrlForLogging(originalUrl)}`);
      }
    } else {
      console.warn(`[Tracking] Token not found in database: ${token.substring(0, 8)}...`);
    }

    // Redirect to original URL
    res.redirect(originalUrl);
    return;
  } catch (error: any) {
    console.error('[Tracking] Click error:', error);
    // Try to redirect anyway if URL is available
    const { url } = req.query;
    if (url && typeof url === 'string') {
      try {
        res.redirect(decodeURIComponent(url));
        return;
      } catch {
        res.status(500).send('Tracking error');
        return;
      }
    } else {
      res.status(500).send('Tracking error');
      return;
    }
  }
});

export default router;

