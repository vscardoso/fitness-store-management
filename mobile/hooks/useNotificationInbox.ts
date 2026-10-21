/**
 * useNotificationInbox: lista de alertas da loja e contador de não lidos (selo do menu).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getInbox, getUnreadCount, markAllInboxRead, markInboxRead } from '@/services/notificationInboxService';

const INBOX_KEY = ['notification-inbox'];
const COUNT_KEY = ['notification-unread-count'];

export const useInbox = () => useQuery({ queryKey: INBOX_KEY, queryFn: getInbox });

export const useUnreadCount = () =>
  useQuery({ queryKey: COUNT_KEY, queryFn: getUnreadCount, refetchInterval: 60000 });

export const useMarkRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markInboxRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INBOX_KEY });
      qc.invalidateQueries({ queryKey: COUNT_KEY });
    },
  });
};

export const useMarkAllRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllInboxRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INBOX_KEY });
      qc.invalidateQueries({ queryKey: COUNT_KEY });
    },
  });
};
