import { LegalDocument } from '@/components/legal/LegalDocument';
import { PRIVACY } from '@/constants/legal';

export default function PrivacidadeScreen() {
  return <LegalDocument title="Política de Privacidade" sections={PRIVACY} />;
}
