import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// ── Perfil (logo, marca d'agua, etc) ──
router.get('/perfil', async (req: AuthRequest, res: Response) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: req.clienteId },
    include: { plano: true },
  });
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
  const { senha: _, ...data } = cliente;
  return res.json(data);
});

router.patch('/perfil', async (req: AuthRequest, res: Response) => {
  const { nome, nomeAdega, logo, marcaDagua, posicaoMarca, corMarca } = req.body;
  const cliente = await prisma.cliente.update({
    where: { id: req.clienteId },
    data: { nome, nomeAdega, logo, marcaDagua, posicaoMarca, corMarca },
  });
  const { senha: _, ...data } = cliente;
  return res.json(data);
});

// ── Notificações ──
router.get('/notificacoes', async (req: AuthRequest, res: Response) => {
  const notificacoes = await prisma.notificacao.findMany({
    where: { clienteId: req.clienteId },
    orderBy: { criadoEm: 'desc' },
    take: 50,
  });
  return res.json(notificacoes);
});

router.patch('/notificacoes/:id/read', async (req: AuthRequest, res: Response) => {
  await prisma.notificacao.update({
    where: { id: req.params.id, clienteId: req.clienteId },
    data: { lida: true },
  });
  return res.json({ success: true });
});

// ── Faturas ──
router.get('/faturas', async (req: AuthRequest, res: Response) => {
  const faturas = await prisma.fatura.findMany({
    where: { clienteId: req.clienteId },
    orderBy: { criadoEm: 'desc' },
    take: 50,
  });
  return res.json(faturas);
});

export { router as clientesRouter };
