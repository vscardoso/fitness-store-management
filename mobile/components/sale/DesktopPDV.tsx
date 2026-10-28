/**
 * PDV de balcão do modo notebook (app web com 1024 px ou mais; docs/PLANO_WEB_NOTEBOOK.md, fase 2).
 *
 * Esquerda: busca sempre aberta (nome, cor, tamanho, SKU ou código da etiqueta) e as peças com as variações
 * clicáveis. Direita: carrinho fixo (cliente, quantidades, desconto, total) e "Finalizar" leva ao mesmo
 * checkout do celular, que já cuida de pagamento, troco, PIX e maquininha.
 * Leitor de código de barras/QR USB: digita o código e manda Enter, então cai direto no carrinho.
 * Atalhos: / busca, Enter adiciona, Esc limpa, F2 nova venda, F4 cliente, F9 finalizar.
 *
 * Usa o mesmo carrinho (cartStore) e as mesmas validações de estoque do PDV do celular.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Colors, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useCategories } from '@/hooks/useCategories';
import { getGroupedProducts, getFIFOCosts } from '@/services/productService';
import { getVariantByLabelCode } from '@/services/productVariantService';
import { getCustomerById } from '@/services/customerService';
import { formatCurrency } from '@/utils/format';
import { colorNameToHex } from '@/utils/colorHex';
import { isManagerRole } from '@/utils/roles';
import { isLabelCode, parseShortCode, variantCodeText } from '@/utils/shortCode';
import { validateCartStock, validateProductForCart, formatValidationErrors } from '@/utils/validation';
import CustomerSelectionModal from '@/components/sale/CustomerSelectionModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Money } from '@/components/ui/PriceDisplay';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import type { Customer, ProductGrouped, ProductVariant } from '@/types';

const INK = '#160F28';
const MUTED = '#5B5670';
const LINE = '#E6E3EE';
const SOFT_LINE = '#F0EDF5';

type Dialog = {
  title: string;
  message: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  confirmText: string;
  cancelText?: string;
  onConfirm?: () => void;
};

const norm = (s?: string | null) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** "M / Preto" (rótulo do carrinho) vira "Preto · M", como no resto do app. */
function niceLabel(label?: string): string {
  if (!label) return '';
  const parts = label.split(' / ');
  return parts.length === 2 ? `${parts[1]} · ${parts[0]}` : label;
}

function variantLabel(v: ProductVariant): string {
  return [v.color, v.size].filter(Boolean).join(' · ') || v.sku;
}

/** Acha a variação pelo que o leitor ou a pessoa digitou: código da etiqueta (#101-1, PV#101-1, #0123) ou SKU. */
function findByCode(products: ProductGrouped[], raw: string): { product: ProductGrouped; variant: ProductVariant } | null {
  const text = raw.trim();
  if (!text) return null;
  const upper = text.toUpperCase().replace(/\s+/g, '');
  const pair = upper.match(/^(?:PV)?#?(\d+)-(\d+)$/);
  const short = pair ? null : parseShortCode(upper);
  for (const product of products) {
    for (const variant of product.variants) {
      const vp = variant.display_code?.match(/^#(\d+)-(\d+)$/);
      if (pair && vp && Number(vp[1]) === Number(pair[1]) && Number(vp[2]) === Number(pair[2])) return { product, variant };
      if (short != null && /^(PV)?#/.test(upper) && variant.short_code === short) return { product, variant };
      if (variant.sku && variant.sku.toUpperCase() === upper) return { product, variant };
    }
  }
  return null;
}

export default function DesktopPDV() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const cart = useCart();
  const colors = useBrandingColors();
  const primary = colors.primary;
  const { categories } = useCategories();

  const searchRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType] = useState<'value' | 'percent'>('value');

  // Mesma lista do seletor de produtos do PDV do celular (mesmo cache)
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['grouped-products-modal', true],
    queryFn: () => getGroupedProducts({ limit: 500, has_stock: true }),
  });

  const { data: selectedCustomer, error: customerError } = useQuery({
    queryKey: ['customer', cart.customer_id],
    queryFn: () => getCustomerById(cart.customer_id!),
    enabled: !!cart.customer_id,
    retry: false,
  });
  useEffect(() => {
    if (customerError && cart.customer_id) cart.setCustomer(undefined);
  }, [customerError]);

  // Voltando do checkout: estoque atualizado
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
      setTimeout(() => searchRef.current?.focus(), 50);
    }, [queryClient]),
  );

  // Lucro do carrinho só para gerente/admin (o servidor esconde custo de caixa e vendedor)
  const cartProductIds = useMemo(() => cart.items.map((i) => i.product_id), [cart.items]);
  const { data: fifoCosts } = useQuery({
    queryKey: ['fifo-costs', cartProductIds],
    queryFn: () => getFIFOCosts(cartProductIds),
    enabled: cartProductIds.length > 0 && isManagerRole(user?.role),
    staleTime: 30000,
  });
  const cartProfit = useMemo(() => {
    if (!fifoCosts || cart.items.length === 0) return null;
    let cost = 0;
    let revenue = 0;
    let hasData = false;
    for (const item of cart.items) {
      const info = fifoCosts[String(item.product_id)];
      if (info && info.average_unit_cost > 0) {
        cost += info.average_unit_cost * item.quantity;
        hasData = true;
      }
      revenue += item.unit_price * item.quantity;
    }
    if (!hasData) return null;
    const effective = revenue - (cart.discount ?? 0);
    const profit = effective - cost;
    return { profit, margin: effective > 0 ? (profit / effective) * 100 : 0 };
  }, [fifoCosts, cart.items, cart.discount]);

  const inCart = (variantId: number) => cart.getItemQuantity(`v_${variantId}`);

  // Cada peça com as variações que combinam com a busca ("rosa" mostra só a rosa; "legging" mostra todas)
  const results = useMemo(() => {
    const q = norm(query.replace(/^pv#?/i, '').replace(/^#/, ''));
    const words = q.split(/\s+/).filter(Boolean);
    const out: { product: ProductGrouped; variants: ProductVariant[] }[] = [];
    for (const p of products) {
      if (categoryId != null && p.category_id !== categoryId) continue;
      const base = [p.name, p.brand].filter(Boolean).join(' ');
      const variants = words.length
        ? p.variants.filter((v) => {
            const hay = norm([base, v.color, v.size, v.sku, v.display_code, variantCodeText(v)].filter(Boolean).join(' '));
            return words.every((w) => hay.includes(w));
          })
        : p.variants;
      if (variants.length) out.push({ product: p, variants });
      if (out.length >= 80) break;
    }
    return out;
  }, [products, query, categoryId]);

  const usedCategories = useMemo(() => {
    const ids = new Set(products.map((p) => p.category_id).filter(Boolean));
    return categories.filter((c: any) => ids.has(c.id));
  }, [categories, products]);

  const addVariant = useCallback(
    (product: ProductGrouped, variant: ProductVariant): boolean => {
      const already = cart.getItemQuantity(`v_${variant.id}`);
      if (variant.current_stock <= 0 || already + 1 > variant.current_stock) {
        setNotice({
          ok: false,
          text: variant.current_stock <= 0
            ? `${product.name} (${variantLabel(variant)}) está sem estoque.`
            : `Só há ${variant.current_stock} de ${product.name} (${variantLabel(variant)}), e já estão no carrinho.`,
        });
        return false;
      }
      if (already > 0) cart.updateQuantity(`v_${variant.id}`, already + 1);
      else cart.addVariantItem(product, variant, 1);
      setNotice({ ok: true, text: `${product.name} (${variantLabel(variant)}) foi para o carrinho.` });
      return true;
    },
    [cart],
  );

  /** Enter na busca: código lido pelo leitor, ou a única peça possível da busca. */
  const handleEnter = useCallback(async () => {
    const text = query.trim();
    if (!text) return;
    const hit = findByCode(products, text);
    if (hit) {
      if (addVariant(hit.product, hit.variant)) setQuery('');
      return;
    }
    if (isLabelCode(text) || /^#\d/.test(text)) {
      // Código da etiqueta que não está na lista (lista desatualizada ou peça sem estoque): pergunta ao servidor
      try {
        const v = await getVariantByLabelCode(text);
        const product = products.find((p) => p.id === v.product_id);
        const variant = product?.variants.find((x) => x.id === v.id);
        if (product && variant) {
          if (addVariant(product, variant)) setQuery('');
        } else {
          setNotice({ ok: false, text: `A peça ${text} está sem estoque.` });
        }
      } catch {
        setNotice({ ok: false, text: `Nenhuma peça com o código ${text}. Confira a etiqueta.` });
      }
      return;
    }
    const available = results.flatMap(({ product: p, variants }) =>
      variants.filter((v) => v.current_stock - inCart(v.id) > 0).map((v) => ({ p, v })),
    );
    if (available.length === 1) {
      if (addVariant(available[0].p, available[0].v)) setQuery('');
    } else if (available.length > 1) {
      setNotice({ ok: false, text: 'Mais de uma peça combina com a busca: clique na cor e no tamanho.' });
    } else {
      setNotice({ ok: false, text: `Nenhuma peça com estoque combina com "${text}".` });
    }
  }, [query, products, results, addVariant]);

  const changeQuantity = (cartKey: string, quantity: number) => {
    const item = cart.getItem(cartKey);
    if (!item) return;
    if (quantity <= 0) {
      cart.removeItem(cartKey);
      return;
    }
    const validation = validateProductForCart(item.product, quantity);
    if (!validation.isValid) {
      setNotice({ ok: false, text: formatValidationErrors(validation.errors) });
      return;
    }
    cart.updateQuantity(cartKey, quantity);
  };

  const applyDiscount = () => {
    const raw = parseFloat(discountInput.replace(/\./g, '').replace(',', '.'));
    if (isNaN(raw) || raw < 0) return;
    const value = discountType === 'percent' ? (cart.subtotal * raw) / 100 : raw;
    if (value > cart.subtotal) {
      setDialog({ title: 'Desconto inválido', message: 'O desconto não pode ser maior que o subtotal.', type: 'warning', confirmText: 'Entendi' });
      return;
    }
    cart.setDiscount(Math.round(value * 100) / 100);
    setDiscountOpen(false);
    setDiscountInput('');
  };

  const newSale = useCallback(() => {
    const reset = () => {
      cart.clear();
      setQuery('');
      setNotice(null);
      setDialog(null);
      setTimeout(() => searchRef.current?.focus(), 50);
    };
    if (cart.items.length === 0 && !cart.customer_id) return reset();
    setDialog({
      title: 'Iniciar nova venda',
      message: 'Isso limpa o carrinho, o cliente e o desconto. Deseja continuar?',
      type: 'warning',
      confirmText: 'Sim, nova venda',
      cancelText: 'Cancelar',
      onConfirm: reset,
    });
  }, [cart]);

  const finish = useCallback(() => {
    if (!cart.hasItems()) {
      setNotice({ ok: false, text: 'Adicione peças ao carrinho para finalizar a venda.' });
      return;
    }
    const validation = validateCartStock(cart.items);
    if (!validation.isValid) {
      setDialog({ title: 'Confira o carrinho', message: formatValidationErrors(validation.errors), type: 'danger', confirmText: 'Revisar' });
      return;
    }
    router.push('/checkout');
  }, [cart, router]);

  // Atalhos do teclado (só enquanto o PDV está na tela e sem diálogo aberto)
  const keyState = useRef({ newSale, finish, blocked: false });
  keyState.current = { newSale, finish, blocked: customerOpen || !!dialog };
  useFocusEffect(
    useCallback(() => {
      if (typeof document === 'undefined') return;
      const onKey = (e: KeyboardEvent) => {
        const k = keyState.current;
        if (k.blocked) return;
        const typing = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName ?? '');
        if (e.key === 'F2') { e.preventDefault(); k.newSale(); }
        else if (e.key === 'F4') { e.preventDefault(); setCustomerOpen(true); }
        else if (e.key === 'F9') { e.preventDefault(); k.finish(); }
        else if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); }
      };
      // captura: o campo de texto do react-native-web não deixa a tecla subir até a página
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }, []),
  );

  const pieces = cart.items.reduce((a, i) => a + i.quantity, 0);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text style={styles.title}>Ponto de venda</Text>
          <Text style={styles.subtitle}>{user?.store_name || 'Balcão'} · busque ou passe o leitor na etiqueta</Text>
        </View>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push('/(tabs)/sales' as any)}>
          <Text style={styles.ghostBtnText}>Vendas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.darkBtn} onPress={newSale} accessibilityLabel="Nova venda, atalho F2">
          <Text style={styles.darkBtnText}>Nova venda</Text>
          <Text style={styles.kbdDark}>F2</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* Esquerda: busca e peças */}
        <View style={styles.left}>
          <View style={[styles.searchBox, { borderColor: primary, shadowColor: primary }]}>
            <Ionicons name="search" size={20} color={primary} />
            <TextInput
              ref={searchRef}
              value={query}
              onChangeText={(t) => { setQuery(t); setNotice(null); }}
              onSubmitEditing={handleEnter}
              onKeyPress={(e: any) => { if (e.nativeEvent?.key === 'Escape') { setQuery(''); setNotice(null); } }}
              placeholder="Nome, cor, tamanho ou código da etiqueta (Enter adiciona)"
              placeholderTextColor="#8A839E"
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              blurOnSubmit={false}
              style={styles.searchInput}
              accessibilityLabel="Buscar peça por nome ou código"
            />
            {query ? (
              <TouchableOpacity onPress={() => { setQuery(''); setNotice(null); searchRef.current?.focus(); }} accessibilityLabel="Limpar busca">
                <Ionicons name="close-circle" size={20} color="#8A839E" />
              </TouchableOpacity>
            ) : (
              <Text style={styles.kbd}>/</Text>
            )}
          </View>

          {usedCategories.length > 0 && (
            <View style={styles.chips}>
              <TouchableOpacity
                style={[styles.chip, categoryId == null && styles.chipOn]}
                onPress={() => setCategoryId(null)}
              >
                <Text style={[styles.chipText, categoryId == null && styles.chipTextOn]}>Todas</Text>
              </TouchableOpacity>
              {usedCategories.map((c: any) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, categoryId === c.id && styles.chipOn]}
                  onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
                >
                  <Text style={[styles.chipText, categoryId === c.id && styles.chipTextOn]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {notice && (
            <View
              accessibilityRole="alert"
              style={[styles.notice, notice.ok ? styles.noticeOk : styles.noticeWarn]}
            >
              <Ionicons name={notice.ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={notice.ok ? '#047857' : '#B45309'} />
              <Text style={[styles.noticeText, { color: notice.ok ? '#065F46' : '#92400E' }]}>{notice.text}</Text>
            </View>
          )}

          <View style={styles.list}>
            <View style={styles.listHead}>
              <Text style={[styles.listHeadText, { flex: 1 }]}>PEÇA</Text>
              <Text style={styles.listHeadText}>CLIQUE NA COR E TAMANHO PARA ADICIONAR</Text>
            </View>
            {isLoading ? (
              <View style={styles.empty}><ActivityIndicator size="small" color={primary} /></View>
            ) : results.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {query ? `Nenhuma peça com estoque combina com "${query}".` : 'Nenhuma peça com estoque ainda.'}
                </Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                {results.map(({ product: p, variants: shown }) => {
                  const total = p.variants.reduce((a, v) => a + Math.max(0, v.current_stock - inCart(v.id)), 0);
                  const prices = p.min_price === p.max_price
                    ? formatCurrency(p.min_price)
                    : `${formatCurrency(p.min_price)} a ${formatCurrency(p.max_price)}`;
                  return (
                    <View key={p.id} style={styles.row}>
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowName} numberOfLines={2}>{p.name}</Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {[p.brand, total > 0 ? `${total} em estoque` : 'sem estoque'].filter(Boolean).join(' · ')}
                        </Text>
                        <Text style={[styles.rowPrice, { color: primary }]}>{prices}</Text>
                      </View>
                      <View style={styles.variants}>
                        {shown.map((v) => {
                          const left = v.current_stock - inCart(v.id);
                          const off = left <= 0;
                          const hex = colorNameToHex(v.color);
                          const code = variantCodeText(v);
                          return (
                            <TouchableOpacity
                              key={v.id}
                              disabled={off}
                              onPress={() => { addVariant(p, v); searchRef.current?.focus(); }}
                              style={[styles.vchip, off && styles.vchipOff]}
                              accessibilityLabel={off ? `${variantLabel(v)} esgotado` : `Adicionar ${variantLabel(v)}, ${left} em estoque`}
                            >
                              {hex ? <View style={[styles.swatch, { backgroundColor: hex }]} /> : null}
                              <Text style={[styles.vchipText, off && styles.vchipTextOff]}>{variantLabel(v)}</Text>
                              <Text style={[styles.vchipStock, { color: off ? '#9A93AD' : left <= 2 ? '#B45309' : '#047857' }]}>
                                {off ? 'esgotado' : `${left} un.`}
                              </Text>
                              {code ? <Text style={styles.vchipCode}>{code}</Text> : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
          <Text style={styles.hint}>
            Atalhos: / busca · Enter adiciona o código lido ou a única peça da busca · Esc limpa · F4 cliente · F9 finalizar
          </Text>
        </View>

        {/* Direita: venda atual */}
        <View style={styles.right}>
          <View style={styles.block}>
            {cart.customer_id && selectedCustomer ? (
              <View style={styles.customer}>
                <Ionicons name="person-circle-outline" size={22} color={primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.customerName} numberOfLines={1}>{selectedCustomer.full_name}</Text>
                  <Text style={styles.customerHint} numberOfLines={1}>{selectedCustomer.phone || selectedCustomer.email || 'Cliente da venda'}</Text>
                </View>
                <TouchableOpacity onPress={() => setCustomerOpen(true)}><Text style={[styles.link, { color: primary }]}>Trocar</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => cart.setCustomer(undefined)} accessibilityLabel="Tirar o cliente da venda">
                  <Ionicons name="close-circle" size={20} color="#8A839E" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.customerPick} onPress={() => setCustomerOpen(true)}>
                <Ionicons name="person-add-outline" size={18} color={primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName}>Escolher cliente (opcional)</Text>
                  <Text style={styles.customerHint}>Busque por nome ou telefone</Text>
                </View>
                <Text style={styles.kbd}>F4</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.cartHead}>
            <Text style={styles.cartTitle}>Carrinho · {pieces} {pieces === 1 ? 'peça' : 'peças'}</Text>
            {cart.items.length > 0 && (
              <TouchableOpacity
                onPress={() => setDialog({
                  title: 'Limpar carrinho', message: 'Tirar todas as peças do carrinho?', type: 'danger',
                  confirmText: 'Limpar', cancelText: 'Cancelar', onConfirm: () => { cart.clearItems(); setDialog(null); },
                })}
              >
                <Text style={styles.clear}>Limpar</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView style={styles.cartList} keyboardShouldPersistTaps="handled">
            {cart.items.length === 0 ? (
              <Text style={styles.cartEmpty}>Carrinho vazio.{'\n'}Busque à esquerda ou passe o leitor na etiqueta.</Text>
            ) : (
              cart.items.map((item) => (
                <View key={item.cart_key} style={styles.cartItem}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cartName} numberOfLines={1}>{item.product.name}</Text>
                    <Text style={styles.cartMeta} numberOfLines={1}>
                      {[niceLabel(item.variant_label), formatCurrency(item.unit_price)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.qty}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => changeQuantity(item.cart_key, item.quantity - 1)} accessibilityLabel="Tirar uma">
                      <Ionicons name="remove" size={14} color={INK} />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.quantity}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => changeQuantity(item.cart_key, item.quantity + 1)} accessibilityLabel="Pôr mais uma">
                      <Ionicons name="add" size={14} color={INK} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cartTotal}>{formatCurrency(item.unit_price * item.quantity)}</Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.totals}>
            <View style={styles.line}>
              <Text style={styles.lineLabel}>Subtotal</Text>
              <Text style={styles.lineValue}>{formatCurrency(cart.subtotal)}</Text>
            </View>
            {discountOpen ? (
              <View style={styles.discountRow}>
                <TouchableOpacity style={[styles.dtype, discountType === 'value' && styles.dtypeOn]} onPress={() => setDiscountType('value')}>
                  <Text style={[styles.dtypeText, discountType === 'value' && styles.dtypeTextOn]}>R$</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dtype, discountType === 'percent' && styles.dtypeOn]} onPress={() => setDiscountType('percent')}>
                  <Text style={[styles.dtypeText, discountType === 'percent' && styles.dtypeTextOn]}>%</Text>
                </TouchableOpacity>
                <TextInput
                  value={discountInput}
                  onChangeText={setDiscountInput}
                  onSubmitEditing={applyDiscount}
                  placeholder="0,00"
                  placeholderTextColor="#8A839E"
                  keyboardType="decimal-pad"
                  autoFocus
                  style={styles.discountInput}
                  accessibilityLabel={discountType === 'percent' ? 'Desconto em porcentagem' : 'Desconto em reais'}
                />
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: primary }]} onPress={applyDiscount}>
                  <Text style={styles.smallBtnText}>Aplicar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setDiscountOpen(false); setDiscountInput(''); }} accessibilityLabel="Cancelar desconto">
                  <Ionicons name="close" size={18} color={MUTED} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.line}>
                <TouchableOpacity onPress={() => setDiscountOpen(true)} disabled={cart.items.length === 0}>
                  <Text style={[styles.lineLabel, cart.discount > 0 ? { color: Colors.light.success } : { color: cart.items.length ? primary : MUTED }]}>
                    {cart.discount > 0 ? 'Desconto' : '+ Adicionar desconto'}
                  </Text>
                </TouchableOpacity>
                {cart.discount > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.lineValue, { color: Colors.light.success }]}>- {formatCurrency(cart.discount)}</Text>
                    <TouchableOpacity onPress={() => cart.setDiscount(0)} accessibilityLabel="Tirar o desconto">
                      <Ionicons name="close-circle" size={16} color={Colors.light.error} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
            <View style={[styles.line, { alignItems: 'baseline' }]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Money style={styles.totalValue} value={Number(cart.total)} />
            </View>
            {cartProfit && (
              <View style={styles.line}>
                <Text style={styles.lineLabel}>Lucro estimado</Text>
                <Text style={[styles.lineValue, { color: cartProfit.profit >= 0 ? VALUE_COLORS.positive : VALUE_COLORS.negative }]}>
                  {formatCurrency(cartProfit.profit)} ({cartProfit.margin.toFixed(1)}%)
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.finish, { backgroundColor: cart.items.length ? primary : '#E6E3EE' }]}
              onPress={finish}
              disabled={cart.items.length === 0}
              accessibilityLabel="Finalizar venda, atalho F9"
            >
              <Text style={[styles.finishText, !cart.items.length && { color: '#8A839E' }]}>Finalizar venda</Text>
              <Text style={[styles.kbdDark, !cart.items.length && { color: '#8A839E', backgroundColor: 'transparent' }]}>F9</Text>
            </TouchableOpacity>
            <Text style={styles.payHint}>Pagamento, troco, PIX e maquininha na próxima tela.</Text>
          </View>
        </View>
      </View>

      <CustomerSelectionModal
        visible={customerOpen}
        onDismiss={() => { setCustomerOpen(false); setTimeout(() => searchRef.current?.focus(), 50); }}
        onSelectCustomer={(c: Customer) => { cart.setCustomer(c.id); setCustomerOpen(false); }}
      />
      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        type={dialog?.type ?? 'info'}
        confirmText={dialog?.confirmText ?? 'OK'}
        cancelText={dialog?.cancelText ?? ''}
        onConfirm={() => (dialog?.onConfirm ? dialog.onConfirm() : setDialog(null))}
        onCancel={() => setDialog(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F5FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12,
    paddingHorizontal: 24, paddingVertical: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: LINE,
  },
  title: { fontSize: 20, fontWeight: '700', color: INK },
  subtitle: { fontSize: 13, color: MUTED, marginTop: 2 },
  ghostBtn: { height: 38, paddingHorizontal: 14, borderRadius: 9, borderWidth: 1, borderColor: LINE, justifyContent: 'center', backgroundColor: '#FFFFFF' },
  ghostBtnText: { fontSize: 14, color: INK, fontWeight: '500' },
  darkBtn: { height: 38, paddingHorizontal: 14, borderRadius: 9, backgroundColor: INK, flexDirection: 'row', alignItems: 'center', gap: 8 },
  darkBtnText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  kbdDark: { fontSize: 11, color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  kbd: { fontSize: 12, color: MUTED, borderWidth: 1, borderColor: LINE, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  body: { flex: 1, flexDirection: 'row', gap: 20, padding: 20, minHeight: 0 },
  left: { flex: 1, minWidth: 0, gap: 12 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2,
    backgroundColor: '#FFFFFF', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, color: INK, outlineStyle: 'none' } as any,
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#E0DBEA', backgroundColor: '#FFFFFF', justifyContent: 'center' },
  chipOn: { backgroundColor: INK, borderColor: INK },
  chipText: { fontSize: 13, fontWeight: '600', color: INK },
  chipTextOn: { color: '#FFFFFF' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1 },
  noticeOk: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  noticeWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  noticeText: { fontSize: 13, flex: 1 },
  list: { flex: 1, minHeight: 0, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  listHead: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: LINE, backgroundColor: '#FBFAFD' },
  listHeadText: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.3 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, color: MUTED, textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: SOFT_LINE },
  rowInfo: { flexGrow: 1, flexShrink: 1, flexBasis: 200, minWidth: 0, gap: 2 },
  rowName: { fontSize: 15, fontWeight: '600', color: INK },
  rowMeta: { fontSize: 13, color: MUTED },
  rowPrice: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  variants: { flexGrow: 2, flexShrink: 1, flexBasis: 320, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', alignContent: 'flex-start' },
  vchip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E0DBEA', backgroundColor: '#FFFFFF' },
  vchipOff: { borderColor: '#ECEAF2', backgroundColor: '#F7F6FA' },
  vchipText: { fontSize: 13, fontWeight: '600', color: INK },
  vchipTextOff: { color: '#9A93AD' },
  vchipStock: { fontSize: 12 },
  vchipCode: { fontSize: 11, color: '#8A839E' },
  swatch: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(22,15,40,0.2)' },
  hint: { fontSize: 12, color: MUTED },
  right: { width: 380, flexShrink: 0, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  block: { padding: 14, borderBottomWidth: 1, borderBottomColor: SOFT_LINE },
  customer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customerPick: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CFC8DE' },
  customerName: { fontSize: 14, fontWeight: '600', color: INK },
  customerHint: { fontSize: 12, color: MUTED },
  link: { fontSize: 13, fontWeight: '600' },
  cartHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  cartTitle: { fontSize: 13, fontWeight: '600', color: MUTED },
  clear: { fontSize: 13, fontWeight: '600', color: '#B4235C' },
  cartList: { flex: 1, minHeight: 120 },
  cartEmpty: { padding: 24, textAlign: 'center', color: MUTED, fontSize: 14, lineHeight: 21 },
  cartItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: SOFT_LINE },
  cartName: { fontSize: 14, fontWeight: '600', color: INK },
  cartMeta: { fontSize: 12, color: MUTED },
  qty: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: LINE, borderRadius: 8 },
  qtyBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  qtyText: { minWidth: 22, textAlign: 'center', fontSize: 14, fontWeight: '600', color: INK },
  cartTotal: { width: 92, textAlign: 'right', fontSize: 14, fontWeight: '700', color: INK },
  totals: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: LINE, backgroundColor: '#FBFAFD' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineLabel: { fontSize: 14, color: MUTED },
  lineValue: { fontSize: 14, color: INK },
  totalLabel: { fontSize: 15, fontWeight: '700', color: INK },
  totalValue: { fontSize: 28, fontWeight: '800', color: INK },
  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dtype: { height: 32, paddingHorizontal: 10, borderRadius: 7, borderWidth: 1, borderColor: '#E0DBEA', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  dtypeOn: { borderColor: INK, backgroundColor: INK },
  dtypeText: { fontSize: 13, fontWeight: '700', color: INK },
  dtypeTextOn: { color: '#FFFFFF' },
  discountInput: { flex: 1, minWidth: 0, height: 32, borderWidth: 1, borderColor: '#CFC8DE', borderRadius: 7, paddingHorizontal: 8, fontSize: 14, color: INK, backgroundColor: '#FFFFFF' },
  smallBtn: { height: 32, paddingHorizontal: 10, borderRadius: 7, justifyContent: 'center' },
  smallBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  finish: { height: 50, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4 },
  finishText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  payHint: { fontSize: 12, color: MUTED, textAlign: 'center' },
});
