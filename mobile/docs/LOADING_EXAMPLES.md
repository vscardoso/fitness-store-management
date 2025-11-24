# Loading System Examples

Practical examples of using the global loading indicator system.

## Example 1: Basic Product Creation

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { withLoadingMessage } from '@/utils/apiHelpers';

function CreateProductScreen() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: ProductCreate) => {
      // Global loading shows automatically with custom message
      const response = await api.post(
        '/products',
        data,
        withLoadingMessage('Criando produto...')
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate to refresh list
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return (
    <Button
      onPress={() => createMutation.mutate(formData)}
      loading={createMutation.isPending}
      disabled={createMutation.isPending}
    >
      Criar Produto
    </Button>
  );
}
```

**UX Flow:**
1. User taps "Criar Produto"
2. Button shows local spinner
3. Global overlay blocks UI with message "Criando produto..."
4. On success: overlay hides, list refreshes
5. On error: overlay hides, error shown in snackbar

## Example 2: Background Refresh

```typescript
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { skipLoading } from '@/utils/apiHelpers';

function ProductListScreen() {
  const { data, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await api.get('/products');
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleManualRefresh = async () => {
    // Manual refresh: show loading
    await refetch();
  };

  const handleSilentRefresh = async () => {
    // Silent refresh: skip loading overlay
    await api.get('/products', skipLoading()).then((response) => {
      // Update cache manually if needed
      queryClient.setQueryData(['products'], response.data);
    });
  };

  return (
    <View>
      <FlatList data={data} />
      <Button onPress={handleManualRefresh}>Refresh</Button>
    </View>
  );
}
```

**Key Difference:**
- `refetch()` = Shows loading (user-initiated)
- `skipLoading()` = Silent (background operation)

## Example 3: Multi-Step Form

```typescript
import { useMutation } from '@tanstack/react-query';
import api from '@/services/api';
import { withLoadingMessage } from '@/utils/apiHelpers';

function SignupFlow() {
  const [step, setStep] = useState(1);

  const checkEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await api.post(
        '/auth/check-email',
        { email },
        withLoadingMessage('Verificando email...')
      );
      return response.data;
    },
    onSuccess: () => setStep(2),
  });

  const createAccountMutation = useMutation({
    mutationFn: async (data: SignupData) => {
      const response = await api.post(
        '/auth/signup',
        data,
        withLoadingMessage('Criando conta...')
      );
      return response.data;
    },
    onSuccess: () => {
      // Navigate to dashboard
      router.replace('/(tabs)');
    },
  });

  if (step === 1) {
    return (
      <Button onPress={() => checkEmailMutation.mutate(email)}>
        Próximo
      </Button>
    );
  }

  return (
    <Button onPress={() => createAccountMutation.mutate(formData)}>
      Criar Conta
    </Button>
  );
}
```

**UX Flow:**
1. Step 1: "Verificando email..." (fast)
2. Step 2: "Criando conta..." (slower)
3. Each step has appropriate loading message

## Example 4: Batch Operations

```typescript
import { useMutation } from '@tanstack/react-query';
import api from '@/services/api';
import { withLoadingMessage, mergeConfigs } from '@/utils/apiHelpers';

function BulkDeleteProducts() {
  const deleteMutation = useMutation({
    mutationFn: async (productIds: number[]) => {
      // Single loading overlay for entire batch
      const response = await api.post(
        '/products/bulk-delete',
        { ids: productIds },
        mergeConfigs(
          withLoadingMessage(`Deletando ${productIds.length} produtos...`),
          { timeout: 30000 } // Longer timeout for batch operation
        )
      );
      return response.data;
    },
  });

  const handleBulkDelete = (ids: number[]) => {
    Alert.alert(
      'Confirmar',
      `Deletar ${ids.length} produtos?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(ids),
        },
      ]
    );
  };

  return (
    <Button onPress={() => handleBulkDelete(selectedIds)}>
      Deletar Selecionados ({selectedIds.length})
    </Button>
  );
}
```

**Best Practice:** Dynamic messages show the operation scale.

## Example 5: File Upload with Custom Feedback

```typescript
import { useMutation } from '@tanstack/react-query';
import api from '@/services/api';
import { withLoadingMessage } from '@/utils/apiHelpers';
import * as ImagePicker from 'expo-image-picker';

function ProductImageUpload({ productId }: { productId: number }) {
  const uploadMutation = useMutation({
    mutationFn: async (imageUri: string) => {
      const formData = new FormData();
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'product.jpg',
      } as any);

      const response = await api.post(
        `/products/${productId}/image`,
        formData,
        mergeConfigs(
          withLoadingMessage('Enviando imagem...'),
          {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000, // 1 minute for large files
          }
        )
      );
      return response.data;
    },
  });

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled) {
      uploadMutation.mutate(result.assets[0].uri);
    }
  };

  return (
    <Button onPress={handlePickImage}>
      Adicionar Imagem
    </Button>
  );
}
```

**Note:** File uploads get longer timeout and specific message.

## Example 6: Search with Debounce

```typescript
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import api from '@/services/api';
import { skipLoading } from '@/utils/apiHelpers';

function ProductSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'search', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch) return [];

      // Skip global loading for search (show local loading instead)
      const response = await api.get(
        '/products',
        mergeConfigs(
          skipLoading(),
          { params: { search: debouncedSearch } }
        )
      );
      return response.data;
    },
    enabled: debouncedSearch.length > 0,
  });

  return (
    <View>
      <TextInput
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholder="Buscar produtos..."
        right={isLoading && <ActivityIndicator />}
      />
      <FlatList data={data} />
    </View>
  );
}
```

**Rationale:** Search uses local loading to avoid blocking UI on every keystroke.

## Example 7: Optimistic Updates

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { skipLoading } from '@/utils/apiHelpers';

function ToggleFavorite({ productId }: { productId: number }) {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: async (isFavorite: boolean) => {
      // Skip loading for instant feedback
      const response = await api.patch(
        `/products/${productId}/favorite`,
        { is_favorite: isFavorite },
        skipLoading()
      );
      return response.data;
    },
    onMutate: async (isFavorite) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['products', productId] });

      // Snapshot previous value
      const previous = queryClient.getQueryData(['products', productId]);

      // Optimistically update
      queryClient.setQueryData(['products', productId], (old: any) => ({
        ...old,
        is_favorite: isFavorite,
      }));

      return { previous };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['products', productId], context.previous);
      }
    },
    onSettled: () => {
      // Refetch to sync with server
      queryClient.invalidateQueries({ queryKey: ['products', productId] });
    },
  });

  return (
    <IconButton
      icon={isFavorite ? 'heart' : 'heart-outline'}
      onPress={() => toggleMutation.mutate(!isFavorite)}
    />
  );
}
```

**Pattern:** Optimistic updates skip loading for instant feedback.

## Example 8: Login with Error Handling

```typescript
import { useAuth } from '@/hooks/useAuth';
import { withLoadingMessage } from '@/utils/apiHelpers';

function LoginScreen() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      // Custom message for auth operations
      return await login(credentials, withLoadingMessage('Autenticando...'));
    },
    onError: (error: Error) => {
      // Global loading automatically hides
      // Show error in UI
      setError(error.message);
      Alert.alert('Erro', error.message);
    },
    onSuccess: () => {
      // Navigate on success
      router.replace('/(tabs)');
    },
  });

  return (
    <View>
      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={!!error}
      />
      <TextInput
        label="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        error={!!error}
      />
      {error && <HelperText type="error">{error}</HelperText>}
      <Button
        onPress={() => loginMutation.mutate({ email, password })}
        loading={loginMutation.isPending}
      >
        Entrar
      </Button>
    </View>
  );
}
```

**Error Flow:**
1. Loading shows: "Autenticando..."
2. Error occurs: loading hides automatically
3. Error displayed in UI
4. User can retry immediately

## Common Patterns Summary

| Use Case | Pattern | Loading Behavior |
|----------|---------|------------------|
| User action (create, update, delete) | Default or `withLoadingMessage()` | Show global loading |
| Background refresh | `skipLoading()` | No loading overlay |
| Search/filter | `skipLoading()` + local loading | Local spinner only |
| Optimistic update | `skipLoading()` | Instant feedback |
| File upload | `withLoadingMessage()` + longer timeout | Extended loading |
| Batch operations | `withLoadingMessage()` with count | Show operation scale |
| Multi-step forms | `withLoadingMessage()` per step | Context-specific messages |

## Testing Scenarios

### Test 1: Concurrent Requests

```typescript
// Trigger multiple requests simultaneously
const [products, customers, sales] = await Promise.all([
  api.get('/products'),
  api.get('/customers'),
  api.get('/sales'),
]);

// Expected: Loading shows once, hides when ALL complete
```

### Test 2: Fast Request (< 300ms)

```typescript
// Mock fast endpoint
await api.get('/ping'); // Responds in 50ms

// Expected: Loading shows for minimum 300ms
```

### Test 3: Slow Request (> 10s)

```typescript
// Mock slow endpoint
await api.get('/slow-operation'); // Takes 15s

// Expected:
// - Loading shows
// - Timeout warning appears at 10s
// - Auto-hide at 30s if stuck
```

### Test 4: Request Error

```typescript
try {
  await api.post('/products', invalidData);
} catch (error) {
  // Expected: Loading hides, error handled
}
```

### Test 5: Skip Loading

```typescript
await api.get('/products', skipLoading());

// Expected: No loading overlay shown
```

## Debugging Tips

### Check Request Counter

```typescript
import { loadingManager } from '@/services/loadingManager';

console.log('Pending requests:', loadingManager.getRequestCount());
```

### Monitor State Changes

```typescript
loadingManager.subscribe((state) => {
  console.log('Loading state:', state);
});
```

### Force Reset (Last Resort)

```typescript
// Only for debugging/testing
loadingManager.reset();
```

## Related Documentation

- [LOADING_SYSTEM.md](./LOADING_SYSTEM.md) - Complete system documentation
- [API.md](../../docs/API.md) - Backend API reference
- [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) - System architecture
