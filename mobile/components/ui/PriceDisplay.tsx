/**
 * Preço que sempre cabe (inclusive no app web, onde `adjustsFontSizeToFit` não funciona).
 *
 * - `Money`: "R$" e centavos menores que os reais (R$ 1.249,90 ocupa bem menos largura e lê melhor);
 *   a fonte diminui sozinha, medindo o espaço disponível, até `minSize`.
 * - `PriceRange`: faixa em duas linhas ("de" / "até") em vez de "R$ x – R$ y" cortado com "...";
 *   com `onShowPrices`, mostra o atalho "Ver N preços" (lista por variação).
 * - `FitText`: texto de uma linha que encolhe para caber (para valores de cartões e resumos).
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleProp, Text, TextStyle, TouchableOpacity, View, ViewStyle, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';

// Largura média de um caractere em negrito, em proporção da fonte (dígitos ~0.6)
const CHAR_RATIO = 0.6;
const PREFIX_SCALE = 0.6;
const CENTS_SCALE = 0.65;

function useWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && Math.abs(w - width) > 1) setWidth(w);
  };
  return { width, onLayout };
}

/** Fonte que faz `units` caracteres caberem em `width` (entre minSize e size). */
function fitSize(width: number, units: number, size: number, minSize: number) {
  if (!width || units <= 0) return size;
  return Math.max(minSize, Math.min(size, Math.floor(width / (units * CHAR_RATIO))));
}


/**
 * Fonte que cabe numa linha, medida de verdade. Web: compara a largura do conteúdo (scrollWidth) com a
 * visível (clientWidth) e reduz na proporção exata. Celular: o `adjustsFontSizeToFit` nativo resolve.
 */
function useFitFont(base: number, minSize: number, key: unknown) {
  const ref = useRef<any>(null);
  const [fs, setFs] = useState(base);
  useEffect(() => { setFs(base); }, [base, key]);
  const check = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = ref.current;
    if (!el || !el.getBoundingClientRect) return;
    const have = el.getBoundingClientRect().width;
    if (!have) return;
    // largura real do conteúdo, com fração (scrollWidth arredonda e deixa passar "…" de meio pixel)
    const range = document.createRange();
    range.selectNodeContents(el);
    const need = Math.max(range.getBoundingClientRect().width, el.scrollWidth);
    if (need > have + 0.5) {
      const next = Math.max(minSize, Math.floor((fs * have * 0.98) / need));
      if (next < fs) setFs(next);
    }
  };
  useLayoutEffect(check);
  const nativeFit = Platform.OS === 'web' ? {} : { adjustsFontSizeToFit: true, minimumFontScale: Math.min(1, minSize / base) };
  return { ref, fs, check, nativeFit };
}

/** "R$ 1.249,90" -> { prefix: "R$", whole: "1.249", cents: ",90" } (negativo mantém o sinal no inteiro). */
export function splitMoney(value: number) {
  const text = formatCurrency(value).replace(/ /g, ' ');
  const m = text.match(/^(-?)\s*R\$\s*(-?)([\d.]+)(,\d+)?$/);
  if (!m) return { prefix: '', whole: text, cents: '' };
  return { prefix: 'R$', whole: `${m[1]}${m[2]}${m[3]}`, cents: m[4] ?? '' };
}

/** Largura do preço em "caracteres de tamanho cheio" (R$ e centavos contam menos). */
function moneyUnits(value: number) {
  const { prefix, whole, cents } = splitMoney(value);
  return whole.length + (prefix.length + 1) * PREFIX_SCALE + cents.length * CENTS_SCALE;
}

interface MoneyProps {
  value: number;
  /** Tamanho máximo dos reais (sem ele, o fontSize do `style`) */
  size?: number;
  minSize?: number;
  color?: string;
  /** Força o tamanho (quando o pai já calculou, ex.: as duas linhas de uma faixa) */
  fixedSize?: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

const MoneyText = React.forwardRef<any, { value: number; size: number; color?: string; style?: StyleProp<TextStyle>; testID?: string; nativeFit?: object }>(
  function MoneyText({ value, size, color, style, testID, nativeFit }, ref) {
  const { prefix, whole, cents } = splitMoney(value);
  return (
    <Text
      ref={ref}
      numberOfLines={1}
      {...nativeFit}
      style={[
        styles.money,
        { color: Colors.light.text },
        style,
        // tamanho calculado vence o do estilo; letterSpacing negativo grande some junto com a fonte menor
        { fontSize: size, lineHeight: Math.round(size * 1.2) },
        color ? { color } : null,
      ]}
      accessibilityLabel={formatCurrency(value)}
      testID={testID}
    >
      {prefix ? <Text style={{ fontSize: Math.round(size * PREFIX_SCALE) }}>{prefix} </Text> : null}
      {whole}
      {cents ? <Text style={{ fontSize: Math.round(size * CENTS_SCALE) }}>{cents}</Text> : null}
    </Text>
  );
});

export function Money({ value, size, minSize = 11, color, fixedSize, style, testID }: MoneyProps) {
  // Ocupa só a largura do texto (respeita o alinhamento do pai) e encolhe só se não couber.
  const base = size ?? (StyleSheet.flatten(style)?.fontSize as number | undefined) ?? 18;
  const v = Number(value) || 0;
  const fit = useFitFont(base, Math.min(minSize, base), v);
  return (
    <View onLayout={fit.check} style={styles.shrink}>
      <MoneyText ref={fit.ref} value={v} size={fixedSize ?? fit.fs} color={color} style={style} testID={testID}
        nativeFit={fixedSize ? undefined : fit.nativeFit} />
    </View>
  );
}

interface PriceRangeProps {
  min: number;
  max: number;
  size?: number;
  minSize?: number;
  color?: string;
  /** Abre a lista de preços por variação ("Ver N preços") */
  onShowPrices?: () => void;
  /** Quantos preços diferentes existem (texto do atalho) */
  pricesCount?: number;
  /** Cor do atalho "Ver N preços" (padrão: a do valor) */
  linkColor?: string;
  /** Para listas: menor preço grande e "até R$ X" pequeno embaixo */
  inline?: boolean;
  testID?: string;
}

export function PriceRange({
  min, max, size = 18, minSize = 11, color, onShowPrices, pricesCount, linkColor, inline, testID,
}: PriceRangeProps) {
  const { width, onLayout } = useWidth();
  const same = Math.abs(min - max) < 0.005;

  if (same) {
    return <Money value={min} size={size} minSize={minSize} color={color} testID={testID} />;
  }

  if (inline) {
    // Listas: o menor preço no tamanho cheio e "até R$ X" pequeno embaixo (cabe em cartão estreito e lê bem)
    return (
      <View style={styles.fill} testID={testID}>
        <Money value={min} size={size} minSize={minSize} color={color} />
        {/* sem limite de linha: em tela estreita quebra em vez de cortar o valor */}
        <Text style={styles.upTo}>até {formatCurrency(max)}</Text>
      </View>
    );
  }

  // Duas linhas com o mesmo tamanho: o do valor mais largo que couber ao lado do rótulo
  const labelUnits = 3.2 * PREFIX_SCALE;
  const fs = fitSize(width, Math.max(moneyUnits(min), moneyUnits(max)) + labelUnits, size, minSize);
  const labelSize = Math.max(9, Math.round(fs * 0.55));
  return (
    <View onLayout={onLayout} style={styles.fill} testID={testID}>
      <View style={styles.rangeRow}>
        <Text style={[styles.rangeLabel, { fontSize: labelSize, width: labelSize * 2.1 }]}>de</Text>
        <MoneyText value={min} size={fs} color={color} />
      </View>
      <View style={styles.rangeRow}>
        <Text style={[styles.rangeLabel, { fontSize: labelSize, width: labelSize * 2.1 }]}>até</Text>
        <MoneyText value={max} size={fs} color={color} />
      </View>
      {onShowPrices ? (
        <TouchableOpacity onPress={onShowPrices} style={styles.hint} hitSlop={8} activeOpacity={0.7} accessibilityRole="button">
          <Text style={[styles.hintText, { color: linkColor ?? color ?? Colors.light.primary }]}>
            Ver {pricesCount ? `${pricesCount} preços` : 'preços'}
          </Text>
          <Ionicons name="chevron-forward" size={12} color={linkColor ?? color ?? Colors.light.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

interface FitTextProps {
  children: React.ReactNode;
  /** Tamanho máximo; sem ele usa o fontSize do `style` */
  size?: number;
  minSize?: number;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Texto de uma linha que encolhe para caber, também na web (troca `adjustsFontSizeToFit`). */
export function FitText({ children, size, minSize = 10, style, containerStyle, testID }: FitTextProps) {
  const base = size ?? (StyleSheet.flatten(style)?.fontSize as number | undefined) ?? 16;
  const fit = useFitFont(base, Math.min(minSize, base), String(children ?? ''));
  return (
    <View onLayout={fit.check} style={[styles.shrink, containerStyle]}>
      <Text ref={fit.ref} numberOfLines={1} {...fit.nativeFit} style={[style, { fontSize: fit.fs }]} testID={testID}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { alignSelf: 'stretch', minWidth: 0 },
  shrink: { maxWidth: '100%', flexShrink: 1, minWidth: 0 },
  money: { fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  upTo: { fontSize: 11, fontWeight: '600', color: Colors.light.textSecondary, marginTop: 1 },
  rangeRow: { flexDirection: 'row', alignItems: 'baseline' },
  rangeLabel: { color: Colors.light.textSecondary, fontWeight: '600' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4, alignSelf: 'flex-start' },
  hintText: { fontSize: 11, fontWeight: '700' },
});
