import { LegalDocument } from '@/components/legal/LegalDocument';
import { DATA_DELETION } from '@/constants/legal';

export default function ExclusaoDeDadosScreen() {
  return <LegalDocument title="Exclusão de dados" sections={DATA_DELETION} />;
}
