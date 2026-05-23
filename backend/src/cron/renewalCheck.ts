import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Check for expired/expiring subscriptions ──
async function checkRenewals(): Promise<void> {
  console.log('[RenewalCheck] Starting daily renewal check...');

  try {
    const agora = new Date();
    const em7dias = new Date();
    em7dias.setDate(em7dias.getDate() + 7);

    // ── Find expiring clients (within 7 days) ──
    const expiringClients = await prisma.cliente.findMany({
      where: {
        ativo: true,
        dataExpiracao: {
          lte: em7dias,
          gt: agora,
        },
      },
      include: {
        plano: true,
      },
    });

    for (const cliente of expiringClients) {
      const diasRestantes = Math.ceil(
        (cliente.dataExpiracao!.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24),
      );

      console.log(`[RenewalCheck] Cliente ${cliente.id} (${cliente.nomeAdega}) expires in ${diasRestantes} days`);

      // Create notification
      await prisma.notificacao.create({
        data: {
          clienteId: cliente.id,
          titulo: 'Renovação se aproximando',
          mensagem: `Sua assinatura expira em ${diasRestantes} dias. Renove para manter o serviço ativo.`,
          tipo: 'warning',
        },
      });

      // If plan exists, try to auto-bill (via Asaas)
      if (cliente.plano && cliente.asaasCustomerId) {
        console.log(`[RenewalCheck] Auto-renewal candidate: ${cliente.email} (plan: ${cliente.plano.nome})`);
        // The actual Asaas payment creation would be handled by the Asaas service
        // and webhook callback. Here we just log the intent.
      }
    }

    // ── Find already expired clients ──
    const expiredClients = await prisma.cliente.findMany({
      where: {
        ativo: true,
        dataExpiracao: {
          lte: agora,
        },
      },
    });

    for (const cliente of expiredClients) {
      console.log(`[RenewalCheck] Cliente ${cliente.id} (${cliente.nomeAdega}) has expired - deactivating`);

      // Deactivate client
      await prisma.cliente.update({
        where: { id: cliente.id },
        data: { ativo: false },
      });

      // Create notification
      await prisma.notificacao.create({
        data: {
          clienteId: cliente.id,
          titulo: 'Assinatura expirada',
          mensagem: 'Sua assinatura expirou. Renove para reativar o serviço.',
          tipo: 'warning',
        },
      });

      // Notify admin
      await prisma.notificacao.create({
        data: {
          clienteId: cliente.id,
          titulo: 'Cliente desativado por expiração',
          mensagem: `Cliente ${cliente.nomeAdega} (${cliente.email}) foi desativado por expiração de assinatura.`,
          tipo: 'admin',
        },
      });
    }

    // ── Count summary ──
    console.log(`[RenewalCheck] Summary: ${expiringClients.length} expiring, ${expiredClients.length} expired`);
  } catch (err) {
    console.error('[RenewalCheck] Error:', (err as Error).message);
  }
}

// ── Schedule: every day at 2:00 AM ──
export function startRenewalCheck(): cron.ScheduledTask {
  console.log('[RenewalCheck] Scheduled daily at 2:00 AM');

  // Run immediately on startup for dev
  if (process.env.NODE_ENV === 'development') {
    checkRenewals();
  }

  return cron.schedule('0 2 * * *', checkRenewals, {
    scheduled: true,
    timezone: 'America/Sao_Paulo',
  });
}

export { checkRenewals };
