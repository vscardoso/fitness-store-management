/**
 * Botões de PDF, iguais em todo o app: "Enviar o PDF para a impressora" (compartilha o arquivo) e, se quiser, "Abrir o PDF numa aba" (com openFirst, ordem trocada).
 * Usado pelas etiquetas, comprovante, brinde e relatórios. A lógica fica em `usePdfDelivery` + `services/pdfDelivery.ts`: tela nova
 * que gera PDF usa este componente, não copia a entrega.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import AppButton from '@/components/ui/AppButton';
import { Colors, theme } from '@/constants/Colors';
import { usePdfDelivery, type UsePdfDeliveryOptions } from '@/hooks/usePdfDelivery';

interface Props extends UsePdfDeliveryOptions {
  /** Texto do botão principal (compartilhar o arquivo) */
  shareLabel?: string;
  /** Mostra também "Abrir o PDF numa aba" */
  showOpen?: boolean;
  openLabel?: string;
  /** "Abrir o PDF" vem primeiro e é o botão principal. Etiqueta: o Label Expert só aparece na lista de apps quando o PDF é aberto no Safari e compartilhado de lá (a folha de compartilhar do app não o mostra). */
  openFirst?: boolean;
  /** Estilo do botão principal */
  variant?: 'primary' | 'secondary' | 'outlined';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  /** Só o ícone de compartilhar (linhas de lista) */
  iconOnly?: boolean;
  onDelivered?: () => void;
}

export default function PdfActions({
  shareLabel = 'Enviar o PDF para a impressora', showOpen = false, openLabel = 'Abrir o PDF numa aba', openFirst = false,
  variant = 'primary', size = 'lg', fullWidth = true, iconOnly = false, onDelivered, ...source
}: Props) {
  const p = usePdfDelivery(source);
  const doShare = async () => { if ((await p.share()) && onDelivered) onDelivered(); };
  const doOpen = async () => { if ((await p.open()) && onDelivered) onDelivered(); };
  const shareBtn = (
    <AppButton
      key="share"
      variant={p.needsAnotherTap ? 'primary' : openFirst && showOpen ? 'outlined' : variant}
      size={openFirst && showOpen && !iconOnly ? 'md' : size}
      fullWidth={fullWidth && !iconOnly}
      icon={iconOnly ? 'share-outline' : 'print-outline'}
      iconOnly={iconOnly && !p.needsAnotherTap}
      label={p.busy === 'share' ? 'Abrindo...' : p.needsAnotherTap ? 'Toque de novo para enviar' : shareLabel}
      loading={p.busy === 'share'}
      disabled={!!p.busy}
      onPress={doShare}
    />
  );
  const openBtn = showOpen ? (
    <AppButton
      key="open"
      variant={openFirst ? variant : 'outlined'}
      size={openFirst && !iconOnly ? size : iconOnly ? 'sm' : 'md'}
      fullWidth={fullWidth && !iconOnly}
      icon="document-text-outline"
      label={p.busy === 'open' ? 'Abrindo...' : openLabel}
      loading={p.busy === 'open'}
      disabled={!!p.busy}
      onPress={doOpen}
    />
  ) : null;
  return (
    <View style={iconOnly ? styles.inline : styles.box}>
      {openFirst ? [openBtn, shareBtn] : [shareBtn, openBtn]}
      {p.error ? <Text style={styles.error} accessibilityLiveRegion="polite">{p.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: theme.spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' },
  error: { color: Colors.light.errorDark, fontSize: theme.fontSize.sm },
});
