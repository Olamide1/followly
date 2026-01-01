import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { initializeDatabase } from './database/connection';
import { initializeRedis } from './services/redis';
import { initializeQueues } from './services/queues';
import { errorHandler, createError } from './middleware/errorHandler';
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

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5174',
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

// Error handling
app.use(errorHandler);

// 404 handler
app.use((_req, _res, next) => {
  next(createError('Route not found', 404));
});

// Initialize services
async function startServer() {
  try {
    await initializeDatabase();
    await initializeRedis();
    await initializeQueues();
    
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

