import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { cacheM3uPlaylist } from '../services/cache';

const prisma = new PrismaClient();
const TV_URL = process.env.TV_URL || 'https://tv.adega.queroservico.com.br';

// ── Pre-warm M3U cache for active TVs ──
async function preCacheM3u(): Promise<void> {
  console.log('[M3uPreCache] Starting M3U cache pre-warming...');

  try {
    // ── Find all active TVs ──
    const activeTVs = await prisma.tV.findMany({
      where: { ativa: true },
      include: {
        cliente: {
          select: {
            id: true,
            slug: true,
            nomeAdega: true,
          },
        },
      },
    });

    console.log(`[M3uPreCache] Found ${activeTVs.length} active TVs`);

    let cached = 0;
    let skipped = 0;
    let errors = 0;

    for (const tv of activeTVs) {
      try {
        // Build the M3U content
        const playlist = await prisma.playlist.findFirst({
          where: { clienteId: tv.clienteId, padrao: true },
          include: {
            midias: {
              orderBy: { ordem: 'asc' },
              include: { midia: { where: { status: 'ready' } } },
            },
            promocoes: {
              include: { promocao: { where: { ativa: true } } },
            },
          },
        });

        if (!playlist || playlist.midias.length === 0) {
          skipped++;
          continue;
        }

        // Build minimal M3U for caching (the full thing is built on-demand)
        const lines: string[] = [
          '#EXTM3U',
          `#PLAYLIST:${tv.cliente.nomeAdega}`,
        ];

        for (const pm of playlist.midias) {
          if (!pm.midia) continue;
          const titulo = pm.midia.titulo || 'Video';
          const duracao = pm.midia.duracao || 0;
          lines.push(`#EXTINF:${duracao},${titulo}`);
          lines.push(`${TV_URL}/stream/${tv.cliente.slug}/${pm.midia.id}`);
        }

        const content = lines.join('\n');
        await cacheM3uPlaylist(tv.cliente.slug, tv.numero, content);
        cached++;
      } catch (err) {
        console.warn(`[M3uPreCache] Error caching TV ${tv.id}:`, (err as Error).message);
        errors++;
      }
    }

    console.log(`[M3uPreCache] Pre-warming complete: ${cached} cached, ${skipped} skipped, ${errors} errors`);
  } catch (err) {
    console.error('[M3uPreCache] Error:', (err as Error).message);
  }
}

// ── Schedule: every 10 minutes ──
export function startM3uPreCache(): cron.ScheduledTask {
  console.log('[M3uPreCache] Scheduled every 10 minutes');

  // Run immediately on startup
  preCacheM3u();

  return cron.schedule('*/10 * * * *', preCacheM3u, {
    scheduled: true,
    timezone: 'America/Sao_Paulo',
  });
}

export { preCacheM3u };
