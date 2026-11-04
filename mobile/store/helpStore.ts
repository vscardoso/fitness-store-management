/** Ficha de ajuda aberta (folha no celular, painel à direita no notebook). */
import { create } from 'zustand';

interface HelpState {
  openId: string | null;
  open: (id: string) => void;
  close: () => void;
  toggle: (id: string) => void;
}

export const useHelpStore = create<HelpState>((set, get) => ({
  openId: null,
  open: (id) => set({ openId: id }),
  close: () => set({ openId: null }),
  toggle: (id) => set({ openId: get().openId === id ? null : id }),
}));
