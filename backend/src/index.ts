import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import { authRouter } from './routes/auth';
import { clientesRouter } from './routes/clientes';
import { tvsRouter } from './routes/tvs';
import { promocoesRouter } from './routes/promocoes';
import { midiasRouter } from './routes/midias';
import { playlistsRouter } from './routes/playlists';
import { adminRouter } from './routes/admin';
import { m3uRouter } from './routes/m3u';
import { webhookRouter } from './routes/webhook';
import { errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/auth';
import { startAllWorkers, stopAllWorkers } from './workers';
import { startAllCronJobs, stopAllCronJobs } from './cron';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas públicas
app.use('/api/auth', authRouter);
app.use('/tv', m3uRouter);        // M3U playlist delivery (público)
app.use('/api/webhook', webhookRouter); // Asaas webhooks

// Rotas autenticadas (cliente)
app.use('/api/clientes', authenticate, clientesRouter);
app.use('/api/tvs', authenticate, tvsRouter);
app.use('/api/promocoes', authenticate, promocoesRouter);
app.use('/api/midias', authenticate, midiasRouter);
app.use('/api/playlists', authenticate, playlistsRouter);

// Rotas admin
app.use('/api/admin', adminRouter);

// Serve uploads
app.use('/uploads', express.static(process.env.UPLOAD_DIR || '/app/uploads'));

// Error handler
app.use(errorHandler);

const server = app.listen(PORT, async () => {
  console.log(`[Adega] Backend rodando na porta ${PORT}`);
  console.log(`[Adega] Ambiente: ${process.env.NODE_ENV || 'development'}`);

  // Iniciar workers (BullMQ) — apenas se não estiver em modo API-only
  if (process.env.WORKERS_ENABLED !== 'false') {
    try {
      const workerStatus = await startAllWorkers();
      console.log('[Adega] Workers iniciados:', workerStatus);
    } catch (err) {
      console.error('[Adega] Erro ao iniciar workers:', (err as Error).message);
      console.warn('[Adega] Continuando sem workers — configure Redis para processamento assíncrono');
    }
  } else {
    console.log('[Adega] Workers desabilitados (WORKERS_ENABLED=false)');
  }

  // Iniciar cron jobs — apenas se não desabilitado
  if (process.env.CRON_ENABLED !== 'false') {
    try {
      startAllCronJobs();
      console.log('[Adega] Cron jobs iniciados');
    } catch (err) {
      console.error('[Adega] Erro ao iniciar cron jobs:', (err as Error).message);
    }
  } else {
    console.log('[Adega] Cron desabilitado (CRON_ENABLED=false)');
  }
});

// ── Graceful shutdown ──
process.on('SIGTERM', async () => {
  console.log('[Adega] SIGTERM recebido — desligando graciosamente...');
  stopAllCronJobs();
  await stopAllWorkers();
  server.close(() => {
    console.log('[Adega] Servidor fechado');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[Adega] SIGINT recebido — desligando...');
  stopAllCronJobs();
  await stopAllWorkers();
  server.close(() => {
    console.log('[Adega] Servidor fechado');
    process.exit(0);
  });
});

export default app;
