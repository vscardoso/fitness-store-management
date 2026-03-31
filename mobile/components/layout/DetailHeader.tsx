import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';

interface Badge {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  type: 'success' | 'warning' | 'error' | 'info';
}

interface MetricCard {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}

interface DetailHeaderProps {
  /** Título da tela (ex: "Detalhes do Produto") - não usado, entidade é o título */
  title: string;
  /** Nome principal da entidade (ex: nome do produto) */
  entityName: string;
  /** Rota para voltar */
  backRoute: string;
  /** Rota para edição */
  editRoute?: string;
  /** Callback para deletar */
  onDelete?: () => void;
  /** Ocultar botões de editar/deletar */
  hideActions?: boolean;
  /** Badges de status */
  badges?: Badge[];
  /** Cards de métricas principais (máx 3) */
  metrics?: MetricCard[];
  /** Elemento customizado (ex: avatar) */
  customElement?: React.ReactNode;
}

export default function DetailHeader({
  title,
  entityName,
  backRoute,
  editRoute,
  onDelete,
  hideActions = false,
  badges = [],
  metrics = [],
  customElement,
}: DetailHeaderProps) {
  const router = useRouter();
  const brandingColors = useBrandingColors();

  const getBadgeStyle = (type: Badge['type']) => {
    switch (type) {
      case 'success':
        return styles.badgeSuccess;
      case 'warning':
        return styles.badgeWarning;
      case 'error':
        return styles.badgeError;
      case 'info':
        return styles.badgeInfo;
    }
  };

  return (
    <View style={styles.headerContainer}>
      <LinearGradient
        colors={brandingColors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          {/* Barra de navegação */}
          <View style={styles.navbar}>
            <TouchableOpacity
              onPress={() => router.push(backRoute as any)}
              style={styles.navButton}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            <View style={styles.navSpacer} />

            {!hideActions && (editRoute || onDelete) && (
              <View style={styles.navActions}>
                {editRoute && (
                  <TouchableOpacity
                    onPress={() => router.push(editRoute as any)}
                    style={styles.actionButton}
                  >
                    <Ionicons name="pencil" size={20} color="#fff" />
                  </TouchableOpacity>
                )}
                {onDelete && (
                  <TouchableOpacity onPress={onDelete} style={styles.actionButton}>
                    <Ionicons name="trash" size={20} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Elemento customizado (avatar, etc) */}
          {customElement && <View style={styles.customElement}>{customElement}</View>}

          {/* Título e nome da entidade */}
          <View style={styles.headerInfo}>
            {title ? (
              <>
                <Text style={styles.titleMain}>{title}</Text>
                <Text style={styles.entityNameSmall}>{entityName}</Text>
              </>
            ) : (
              <Text style={styles.greeting}>{entityName}</Text>
            )}
          </View>

          {/* Badges de status */}
          {badges.length > 0 && (
            <View style={styles.badges}>
              {badges.map((badge, index) => (
                <View key={index} style={[styles.badge, getBadgeStyle(badge.type)]}>
                  <Ionicons
                    name={badge.icon}
                    size={14}
                    color="#fff"
                    style={styles.badgeIcon}
                  />
                  <Text style={styles.badgeText}>{badge.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Cards de métricas */}
          {metrics.length > 0 && (
            <View style={styles.metrics}>
              {metrics.slice(0, 3).map((metric, index) => (
                <View key={index} style={styles.metricCard}>
                  <Ionicons
                    name={metric.icon}
                    size={20}
                    color="#fff"
                    style={styles.metricIcon}
                  />
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                  <Text style={styles.metricValue}>{metric.value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  // EXATAMENTE igual lista de produtos/clientes
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    // Container do conteúdo
  },
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navSpacer: {
    flex: 1,
  },
  navActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
  },
  customElement: {
    alignItems: 'center',
    marginBottom: 12,
  },
  headerInfo: {
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  greeting: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  titleMain: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  entityNameSmall: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeSuccess: {
    backgroundColor: Colors.light.success + 'E6',
  },
  badgeWarning: {
    backgroundColor: Colors.light.warning + 'E6',
  },
  badgeError: {
    backgroundColor: Colors.light.error + 'E6',
  },
  badgeInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  badgeIcon: {
    marginRight: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  metrics: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  metricIcon: {
    marginBottom: 6,
  },
  metricLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    marginBottom: 4,
  },
  metricValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
