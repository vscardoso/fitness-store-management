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
 * Primeiro nome tirado do nome do perfil do WhatsApp (que a pessoa mesma digitou): só letras, pelo menos 2, sem
 * emoji, número nem sinal. "JULIANA ✨" vira "Juliana"; "👑", "." ou "5534..." não viram nome. Quando o nome
 * vem todo em maiúscula ou todo em minúscula, arruma para Inicial maiúscula.
 */
export function profileFirstName(profileName: string | null | undefined): string {
  const token = (profileName ?? '').trim().split(/\s+/)[0] ?? '';
  const letters = token.replace(/[^\p{L}'-]/gu, '').replace(/^['-]+|['-]+$/g, '');
  if ([...letters].filter((ch) => /\p{L}/u.test(ch)).length < 2) return '';
  const mixed = letters !== letters.toUpperCase() && letters !== letters.toLowerCase();
  return mixed ? letters : letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
}

/**
 * Troca {nome} pelo primeiro nome da cliente (cadastro, se a conversa estiver ligada a uma cliente) ou, na falta
 * dele, pelo do perfil do WhatsApp. Sem nome nenhum, tira a variável e arruma a pontuação para não sair
 * "Oi , tudo bem?" nem "{nome}" literal.
 */
export function fillQuickReply(text: string, customerName: string | null | undefined, profileName?: string | null): string {
  const name = firstName(customerName) || profileFirstName(profileName);
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
