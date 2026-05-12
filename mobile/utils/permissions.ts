import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export async function requestCameraPermissionFriendly(): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();

  if (current.status === 'granted') return true;

  if (!current.canAskAgain) {
    Alert.alert(
      'Permissão necessária',
      'O acesso à câmera foi negado. Vá em Configurações e habilite a permissão para o Fitness Store.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir Configurações', onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  }

  const result = await ImagePicker.requestCameraPermissionsAsync();

  if (result.status !== 'granted') {
    Alert.alert(
      'Câmera bloqueada',
      'Sem acesso à câmera não é possível escanear produtos. Habilite a permissão nas configurações do dispositivo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir Configurações', onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  }

  return true;
}

export async function requestGalleryPermissionFriendly(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();

  if (current.status === 'granted') return true;

  if (!current.canAskAgain) {
    Alert.alert(
      'Permissão necessária',
      'O acesso à galeria foi negado. Vá em Configurações e habilite a permissão para o Fitness Store.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir Configurações', onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  }

  const result = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (result.status !== 'granted') {
    Alert.alert(
      'Galeria bloqueada',
      'Sem acesso à galeria não é possível selecionar fotos de produtos. Habilite a permissão nas configurações do dispositivo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir Configurações', onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  }

  return true;
}
