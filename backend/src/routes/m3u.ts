import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();
const TV_URL = process.env.TV_URL || 'https://tv.adega.queroservico.com.br';

// ── M3U Playlist ──
// GET /tv/tv1-nomedaadega.m3u
router.get('/:filename.m3u', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    // Parse: tv1-nomedaadega -> numero=1, slug=nomedaadega
    const match = filename.match(/^tv(\d+)-(.+)$/);

    if (!match) {
      return res.status(400).send('#EXTM3U\n# Arquivo M3U inválido. Formato: tv{NUMERO}-{SLUG}.m3u\n');
    }

    const numero = parseInt(match[1]);
    const slug = match[2];

    const tv = await prisma.tV.findFirst({
      where: {
        numero,
        cliente: { slug },
        ativa: true,
      },
      include: {
        cliente: {
          select: {
            id: true,
            nomeAdega: true,
            logo: true,
            marcaDagua: true,
            posicaoMarca: true,
            corMarca: true,
            slug: true,
          },
        },
      },
    });

    if (!tv) {
      return res.status(404).send('#EXTM3U\n# TV não encontrada ou inativa\n');
    }

    // Atualizar último acesso
    await prisma.tV.update({
      where: { id: tv.id },
      data: { ultimoAcesso: new Date() },
    });

    // Buscar playlist padrão
    const playlist = await prisma.playlist.findFirst({
      where: { clienteId: tv.clienteId, padrao: true },
      include: {
        midias: {
          orderBy: { ordem: 'asc' },
          include: {
            midia: {
              where: { status: 'ready' },
            },
          },
        },
        promocoes: {
          include: {
            promocao: {
              where: { ativa: true },
            },
          },
        },
      },
    });

    // Buscar campanhas do dev aplicáveis
    const campanhas = await prisma.campanhaDev.findMany({
      where: {
        ativa: true,
        OR: [
          { clientesAlvo: { has: tv.clienteId } },
          { clientesAlvo: { isEmpty: true } },
        ],
        // Verificar agendamento
        AND: [
          {
            OR: [
              { agendada: false },
              {
                agendada: true,
                dataInicio: { lte: new Date() },
                dataFim: { gte: new Date() },
              },
            ],
          },
        ],
      },
    });

    // Construir M3U
    const lines: string[] = ['#EXTM3U', `#PLAYLIST:${tv.cliente.nomeAdega}`];

    if (!playlist) {
      lines.push('#EXTINF:-1, Sem conteúdo');
      lines.push(`${TV_URL}/empty.mp4`);
      res.set('Content-Type', 'audio/x-mpegurl');
      return res.send(lines.join('\n'));
    }

    let index = 1;
    const addedMidias = new Set<string>();

    for (const pm of playlist.midias) {
      if (!pm.midia) continue;
      const midia = pm.midia;
      addedMidias.add(midia.id);

      const titulo = midia.titulo || `Video ${index}`;
      const duracao = midia.duracao || 0;

      lines.push(`#EXTINF:${duracao},${titulo}`);
      lines.push(`${TV_URL}/stream/${tv.cliente.slug}/${midia.id}`);

      // Inserir campanhas do dev (se aplicável)
      for (const campanha of campanhas) {
        if (campanha.aleatoria) {
          if (Math.random() > 1 / campanha.frequencia) continue;
        } else if (index % campanha.frequencia !== 0) continue;

        lines.push(`#EXTINF:${campanha.duracao || 15},[CAMPANHA] ${campanha.titulo}`);
        lines.push(`${TV_URL}/stream/campanha/${campanha.id}`);
      }

      // Verificar promoções agendadas ativas
      const agora = new Date();
      for (const pp of playlist.promocoes) {
        if (!pp.promocao) continue;
        const promocao = pp.promocao;

        if (promocao.agendada) {
          if (promocao.dataInicio && new Date(promocao.dataInicio) > agora) continue;
          if (promocao.dataFim && new Date(promocao.dataFim) < agora) continue;
          if (promocao.diasSemana?.length && !promocao.diasSemana.includes(agora.getDay())) continue;
          // Verificar horário
          if (promocao.horaInicio && promocao.horaFim) {
            const horaAtual = agora.getHours() * 60 + agora.getMinutes();
            const [hi, mi] = promocao.horaInicio.split(':').map(Number);
            const [hf, mf] = promocao.horaFim.split(':').map(Number);
            const horaInicio = hi * 60 + mi;
            const horaFim = hf * 60 + mf;
            if (horaAtual < horaInicio || horaAtual > horaFim) continue;
          }
        }

        if (index % pp.frequencia === 0) {
          const meta = [
            `logo=${tv.cliente.logo || ''}`,
            `marcaDagua=${tv.cliente.marcaDagua || ''}`,
            `posicaoMarca=${tv.cliente.posicaoMarca}`,
            `corMarca=${tv.cliente.corMarca}`,
            `tipo=${promocao.tipo}`,
            `duracao=${promocao.duracao}`,
            `posicao=${promocao.posicao}`,
            `titulo=${encodeURIComponent(promocao.titulo)}`,
            `descricao=${encodeURIComponent(promocao.descricao || '')}`,
            `corFundo=${encodeURIComponent(promocao.corFundo)}`,
            `corTexto=${encodeURIComponent(promocao.corTexto)}`,
            `imagemUrl=${encodeURIComponent(promocao.imagemUrl || '')}`,
            `somUrl=${encodeURIComponent(promocao.somUrl || '')}`,
          ].join('&');

          lines.push(`#EXTINF:${promocao.duracao},[PROMO] ${promocao.titulo}`);
          lines.push(`${TV_URL}/overlay/${tv.cliente.slug}/${promocao.id}?${meta}`);
        }
      }

      index++;
    }

    res.set('Content-Type', 'audio/x-mpegurl');
    res.set('Content-Disposition', `inline; filename="${filename}.m3u"`);
    return res.send(lines.join('\n'));
  } catch (err) {
    console.error('[M3U] Error:', err);
    return res.status(500).send('#EXTM3U\n# Erro ao gerar playlist\n');
  }
});

// ── Stream de vídeo ──
router.get('/stream/:slug/:midiaId', async (req: Request, res: Response) => {
  try {
    const { slug, midiaId } = req.params;

    // Validar acesso
    const cliente = await prisma.cliente.findUnique({ where: { slug } });
    if (!cliente) return res.status(404).json({ error: 'Não encontrado' });

    const midia = await prisma.midia.findFirst({
      where: { id: midiaId, clienteId: cliente.id },
    });

    if (!midia || midia.status !== 'ready') {
      return res.status(404).json({ error: 'Mídia não encontrada' });
    }

    // Redirecionar para o arquivo
    return res.redirect(midia.url);
  } catch (err) {
    console.error('[Stream] Error:', err);
    return res.status(500).json({ error: 'Erro ao servir mídia' });
  }
});

// ── Stream de campanha ──
router.get('/stream/campanha/:campanhaId', async (req: Request, res: Response) => {
  const campanha = await prisma.campanhaDev.findUnique({
    where: { id: req.params.campanhaId },
  });

  if (!campanha || !campanha.ativa) {
    return res.status(404).json({ error: 'Campanha não encontrada' });
  }

  return res.redirect(campanha.url);
});

// ── Overlay de promoção (HTML/JS player) ──
router.get('/overlay/:slug/:promocaoId', (_req: Request, res: Response) => {
  // Retorna HTML que overlay sobre o vídeo
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{margin:0;background:transparent;overflow:hidden}
  #overlay{position:fixed;z-index:9999;display:flex;align-items:center;justify-content:center;font-family:Arial}
  #overlay.bottom{bottom:10%;left:5%;right:5%}
  #overlay.top{top:10%;left:5%;right:5%}
  #overlay.center{top:50%;left:50%;transform:translate(-50%,-50%)}
</style></head><body>
<div id="overlay" class="bottom"></div>
<script>
  const params = new URLSearchParams(window.location.search);
  const overlay = document.getElementById('overlay');
  overlay.className = params.get('posicao') || 'bottom';
  overlay.style.backgroundColor = params.get('corFundo') || '#000000cc';
  overlay.style.color = params.get('corTexto') || '#ffffff';
  overlay.style.padding = '20px';
  overlay.style.borderRadius = '8px';
  overlay.style.fontSize = (params.get('tamanhoFonte') || 24) + 'px';

  const titulo = decodeURIComponent(params.get('titulo') || '');
  const descricao = decodeURIComponent(params.get('descricao') || '');
  const imagem = decodeURIComponent(params.get('imagemUrl') || '');

  let html = '';
  if(imagem) html += '<img src="' + imagem + '" style="max-width:200px;margin-right:15px" />';
  html += '<div><strong>' + titulo + '</strong>';
  if(descricao) html += '<br><small>' + descricao + '</small>';
  html += '</div>';
  overlay.innerHTML = html;

  const duracao = parseInt(params.get('duracao') || '10') * 1000;
  setTimeout(function(){ window.close(); }, duracao);
</script></body></html>`);
});

export { router as m3uRouter };
