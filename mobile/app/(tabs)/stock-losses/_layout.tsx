import { Stack } from 'expo-router';

export default function StockLossesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="register" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
