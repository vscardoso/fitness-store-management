import { create } from 'zustand';

export interface ConditionalProcessingItemDraft {
  id: number;
  quantity_kept: number;
  quantity_returned: number;
  quantity_damaged: number;
  quantity_lost: number;
  notes: string;
}

interface ConditionalProcessingState {
  drafts: Record<number, Record<number, ConditionalProcessingItemDraft>>;
  initializeShipmentDraft: (shipmentId: number, items: ConditionalProcessingItemDraft[]) => void;
  updateShipmentItem: (shipmentId: number, itemId: number, updates: Partial<ConditionalProcessingItemDraft>) => void;
  resetShipmentDraft: (shipmentId: number) => void;
}

export const useConditionalProcessingStore = create<ConditionalProcessingState>((set) => ({
  drafts: {},
  initializeShipmentDraft: (shipmentId, items) =>
    set((state) => {
      if (state.drafts[shipmentId] && Object.keys(state.drafts[shipmentId]).length > 0) {
        return state;
      }

      const mappedItems = items.reduce<Record<number, ConditionalProcessingItemDraft>>((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});

      return {
        drafts: {
          ...state.drafts,
          [shipmentId]: mappedItems,
        },
      };
    }),
  updateShipmentItem: (shipmentId, itemId, updates) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [shipmentId]: {
          ...(state.drafts[shipmentId] || {}),
          [itemId]: {
            ...(state.drafts[shipmentId]?.[itemId] || {
              id: itemId,
              quantity_kept: 0,
              quantity_returned: 0,
              quantity_damaged: 0,
              quantity_lost: 0,
              notes: '',
            }),
            ...updates,
          },
        },
      },
    })),
  resetShipmentDraft: (shipmentId) =>
    set((state) => {
      const nextDrafts = { ...state.drafts };
      delete nextDrafts[shipmentId];
      return { drafts: nextDrafts };
    }),
}));
