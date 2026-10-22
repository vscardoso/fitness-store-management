/**
 * Rascunho do cadastro entre signup e create-store.
 * Só em memória (sem persist): a senha nunca vai para URL, histórico ou storage.
 */
import { create } from 'zustand';

export interface SignupDraft {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
}

interface SignupDraftState {
  draft: SignupDraft | null;
  setDraft: (draft: SignupDraft) => void;
  clearDraft: () => void;
}

export const useSignupDraftStore = create<SignupDraftState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: null }),
}));
