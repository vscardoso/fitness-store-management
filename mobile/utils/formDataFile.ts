import { Platform } from 'react-native';

/**
 * Anexa um arquivo local ao FormData.
 * No web o objeto {uri,name,type} do RN vira a string "[object Object]";
 * lá é preciso buscar o blob (blob:/data: URI) e anexar o arquivo de verdade.
 */
export async function appendFileToFormData(
  formData: FormData,
  field: string,
  uri: string,
  name: string,
  type: string,
): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    formData.append(field, blob, name);
  } else {
    formData.append(field, { uri, name, type } as any);
  }
}
