import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// ── Asaas Webhook ──
router.post('/asaas', async (req: Request, res: Response) => {
  try {
    const { event, payment } = req.body;

    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      const fatura = await prisma.fatura.findFirst({
        where: { asaasPaymentId: payment.id },
        include: { cliente: true },
      });

      if (fatura) {
        await prisma.fatura.update({
          where: { id: fatura.id },
          data: {
            status: 'confirmed',
            dataPagamento: new Date(),
          },
        });

        // Renovar expiração do cliente
        const plano = await prisma.plano.findUnique({
          where: { id: fatura.cliente.planoId || '' },
        });

        const dias = 30; // plano mensal padrão
        const novaData = new Date();
        novaData.setDate(novaData.getDate() + dias);

        await prisma.cliente.update({
          where: { id: fatura.clienteId },
          data: { dataExpiracao: novaData, ativo: true },
        });
      }
    }

    if (event === 'PAYMENT_OVERDUE') {
      await prisma.fatura.updateMany({
        where: { asaasPaymentId: payment.id },
        data: { status: 'overdue' },
      });
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('[Webhook Asaas] Error:', err);
    return res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

export { router as webhookRouter };
