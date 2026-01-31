import rateLimit from 'express-rate-limit';

// More reasonable defaults: 500 requests per hour (instead of 100 per 15 minutes)
// This prevents legitimate users from hitting limits while still protecting against abuse
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000'), // 1 hour (default)
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '500'), // 500 requests per hour (default)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for health checks and static files
  skip: (req) => {
    // Don't rate limit health checks
    if (req.path === '/health') return true;
    // Don't rate limit static assets (favicon, CSS, JS, images, etc.)
    if (req.path.startsWith('/assets/') || req.path.startsWith('/vite.svg') || req.path === '/favicon.ico') {
      return true;
    }
    return false;
  },
});

