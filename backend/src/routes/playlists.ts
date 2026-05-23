import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// ── Listar ──
router.get('/', async (req: AuthRequest, res: Response) => {
  const playlists = await prisma.playlist.findMany({
    where: { clienteId: req.clienteId },
    include: {
      _count: { select: { midias: true, promocoes: true } },
    },
  });
  return res.json(playlists);
});

// ── Detalhe com itens ──
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const playlist = await prisma.playlist.findFirst({
    where: { id: req.params.id, clienteId: req.clienteId },
    include: {
      midias: {
        orderBy: { ordem: 'asc' },
        include: { midia: true },
      },
      promocoes: {
        include: { promocao: true },
      },
    },
  });

  if (!playlist) return res.status(404).json({ error: 'Playlist não encontrada' });
  return res.json(playlist);
});

// ── Criar ──
router.post('/', async (req: AuthRequest, res: Response) => {
  const playlist = await prisma.playlist.create({
    data: { ...req.body, clienteId: req.clienteId },
  });
  return res.status(201).json(playlist);
});

// ── Adicionar mídia ──
router.post('/:id/midias', async (req: AuthRequest, res: Response) => {
  const { midiaId } = req.body;

  // Obter última ordem
  const last = await prisma.playlistMidia.findFirst({
    where: { playlistId: req.params.id },
    orderBy: { ordem: 'desc' },
  });

  const item = await prisma.playlistMidia.create({
    data: {
      playlistId: req.params.id,
      midiaId,
      ordem: (last?.ordem || 0) + 1,
    },
  });

  return res.status(201).json(item);
});

// ── Remover mídia ──
router.delete('/:id/midias/:midiaId', async (req: AuthRequest, res: Response) => {
  await prisma.playlistMidia.deleteMany({
    where: {
      playlistId: req.params.id,
      midiaId: req.params.midiaId,
    },
  });
  return res.json({ success: true });
});

// ── Reordenar ──
router.patch('/:id/reorder', async (req: AuthRequest, res: Response) => {
  const { items } = req.body; // [{midiaId, ordem}, ...]
  for (const item of items) {
    await prisma.playlistMidia.updateMany({
      where: { playlistId: req.params.id, midiaId: item.midiaId },
      data: { ordem: item.ordem },
    });
  }
  return res.json({ success: true });
});

// ── Adicionar promoção ──
router.post('/:id/promocoes', async (req: AuthRequest, res: Response) => {
  const { promocaoId, frequencia } = req.body;
  const item = await prisma.playlistPromocao.create({
    data: {
      playlistId: req.params.id,
      promocaoId,
      frequencia: frequencia || 1,
    },
  });
  return res.status(201).json(item);
});

// ── Remover promoção ──
router.delete('/:id/promocoes/:promocaoId', async (req: AuthRequest, res: Response) => {
  await prisma.playlistPromocao.deleteMany({
    where: {
      playlistId: req.params.id,
      promocaoId: req.params.promocaoId,
    },
  });
  return res.json({ success: true });
});

// ── Deletar playlist ──
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.playlist.delete({
    where: { id: req.params.id, clienteId: req.clienteId },
  });
  return res.json({ success: true });
});

export { router as playlistsRouter };
