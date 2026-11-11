/** Comprovante da venda vindo do servidor (a mesma consulta serve a tela, o WhatsApp e o PDF: baixa uma vez só). */
import { useQuery } from '@tanstack/react-query';
import { getReceipt } from '@/services/receiptService';

export function useSaleReceipt(saleId: number | undefined, change?: number) {
  return useQuery({
    queryKey: ['sale-receipt', saleId, change ?? 0],
    queryFn: () => getReceipt(saleId!, change),
    enabled: !!saleId,
    staleTime: 60_000,
  });
}
