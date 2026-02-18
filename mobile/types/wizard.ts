/**
 * Tipos para o Wizard de Criação de Produtos
 * Fluxo de 3 etapas: Identificar → Confirmar → Entrada
 */

import type { Product, ProductCreate, ProductScanResult, DuplicateMatch, StockEntry } from './index';

// ============================================
// WIZARD STEPS & METHODS
// ============================================

export type WizardStep = 'identify' | 'confirm' | 'entry' | 'complete';

export type IdentifyMethod = 'scanner' | 'manual' | 'catalog';

export type EntryChoice = 'new' | 'existing' | 'skip';

// Dados da entrada vinculada (retornados após criar entrada)
export interface LinkedEntryData {
  id: number;
  code: string;
  quantity: number;
  supplier?: string;
}

// ============================================
// WIZARD DIALOG (substitui Alert.alert no hook)
// ============================================

export interface WizardDialog {
  visible: boolean;
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
}

// ============================================
// WIZARD STATE
// ============================================

export interface WizardState {
  // Current step
  currentStep: WizardStep;

  // Step 1 - Identify
  identifyMethod: IdentifyMethod | null;
  capturedImage: string | null;
  scanResult: ProductScanResult | null;
  isAnalyzing: boolean;
  analyzeError: string | null;
  selectedCatalogProduct: Product | null;

  // Step 2 - Confirm
  productData: Partial<ProductCreate>;
  duplicates: DuplicateMatch[];
  isEditing: boolean;
  validationErrors: Record<string, string>;

  // Step 3 - Entry
  createdProduct: Product | null;
  entryChoice: EntryChoice | null;
  selectedEntry: StockEntry | null;

  // Step 4 - Complete (após retorno de criação de entrada)
  linkedEntry: LinkedEntryData | null;

  // Meta
  isDirty: boolean;
  isCreating: boolean;
  createError: string | null;

  // Dialog (substitui Alert.alert — consumido pelo componente wizard.tsx)
  wizardDialog: WizardDialog | null;
}

// ============================================
// WIZARD ACTIONS
// ============================================

export interface WizardActions {
  // Navigation
  goToStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  resetWizard: () => void;

  // Step 1 - Identify
  selectMethod: (method: IdentifyMethod) => void;
  setCapturedImage: (uri: string | null) => void;
  setScanResult: (result: ProductScanResult | null) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  setAnalyzeError: (error: string | null) => void;
  selectCatalogProduct: (product: Product | null) => void;

  // Step 2 - Confirm
  updateProductData: (data: Partial<ProductCreate>) => void;
  setDuplicates: (duplicates: DuplicateMatch[]) => void;
  setIsEditing: (editing: boolean) => void;
  setValidationErrors: (errors: Record<string, string>) => void;
  validateProductData: () => boolean;
  createProduct: () => Promise<Product | null>;

  // Step 3 - Entry
  selectEntryChoice: (choice: EntryChoice) => void;
  selectEntry: (entry: StockEntry | null) => void;
  completeWizard: () => void;

  // Helpers
  setIsDirty: (dirty: boolean) => void;
  confirmExit: () => Promise<boolean>;

  // Duplicate actions
  addStockToDuplicate: (productId: number) => void;
}

// ============================================
// WIZARD CONTEXT
// ============================================

export interface WizardContextValue {
  state: WizardState;
  actions: WizardActions;
}

// ============================================
// WIZARD COMPONENT PROPS
// ============================================

export interface WizardStepperProps {
  currentStep: WizardStep;
  steps: WizardStep[];
}

export interface WizardStep1Props {
  state: WizardState;
  actions: WizardActions;
}

export interface WizardStep2Props {
  state: WizardState;
  actions: WizardActions;
}

export interface WizardStep3Props {
  state: WizardState;
  actions: WizardActions;
}

export interface DuplicatesPanelProps {
  duplicates: DuplicateMatch[];
  onAddStock: (productId: number) => void;
  onViewProduct: (productId: number) => void;
}

export interface ProductEditModalProps {
  visible: boolean;
  productData: Partial<ProductCreate>;
  categories: { id: number; name: string }[];
  onSave: (data: Partial<ProductCreate>) => void;
  onDismiss: () => void;
}

export interface EntrySelectModalProps {
  visible: boolean;
  entries: StockEntry[];
  onSelect: (entry: StockEntry) => void;
  onDismiss: () => void;
  isLoading?: boolean;
}

// ============================================
// WIZARD INITIAL STATE
// ============================================

export const INITIAL_WIZARD_STATE: WizardState = {
  currentStep: 'identify',
  identifyMethod: null,
  capturedImage: null,
  scanResult: null,
  isAnalyzing: false,
  analyzeError: null,
  selectedCatalogProduct: null,
  productData: {},
  duplicates: [],
  isEditing: false,
  validationErrors: {},
  createdProduct: null,
  entryChoice: null,
  selectedEntry: null,
  linkedEntry: null,
  isDirty: false,
  isCreating: false,
  createError: null,
  wizardDialog: null,
};

// ============================================
// WIZARD STEP CONFIG
// ============================================

export interface WizardStepConfig {
  key: WizardStep;
  label: string;
  icon: string;
  description: string;
}

export const WIZARD_STEPS: WizardStepConfig[] = [
  {
    key: 'identify',
    label: 'Identificar',
    icon: 'scan-outline',
    description: 'Escolha como identificar o produto',
  },
  {
    key: 'confirm',
    label: 'Confirmar',
    icon: 'checkmark-circle-outline',
    description: 'Revise e confirme os dados',
  },
  {
    key: 'entry',
    label: 'Entrada',
    icon: 'archive-outline',
    description: 'Vincule a uma entrada de estoque',
  },
  {
    key: 'complete',
    label: 'Concluido',
    icon: 'checkmark-done-outline',
    description: 'Produto cadastrado com sucesso',
  },
];
