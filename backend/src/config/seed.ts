import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { v4 as uuid } from 'uuid';

dotenv.config();
const prisma = new PrismaClient();

// ── Helpers ──
function futureDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function pastDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ── Main seed ──
async function seed(env: 'production' | 'development' = 'development') {
  console.log(`🌱 Iniciando seed do banco... (ambiente: ${env})`);

  // ═══════════════════════════════════════════════
  // ── Admin padrão ──
  // ═══════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════
  // ── Planos ──
  // ═══════════════════════════════════════════════
  const planos = [
    {
      nome: 'Básico',
      descricao: 'Ideal para adegas pequenas — exiba promoções, vídeos e campanhas.',
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
      descricao: 'Para adegas em crescimento — YouTube, áudio e mais.',
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
      descricao: 'Solução completa com suporte prioritário e relatórios.',
      valorMensal: 199.90,
      valorAnual: 1999.00,
      modulos: ['promocoes', 'upload', 'youtube', 'agenda', 'audio', 'relatorios'],
      maxTVs: 10,
      maxPromocoes: 100,
      maxMidias: 500,
      permiteCampanhasDev: true,
    },
  ];

  let planoBasicoId: string = '';
  let planoProfissionalId: string = '';
  let planoEnterpriseId: string = '';

  for (const plano of planos) {
    let existing = await prisma.plano.findFirst({ where: { nome: plano.nome } });
    if (!existing) {
      existing = await prisma.plano.create({ data: plano });
      console.log(`✅ Plano criado: ${plano.nome}`);
    } else {
      console.log(`ℹ️ Plano já existe: ${plano.nome}`);
    }

    if (plano.nome === 'Básico') planoBasicoId = existing.id;
    if (plano.nome === 'Profissional') planoProfissionalId = existing.id;
    if (plano.nome === 'Enterprise') planoEnterpriseId = existing.id;
  }

  // ═══════════════════════════════════════════════
  // ── Configurações do sistema ──
  // ═══════════════════════════════════════════════
  const configuracoes: Array<{ chave: string; valor: string }> = [
    { chave: 'app.name', valor: 'Adega SaaS TV Manager' },
    { chave: 'app.version', valor: '1.0.0' },
    { chave: 'asaas.payment_retry_days', valor: '3' },
    { chave: 'asaas.grace_period_days', valor: '7' },
    { chave: 'm3u.cache_ttl_seconds', valor: '300' },
    { chave: 'upload.max_file_size_mb', valor: '500' },
    { chave: 'youtube.max_download_duration', valor: '3600' },
    { chave: 'tv.heartbeat_timeout_minutes', valor: '5' },
  ];

  for (const config of configuracoes) {
    const exists = await prisma.configuracao.findUnique({ where: { chave: config.chave } });
    if (!exists) {
      await prisma.configuracao.create({ data: config });
    }
  }
  console.log('✅ Configurações do sistema garantidas');

  // ═══════════════════════════════════════════════
  // ── DADOS DE DEMONSTRAÇÃO (apenas dev) ──
  // ═══════════════════════════════════════════════
  if (env === 'development') {
    await seedDemoData(planoBasicoId, planoProfissionalId, planoEnterpriseId);
  }

  console.log('🎉 Seed concluído!');
}

// ═══════════════════════════════════════════════
// ── Demo Data ──
// ═══════════════════════════════════════════════
async function seedDemoData(
  planoBasicoId: string,
  planoProfissionalId: string,
  planoEnterpriseId: string,
) {
  const demoExists = await prisma.cliente.findFirst({ where: { email: 'demo@adega.com' } });
  if (demoExists) {
    console.log('ℹ️ Dados de demonstração já existem, pulando...');
    return;
  }

  console.log('🎭 Criando dados de demonstração...');

  // ── Cliente Demo ──
  const senha = await bcrypt.hash('demo123', 12);
  const clienteDemo = await prisma.cliente.create({
    data: {
      nome: 'Vinícola Demo',
      email: 'demo@adega.com',
      senha,
      nomeAdega: 'Adega Demo',
      slug: 'adega-demo',
      logo: '/uploads/demo/logo.png',
      marcaDagua: '/uploads/demo/marca.png',
      posicaoMarca: 'bottom-right',
      corMarca: '#ffffff80',
      ativo: true,
      planoId: planoProfissionalId,
      dataExpiracao: futureDays(365),
      asaasCustomerId: 'cus_demo00000001',
    },
  });
  console.log('✅ Cliente demo criado: demo@adega.com / demo123');

  // ── Cliente Básico ──
  const clienteBasico = await prisma.cliente.create({
    data: {
      nome: 'Adega do Zé',
      email: 'ze@adega.com',
      senha,
      nomeAdega: 'Adega do Zé',
      slug: 'adega-do-ze',
      ativo: true,
      planoId: planoBasicoId,
      dataExpiracao: futureDays(30),
    },
  });

  // ── Cliente Enterprise ──
  const clienteEnterprise = await prisma.cliente.create({
    data: {
      nome: 'Grande Vinícola Ltda',
      email: 'grande@vinicola.com',
      senha,
      nomeAdega: 'Grande Vinícola',
      slug: 'grande-vinicola',
      ativo: true,
      planoId: planoEnterpriseId,
      dataExpiracao: futureDays(180),
    },
  });

  // ── TVs do Demo ──
  const tv1 = await prisma.tV.create({
    data: {
      clienteId: clienteDemo.id,
      numero: 1,
      nome: 'TV Salão Principal',
      token: uuid(),
      ativa: true,
      ultimoAcesso: pastDays(0),
    },
  });

  const tv2 = await prisma.tV.create({
    data: {
      clienteId: clienteDemo.id,
      numero: 2,
      nome: 'TV Área Externa',
      token: uuid(),
      ativa: true,
      ultimoAcesso: pastDays(0),
    },
  });

  const tv3 = await prisma.tV.create({
    data: {
      clienteId: clienteDemo.id,
      numero: 3,
      nome: 'TV Degustação',
      token: uuid(),
      ativa: true,
      ultimoAcesso: pastDays(2), // offline
    },
  });

  console.log(`✅ TVs criadas: ${clienteDemo.nomeAdega} (3 TVs)`);

  // ── TV do Básico ──
  await prisma.tV.create({
    data: {
      clienteId: clienteBasico.id,
      numero: 1,
      nome: 'TV Única',
      token: uuid(),
      ativa: true,
    },
  });

  // ── TVs do Enterprise ──
  for (let i = 1; i <= 5; i++) {
    await prisma.tV.create({
      data: {
        clienteId: clienteEnterprise.id,
        numero: i,
        nome: `TV ${i}`,
        token: uuid(),
        ativa: i <= 4, // TV 5 inativa
      },
    });
  }

  // ── Mídias (demo) ──
  const midias = [
    {
      clienteId: clienteDemo.id,
      titulo: 'Tour pela Vinícola',
      tipo: 'video',
      url: '/uploads/demo/tour.mp4',
      thumbnailUrl: '/uploads/demo/tour_thumb.jpg',
      duracao: 120,
      tamanho: BigInt(50 * 1024 * 1024),
      status: 'ready',
      origem: 'upload',
      metadata: { width: 1920, height: 1080, codec: 'h264', bitrate: 5000 },
    },
    {
      clienteId: clienteDemo.id,
      titulo: 'Harmonização de Vinhos',
      tipo: 'video',
      url: '/uploads/demo/harmonizacao.mp4',
      thumbnailUrl: '/uploads/demo/harmonizacao_thumb.jpg',
      duracao: 180,
      tamanho: BigInt(75 * 1024 * 1024),
      status: 'ready',
      origem: 'upload',
      metadata: { width: 1280, height: 720, codec: 'h264', bitrate: 3000 },
    },
    {
      clienteId: clienteDemo.id,
      titulo: 'Como Servir Vinho',
      tipo: 'video',
      url: '/uploads/demo/servir.mp4',
      thumbnailUrl: '/uploads/demo/servir_thumb.jpg',
      duracao: 90,
      tamanho: BigInt(30 * 1024 * 1024),
      status: 'ready',
      origem: 'upload',
      metadata: { width: 1920, height: 1080, codec: 'h264', bitrate: 4000 },
    },
    {
      clienteId: clienteDemo.id,
      titulo: 'Processo de Produção',
      tipo: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnailUrl: '/uploads/demo/producao_thumb.jpg',
      duracao: 212,
      tamanho: BigInt(45 * 1024 * 1024),
      status: 'ready',
      origem: 'youtube',
      youtubeId: 'dQw4w9WgXcQ',
      metadata: { originalTitle: 'Processo de Produção de Vinho', uploader: 'Canal do Vinho' },
    },
    {
      clienteId: clienteDemo.id,
      titulo: 'Carta de Vinhos (Imagem)',
      tipo: 'imagem',
      url: '/uploads/demo/carta-vinhos.jpg',
      thumbnailUrl: '/uploads/demo/carta-vinhos_thumb.jpg',
      duracao: 15,
      tamanho: BigInt(2 * 1024 * 1024),
      status: 'ready',
      origem: 'upload',
      metadata: { width: 1920, height: 1080 },
    },
    {
      clienteId: clienteDemo.id,
      titulo: 'Promoção Especial (Imagem)',
      tipo: 'imagem',
      url: '/uploads/demo/promo-especial.jpg',
      thumbnailUrl: '/uploads/demo/promo-especial_thumb.jpg',
      duracao: 10,
      tamanho: BigInt(1.5 * 1024 * 1024),
      status: 'ready',
      origem: 'upload',
      metadata: { width: 1920, height: 1080 },
    },
  ];

  for (const m of midias) {
    await prisma.midia.create({ data: m });
  }

  // Mídias para Básico
  await prisma.midia.create({
    data: {
      clienteId: clienteBasico.id,
      titulo: 'Vídeo da Adega',
      tipo: 'video',
      url: '/uploads/demo/basico-video.mp4',
      duracao: 60,
      status: 'ready',
      origem: 'upload',
      metadata: { width: 1280, height: 720 },
    },
  });

  // Mídias para Enterprise
  for (let i = 1; i <= 10; i++) {
    await prisma.midia.create({
      data: {
        clienteId: clienteEnterprise.id,
        titulo: `Conteúdo Corporativo ${i}`,
        tipo: 'video',
        url: `/uploads/demo/enterprise-${i}.mp4`,
        duracao: 60 + i * 10,
        status: 'ready',
        origem: 'upload',
        metadata: { width: 1920, height: 1080 },
      },
    });
  }

  console.log('✅ Mídias criadas');

  // ── Promoções (demo) ──
  const promocoes = [
    {
      clienteId: clienteDemo.id,
      titulo: '🍷 Wine Night — 20% OFF',
      descricao: 'Todas as garrafas de vinho tinto com 20% de desconto!',
      tipo: 'overlay',
      duracao: 10,
      posicao: 'bottom',
      corFundo: '#8B0000cc',
      corTexto: '#FFD700',
      tamanhoFonte: 28,
      ativa: true,
      agendada: false,
      prioridade: 10,
    },
    {
      clienteId: clienteDemo.id,
      titulo: '🎉 Degustação Grátis Sábado!',
      descricao: 'Venha degustar nossos vinhos premiados. Sábado das 14h às 18h.',
      tipo: 'fullscreen',
      duracao: 15,
      posicao: 'center',
      corFundo: '#4A0082cc',
      corTexto: '#FFFFFF',
      tamanhoFonte: 32,
      ativa: true,
      agendada: true,
      diasSemana: [6], // sábado
      horaInicio: '12:00',
      horaFim: '20:00',
      prioridade: 20,
    },
    {
      clienteId: clienteDemo.id,
      titulo: '🔥 Promoção Relâmpago',
      descricao: 'Queijos e vinhos — combo especial com 30% OFF!',
      tipo: 'overlay',
      duracao: 8,
      posicao: 'top',
      corFundo: '#FF4500cc',
      corTexto: '#FFFFFF',
      tamanhoFonte: 24,
      ativa: true,
      agendada: true,
      dataInicio: pastDays(1),
      dataFim: futureDays(7),
      prioridade: 15,
    },
    {
      clienteId: clienteDemo.id,
      titulo: '📦 Assinatura de Vinhos',
      descricao: 'Receba vinhos selecionados todo mês em casa!',
      tipo: 'overlay',
      duracao: 10,
      posicao: 'bottom',
      corFundo: '#006400cc',
      corTexto: '#FFFFFF',
      tamanhoFonte: 24,
      ativa: true,
      agendada: false,
      prioridade: 5,
    },
    {
      clienteId: clienteDemo.id,
      titulo: '🏆 Vinhos Premiados 2025',
      descricao: 'Conheça nossa seleção de vinhos premiados internacionalmente.',
      tipo: 'fullscreen',
      duracao: 12,
      posicao: 'center',
      corFundo: '#1a1a2ecc',
      corTexto: '#e94560',
      tamanhoFonte: 36,
      ativa: false, // desativada
      agendada: false,
      prioridade: 0,
    },
  ];

  // Promoções para Básico
  const promocaoBasico = {
    clienteId: clienteBasico.id,
    titulo: 'Promoção da Semana',
    descricao: 'Aproveite nossas ofertas!',
    tipo: 'overlay',
    duracao: 10,
    posicao: 'bottom',
    ativa: true,
    prioridade: 5,
  };

  await prisma.promocao.create({ data: promocaoBasico });

  for (const p of promocoes) {
    await prisma.promocao.create({ data: p });
  }
  console.log('✅ Promoções criadas');

  // ── Playlists ──
  const playlistDemo = await prisma.playlist.create({
    data: {
      clienteId: clienteDemo.id,
      nome: 'Playlist Principal',
      padrao: true,
    },
  });

  // Buscar mídias do demo para adicionar à playlist
  const demoMidias = await prisma.midia.findMany({
    where: { clienteId: clienteDemo.id },
    orderBy: { criadoEm: 'asc' },
  });

  let ordem = 1;
  for (const midia of demoMidias) {
    await prisma.playlistMidia.create({
      data: {
        playlistId: playlistDemo.id,
        midiaId: midia.id,
        ordem: ordem++,
      },
    });
  }

  // Vinculação de promoções (a cada 3 vídeos)
  const demoPromocoes = await prisma.promocao.findMany({
    where: { clienteId: clienteDemo.id, ativa: true },
  });

  for (const promo of demoPromocoes) {
    await prisma.playlistPromocao.create({
      data: {
        playlistId: playlistDemo.id,
        promocaoId: promo.id,
        frequencia: 2,
      },
    });
  }

  // Playlist do Básico
  const playlistBasico = await prisma.playlist.create({
    data: {
      clienteId: clienteBasico.id,
      nome: 'Playlist Padrão',
      padrao: true,
    },
  });

  const midiasBasico = await prisma.midia.findMany({
    where: { clienteId: clienteBasico.id },
  });

  for (const m of midiasBasico) {
    await prisma.playlistMidia.create({
      data: { playlistId: playlistBasico.id, midiaId: m.id, ordem: 1 },
    });
  }

  // Playlist do Enterprise
  const playlistEnterprise = await prisma.playlist.create({
    data: {
      clienteId: clienteEnterprise.id,
      nome: 'Playlist Corporativa',
      padrao: true,
    },
  });

  const midiasEnterprise = await prisma.midia.findMany({
    where: { clienteId: clienteEnterprise.id },
    take: 5,
    orderBy: { criadoEm: 'asc' },
  });

  ordem = 1;
  for (const m of midiasEnterprise) {
    await prisma.playlistMidia.create({
      data: { playlistId: playlistEnterprise.id, midiaId: m.id, ordem: ordem++ },
    });
  }

  console.log('✅ Playlists criadas');

  // ── Campanhas do Dev (Admin) ──
  await prisma.campanhaDev.create({
    data: {
      titulo: 'Adega SaaS — Planos Especiais',
      tipo: 'video',
      url: '/uploads/campanhas/adega-promo.mp4',
      duracao: 30,
      ativa: true,
      agendada: false,
      aleatoria: true,
      frequencia: 5,
      clientesAlvo: [],
      planosAlvo: [],
    },
  });

  await prisma.campanhaDev.create({
    data: {
      titulo: 'Atualize para o Plano Enterprise',
      tipo: 'overlay',
      url: '/uploads/campanhas/upgrade.png',
      duracao: 10,
      ativa: true,
      agendada: false,
      aleatoria: false,
      frequencia: 3,
      clientesAlvo: [clienteBasico.id], // só aparece para cliente básico
      planosAlvo: [planoBasicoId],
    },
  });

  console.log('✅ Campanhas do Dev criadas');

  // ── Faturas ──
  const faturas = [
    {
      clienteId: clienteDemo.id,
      asaasPaymentId: 'pay_demo00001',
      valor: 99.90,
      status: 'confirmed',
      dataVencimento: pastDays(15),
      dataPagamento: pastDays(16),
      tipo: 'assinatura',
      descricao: 'Plano Profissional — Mensal',
    },
    {
      clienteId: clienteDemo.id,
      asaasPaymentId: 'pay_demo00002',
      valor: 99.90,
      status: 'pending',
      dataVencimento: futureDays(15),
      tipo: 'assinatura',
      descricao: 'Plano Profissional — Mensal',
    },
    {
      clienteId: clienteBasico.id,
      asaasPaymentId: 'pay_demo00003',
      valor: 49.90,
      status: 'confirmed',
      dataVencimento: pastDays(10),
      dataPagamento: pastDays(10),
      tipo: 'assinatura',
      descricao: 'Plano Básico — Mensal',
    },
    {
      clienteId: clienteBasico.id,
      asaasPaymentId: 'pay_demo00004',
      valor: 49.90,
      status: 'pending',
      dataVencimento: futureDays(20),
      tipo: 'assinatura',
      descricao: 'Plano Básico — Mensal',
    },
  ];

  for (const f of faturas) {
    await prisma.fatura.create({ data: f });
  }
  console.log('✅ Faturas criadas');

  // ── Notificações ──
  const notificacoes = [
    {
      clienteId: clienteDemo.id,
      titulo: 'Bem-vindo ao Adega SaaS!',
      mensagem: 'Comece configurando suas TVs e adicionando conteúdo.',
      tipo: 'success',
      lida: true,
    },
    {
      clienteId: clienteDemo.id,
      titulo: 'Novo recurso: YouTube',
      mensagem: 'Agora você pode adicionar vídeos do YouTube à sua playlist.',
      tipo: 'info',
      lida: false,
    },
    {
      clienteId: clienteDemo.id,
      titulo: 'TV Degustação offline',
      mensagem: 'A TV 3 (Degustação) está sem sinal há 2 dias.',
      tipo: 'warning',
      lida: false,
    },
    {
      clienteId: clienteBasico.id,
      titulo: 'Bem-vindo!',
      mensagem: 'Sua conta foi criada com sucesso.',
      tipo: 'success',
      lida: true,
    },
  ];

  for (const n of notificacoes) {
    await prisma.notificacao.create({ data: n });
  }
  console.log('✅ Notificações criadas');

  console.log('🎭 Dados de demonstração criados com sucesso!');
  console.log('   📧 demo@adega.com / demo123');
  console.log('   📧 ze@adega.com / demo123');
  console.log('   📧 grande@vinicola.com / demo123');
}

// ═══════════════════════════════════════════════
// ── Run ──
// ═══════════════════════════════════════════════
const env = (process.env.NODE_ENV || 'development') as 'production' | 'development';

seed(env)
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

export { seed };
