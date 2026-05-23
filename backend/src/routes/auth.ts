import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const router = Router();

// ── Registro ──
const registerSchema = z.object({
  nome: z.string().min(3),
  email: z.string().email(),
  senha: z.string().min(6),
  nomeAdega: z.string().min(2),
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    const exists = await prisma.cliente.findUnique({ where: { email: data.email } });
    if (exists) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const slug = data.nomeAdega
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 50);

    // Verificar slug único
    const slugExists = await prisma.cliente.findUnique({ where: { slug } });
    const finalSlug = slugExists ? `${slug}${Date.now().toString(36)}` : slug;

    const senhaHash = await bcrypt.hash(data.senha, 12);

    const cliente = await prisma.cliente.create({
      data: {
        nome: data.nome,
        email: data.email,
        senha: senhaHash,
        nomeAdega: data.nomeAdega,
        slug: finalSlug,
      },
    });

    // Criar playlist padrão
    await prisma.playlist.create({
      data: {
        clienteId: cliente.id,
        nome: 'Playlist Padrão',
        padrao: true,
      },
    });

    const token = jwt.sign({ sub: cliente.id, type: 'cliente' }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      token,
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        email: cliente.email,
        nomeAdega: cliente.nomeAdega,
        slug: cliente.slug,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    console.error(err);
    return res.status(500).json({ error: 'Erro ao registrar' });
  }
});

// ── Login ──
const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);

    const cliente = await prisma.cliente.findUnique({ where: { email: data.email } });
    if (!cliente) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (!cliente.ativo) {
      return res.status(403).json({ error: 'Conta desativada' });
    }

    const senhaValida = await bcrypt.compare(data.senha, cliente.senha);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign({ sub: cliente.id, type: 'cliente' }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      token,
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        email: cliente.email,
        nomeAdega: cliente.nomeAdega,
        slug: cliente.slug,
        logo: cliente.logo,
        planoId: cliente.planoId,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    console.error(err);
    return res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// ── Perfil ──
router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const payload = jwt.verify(authHeader.substring(7), JWT_SECRET) as { sub: string; type: string };
    if (payload.type !== 'cliente') return res.status(403).json({ error: 'Acesso negado' });

    const cliente = await prisma.cliente.findUnique({
      where: { id: payload.sub },
      include: { plano: true, tvs: true },
    });

    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

    const { senha: _, ...clienteData } = cliente;
    return res.json(clienteData);
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
});

export { router as authRouter };
