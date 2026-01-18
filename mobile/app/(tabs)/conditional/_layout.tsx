import { Stack } from 'expo-router';

export default function ConditionalLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
