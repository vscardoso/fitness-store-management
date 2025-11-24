# Global Loading Indicator System

## Overview

The app uses a global loading overlay that automatically shows during API requests. This provides consistent loading feedback across all screens without requiring manual loading state management in each component.

## Architecture

### Components

1. **LoadingOverlay** (`components/ui/LoadingOverlay.tsx`)
   - Visual component that displays the loading indicator
   - Semi-transparent backdrop with centered spinner
   - Optional message display
   - Timeout warning after 10 seconds
   - Auto-hide after 30 seconds (safety mechanism)

2. **LoadingManager** (`services/loadingManager.ts`)
   - State manager using event emitter pattern
   - Request counter to handle concurrent requests
   - Minimum display time of 300ms to avoid flicker
   - Subscription-based for React component integration

3. **API Interceptors** (`services/api.ts`)
   - Axios request interceptor triggers loading start
   - Axios response interceptor triggers loading stop
   - Handles both success and error cases

### Flow Diagram

```
API Request → Request Interceptor → loadingManager.show()
                                          ↓
                                    Increment counter
                                          ↓
                                    Notify subscribers
                                          ↓
                                    LoadingOverlay renders
                                          ↓
API Response → Response Interceptor → loadingManager.hide()
                                          ↓
                                    Decrement counter
                                          ↓
                                    If counter === 0:
                                          ↓
                                    Wait minimum display time
                                          ↓
                                    Notify subscribers
                                          ↓
                                    LoadingOverlay hides
```

## Usage

### Automatic Loading (Default Behavior)

All API requests automatically show the loading overlay:

```typescript
import api from '@/services/api';

// Loading automatically shows and hides
const response = await api.get('/products');
```

### Skip Loading for Background Operations

Use `skipLoading()` helper for silent operations like background refreshes:

```typescript
import api from '@/services/api';
import { skipLoading } from '@/utils/apiHelpers';

// No loading indicator shown
const response = await api.get('/products', skipLoading());
```

**When to use:**
- Background data refreshes
- Polling operations
- Silent cache updates
- Auto-save operations

### Custom Loading Messages

Provide context-specific feedback:

```typescript
import api from '@/services/api';
import { withLoadingMessage } from '@/utils/apiHelpers';

const response = await api.post(
  '/products',
  productData,
  withLoadingMessage('Criando produto...')
);
```

**Message Guidelines:**
- Keep it short (2-4 words)
- Use present continuous tense ("Criando...", "Carregando...", "Salvando...")
- Be specific to the action
- Use Portuguese for user-facing messages

### Combining Options

Use `mergeConfigs()` to combine multiple configurations:

```typescript
import { mergeConfigs, withLoadingMessage, skipLoading } from '@/utils/apiHelpers';

// Custom timeout with loading message
const response = await api.post(
  '/products',
  data,
  mergeConfigs(
    withLoadingMessage('Criando produto...'),
    { timeout: 10000 }
  )
);
```

## React Query Integration

The loading system works seamlessly with React Query:

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/services/api';

// Query - loading automatically shown during fetch
const { data, isLoading } = useQuery({
  queryKey: ['products'],
  queryFn: async () => {
    const response = await api.get('/products');
    return response.data;
  },
});

// Mutation - loading shown during operation
const mutation = useMutation({
  mutationFn: async (data: ProductCreate) => {
    // Custom message for better UX
    const response = await api.post(
      '/products',
      data,
      withLoadingMessage('Criando produto...')
    );
    return response.data;
  },
});
```

**Note:** You can use both the global loading overlay AND local loading states. For example, a button can show a local spinner while the global overlay blocks other interactions.

## Features

### Request Counter

The loading manager tracks concurrent requests:

```typescript
Request 1 starts → counter: 1 → show loading
Request 2 starts → counter: 2 → loading still visible
Request 1 completes → counter: 1 → loading still visible
Request 2 completes → counter: 0 → hide loading
```

### Minimum Display Time

Loading overlay shows for at least 300ms to avoid flicker on fast requests:

```
Request starts at T+0ms
Response arrives at T+50ms
Loading still visible until T+300ms
Loading hides at T+300ms
```

### Timeout Warning

If a request takes longer than 10 seconds, a warning message appears:

```
"Isso está demorando mais que o esperado..."
```

This provides feedback that the app hasn't frozen.

### Auto-Hide Safety

If requests get stuck (due to network issues, etc.), the overlay auto-hides after 30 seconds to prevent a permanently blocked UI.

A console warning is logged when this happens:

```
⚠️ Loading overlay auto-hidden after 30s. Possible stuck request.
```

### Animation

The overlay uses:
- **Fade in/out** (200ms) for smooth transitions
- **Pulse animation** on the spinner container for visual interest
- **React Native Reanimated** for 60 FPS performance

## Development

### Debug Logging

In development mode (`__DEV__ === true`), the loading manager logs all operations:

```
🔄 Loading started (counter: 1) Carregando produtos...
🔄 Loading increment (counter: 2)
🔄 Loading decrement (counter: 1)
✅ Loading completed
```

### Manual Control (Testing Only)

For testing, you can manually control the loading manager:

```typescript
import { loadingManager } from '@/services/loadingManager';

// Show loading
loadingManager.show('Custom message');

// Hide loading
loadingManager.hide();

// Get current state
const state = loadingManager.getState();
console.log(state); // { isLoading: true, message: 'Custom message', showTimeout: false }

// Get request count
const count = loadingManager.getRequestCount();
console.log(count); // 2

// Reset (clear all state)
loadingManager.reset();
```

**Warning:** Manual control bypasses the request counter. Only use for testing.

## Best Practices

### DO

✅ Use automatic loading for user-initiated actions (button clicks, form submissions)
✅ Use custom messages for long operations
✅ Skip loading for background operations
✅ Combine global loading with local loading states when appropriate
✅ Keep loading messages short and action-oriented

### DON'T

❌ Don't manually manage loading for every API call
❌ Don't skip loading for user-initiated actions
❌ Don't use long, verbose loading messages
❌ Don't bypass the loading system unless necessary
❌ Don't forget to test timeout behavior for slow networks

## Migration Guide

If you have existing screens with manual loading states, here's how to migrate:

### Before (Manual Loading State)

```typescript
const [isLoading, setIsLoading] = useState(false);

const handleSubmit = async () => {
  setIsLoading(true);
  try {
    await api.post('/products', data);
  } finally {
    setIsLoading(false);
  }
};

return (
  <Button loading={isLoading} disabled={isLoading}>
    Submit
  </Button>
);
```

### After (Global Loading + Local State)

```typescript
import { withLoadingMessage } from '@/utils/apiHelpers';

const mutation = useMutation({
  mutationFn: async (data) => {
    const response = await api.post(
      '/products',
      data,
      withLoadingMessage('Criando produto...')
    );
    return response.data;
  },
});

return (
  <Button
    loading={mutation.isPending}
    disabled={mutation.isPending}
    onPress={() => mutation.mutate(data)}
  >
    Submit
  </Button>
);
```

**Benefits:**
- Global overlay blocks UI during operation
- Button still shows local loading state
- No manual try/finally blocks needed
- Automatic error handling via React Query

## Troubleshooting

### Loading Overlay Stuck Visible

**Symptoms:** Overlay doesn't hide after request completes

**Causes:**
1. Request counter out of sync (e.g., error in interceptor)
2. Request still pending
3. Multiple requests with mismatched show/hide calls

**Solutions:**
1. Check console for error logs
2. Use `loadingManager.getRequestCount()` to check counter
3. Use `loadingManager.reset()` to force clear (last resort)
4. Wait for 30s auto-hide safety mechanism

### Flicker on Fast Requests

**Symptoms:** Loading overlay briefly flashes on screen

**Cause:** This is intentional! The minimum display time prevents worse flicker from showing/hiding too quickly.

**Solution:** If it's excessive, consider using `skipLoading()` for that specific request.

### Loading Not Showing

**Symptoms:** API request happens but no loading overlay

**Causes:**
1. Request has `X-Skip-Loading` header
2. LoadingOverlay not added to root layout
3. React Native Reanimated not configured properly

**Solutions:**
1. Remove `skipLoading()` helper
2. Verify `<LoadingOverlay />` in `app/_layout.tsx`
3. Check React Native Reanimated setup

### Timeout Warning Too Soon

**Symptoms:** Timeout warning shows before request naturally completes

**Cause:** TIMEOUT_WARNING_DELAY is too short for slow networks/operations

**Solution:** Adjust timeout in `loadingManager.ts`:

```typescript
private readonly TIMEOUT_WARNING_DELAY = 15000; // Increase to 15 seconds
```

## Future Enhancements

Potential improvements for future versions:

1. **Progress Indicators**: Show upload/download progress for large files
2. **Queue Status**: Display "X requests pending" for batch operations
3. **Network Speed Detection**: Adjust timeouts based on connection speed
4. **Custom Animations**: Allow different animations per request type
5. **Accessibility**: Add screen reader announcements for loading states
6. **Analytics**: Track slow requests and timeout frequency

## Related Files

- `mobile/components/ui/LoadingOverlay.tsx` - Visual component
- `mobile/services/loadingManager.ts` - State manager
- `mobile/services/api.ts` - Axios interceptors
- `mobile/utils/apiHelpers.ts` - Helper utilities
- `mobile/app/_layout.tsx` - Integration point

## See Also

- [React Query Documentation](https://tanstack.com/query/latest)
- [Axios Interceptors](https://axios-http.com/docs/interceptors)
- [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/)
