import { LegalDocument } from '@/components/legal/LegalDocument';
import { TERMS } from '@/constants/legal';

export default function TermosScreen() {
  return <LegalDocument title="Termos de Uso" sections={TERMS} />;
}
