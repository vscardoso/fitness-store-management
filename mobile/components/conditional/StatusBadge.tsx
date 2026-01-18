/**
 * StatusBadge - Reusable status indicator for conditional shipments
 * Shows icon, label, and color-coded styling based on shipment status
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { ShipmentStatus } from '@/types/conditional';
import {
  SHIPMENT_STATUS_COLORS,
  SHIPMENT_STATUS_ICONS,
  SHIPMENT_STATUS_LABELS,
} from '@/types/conditional';
import { Colors } from '@/constants/Colors';

interface StatusBadgeProps {
  status: ShipmentStatus;
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
}

export default function StatusBadge({
  status,
  size = 'medium',
  showIcon = true,
}: StatusBadgeProps) {
  const color = SHIPMENT_STATUS_COLORS[status] ?? Colors.light.info;
  const icon = SHIPMENT_STATUS_ICONS[status] ?? 'information';
  const label = SHIPMENT_STATUS_LABELS[status] ?? status;

  const sizeStyles = {
    small: { fontSize: 10, height: 24 },
    medium: { fontSize: 12, height: 28 },
    large: { fontSize: 14, height: 32 },
  };

  return (
    <Chip
      icon={showIcon ? icon : undefined}
      style={[
        styles.badge,
        {
          backgroundColor: color + '20',
          height: sizeStyles[size].height,
        }
      ]}
      textStyle={[
        styles.badgeText,
        {
          color,
          fontSize: sizeStyles[size].fontSize,
        }
      ]}
      compact={size === 'small'}
    >
      {label}
    </Chip>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontWeight: '600',
  },
});
