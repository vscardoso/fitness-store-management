/**
 * ShipmentTimeline - Event timeline showing shipment history
 * Displays chronological events with dates and details
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { ConditionalShipment } from '@/types/conditional';
import { Colors } from '@/constants/Colors';
import { formatDate } from '@/utils/format';

interface TimelineEvent {
  date: string;
  label: string;
  details?: string;
  icon: string;
  color: string;
  isCompleted: boolean;
}

interface ShipmentTimelineProps {
  shipment: ConditionalShipment;
}

export default function ShipmentTimeline({ shipment }: ShipmentTimelineProps) {
  // Build timeline events based on shipment data
  const events: TimelineEvent[] = [];

  // 1. Created event (always present)
  events.push({
    date: shipment.created_at,
    label: 'Envio Criado',
    details: `${shipment.total_items_sent} itens, ${shipment.customer_name}`,
    icon: 'create',
    color: Colors.light.textSecondary,
    isCompleted: true,
  });

  // 2. Sent event
  if (shipment.sent_at) {
    const details = [];
    if (shipment.carrier) details.push(`Transportadora: ${shipment.carrier}`);
    if (shipment.tracking_code) details.push(`Rastreio: ${shipment.tracking_code}`);

    events.push({
      date: shipment.sent_at,
      label: 'Enviado ao Cliente',
      details: details.join(', ') || undefined,
      icon: 'send',
      color: Colors.light.primary,
      isCompleted: true,
    });
  } else {
    events.push({
      date: '',
      label: 'Aguardando Envio',
      details: 'Marque como enviado quando sair da loja',
      icon: 'time-outline',
      color: Colors.light.textSecondary,
      isCompleted: false,
    });
  }

  // 3. Deadline event
  if (shipment.deadline && shipment.status === 'SENT') {
    const daysRemaining = shipment.days_remaining;
    const isOverdue = shipment.is_overdue;

    events.push({
      date: shipment.deadline,
      label: isOverdue ? 'Prazo Vencido' : 'Prazo de Devolução',
      details: isOverdue
        ? `Atrasado ${Math.abs(daysRemaining)} dias`
        : `${daysRemaining} dias restantes`,
      icon: isOverdue ? 'alert-circle' : 'calendar',
      color: isOverdue ? Colors.light.error : Colors.light.warning,
      isCompleted: false,
    });
  }

  // 4. Return event
  if (shipment.returned_at) {
    events.push({
      date: shipment.returned_at,
      label: 'Devolução Processada',
      details: `${shipment.total_items_kept} mantidos, ${shipment.total_items_returned} devolvidos`,
      icon: 'return-down-back',
      color: Colors.light.warning,
      isCompleted: true,
    });
  }

  // 5. Completion event
  if (shipment.completed_at) {
    events.push({
      date: shipment.completed_at,
      label: 'Envio Concluído',
      details: `Venda finalizada`,
      icon: 'checkmark-circle',
      color: Colors.light.success,
      isCompleted: true,
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Histórico do Envio</Text>

      {events.map((event, index) => (
        <View key={index} style={styles.eventContainer}>
          {/* Timeline Line */}
          <View style={styles.timelineColumn}>
            <View
              style={[
                styles.eventDot,
                event.isCompleted
                  ? { backgroundColor: event.color }
                  : { backgroundColor: Colors.light.border },
              ]}
            >
              {event.isCompleted && (
                <Ionicons name={event.icon as any} size={12} color="#fff" />
              )}
            </View>
            {index < events.length - 1 && (
              <View
                style={[
                  styles.timelineLine,
                  event.isCompleted && styles.timelineLineActive,
                ]}
              />
            )}
          </View>

          {/* Event Content */}
          <View style={styles.eventContent}>
            <Text style={styles.eventLabel}>{event.label}</Text>
            {event.date && (
              <Text style={styles.eventDate}>
                {formatDate(event.date)}
              </Text>
            )}
            {event.details && (
              <Text style={styles.eventDetails}>{event.details}</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  eventContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  timelineColumn: {
    alignItems: 'center',
    marginRight: 16,
  },
  eventDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 4,
  },
  timelineLineActive: {
    backgroundColor: Colors.light.primary,
  },
  eventContent: {
    flex: 1,
    paddingBottom: 8,
  },
  eventLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  eventDetails: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontStyle: 'italic',
  },
});
