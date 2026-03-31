/**
 * AppButton — Componente de botão unificado do sistema
 *
 * Substitui os padrões inconsistentes de TouchableOpacity + inline styles
 * espalhados por 67+ arquivos do app.
 *
 * VARIANTES:
 *   primary        → gradiente brandingColors (CTA principal)
 *   secondary      → fundo primaryLight + borda primary (ação secundária)
 *   outlined       → apenas borda primary, fundo transparente
 *   ghost          → sem borda/fundo, pressionar mostra ripple (ações discretas)
 *   danger         → vermelho sólido (ações destrutivas)
 *   danger-outline → borda vermelha, fundo transparente
 *   text           → apenas texto colorido (links, ações inline)
 *
 * TAMANHOS:
 *   sm  → h32 / fs12  — chips, filtros, ações compactas
 *   md  → h44 / fs14  — botão padrão
 *   lg  → h52 / fs16  — CTA de destaque
 *
 * EXEMPLOS:
 *   <AppButton variant="primary" label="Salvar" onPress={save} />
 *   <AppButton variant="outlined" size="sm" label="Cancelar" onPress={cancel} />
 *   <AppButton variant="danger" label="Excluir" onPress={del} loading={deleting} />
 *   <AppButton variant="ghost" icon="pencil" iconOnly onPress={edit} />
 *   <AppButton variant="primary" size="lg" fullWidth label="Finalizar Venda" onPress={checkout} />
 *   <AppButton variant="secondary" size="md" icon="add" label="Adicionar" onPress={add} />
 */

import React from 'react';
import {
  TouchableOpacity,
  View,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, theme } from '@/constants/Colors';
import { BUTTON, type ButtonSize, type ButtonVariant } from '@/constants/tokens';
import { useBrandingColors } from '@/store/brandingStore';

// ─────────────────────────────────────────────────────────────────────────────

interface AppButtonProps {
  /** Texto do botão (obrigatório, exceto em iconOnly) */
  label?: string;
  /** Variante visual */
  variant?: ButtonVariant;
  /** Tamanho do botão */
  size?: ButtonSize;
  /** Ícone Ionicons no lado esquerdo do texto */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Ícone apenas (sem label) — botão circular */
  iconOnly?: boolean;
  /** Ação ao pressionar */
  onPress?: () => void;
  /** Estado de carregamento — substitui o conteúdo por ActivityIndicator */
  loading?: boolean;
  /** Desativado */
  disabled?: boolean;
  /** Ocupa 100% da largura do container */
  fullWidth?: boolean;
  /** Estilo externo (margin, flex, etc.) */
  style?: ViewStyle;
  /** Sobrescrever cor do texto/ícone */
  textColor?: string;
  /** Sobrescrever cor de fundo */
  backgroundColor?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AppButton({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconOnly = false,
  onPress,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  textColor,
  backgroundColor,
}: AppButtonProps) {
  const brandingColors = useBrandingColors();
  const tok = BUTTON.size[size];
  const isDisabled = disabled || loading;

  // ── Calcular cores por variante ───────────────────────────────────────────

  const variantConfig = resolveVariant(variant, brandingColors, tok);

  // Overrides externos
  const resolvedBg    = backgroundColor ?? variantConfig.bg;
  const resolvedColor = textColor        ?? variantConfig.color;

  // ── Tamanho do container ──────────────────────────────────────────────────

  const containerStyle: ViewStyle = {
    height: iconOnly ? tok.height : tok.height,
    minWidth: iconOnly ? tok.height : undefined,  // quadrado quando iconOnly
    width: iconOnly ? tok.height : fullWidth ? '100%' : undefined,
    borderRadius: iconOnly ? tok.height / 2 : tok.borderRadius,
    ...(variantConfig.border ? {
      borderWidth: 1.5,
      borderColor: variantConfig.border,
    } : {}),
    opacity: isDisabled ? 0.5 : 1,
    ...(style as object ?? {}),
  };

  // ── Inner padding ─────────────────────────────────────────────────────────

  const innerStyle: ViewStyle = {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: iconOnly ? 0 : tok.paddingH,
    gap: tok.gap,
  };

  // ── Conteúdo ──────────────────────────────────────────────────────────────

  const content = loading ? (
    <ActivityIndicator size="small" color={resolvedColor} />
  ) : (
    <>
      {icon && (
        <Ionicons name={icon} size={tok.iconSize} color={resolvedColor} />
      )}
      {!iconOnly && label && (
        <Text style={[styles.label, { fontSize: tok.fontSize, color: resolvedColor }]}>
          {label}
        </Text>
      )}
    </>
  );

  // ── Renderizar (gradient para primary, plano para o resto) ────────────────

  if (variant === 'primary' && !isDisabled) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.82}
        style={[styles.base, containerStyle]}
      >
        <LinearGradient
          colors={brandingColors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.gradientFill, innerStyle]}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={variant === 'ghost' || variant === 'text' ? 0.6 : 0.8}
      style={[
        styles.base,
        containerStyle,
        variant !== 'ghost' && variant !== 'text' && { backgroundColor: resolvedBg },
      ]}
    >
      <View style={innerStyle}>
        {content}
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface VariantConfig {
  bg: string;
  color: string;
  border?: string;
}

function resolveVariant(
  variant: ButtonVariant,
  brandingColors: { primary: string; secondary: string; accent: string },
  tok: typeof BUTTON.size[ButtonSize],
): VariantConfig {
  switch (variant) {
    case 'primary':
      return {
        bg: brandingColors.primary,
        color: '#fff',
      };
    case 'secondary':
      return {
        bg: brandingColors.primary + '18',
        color: brandingColors.primary,
        border: brandingColors.primary + '60',
      };
    case 'outlined':
      return {
        bg: 'transparent',
        color: brandingColors.primary,
        border: brandingColors.primary,
      };
    case 'ghost':
      return {
        bg: 'transparent',
        color: Colors.light.text,
      };
    case 'danger':
      return {
        bg: Colors.light.error,
        color: '#fff',
      };
    case 'danger-outline':
      return {
        bg: Colors.light.errorLight,
        color: Colors.light.error,
        border: Colors.light.error,
      };
    case 'text':
      return {
        bg: 'transparent',
        color: brandingColors.primary,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    alignSelf: 'flex-start',
    ...theme.shadows.sm,
  },
  gradientFill: {
    // LinearGradient ocupa 100% do TouchableOpacity
  },
  label: {
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.2,
  },
});
