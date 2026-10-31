/** Respostas rápidas: filtro pelo que a atendente digitou depois da "/" e troca da variável {nome}. */
import type { WaQuickReply } from '@/services/whatsappService';

/** Texto digitado vira atalho a procurar quando começa com "/" e ainda não tem espaço (ex.: "/pre"). */
export function slashQuery(input: string): string | null {
  const m = /^\/([^\s/]*)$/.exec(input);
  return m ? m[1].toLowerCase() : null;
}

export function filterQuickReplies(all: WaQuickReply[], query: string): WaQuickReply[] {
  const q = query.toLowerCase();
  return all.filter((r) => r.shortcut.includes(q) || r.text.toLowerCase().includes(q));
}

function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * Troca {nome} pelo primeiro nome da cliente (cadastro, se a conversa estiver ligada a uma cliente). Sem nome
 * nenhum, tira a variável e arruma a pontuação para não sair "Oi , tudo bem?" nem "{nome}" literal.
 */
export function fillQuickReply(text: string, customerName: string | null | undefined): string {
  const name = firstName(customerName);
  if (name) return text.replace(/\{nome\}/gi, name);
  const cleaned = text
    .replace(/[,\s]*\{nome\}\s*([,!.?:;])/gi, '$1')   // "Oi, {nome}!" -> "Oi!"  e  "Olá {nome}, tudo" -> "Olá, tudo"
    .replace(/\s*\{nome\}/gi, '')                       // "Obrigada {nome}" -> "Obrigada"
    .replace(/\{nome\}\s*/gi, '')
    .replace(/ {2,}/g, ' ')
    .replace(/^[,;:]\s*/, '')                            // "{nome}, chegou" -> "chegou"
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
