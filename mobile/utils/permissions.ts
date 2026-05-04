import { Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export async function requestCameraPermissionFriendly(): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();

  if (current.status === 'granted') return true;

  if (!current.canAskAgain) {
    Linking.openSettings().catch(() => {});
    return false;
  }

  const result = await ImagePicker.requestCameraPermissionsAsync();
  return result.status === 'granted';
}

export async function requestGalleryPermissionFriendly(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();

  if (current.status === 'granted') return true;

  if (!current.canAskAgain) {
    Linking.openSettings().catch(() => {});
    return false;
  }

  const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return result.status === 'granted';
}
