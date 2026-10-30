/** Contador de mensagens do WhatsApp da loja que ainda não foram lidas (selo do menu). */
import { useQuery } from '@tanstack/react-query';
import { getWhatsappUnread } from '@/services/whatsappService';

export const useWhatsappUnread = (enabled: boolean) =>
  useQuery({
    queryKey: ['whatsapp-unread'],
    queryFn: getWhatsappUnread,
    enabled,
    refetchInterval: 30000,
    // a loja sem número oficial (ou sem permissão) responde erro: sem selo, sem barulho
    retry: false,
  });
