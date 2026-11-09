/**
 * Importar estoque por planilha: para a loja que já tem peças quando começa a usar o app.
 * Baixa o modelo, preenche no Excel, envia (ou cola) e confere ANTES de gravar. Grava tudo ou nada,
 * numa única entrada de "Estoque inicial", com o custo da planilha.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency } from '@/utils/format';
import { brToIso, maskDate, todayBr } from '@/utils/dateBr';
import { parseApiError } from '@/utils/apiError';
import {
  commitStockImport,
  downloadImportTemplate,
  previewStockImport,
  type ImportPreview,
  type ImportResult,
  type ImportRow,
  type ImportRowStatus,
  type ImportSource,
} from '@/services/stockImportService';
import { useDesktopContentStyle } from '@/hooks/useLayout';

const STATUS_LABEL: Record<ImportRowStatus, string> = {
  novo_produto: 'Produto novo',
  nova_variacao: 'Variação nova',
  soma: 'Soma no estoque',
  ignorada: 'Ignorada',
  erro: 'Erro',
};
const MAX_SHOWN = 200;

export default function ImportStockScreen() {
  const desktopContent = useDesktopContentStyle();
  const router = useRouter();
  const brand = useBrandingColors();
  const queryClient = useQueryClient();
  const fileInput = useRef<any>(null);

  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [dateBr, setDateBr] = useState(todayBr());
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');

  const source: ImportSource = useMemo(() => ({ file, text }), [file, text]);
  const hasInput = !!file || text.trim().length > 0;

  const reset = () => {
    setPreview(null);
    setResult(null);
    setError('');
  };

  const pickFile = (e: any) => {
    const f: File | undefined = e?.target?.files?.[0];
    if (e?.target) e.target.value = ''; // permite escolher o mesmo arquivo de novo depois de corrigir
    if (!f) return;
    setFile(f);
    setText('');
    reset();
  };

  const check = async () => {
    reset();
    setBusy(true);
    try {
      setPreview(await previewStockImport(source));
    } catch (e) {
      setError(parseApiError(e) || 'Não foi possível conferir a planilha.');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    const iso = brToIso(dateBr);
    if (!iso) {
      setConfirm(false);
      setError('Data do estoque inválida. Use DD/MM/AAAA.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await commitStockImport(source, iso);
      setResult(res);
      setPreview(null);
      setConfirm(false);
      queryClient.invalidateQueries();
    } catch (e) {
      setConfirm(false);
      setError(parseApiError(e) || 'Não foi possível importar. Nada foi gravado.');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      await downloadImportTemplate();
    } catch (e) {
      setError(parseApiError(e) || 'Não foi possível baixar o modelo.');
    }
  };

  const s = preview?.summary;
  const errorRows = (preview?.rows ?? []).filter((r) => r.status === 'erro');
  const shownRows = useMemo(() => {
    const rows = preview?.rows ?? [];
    return [...rows.filter((r) => r.status === 'erro'), ...rows.filter((r) => r.status !== 'erro')].slice(0, MAX_SHOWN);
  }, [preview]);

  return (
    <View style={styles.container}>
      <PageHeader title="Importar estoque" subtitle="Traga as peças que a loja já tem" showBackButton />
      <ScrollView contentContainerStyle={[styles.content, desktopContent]} keyboardShouldPersistTaps="handled">
        {result ? (
          <View style={styles.card}>
            <Text style={styles.title}>Estoque importado</Text>
            <Text style={styles.note}>
              {result.pieces} peças entraram na entrada {result.entry_code}, com o custo da planilha ({formatCurrency(result.total_cost)} no total).
            </Text>
            <Text style={styles.note}>
              {result.products_created} produto(s) novo(s), {result.variants_created} variação(ões) nova(s)
              {result.products_touched > result.products_created ? `, ${result.products_touched - result.products_created} produto(s) que já existiam` : ''}.
              {result.categories_created.length ? ` Categorias criadas: ${result.categories_created.join(', ')}.` : ''}
            </Text>
            <View style={styles.actions}>
              <Button mode="contained" buttonColor={brand.primary} onPress={() => router.replace(`/entries/${result.entry_id}` as any)}>
                Ver a entrada
              </Button>
              <Button mode="outlined" onPress={() => router.replace('/(tabs)/products' as any)}>
                Ver produtos
              </Button>
              <Button
                mode="text"
                onPress={() => {
                  setFile(null);
                  setText('');
                  reset();
                }}
              >
                Importar outra planilha
              </Button>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.title}>1. Baixe o modelo e preencha</Text>
              <Text style={styles.note}>
                Uma linha por peça: Produto, Categoria, Cor, Tamanho, Quantidade, Custo e Preço. O custo é obrigatório: sem ele o lucro
                fica errado. Cada tamanho e cor é uma linha. Até 1.500 linhas por vez.
              </Text>
              <Button mode="outlined" icon="download" onPress={download} style={styles.btn}>
                Baixar modelo
              </Button>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>2. Envie a planilha</Text>
              {Platform.OS === 'web' && (
                <>
                  {React.createElement('input', {
                    ref: fileInput,
                    type: 'file',
                    accept: '.xlsx,.csv,.txt,text/csv',
                    onChange: pickFile,
                    style: { display: 'none' },
                  })}
                  <Button mode="contained-tonal" icon="file-upload-outline" onPress={() => fileInput.current?.click()} style={styles.btn}>
                    {file ? 'Trocar arquivo' : 'Escolher arquivo (Excel ou CSV)'}
                  </Button>
                  {!!file && <Text style={styles.fileName}>{file.name}</Text>}
                </>
              )}
              <Text style={styles.note}>
                {Platform.OS === 'web' ? 'Ou cole aqui as linhas copiadas do Excel (com a linha de títulos):' : 'Copie as linhas do Excel (com a linha de títulos) e cole aqui:'}
              </Text>
              <TextInput
                mode="outlined"
                multiline
                numberOfLines={6}
                value={text}
                onChangeText={(t) => {
                  setText(t);
                  if (file) setFile(null);
                  reset();
                }}
                placeholder={'Produto\tCategoria\tCor\tTamanho\tQuantidade\tCusto\tPreço'}
                style={[styles.input, { minHeight: 120 }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                mode="outlined"
                label="Data do estoque inicial"
                value={dateBr}
                onChangeText={(t) => setDateBr(maskDate(t))}
                keyboardType="numeric"
                placeholder="DD/MM/AAAA"
                style={styles.input}
              />
              <Button mode="contained" buttonColor={brand.primary} onPress={check} disabled={!hasInput || busy} style={styles.btn}>
                Conferir planilha
              </Button>
              {busy && !confirm && (
                <ScreenLoader inline message="Conferindo a planilha..." style={styles.checking} />
              )}
            </View>
          </>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {preview?.fatal && (
          <View style={[styles.card, styles.cardError]}>
            <Text style={styles.errorTitle}>{preview.summary ? 'Não dá para importar' : 'Confira a planilha'}</Text>
            <Text style={styles.error}>{preview.fatal}</Text>
          </View>
        )}

        {s && (
          <View style={styles.card}>
            <Text style={styles.title}>3. Conferência</Text>
            <View style={styles.grid}>
              <Stat label="Peças" value={String(s.pieces)} />
              <Stat label="Produtos novos" value={String(s.products_new)} />
              <Stat label="Já existem" value={String(s.products_existing)} />
              <Stat label="Variações" value={String(s.variants)} />
              <Stat label="Custo total" value={formatCurrency(s.total_cost)} />
              <Stat label="Valor de venda" value={formatCurrency(s.total_sale)} />
            </View>
            {s.categories_new.length > 0 && <Text style={styles.note}>Categorias novas: {s.categories_new.join(', ')}.</Text>}
            {s.variants_added_to_existing > 0 && (
              <Text style={styles.warn}>
                {s.variants_added_to_existing} peça(s) já existem no estoque: as unidades da planilha serão SOMADAS a elas.
              </Text>
            )}
            {s.ignored > 0 && <Text style={styles.note}>{s.ignored} linha(s) sem quantidade serão ignoradas.</Text>}
            {s.errors > 0 ? (
              <Text style={styles.error}>
                {s.errors} linha(s) com erro. Corrija a planilha e confira de novo: nada é importado enquanto houver erro.
              </Text>
            ) : preview?.can_import ? (
              <Button
                mode="contained"
                buttonColor={brand.primary}
                onPress={() => setConfirm(true)}
                disabled={busy}
                style={styles.btn}
              >
                {`Importar ${s.pieces} peças`}
              </Button>
            ) : null}
          </View>
        )}

        {shownRows.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.title}>Linhas</Text>
            {errorRows.length > 0 && <Text style={styles.note}>As linhas com erro aparecem primeiro.</Text>}
            {shownRows.map((r) => (
              <RowItem key={r.line} row={r} />
            ))}
            {(preview?.rows.length ?? 0) > MAX_SHOWN && (
              <Text style={styles.note}>Mostrando {MAX_SHOWN} de {preview?.rows.length} linhas.</Text>
            )}
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirm}
        title="Importar o estoque?"
        message="As peças entram no estoque agora, numa entrada de Estoque inicial, e valem para vendas e relatórios. Se algo falhar, nada é gravado."
        details={s ? [`${s.pieces} peças`, `Custo total ${formatCurrency(s.total_cost)}`, `${s.products_new} produto(s) novo(s)`, `Data ${dateBr}`] : []}
        confirmText="Importar"
        type="info"
        loading={busy}
        onConfirm={doImport}
        onCancel={() => setConfirm(false)}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RowItem({ row }: { row: ImportRow }) {
  const isError = row.status === 'erro';
  const color = isError ? Colors.light.error : row.status === 'soma' ? Colors.light.warning : row.status === 'ignorada' ? Colors.light.textSecondary : Colors.light.success;
  const variant = [row.color, row.size].filter(Boolean).join(' · ');
  return (
    <View style={[styles.rowItem, isError && styles.rowItemError]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>
          {`Linha ${row.line}: ${row.product || '(sem nome)'}`}
          {variant ? ` (${variant})` : ''}
        </Text>
        {!!row.message && <Text style={[styles.rowMsg, isError && { color: Colors.light.error }]}>{row.message}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.rowStatus, { color }]}>{STATUS_LABEL[row.status]}</Text>
        {row.quantity > 0 && <Text style={styles.rowMsg}>{row.quantity} un</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.light.border },
  cardError: { borderColor: Colors.light.error },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  errorTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.error },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginTop: 6 },
  warn: { fontSize: 13, lineHeight: 19, color: Colors.light.warning, marginTop: 8, fontWeight: '600' },
  error: { color: Colors.light.error, marginTop: 6, lineHeight: 19 },
  fileName: { marginTop: 6, fontWeight: '600', color: Colors.light.text },
  input: { marginTop: 10, backgroundColor: Colors.light.card },
  btn: { marginTop: 12 },
  checking: { paddingVertical: 24 },
  actions: { marginTop: 12, gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  stat: { minWidth: 112, flexGrow: 1, flexBasis: 112, padding: 10, borderRadius: 12, backgroundColor: Colors.light.background },
  statValue: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  statLabel: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  rowItem: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.light.border },
  rowItemError: { backgroundColor: Colors.light.errorLight, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 8 },
  rowTitle: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  rowMsg: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  rowStatus: { fontSize: 12, fontWeight: '700' },
});
