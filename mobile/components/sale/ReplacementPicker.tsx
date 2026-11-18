/**
 * Escolha da peça que o cliente leva no lugar (troca), no padrão BottomSheet do app.
 *
 * Ordem pensada para o balcão: (1) o que está voltando, para ninguém trocar a peça errada; (2) BIPAR a etiqueta da peça nova
 * (câmera, leitor ou código digitado), que serve para qualquer produto; (3) duas abas: "Mesmo produto" (outras cores e tamanhos,
 * o caso mais comum, com o efeito no valor ao lado de cada uma) e "Outro produto" (busca pelo nome). As abas existem porque o
 * mesmo produto pode ter 20 variações e empurrar a busca para fora da tela.
 * Peça sem estoque, a mesma que voltou e peça mais barata em loja que não devolve diferença não podem ser escolhidas, e a
 * tela diz o porquê (em vez de deixar escolher e recusar depois).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import AppButton from '@/components/ui/AppButton';
import BottomSheet from '@/components/ui/BottomSheet';
import ScreenLoader from '@/components/ui/ScreenLoader';
import ScanBar, { type ScanStatus } from '@/components/scan/ScanBar';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { getProductById, getProducts, searchProducts } from '@/services/productService';
import { lookupCode } from '@/services/codeResolver';
import { formatCurrency } from '@/utils/format';
import { playScan } from '@/utils/scanFeedback';
import type { Product } from '@/types';

export interface ReplacementChoice {
  variant_id: number;
  label: string;
  /** Preço de tabela da peça nova (o desconto da troca, se houver, vem em `unitDiscount`). */
  price: number;
  /** Desconto POR PEÇA em reais que quem vende deu nesta peça nova (digitado; vazio = sem desconto). */
  unitDiscount?: number;
}

interface Props {
  visible: boolean;
  /** Produto da peça devolvida: as variações dele aparecem primeiro. */
  productId?: number;
  /** Variação devolvida (não pode ser escolhida de volta). */
  excludeVariantId?: number | null;
  /** O que está voltando, para mostrar no topo (nome e cor/tamanho). */
  returnedLabel?: string;
  /** Texto antes do nome no topo (padrão: "Voltando"). */
  returnedPrefix?: string;
  /** Valor de CADA peça que volta (já com o desconto que ela teve): base para mostrar quanto muda no valor. */
  returnedUnitValue?: number;
  /** Se a loja devolve a diferença quando a peça nova é mais barata (se não, o cliente completa com outras peças). */
  allowRefund?: boolean;
  onSelect: (choice: ReplacementChoice) => void;
  onClose: () => void;
}

type Effect = { text: string; tone: 'neutral' | 'pay' | 'back' | 'blocked' };

/** Efeito da peça nova no valor da troca, em frase curta (e se ela pode ser escolhida). */
function effectOf(price: number, returnedUnitValue: number | undefined, allowRefund: boolean): Effect & { allowed: boolean } {
  if (returnedUnitValue == null) return { text: '', tone: 'neutral', allowed: true };
  const diff = Math.round((price - returnedUnitValue) * 100) / 100;
  if (Math.abs(diff) < 0.005) return { text: 'mesmo valor', tone: 'neutral', allowed: true };
  if (diff > 0) return { text: `${formatCurrency(diff)} a pagar`, tone: 'pay', allowed: true };
  if (allowRefund) return { text: `você devolve ${formatCurrency(-diff)}`, tone: 'back', allowed: true };
  // Loja que não devolve dinheiro: a peça mais barata é aceita e o cliente completa o valor com outra peça
  return { text: `falta ${formatCurrency(-diff)} para completar`, tone: 'neutral', allowed: true };
}

export default function ReplacementPicker({
  visible, productId, excludeVariantId, returnedLabel, returnedPrefix = 'Voltando', returnedUnitValue, allowRefund = true, onSelect, onClose,
}: Props) {
  const brand = useBrandingColors();
  const [sameProduct, setSameProduct] = useState<Product | null>(null);
  const [results, setResults] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [loadingSame, setLoadingSame] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState('');
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [tab, setTab] = useState<'same' | 'other'>('same');
  const [suggested, setSuggested] = useState<Product[]>([]);

  useEffect(() => {
    if (!visible) return;
    setQuery(''); setError(''); setResults([]); setSameProduct(null); setScanStatus(null);
    setTab(productId ? 'same' : 'other');
    if (productId) {
      setLoadingSame(true);
      getProductById(productId)
        .then((p) => setSameProduct(p))
        .catch(() => setError('Não foi possível carregar as outras cores e tamanhos.'))
        .finally(() => setLoadingSame(false));
    }
  }, [visible, productId]);

  // Sem produto igual com estoque: abre direto em "Outro produto". Lá, antes de digitar, já mostra o que tem em estoque.
  useEffect(() => {
    if (visible && !loadingSame && productId && sameProduct && available(sameProduct).length === 0) setTab('other');
  }, [visible, loadingSame, productId, sameProduct]);

  useEffect(() => {
    if (!visible || tab !== 'other') return;
    getProducts({ has_stock: true, limit: 30 }).then((r) => setSuggested(r)).catch(() => { /* a busca por nome continua valendo */ });
  }, [visible, tab]);

  useEffect(() => {
    if (!visible || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      setLoadingSearch(true);
      searchProducts(query.trim())
        .then((r) => setResults(r))
        .catch(() => setError('Não foi possível buscar.'))
        .finally(() => setLoadingSearch(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, visible]);

  const available = (p: Product) =>
    (p.variants || []).filter((v) => v.is_active !== false && v.id !== excludeVariantId && (v.current_stock ?? 0) > 0);

  const choose = (name: string, v: { id: number; color?: string | null; size?: string | null }, price: number) => {
    const detail = [v.color, v.size].filter(Boolean).join(' · ') || 'Única';
    onSelect({ variant_id: v.id, label: `${name} - ${detail}`, price });
  };

  // Bipou a etiqueta da peça nova: confere e já escolhe (qualquer produto da loja)
  const handleScan = async (code: string) => {
    try {
      const found = await lookupCode(code);
      if (!found) {
        playScan('error');
        setScanStatus({ kind: 'error', text: `Código ${code} não encontrado nesta loja.` });
        return;
      }
      const v = found.variant;
      const detail = [v.color, v.size].filter(Boolean).join(' · ') || 'Única';
      const price = Number(v.price) > 0 ? Number(v.price) : Number(found.product.base_price);
      if (v.id === excludeVariantId) {
        playScan('error');
        setScanStatus({ kind: 'error', text: 'Esta é a peça que está voltando. Bipe a peça nova que o cliente leva.' });
        return;
      }
      if ((v.current_stock ?? 0) <= 0) {
        playScan('error');
        setScanStatus({ kind: 'error', text: `Sem estoque: ${found.product.name} · ${detail}.` });
        return;
      }
      if (!(price > 0)) {
        playScan('error');
        setScanStatus({ kind: 'error', text: `${found.product.name} · ${detail} está sem preço no cadastro.` });
        return;
      }
      playScan('ok');
      choose(found.product.name, v, price);
    } catch (e: any) {
      playScan('error');
      setScanStatus({ kind: 'error', text: e?.message || 'Não foi possível consultar o código. Tente de novo.' });
    }
  };

  const renderOptions = (p: Product) => (
    <View key={p.id} style={{ marginBottom: theme.spacing.sm }}>
      {available(p).map((v) => {
        const detail = [v.color, v.size].filter(Boolean).join(' · ') || 'Única';
        const price = Number(v.price);
        const eff = effectOf(price, returnedUnitValue, allowRefund);
        return (
          <TouchableOpacity
            key={v.id}
            style={[styles.row, !eff.allowed && styles.rowBlocked]}
            activeOpacity={0.75}
            disabled={!eff.allowed}
            onPress={() => choose(p.name, v, price)}
            accessibilityRole="button"
            accessibilityLabel={`${p.name}, ${detail}, ${formatCurrency(price)}${eff.text ? `, ${eff.text}` : ''}`}
          >
            <View style={[styles.rowIcon, { backgroundColor: brand.primary + '20' }]}>
              <Ionicons name="shirt-outline" size={18} color={brand.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{detail}</Text>
              <Text style={styles.rowMeta} numberOfLines={2}>
                {v.current_stock} em estoque
                {eff.text ? <Text style={eff.tone === 'pay' ? styles.effPay : eff.tone === 'blocked' ? styles.effBlocked : styles.effNeutral}>{` · ${eff.text}`}</Text> : null}
              </Text>
            </View>
            <Text style={[styles.rowPrice, { color: eff.allowed ? brand.primary : Colors.light.textTertiary }]}>{formatCurrency(price)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const sameOptions = sameProduct ? available(sameProduct) : [];
  const searched = results.filter((p) => available(p).length > 0);
  const hasQuery = query.trim().length >= 2;

  return (
    <BottomSheet visible={visible} onDismiss={onClose} title="Qual peça vai no lugar?" subtitle="Só aparecem peças com estoque" icon="swap-horizontal-outline" tall>
      {!!returnedLabel && (
        <View style={styles.returning}>
          <Ionicons name="return-down-back-outline" size={18} color={Colors.light.textSecondary} />
          <Text style={styles.returningText} numberOfLines={2}>
            {returnedPrefix}: <Text style={styles.returningStrong}>{returnedLabel}</Text>
            {returnedUnitValue != null ? ` (${formatCurrency(returnedUnitValue)})` : ''}
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Bipar a peça nova</Text>
      <ScanBar
        onCode={handleScan}
        status={scanStatus}
        placeholder="Bipe ou digite o código da etiqueta"
        paused={!visible}
        closeOnScan
      />

      <View style={styles.tabs} accessibilityRole="tablist">
        <AppButton
          variant={tab === 'same' ? 'primary' : 'outlined'} size="sm" icon="shirt-outline" style={styles.tabBtn}
          label={sameOptions.length > 0 ? `Outro tamanho ou cor (${sameOptions.length})` : 'Sem outro tamanho ou cor'}
          onPress={() => setTab('same')} disabled={!loadingSame && sameOptions.length === 0}
        />
        <AppButton
          variant={tab === 'other' ? 'primary' : 'outlined'} size="sm" icon="search-outline" style={styles.tabBtn}
          label="Outro produto" onPress={() => setTab('other')}
        />
      </View>

      {tab === 'same' && (loadingSame ? <ScreenLoader inline /> : sameOptions.length > 0 ? (
        <>
          <Text style={styles.hint}>Outros tamanhos e cores de {sameProduct?.name}</Text>
          {renderOptions({ ...sameProduct!, variants: sameOptions })}
        </>
      ) : (
        <Text style={styles.hint}>Este produto não tem outro tamanho ou cor em estoque. Bipe a etiqueta ou busque outro produto.</Text>
      ))}

      {tab === 'other' && (<>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={Colors.light.textTertiary} />
        <RNTextInput
          style={styles.searchInput}
          placeholder="Buscar pelo nome (2 letras ou mais)"
          placeholderTextColor={Colors.light.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          accessibilityLabel="Buscar outro produto pelo nome"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Limpar busca">
            <Ionicons name="close-circle" size={16} color={Colors.light.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {hasQuery && (loadingSearch ? (
        <ScreenLoader inline />
      ) : searched.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={32} color={Colors.light.textTertiary} />
          <Text style={styles.emptyText}>Nenhuma peça com estoque para "{query.trim()}". Tente outro nome ou bipe a etiqueta.</Text>
        </View>
      ) : (
        searched.map((p) => (
          <View key={p.id}>
            <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
            {renderOptions({ ...p, variants: available(p) })}
          </View>
        ))
      ))}
      {!hasQuery && (
        <>
          <Text style={styles.hint}>Peças em estoque agora. Digite o nome para filtrar ou bipe a etiqueta acima.</Text>
          {suggested.filter((p) => available(p).length > 0).map((p) => (
            <View key={p.id}>
              <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
              {renderOptions({ ...p, variants: available(p) })}
            </View>
          ))}
        </>
      )}
      </>)}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  returning: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.sm,
    backgroundColor: Colors.light.backgroundSecondary, borderRadius: theme.borderRadius.lg, marginBottom: theme.spacing.md,
  },
  returningText: { flex: 1, fontSize: 13, color: Colors.light.textSecondary },
  returningStrong: { fontWeight: '700', color: Colors.light.text },
  tabs: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
  tabBtn: { flex: 1 },
  hint: { fontSize: 13, color: Colors.light.textSecondary, marginBottom: theme.spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.light.textSecondary, marginTop: theme.spacing.md, marginBottom: theme.spacing.xs },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg, paddingHorizontal: theme.spacing.md, height: 44, marginBottom: theme.spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.light.text },
  productName: { fontSize: 13, fontWeight: '700', color: Colors.light.text, marginBottom: 4, marginTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm, minHeight: 48, borderRadius: theme.borderRadius.lg, backgroundColor: Colors.light.card,
  },
  rowBlocked: { opacity: 0.6 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  rowMeta: { fontSize: 12, color: Colors.light.textSecondary },
  effNeutral: { color: Colors.light.textSecondary },
  effPay: { color: Colors.light.warningDark, fontWeight: '600' },
  effBlocked: { color: Colors.light.errorDark, fontWeight: '600' },
  rowPrice: { fontSize: 14, fontWeight: '700' },
  error: { color: Colors.light.error, marginBottom: theme.spacing.sm },
  empty: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.light.textSecondary, textAlign: 'center' },
});
