import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Iniciando seed do banco...');

  // ── Admin padrão ──
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@adega.com';
  const adminSenha = process.env.ADMIN_SENHA || 'admin123';

  const adminExists = await prisma.admin.findUnique({ where: { email: adminEmail } });
  if (!adminExists) {
    const hash = await bcrypt.hash(adminSenha, 12);
    await prisma.admin.create({
      data: {
        nome: 'Super Admin',
        email: adminEmail,
        senha: hash,
        role: 'superadmin',
      },
    });
    console.log(`✅ Admin criado: ${adminEmail} / ${adminSenha}`);
  } else {
    console.log('ℹ️ Admin já existe');
  }

  // ── Planos padrão ──
  const planos = [
    {
      nome: 'Básico',
      descricao: 'Ideal para adegas pequenas',
      valorMensal: 49.90,
      valorAnual: 499.00,
      modulos: ['promocoes', 'upload'],
      maxTVs: 1,
      maxPromocoes: 5,
      maxMidias: 20,
      permiteCampanhasDev: false,
    },
    {
      nome: 'Profissional',
      descricao: 'Para adegas em crescimento',
      valorMensal: 99.90,
      valorAnual: 999.00,
      modulos: ['promocoes', 'upload', 'youtube', 'agenda', 'audio'],
      maxTVs: 3,
      maxPromocoes: 20,
      maxMidias: 100,
      permiteCampanhasDev: false,
    },
    {
      nome: 'Enterprise',
      descricao: 'Solução completa com suporte prioritário',
      valorMensal: 199.90,
      valorAnual: 1999.00,
      modulos: ['promocoes', 'upload', 'youtube', 'agenda', 'audio', 'relatorios'],
      maxTVs: 10,
      maxPromocoes: 100,
      maxMidias: 500,
      permiteCampanhasDev: true,
    },
  ];

  for (const plano of planos) {
    const exists = await prisma.plano.findFirst({ where: { nome: plano.nome } });
    if (!exists) {
      await prisma.plano.create({ data: plano });
      console.log(`✅ Plano criado: ${plano.nome}`);
    }
  }

  console.log('🎉 Seed concluído!');
}

seed()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
