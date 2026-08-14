#!/usr/bin/env node
/**
 * Verificação de português em textos de UI (.tsx/.ts).
 *
 * Varre todo o código por pares de palavras comumente confundidas em
 * PT-BR (média/mídia, sessão/seção, etc) e imprime cada ocorrência com
 * contexto para revisão humana — não corrige automaticamente, porque
 * a palavra certa depende do sentido da frase.
 *
 * Uso: node scripts/check-pt-br.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORE_DIRS = new Set(['node_modules', '.git', 'ios', 'android', '.expo', 'dist', 'build']);
const EXTENSIONS = new Set(['.tsx', '.ts']);

// Pares [regex do termo suspeito, termo(s) provavelmente corretos, dica de contexto]
// Focado em pares de ALTA confiança (troca de acento/letra muda o sentido inteiro),
// evitando pares ambíguos demais para grep (ex: "mas/mais" gera muito falso positivo).
const SUSPECT_PAIRS = [
  { term: /\bMídia\b/g, note: 'Mídia (comunicação/imprensa) vs Média (average/aritmética) — confirme o sentido' },
  { term: /\bSeção\b/g, note: 'Seção (parte de um texto/tela) vs Sessão (período de tempo/login) — confirme o sentido' },
  { term: /\bSessão\b/g, note: 'Sessão (período de tempo/login) vs Seção (parte de texto/tela) — confirme o sentido' },
  { term: /\bCessão\b/g, note: 'Cessão (ato de ceder) — raro, confirme se não era Seção/Sessão' },
  { term: /\bComprimento\b/g, note: 'Comprimento (medida/tamanho) vs Cumprimento (saudação) — confirme o sentido' },
  { term: /\bCumprimento\b/g, note: 'Cumprimento (saudação) vs Comprimento (medida/tamanho) — confirme o sentido' },
  { term: /\bTrafego\b/g, note: 'Sem acento — provavelmente deveria ser "Tráfego"' },
  { term: /\bConcerteza\b/gi, note: 'Errado — o correto é "com certeza" (duas palavras)' },
  { term: /\bAtravez\b/gi, note: 'Errado — o correto é "através"' },
  { term: /\bAcender\b/g, note: 'Acender (ligar luz/fogo) vs Ascender (subir/progredir) — confirme o sentido' },
  { term: /\bAscender\b/g, note: 'Ascender (subir/progredir) vs Acender (ligar luz/fogo) — confirme o sentido' },
  { term: /\bTampouco\b/gi, note: 'Ok se usado como "nem sequer" — confirme não ser erro de "tão pouco"' },
  { term: /\bDescriminar\b/gi, note: 'Descriminar (absolver) vs Discriminar (diferenciar/segregar) — confirme o sentido' },
  { term: /\bEmoção\b.{0,15}\bemossão\b/gi, note: 'possível erro de grafia' },
  { term: /\bRetificar\b/g, note: 'Retificar (corrigir) vs Ratificar (confirmar/aprovar) — confirme o sentido' },
  { term: /\bRatificar\b/g, note: 'Ratificar (confirmar/aprovar) vs Retificar (corrigir) — confirme o sentido' },
  { term: /\bInflação\b.{0,10}\binflamação\b/gi, note: 'possível troca de termo' },
  { term: /\bEmpecilho\b/gi, note: 'Confirme grafia — comum erro "impecilho"' },
  { term: /\bImpecilho\b/gi, note: 'Errado — o correto é "empecilho"' },
  { term: /\bPriorizar\b/g, note: null }, // termo correto, sem nota — placeholder para futuras extensões
];

// Remove o placeholder sem nota (mantém a lista só com pares acionáveis)
const RULES = SUSPECT_PAIRS.filter((r) => r.note);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function main() {
  const files = walk(ROOT);
  let totalHits = 0;
  const hitsByFile = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    const fileHits = [];

    lines.forEach((line, idx) => {
      for (const rule of RULES) {
        rule.term.lastIndex = 0;
        if (rule.term.test(line)) {
          fileHits.push({ lineNumber: idx + 1, text: line.trim(), note: rule.note });
        }
      }
    });

    if (fileHits.length > 0) {
      hitsByFile.push({ file: path.relative(ROOT, file), hits: fileHits });
      totalHits += fileHits.length;
    }
  }

  if (totalHits === 0) {
    console.log('Nenhuma ocorrência suspeita encontrada.');
    return;
  }

  console.log(`${totalHits} ocorrência(s) suspeita(s) em ${hitsByFile.length} arquivo(s):\n`);
  for (const { file, hits } of hitsByFile) {
    console.log(`\x1b[1m${file}\x1b[0m`);
    for (const h of hits) {
      console.log(`  ${h.lineNumber}: ${h.text}`);
      console.log(`      \x1b[33m→ ${h.note}\x1b[0m`);
    }
    console.log('');
  }
}

main();
