import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

router.get('/', async (req: AuthRequest, res: Response) => {
  const tvs = await prisma.tV.findMany({
    where: { clienteId: req.clienteId },
  });
  return res.json(tvs);
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const { nome } = req.body;
  const ultima = await prisma.tV.findFirst({
    where: { clienteId: req.clienteId },
    orderBy: { numero: 'desc' },
  });
  const numero = (ultima?.numero || 0) + 1;
  const tv = await prisma.tV.create({
    data: { clienteId: req.clienteId!, numero, nome: nome || `TV ${numero}` },
  });
  return res.status(201).json(tv);
});

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const tv = await prisma.tV.update({
    where: { id: req.params.id, clienteId: req.clienteId },
    data: req.body,
  });
  return res.json(tv);
});

router.post('/:id/regenerate-token', async (req: AuthRequest, res: Response) => {
  const { v4: uuid } = require('uuid');
  const tv = await prisma.tV.update({
    where: { id: req.params.id, clienteId: req.clienteId },
    data: { token: uuid() },
  });
  return res.json(tv);
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.tV.delete({
    where: { id: req.params.id, clienteId: req.clienteId },
  });
  return res.json({ success: true });
});

export { router as tvsRouter };
