import { View, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, theme } from '@/constants/Colors';

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
  /** Título da tela (ex: "Detalhes do Produto") */
  title: string;
  /** Nome principal da entidade (ex: nome do produto) */
  entityName: string;
  /** Rota para voltar */
  backRoute: string;
  /** Rota para edição */
  editRoute: string;
  /** Callback para deletar */
  onDelete: () => void;
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
  badges = [],
  metrics = [],
  customElement,
}: DetailHeaderProps) {
  const router = useRouter();

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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />
      <LinearGradient
        colors={[Colors.light.primary, '#7c4dff']}
        style={styles.container}
      >
        <View style={styles.content}>
          {/* Barra de navegação */}
          <View style={styles.navbar}>
            <TouchableOpacity
              onPress={() => router.push(backRoute as any)}
              style={styles.navButton}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            <Text variant="titleLarge" style={styles.navTitle}>
              {title}
            </Text>

            <View style={styles.navActions}>
              <TouchableOpacity
                onPress={() => router.push(editRoute as any)}
                style={styles.actionButton}
              >
                <Ionicons name="pencil" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onDelete} style={styles.actionButton}>
                <Ionicons name="trash" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Elemento customizado (avatar, etc) */}
          {customElement && <View style={styles.customElement}>{customElement}</View>}

          {/* Nome da entidade */}
          <Text variant="headlineMedium" style={styles.entityName}>
            {entityName}
          </Text>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: Colors.light.primary, // IMPORTANTE: mesma cor do gradiente
  },
  container: {
    paddingTop: 0, // SafeArea já cuidou do espaço
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  content: {
    marginTop: theme.spacing.sm, // Pequeno espaço após SafeArea
  },
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTitle: {
    color: '#fff',
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.xl,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: theme.spacing.sm,
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
  entityName: {
    color: '#fff',
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.lg,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
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
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
  },
  badgeWarning: {
    backgroundColor: 'rgba(255, 152, 0, 0.9)',
  },
  badgeError: {
    backgroundColor: 'rgba(244, 67, 54, 0.9)',
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
