import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const router = Router();
const TV_URL = process.env.TV_URL || 'https://tv.adega.queroservico.com.br';

router.get('/:filename.m3u', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const match = filename.match(/^tv(\d+)-(.+)$/);
    if (!match) return res.status(400).send('#EXTM3U\n# Invalid format\n');
    const numero = parseInt(match[1]), slug = match[2];

    const tv: any = await prisma.tV.findFirst({
      where: { numero, cliente: { slug }, ativa: true },
      include: { cliente: { select: { id: true, nomeAdega: true, logo: true, marcaDagua: true, posicaoMarca: true, corMarca: true, slug: true } } },
    });
    if (!tv) return res.status(404).send('#EXTM3U\n# TV not found\n');

    await prisma.tV.update({ where: { id: tv.id }, data: { ultimoAcesso: new Date() } });

    const playlist: any = await prisma.playlist.findFirst({
      where: { clienteId: tv.clienteId, padrao: true },
      include: { midias: { orderBy: { ordem: 'asc' }, include: { midia: true } }, promocoes: { include: { promocao: true } } },
    });

    const lines = ['#EXTM3U', `#PLAYLIST:${tv.cliente.nomeAdega}`];
    if (!playlist) { lines.push('# No content'); res.set('Content-Type', 'audio/x-mpegurl'); return res.send(lines.join('\n')); }

    for (const pm of playlist.midias || []) {
      if (!pm.midia) continue;
      lines.push(`#EXTINF:${pm.midia.duracao || 0},${pm.midia.titulo || 'Video'}`);
      lines.push(`${TV_URL}/stream/${tv.cliente.slug}/${pm.midia.id}`);
    }
    res.set('Content-Type', 'audio/x-mpegurl');
    res.set('Content-Disposition', `inline; filename="${filename}.m3u"`);
    return res.send(lines.join('\n'));
  } catch (err) {
    console.error('[M3U] Error:', err);
    return res.status(500).send('#EXTM3U\n# Error\n');
  }
});

router.get('/stream/:slug/:midiaId', async (req: Request, res: Response) => {
  const { slug, midiaId } = req.params;
  const cliente = await prisma.cliente.findUnique({ where: { slug } });
  if (!cliente) return res.status(404).json({ error: 'Not found' });
  const midia = await prisma.midia.findFirst({ where: { id: midiaId, clienteId: cliente.id } });
  if (!midia) return res.status(404).json({ error: 'Not found' });
  return res.redirect(midia.url);
});

export { router as m3uRouter };
