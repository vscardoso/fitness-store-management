import { Stack } from 'expo-router';

export default function LabelsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="queue" />
    </Stack>
  );
}
