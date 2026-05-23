import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// ── Listar ──
router.get('/', async (req: AuthRequest, res: Response) => {
  const promocoes = await prisma.promocao.findMany({
    where: { clienteId: req.clienteId },
    orderBy: { criadoEm: 'desc' },
  });
  return res.json(promocoes);
});

// ── Criar ──
router.post('/', async (req: AuthRequest, res: Response) => {
  const promocao = await prisma.promocao.create({
    data: { ...req.body, clienteId: req.clienteId },
  });
  return res.status(201).json(promocao);
});

// ── Atualizar ──
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const promocao = await prisma.promocao.update({
    where: { id: req.params.id, clienteId: req.clienteId },
    data: req.body,
  });
  return res.json(promocao);
});

// ── Deletar ──
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.promocao.delete({
    where: { id: req.params.id, clienteId: req.clienteId },
  });
  return res.json({ success: true });
});

export { router as promocoesRouter };
