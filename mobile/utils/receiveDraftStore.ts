/**
 * Rascunho da compra guardado no aparelho (por loja), para não perder o que já foi lançado se o app fechar.
 * Nada disto vai ao servidor: o estoque só muda em "Lançar no estoque".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReceiveDraft } from '@/utils/receivePurchase';

const key = (tenantId: number | null | undefined) => `@provador:receber:${tenantId ?? 'x'}`;

export async function loadReceiveDraft(tenantId: number | null | undefined): Promise<ReceiveDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(key(tenantId));
    if (!raw) return null;
    const d = JSON.parse(raw) as ReceiveDraft;
    return d && Array.isArray(d.items) && d.requestId ? d : null;
  } catch {
    return null;
  }
}

export async function saveReceiveDraft(tenantId: number | null | undefined, draft: ReceiveDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(key(tenantId), JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    /* sem espaço ou bloqueado: a compra continua na tela, só não fica guardada */
  }
}

export async function clearReceiveDraft(tenantId: number | null | undefined): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(tenantId));
  } catch {
    /* ignora */
  }
}
