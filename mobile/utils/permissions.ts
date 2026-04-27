import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

function openSettings() {
  Linking.openSettings().catch(() => {});
}

/**
 * Solicita permissão de câmera com diálogo amigável antes do pedido do sistema.
 * - Se já concedida: retorna true imediatamente
 * - Se negada permanentemente: orienta o usuário a abrir as Configurações
 * - Se não decidida: mostra contexto antes do diálogo do sistema
 */
export async function requestCameraPermissionFriendly(): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();

  if (current.status === 'granted') return true;

  // Negada permanentemente → orienta para Configurações
  if (!current.canAskAgain) {
    await new Promise<void>((resolve) =>
      Alert.alert(
        'Câmera bloqueada',
        'O acesso à câmera foi negado. Para usar este recurso, abra as Configurações do celular e permita o acesso à câmera.',
        [
          { text: 'Agora não', style: 'cancel', onPress: () => resolve() },
          { text: 'Abrir Configurações', onPress: () => { openSettings(); resolve(); } },
        ],
      ),
    );
    return false;
  }

  // Primeira vez (undetermined) → vai direto ao diálogo do sistema
  const result = await ImagePicker.requestCameraPermissionsAsync();
  return result.status === 'granted';
}

/**
 * Solicita permissão de galeria com diálogo amigável.
 */
export async function requestGalleryPermissionFriendly(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();

  if (current.status === 'granted') return true;

  // Negada permanentemente → orienta para Configurações
  if (!current.canAskAgain) {
    await new Promise<void>((resolve) =>
      Alert.alert(
        'Galeria bloqueada',
        'O acesso à galeria foi negado. Para usar este recurso, abra as Configurações do celular e permita o acesso às fotos.',
        [
          { text: 'Agora não', style: 'cancel', onPress: () => resolve() },
          { text: 'Abrir Configurações', onPress: () => { openSettings(); resolve(); } },
        ],
      ),
    );
    return false;
  }

  // Primeira vez → vai direto ao diálogo do sistema
  const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return result.status === 'granted';
}
