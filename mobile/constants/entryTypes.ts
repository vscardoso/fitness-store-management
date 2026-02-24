/**
 * Constantes de tipos de entrada de estoque.
 *
 * Centraliza labels, cores e ícones que antes eram duplicados em
 * edit/[id].tsx, entries/[id].tsx e outros arquivos.
 */

import { Colors } from '@/constants/Colors';

// --------------------------------------------------------------------------
// Labels
// --------------------------------------------------------------------------

export const ENTRY_TYPE_LABELS: Record<string, string> = {
  trip: 'Viagem',
  online: 'Online',
  local: 'Local',
  initial: 'Inicial',
  adjustment: 'Ajuste',
  return: 'Devolução',
  donation: 'Doação',
};

// --------------------------------------------------------------------------
// Cores
// --------------------------------------------------------------------------

export const ENTRY_TYPE_COLORS: Record<string, string> = {
  trip: Colors.light.info,
  online: Colors.light.warning,
  local: Colors.light.success,
  initial: Colors.light.textSecondary,
  adjustment: Colors.light.primary,
  return: Colors.light.info,
  donation: Colors.light.success,
};

// --------------------------------------------------------------------------
// Ícones Ionicons
// --------------------------------------------------------------------------

export const ENTRY_TYPE_ICONS: Record<string, string> = {
  trip: 'car-outline',
  online: 'cart-outline',
  local: 'storefront-outline',
  initial: 'archive-outline',
  adjustment: 'construct-outline',
  return: 'return-up-back-outline',
  donation: 'gift-outline',
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

export const getEntryTypeLabel = (type: string): string =>
  ENTRY_TYPE_LABELS[type?.toLowerCase()] ?? type;

export const getEntryTypeColor = (type: string): string =>
  ENTRY_TYPE_COLORS[type?.toLowerCase()] ?? Colors.light.textSecondary;

export const getEntryTypeIcon = (type: string): string =>
  ENTRY_TYPE_ICONS[type?.toLowerCase()] ?? 'cube-outline';
