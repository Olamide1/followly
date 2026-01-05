import { Router, Request, Response } from 'express';
import { lookupTrackingToken, recordOpenEvent, recordClickEvent } from '../services/tracking';

const router = Router();

/**
 * Tracking pixel endpoint
 * Serves a 1x1 transparent pixel and records the open event
 */
router.get('/pixel/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Lookup token
    const trackingInfo = await lookupTrackingToken(token);
    
    if (trackingInfo) {
      // Record open event (with deduplication)
      await recordOpenEvent(
        trackingInfo.emailQueueId,
        trackingInfo.contactId,
        trackingInfo.campaignId,
        'pixel'
      );
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
    console.error('Tracking pixel error:', error);
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

    if (!url || typeof url !== 'string') {
      res.status(400).send('Missing URL parameter');
      return;
    }

    // Decode the original URL
    const originalUrl = decodeURIComponent(url);

    // Lookup token
    const trackingInfo = await lookupTrackingToken(token);
    
    if (trackingInfo) {
      // Record click event (with deduplication)
      await recordClickEvent(
        trackingInfo.emailQueueId,
        trackingInfo.contactId,
        trackingInfo.campaignId,
        originalUrl,
        'link'
      );
    }

    // Redirect to original URL
    res.redirect(originalUrl);
    return;
  } catch (error: any) {
    console.error('Click tracking error:', error);
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

