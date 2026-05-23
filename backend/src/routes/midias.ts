import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient();
const router = Router();

const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR || '/app/uploads',
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'video/mp4', 'video/webm', 'video/quicktime',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  },
});

// ── Listar ──
router.get('/', async (req: AuthRequest, res: Response) => {
  const { tipo } = req.query;
  const where: any = { clienteId: req.clienteId };
  if (tipo) where.tipo = tipo;

  const midias = await prisma.midia.findMany({
    where,
    orderBy: { criadoEm: 'desc' },
  });
  return res.json(midias);
});

// ── Upload ──
router.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const tipo = req.file.mimetype.startsWith('video/') ? 'video'
    : req.file.mimetype.startsWith('image/') ? 'imagem'
    : 'som';

  const url = `/uploads/${req.file.filename}`;

  const midia = await prisma.midia.create({
    data: {
      clienteId: req.clienteId,
      titulo: req.body.titulo || req.file.originalname,
      tipo,
      url,
      tamanho: req.file.size,
      status: tipo === 'video' ? 'processing' : 'ready',
      origem: 'upload',
    },
  });

  return res.status(201).json(midia);
});

// ── Importar YouTube ──
router.post('/youtube', async (req: AuthRequest, res: Response) => {
  const { url: youtubeUrl, titulo } = req.body;
  if (!youtubeUrl) return res.status(400).json({ error: 'URL do YouTube é obrigatória' });

  // Extrair ID do YouTube
  const match = youtubeUrl.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
  const youtubeId = match ? match[1] : null;
  if (!youtubeId) return res.status(400).json({ error: 'URL do YouTube inválida' });

  const midia = await prisma.midia.create({
    data: {
      clienteId: req.clienteId,
      titulo: titulo || `YouTube - ${youtubeId}`,
      tipo: 'youtube',
      url: youtubeUrl,
      origem: 'youtube',
      youtubeId,
      status: 'processing',
    },
  });

  // Jobs em background: download + processamento
  // O BullMQ worker vai processar isso
  // mas por enquanto marcamos como pronto com a URL do embed
  return res.status(201).json(midia);
});

// ── Deletar ──
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.midia.delete({
    where: { id: req.params.id, clienteId: req.clienteId },
  });
  return res.json({ success: true });
});

export { router as midiasRouter };
