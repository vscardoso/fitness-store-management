import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useNavReady } from '@/hooks/useNavReady';

export default function CatalogRedirect() {
  const router = useRouter();
  const ready = useNavReady();
  useEffect(() => { if (ready) router.replace('/(tabs)/products'); }, [ready]);
  return null;
}
