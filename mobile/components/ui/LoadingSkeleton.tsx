import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Colors } from '@/constants/Colors';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

export function Skeleton({ width = '100%', height = 20, borderRadius = 8, style }: SkeletonProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
}

interface ProductCardSkeletonProps {
  count?: number;
}

export function ProductCardSkeleton({ count = 4 }: ProductCardSkeletonProps) {
  return (
    <View style={styles.gridContainer}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.cardContainer}>
          <View style={styles.card}>
            <Skeleton width={60} height={24} borderRadius={12} style={styles.badge} />
            <Skeleton width="80%" height={18} style={styles.title} />
            <Skeleton width="60%" height={14} style={styles.subtitle} />
            <View style={styles.footer}>
              <Skeleton width={80} height={28} />
              <Skeleton width={60} height={28} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

interface ListItemSkeletonProps {
  count?: number;
}

export function ListItemSkeleton({ count = 6 }: ListItemSkeletonProps) {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.listItem}>
          <Skeleton width={48} height={48} borderRadius={24} />
          <View style={styles.listItemContent}>
            <Skeleton width="70%" height={16} style={styles.listItemTitle} />
            <Skeleton width="50%" height={14} />
          </View>
          <Skeleton width={24} height={24} borderRadius={12} />
        </View>
      ))}
    </View>
  );
}

interface DashboardSkeletonProps {}

export function DashboardSkeleton({}: DashboardSkeletonProps) {
  return (
    <View style={styles.dashboardContainer}>
      <Skeleton width="60%" height={28} style={styles.dashboardTitle} />
      <Skeleton width="40%" height={18} style={styles.dashboardSubtitle} />
      <View style={styles.statsGrid}>
        {Array.from({ length: 6 }).map((_, index) => (
          <View key={index} style={styles.statCard}>
            <Skeleton width={40} height={40} borderRadius={20} style={styles.statIcon} />
            <Skeleton width="60%" height={14} style={styles.statLabel} />
            <Skeleton width="80%" height={24} style={styles.statValue} />
            <Skeleton width="50%" height={12} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: Colors.light.border,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  cardContainer: {
    width: '50%',
    padding: 6,
  },
  card: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 12,
    elevation: 2,
  },
  badge: {
    marginBottom: 8,
  },
  title: {
    marginBottom: 6,
  },
  subtitle: {
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  listContainer: {
    padding: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
  },
  listItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  listItemTitle: {
    marginBottom: 6,
  },
  dashboardContainer: {
    padding: 16,
  },
  dashboardTitle: {
    marginBottom: 8,
  },
  dashboardSubtitle: {
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.light.background,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
  },
  statIcon: {
    marginBottom: 8,
  },
  statLabel: {
    marginBottom: 4,
  },
  statValue: {
    marginBottom: 2,
  },
});
