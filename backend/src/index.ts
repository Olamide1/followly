import dotenv from 'dotenv';
dotenv.config(); // Must be first, before any other imports that use env vars

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { createServer } from 'http';
import { initializeDatabase } from './database/connection';
import { initializeRedis } from './services/redis';
import { initializeQueues } from './services/queues';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

// Routes
import authRoutes from './routes/auth';
import contactRoutes from './routes/contacts';
import listRoutes from './routes/lists';
import campaignRoutes from './routes/campaigns';
// import automationRoutes from './routes/automations'; // DISABLED: Temporarily commented out
import analyticsRoutes from './routes/analytics';
import providerRoutes from './routes/providers';
import complianceRoutes from './routes/compliance';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

const isProduction = process.env.NODE_ENV === 'production';
const PROD_URL = 'https://followly-1a83c23a0be1.herokuapp.com';
const DEV_URL = 'http://localhost:5174';

// Trust proxy - required for Heroku (behind load balancer)
// This allows express-rate-limit to correctly identify users by IP
if (isProduction) {
  app.set('trust proxy', 1);
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", PROD_URL],
    },
  } : false,
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || (isProduction ? PROD_URL : DEV_URL),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(rateLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/campaigns', campaignRoutes);
// app.use('/api/automations', automationRoutes); // DISABLED: Temporarily commented out
app.use('/api/analytics', analyticsRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/compliance', complianceRoutes);

// Serve frontend static files in production
if (isProduction) {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  
  // Serve static assets
  app.use(express.static(frontendPath));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (_, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
} else {
  // 404 handler for development (frontend runs separately)
  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found', path: _req.originalUrl || _req.path });
  });
}

// Error handling (for actual errors)
app.use(errorHandler);

// Initialize services
async function startServer() {
  try {
    await initializeDatabase();
    await initializeRedis();
    await initializeQueues();
    
    // Recover any scheduled campaigns that might not be in the queue
    // This ensures campaigns aren't stranded after server restarts or Redis issues
    try {
      const { CampaignService } = await import('./services/campaigns');
      const { RoutingService } = await import('./services/routing');
      const { EmailProviderService } = await import('./services/providers');
      const { WarmupService } = await import('./services/warmup');
      
      const campaignService = new CampaignService(
        new RoutingService(new EmailProviderService()),
        new EmailProviderService(),
        new WarmupService()
      );
      
      await campaignService.recoverScheduledCampaigns();
    } catch (recoveryError) {
      // Log but don't fail startup - recovery is best effort
      console.warn('Campaign recovery failed (non-critical):', recoveryError);
    }
    
    httpServer.listen(PORT, () => {
      console.log(`🚀 Followly API server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;

