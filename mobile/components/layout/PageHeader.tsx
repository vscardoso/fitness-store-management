/**
 * PageHeader - Componente de Header Universal
 * 
 * Header consolidado com CSS consistente e espaçamento correto.
 * Pode ser usado em qualquer tipo de tela: lista, formulário, detalhes.
 * 
 * @example
 * // Lista com contador
 * <PageHeader
 *   title="Equipe"
 *   subtitle="15 membros"
 *   onBack={() => router.back()}
 * />
 * 
 * // Formulário
 * <PageHeader
 *   title="Novo Membro"
 *   subtitle="Adicione um colaborador à sua equipe"
 *   showBackButton
 * />
 * 
 * // Detalhes com ações
 * <PageHeader
 *   title="João Silva"
 *   subtitle="Vendedor"
 *   showBackButton
 *   rightActions={[
 *     { icon: 'pencil', onPress: () => {} },
 *     { icon: 'trash', onPress: () => {} },
 *   ]}
 * />
 */

import { View, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, theme } from '@/constants/Colors';

interface RightAction {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
}

interface PageHeaderProps {
  /** Título principal */
  title: string;
  /** Subtítulo/contador */
  subtitle?: string;
  /** Mostrar botão de voltar */
  showBackButton?: boolean;
  /** Callback customizado para voltar */
  onBack?: () => void;
  /** Ações à direita (máx 3) */
  rightActions?: RightAction[];
  /** Cores do gradiente (padrão: primary → secondary) */
  gradientColors?: [string, string];
  /** Elemento customizado abaixo do título (ex: badges, avatar) */
  children?: React.ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  showBackButton = false,
  onBack,
  rightActions = [],
  gradientColors = [Colors.light.primary, Colors.light.secondary],
  children,
}: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={gradientColors[0]} />
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.content}>
          {/* Linha única: Botão voltar + Título centralizado + Ações */}
          <View style={styles.topRow}>
            {/* Botão voltar à esquerda */}
            {showBackButton ? (
              <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
            ) : (
              <View style={styles.placeholder} />
            )}

            {/* Título e subtítulo centralizados */}
            <View style={styles.headerInfo}>
              <Text style={styles.title}>{title}</Text>
              {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>

            {/* Ações à direita */}
            {rightActions.length > 0 ? (
              <View style={styles.actions}>
                {rightActions.slice(0, 3).map((action, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={action.onPress}
                    style={styles.actionButton}
                  >
                    <Ionicons
                      name={action.icon}
                      size={20}
                      color={action.color || '#fff'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.placeholder} />
            )}
          </View>

          {/* Elemento customizado (badges, avatar, etc) */}
          {children && <View style={styles.customContent}>{children}</View>}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 0,
  },
  gradient: {
    paddingHorizontal: theme.spacing.md,     // 16
    paddingTop: theme.spacing.xl + 32,       // 64 (StatusBar + espaço)
    paddingBottom: theme.spacing.xl,         // ✅ 32 (respiração adequada)
    borderBottomLeftRadius: theme.borderRadius.xxl, // 24
    borderBottomRightRadius: theme.borderRadius.xxl,
  },
  content: {
    // Container do conteúdo
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,                    // Altura mínima para dar mais espaço vertical
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    width: 40, // Mesmo tamanho do botão voltar para manter centralizado
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm, // 8
    minHeight: 44,                    // Altura mínima para dar mais espaço
    justifyContent: 'center',         // Centralizar verticalmente
  },
  title: {
    fontSize: theme.fontSize.xl,      // 20 (era 24 - reduzir para detalhes cabem melhor)
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,                   // Proporção melhor
    paddingHorizontal: 4,             // Margem interna para não grudar nas bordas
  },
  subtitle: {
    fontSize: theme.fontSize.sm,     // 14
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginTop: theme.spacing.xs,     // 4
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm, // 8
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customContent: {
    marginTop: theme.spacing.md, // 16 (mais espaço entre título e badges)
    alignItems: 'center',
  },
});
