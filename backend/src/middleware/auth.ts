import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export interface AuthRequest extends Request {
  clienteId?: string;
  adminId?: string;
  role?: string;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      type: 'cliente' | 'admin';
      role?: string;
    };

    if (payload.type === 'cliente') {
      req.clienteId = payload.sub;
    } else {
      req.adminId = payload.sub;
      req.role = payload.role;
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      type: 'admin';
      role: string;
    };

    if (payload.type !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }

    req.adminId = payload.sub;
    req.role = payload.role;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}
