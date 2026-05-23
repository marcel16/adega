import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, adminOnly } from '../middleware/auth';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const router = Router();

// ── Admin Login ──
router.post('/login', async (req, res: Response) => {
  const { email, senha } = req.body;
  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) return res.status(401).json({ error: 'Credenciais inválidas' });

  const valid = await bcrypt.compare(senha, admin.senha);
  if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

  const token = jwt.sign({ sub: admin.id, type: 'admin', role: admin.role }, JWT_SECRET, { expiresIn: '8h' });
  return res.json({ token, admin: { id: admin.id, nome: admin.nome, email: admin.email, role: admin.role } });
});

// ── Dashboard ──
router.get('/dashboard', adminOnly, async (_req: AuthRequest, res: Response) => {
  const [totalClientes, clientesAtivos, totalTVs, receitaMes, planosAtivos] = await Promise.all([
    prisma.cliente.count(),
    prisma.cliente.count({ where: { ativo: true } }),
    prisma.tV.count({ where: { ativa: true } }),
    prisma.fatura.aggregate({
      _sum: { valor: true },
      where: {
        status: 'confirmed',
        dataPagamento: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    }),
    prisma.plano.count({ where: { ativo: true } }),
  ]);

  return res.json({
    totalClientes,
    clientesAtivos,
    totalTVs,
    receitaMes: receitaMes._sum.valor || 0,
    planosAtivos,
  });
});

// ── CRUD Clientes ──
router.get('/clientes', adminOnly, async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string;

  const where: any = {};
  if (search) {
    where.OR = [
      { nome: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { nomeAdega: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [clientes, total] = await Promise.all([
    prisma.cliente.findMany({
      where,
      include: { plano: true, _count: { select: { tvs: true, promocoes: true } } },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { criadoEm: 'desc' },
    }),
    prisma.cliente.count({ where }),
  ]);

  return res.json({
    data: clientes.map(({ senha: _, ...c }) => c),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

router.get('/clientes/:id', adminOnly, async (req: AuthRequest, res: Response) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: req.params.id },
    include: {
      plano: true,
      tvs: true,
      faturas: { orderBy: { criadoEm: 'desc' }, take: 20 },
    },
  });

  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
  const { senha: _, ...data } = cliente;
  return res.json(data);
});

router.patch('/clientes/:id', adminOnly, async (req: AuthRequest, res: Response) => {
  const { nome, email, ativo, planoId, dataExpiracao } = req.body;
  const cliente = await prisma.cliente.update({
    where: { id: req.params.id },
    data: { nome, email, ativo, planoId, dataExpiracao: dataExpiracao ? new Date(dataExpiracao) : undefined },
  });
  const { senha: _, ...data } = cliente;
  return res.json(data);
});

// ── CRUD Planos ──
router.get('/planos', adminOnly, async (_req: AuthRequest, res: Response) => {
  const planos = await prisma.plano.findMany({
    include: { _count: { select: { clientes: true } } },
  });
  return res.json(planos);
});

router.post('/planos', adminOnly, async (req: AuthRequest, res: Response) => {
  const plano = await prisma.plano.create({ data: req.body });
  return res.status(201).json(plano);
});

router.patch('/planos/:id', adminOnly, async (req: AuthRequest, res: Response) => {
  const plano = await prisma.plano.update({
    where: { id: req.params.id },
    data: req.body,
  });
  return res.json(plano);
});

router.delete('/planos/:id', adminOnly, async (req: AuthRequest, res: Response) => {
  await prisma.plano.update({
    where: { id: req.params.id },
    data: { ativo: false },
  });
  return res.json({ success: true });
});

// ── Campanhas Dev ──
router.get('/campanhas', adminOnly, async (_req: AuthRequest, res: Response) => {
  const campanhas = await prisma.campanhaDev.findMany({ orderBy: { criadoEm: 'desc' } });
  return res.json(campanhas);
});

router.post('/campanhas', adminOnly, async (req: AuthRequest, res: Response) => {
  const campanha = await prisma.campanhaDev.create({ data: req.body });
  return res.status(201).json(campanha);
});

router.patch('/campanhas/:id', adminOnly, async (req: AuthRequest, res: Response) => {
  const campanha = await prisma.campanhaDev.update({
    where: { id: req.params.id },
    data: req.body,
  });
  return res.json(campanha);
});

router.delete('/campanhas/:id', adminOnly, async (req: AuthRequest, res: Response) => {
  await prisma.campanhaDev.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});

// ── Enviar Notificação ──
router.post('/notificar', adminOnly, async (req: AuthRequest, res: Response) => {
  const { clienteId, titulo, mensagem, tipo } = req.body;

  if (clienteId) {
    // Notificação específica
    const notif = await prisma.notificacao.create({
      data: { clienteId, titulo, mensagem, tipo: tipo || 'admin' },
    });
    return res.status(201).json(notif);
  }

  // Broadcast para todos
  const clientes = await prisma.cliente.findMany({ select: { id: true } });
  await prisma.notificacao.createMany({
    data: clientes.map((c) => ({
      clienteId: c.id,
      titulo,
      mensagem,
      tipo: tipo || 'admin',
    })),
  });

  return res.json({ success: true, enviadoPara: clientes.length });
});

// ── Relatório de Faturas ──
router.get('/faturas', adminOnly, async (req: AuthRequest, res: Response) => {
  const status = req.query.status as string;
  const where: any = {};
  if (status) where.status = status;

  const faturas = await prisma.fatura.findMany({
    where,
    include: { cliente: { select: { nome: true, nomeAdega: true, email: true } } },
    orderBy: { criadoEm: 'desc' },
    take: 100,
  });

  return res.json(faturas);
});

export { router as adminRouter };
