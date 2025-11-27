# Mobile UX Patterns Guide

**Version:** 1.0.0
**Last Updated:** 2025-11-24
**Project:** Fitness Store Management - Mobile App

This document establishes mandatory UX patterns for the React Native + Expo mobile application. Following these patterns ensures consistency, proper navigation, and an excellent user experience across all screens.

---

## Table of Contents

1. [Navigation Patterns](#navigation-patterns)
2. [Screen Layout Architecture](#screen-layout-architecture)
3. [Header Patterns](#header-patterns)
4. [SafeAreaView Usage Rules](#safeareaview-usage-rules)
5. [Footer & Tab Navigation](#footer--tab-navigation)
6. [FAB (Floating Action Button)](#fab-floating-action-button)
7. [Spacing and Layout Standards](#spacing-and-layout-standards)
8. [Visual Design Rules](#visual-design-rules)
9. [State Management with React Query](#state-management-with-react-query)
10. [Common Mistakes to Avoid](#common-mistakes-to-avoid)

---

## 1. Navigation Patterns

### Navigation Best Practices

**Detail Screens: Back button goes to feature list**

```tsx
// ✅ CORRECT - Returns to feature list
// In products/[id].tsx
<TouchableOpacity onPress={() => router.push('/products')}>
  <Ionicons name="arrow-back" size={24} color="#fff" />
</TouchableOpacity>

// In customers/[id].tsx
<TouchableOpacity onPress={() => router.push('/customers')}>
  <Ionicons name="arrow-back" size={24} color="#fff" />
</TouchableOpacity>

// In entries/[id].tsx
<TouchableOpacity onPress={() => router.push('/entries')}>
  <Ionicons name="arrow-back" size={24} color="#fff" />
</TouchableOpacity>
```

**Why this pattern:**
- User expects to return to the list after viewing details
- Consistent navigation flow across all features
- Clear mental model: Detail → List → Dashboard

**General rule:**
- **Detail screens ([id].tsx)**: Use `router.push('/feature-list')` to return to list
- **Add/Edit screens**: Use `router.back()` to return to previous screen (could be list or detail)
- **After delete action**: Use `router.push()` to return to list since detail no longer exists

### File-Based Routing Structure

The app uses **Expo Router** with file-based routing. Directory structure determines navigation hierarchy:

```
mobile/app/
├── (auth)/               # Auth screens (login, signup)
│   └── _layout.tsx       # Auth stack navigator
├── (tabs)/               # Main app tabs
│   ├── _layout.tsx       # Tab navigator (VISIBLE tabs defined here)
│   ├── index.tsx         # Dashboard (Tab 1)
│   ├── sale.tsx          # PDV/Sales (Tab 2 - Central)
│   └── management.tsx    # Management (Tab 3)
├── products/             # Product screens (HIDDEN from tabs)
│   ├── _layout.tsx       # ⚠️ REQUIRED - Stack navigator
│   ├── index.tsx         # Product list
│   ├── add.tsx           # Add product
│   ├── [id].tsx          # Product details
│   └── edit/[id].tsx     # Edit product
├── customers/            # Customer screens
│   ├── _layout.tsx       # ⚠️ REQUIRED
│   └── ...
├── trips/                # Trip screens
│   ├── _layout.tsx       # ⚠️ REQUIRED
│   └── ...
└── _layout.tsx           # Root layout
```

### CRITICAL: _layout.tsx Requirement

**Every feature directory MUST have a `_layout.tsx` file** to maintain tab navigation visibility.

**Why:** Without a `_layout.tsx`, Expo Router treats child screens as detached from the tab navigator, causing the footer tabs to disappear.

**Template for feature directories:**

```tsx
import { Stack } from 'expo-router';
import { Colors } from '@/constants/Colors';

export default function FeatureLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.light.primary,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false, // We use custom headers
        }}
      />
      <Stack.Screen
        name="add"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="edit/[id]"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
```

### Tab Visibility Configuration

Hidden screens are registered in `(tabs)/_layout.tsx`:

```tsx
{/* Hidden screens - No tab, but routes preserved */}
<Tabs.Screen name="products" options={{ href: null }} />
<Tabs.Screen name="customers" options={{ href: null }} />
<Tabs.Screen name="trips" options={{ href: null }} />
```

**Key Points:**
- `href: null` hides the tab icon/label
- The route remains accessible via `router.push('/products')`
- Child screens (add, [id], etc.) inherit the hidden state
- Tab footer remains visible because of the feature's `_layout.tsx`

---

## 2. Screen Layout Architecture

### Standard Screen Structure

```tsx
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, ScrollView, FlatList } from 'react-native';

export default function FeatureScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Custom Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Screen Title</Text>
        </View>

        {/* Content (Choose ONE) */}
        <ScrollView style={styles.content}>
          {/* Scrollable content */}
        </ScrollView>

        {/* OR */}
        <FlatList
          data={items}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
        />

        {/* FAB (Optional) */}
        <FAB />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.primary, // Matches header color
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5', // App background
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.light.primary,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
  },
});
```

---

## 3. Header Patterns

### List Screens (index.tsx)

**Pattern:** Title + Empty Right Placeholder

```tsx
<View style={styles.header}>
  <Text style={styles.headerTitle}>Products</Text>
  <View style={{ width: 40 }} /> {/* Placeholder for symmetry */}
</View>
```

**DO NOT:**
- Add "Details" or redundant suffixes
- Use Divider components under headers
- Add action buttons unless critical (prefer FAB)

### Add/Edit Screens

**Pattern:** Back Button + Title + Empty Right Placeholder

```tsx
<View style={styles.header}>
  <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
    <Ionicons name="arrow-back" size={24} color="#fff" />
  </TouchableOpacity>
  <Text style={styles.headerTitle}>New Product</Text>
  <View style={{ width: 40 }} />
</View>

const styles = StyleSheet.create({
  backButton: {
    padding: 8, // Increases touch target
  },
});
```

### Detail Screens ([id].tsx)

**Pattern:** Back Button + Entity Name + Edit/Delete Actions

```tsx
<View style={styles.header}>
  <TouchableOpacity
    onPress={() => router.push('/products')}
    style={styles.backButton}
  >
    <Ionicons name="arrow-back" size={24} color="#fff" />
  </TouchableOpacity>
  <Text style={styles.headerTitle}>{product.name}</Text>
  <View style={styles.headerActions}>
    <TouchableOpacity
      onPress={() => router.push(`/products/edit/${id}` as any)}
      style={styles.actionButton}
    >
      <Ionicons name="pencil" size={20} color="#fff" />
    </TouchableOpacity>
    <TouchableOpacity onPress={handleDelete} style={styles.actionButton}>
      <Ionicons name="trash" size={20} color="#fff" />
    </TouchableOpacity>
  </View>
</View>

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
});
```

**Notes:**
- Use entity name (e.g., "Whey Protein") instead of generic "Product Details"
- Always include Edit (pencil icon) and Delete (trash icon) buttons
- Back button returns to feature list: `/products`, `/customers`, `/entries`, etc.

---

## 4. SafeAreaView Usage Rules

### MANDATORY Pattern

**ALWAYS use `SafeAreaView` from `react-native-safe-area-context`** (NOT from `react-native`).

```tsx
import { SafeAreaView } from 'react-native-safe-area-context';

<SafeAreaView style={styles.safeArea} edges={['top']}>
  {/* Screen content */}
</SafeAreaView>
```

### Edge Configuration

| Screen Type | Edges | Reason |
|-------------|-------|--------|
| Tab screens | `['top']` | Tab footer handles bottom inset |
| Modal screens | `['top', 'bottom']` | No tab footer present |
| Full-screen overlays | `[]` | Manual control needed |

### Style Pattern

```tsx
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.primary, // Matches header
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5', // Body background
  },
});
```

**Why two containers?**
- `safeArea`: Fills status bar area with header color (seamless look)
- `container`: Body content with different background color

---

## 5. Footer & Tab Navigation

### Tab Footer Visibility

The tab footer is **ALWAYS visible** on screens within the `(tabs)` hierarchy, including hidden routes (products, customers, trips) **IF** they have a `_layout.tsx`.

### Tab Footer Dimensions

```tsx
tabBarStyle: {
  height: Platform.OS === 'ios' ? 85 : 65,
  paddingBottom: Platform.OS === 'ios' ? 20 : 8,
  paddingTop: 8,
}
```

### Z-Index Hierarchy

1. **Tab Footer:** `elevation: 8` (highest)
2. **FAB Button:** `bottom: 90, zIndex: 1000` (above content, below nothing)
3. **Content:** Default z-index

**Spacing for FAB:**
```tsx
// Add bottom padding to scrollable content
contentContainerStyle={{
  paddingBottom: 100, // Prevents FAB overlap
}}
```

---

## 6. FAB (Floating Action Button)

### When to Use FAB

**DO use FAB:**
- List screens (products, customers, trips)
- Dashboard/home screens
- Screens where users frequently create new items

**DO NOT use FAB:**
- Add/edit screens (already in creation mode)
- Detail screens (use header actions)
- Screens without creation actions

### Implementation

```tsx
import FAB from '@/components/FAB';

<FAB /> {/* Add at bottom of container */}
```

### Positioning

```tsx
const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 90,  // Above tab footer (65-85px)
    right: 20,
    width: 64,
    height: 64,
    zIndex: 1000,
  },
});
```

### Quick Actions Configuration

Edit `mobile/components/FAB.tsx` to add/remove quick actions:

```tsx
const quickActions: QuickAction[] = [
  {
    id: 'new-product',
    title: 'Novo Produto',
    subtitle: 'Adicionar ao catálogo',
    icon: 'cube',
    colors: ['#4776e6', '#8e54e9'],
    route: '/products/add',
  },
  // Add more actions...
];
```

---

## 7. Spacing and Layout Standards

### Theme Spacing Values

Use values from `mobile/constants/Colors.ts`:

```tsx
theme.spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}
```

### Standard Margins

```tsx
// Section spacing
marginTop: 16,     // Between sections
marginBottom: 16,

// Card spacing
marginBottom: 12,  // Between cards

// Content padding
paddingHorizontal: 16,  // Screen edges
paddingVertical: 16,    // Top/bottom
```

### Gap vs Margin

**Prefer `gap` for flexbox layouts:**

```tsx
// ✅ GOOD - Clean and maintainable
<View style={{ flexDirection: 'row', gap: 12 }}>
  <Item />
  <Item />
</View>

// ❌ BAD - Harder to maintain
<View style={{ flexDirection: 'row' }}>
  <Item style={{ marginRight: 12 }} />
  <Item />
</View>
```

---

## 8. Visual Design Rules

### Information Display Pattern

**Standard field layout:**

```tsx
// Pattern: Label on left, value on right (horizontal row)
<View style={styles.infoRow}>
  <View style={styles.infoIcon}>
    <Ionicons name="calendar-outline" size={20} color={Colors.light.primary} />
  </View>
  <View style={styles.infoContent}>
    <Text style={styles.infoLabel}>Data</Text>
    <Text style={styles.infoValue}>{formatDate(entry.entry_date)}</Text>
  </View>
</View>

const styles = StyleSheet.create({
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: Colors.light.text,
    fontWeight: '500',
  },
});
```

**For metric/summary rows:**

```tsx
// Pattern: Label on left, value on right (single line)
<View style={styles.metricRow}>
  <Text style={styles.metricLabel}>Custo Total</Text>
  <Text style={styles.metricValue}>{formatCurrency(entry.total_cost)}</Text>
</View>

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  metricLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  metricValue: {
    fontSize: 14,
    color: Colors.light.text,
    fontWeight: '500',
  },
});
```

### NO Dividers

**NEVER use `<Divider>` components.** Use spacing instead:

```tsx
// ❌ BAD
<Divider />

// ✅ GOOD
<View style={{ marginTop: 16 }} />
```

**Exception:** Borders within card components are acceptable:

```tsx
borderTopWidth: 1,
borderTopColor: '#f0f0f0',
```

### NO Visual Separators in Headers

Headers should be clean without divider lines:

```tsx
// ❌ BAD
<View style={styles.header}>
  <Text>Title</Text>
</View>
<Divider />

// ✅ GOOD
<View style={styles.header}>
  <Text>Title</Text>
</View>
{/* Use background color transition */}
```

### Consistent Borders

```tsx
// Card/Input borders
borderWidth: 1,
borderColor: '#e0e0e0',
borderRadius: 8,

// Subtle separators
borderBottomWidth: 1,
borderBottomColor: '#f0f0f0',
```

### Shadow/Elevation

```tsx
// Cards
elevation: 2,
shadowColor: '#000',
shadowOffset: { width: 0, height: 1 },
shadowOpacity: 0.1,
shadowRadius: 2,
```

---

## 9. State Management with React Query

### Query Pattern

```tsx
const { data, isLoading, refetch } = useQuery({
  queryKey: ['products'],
  queryFn: getProducts,
});
```

### Mutation Pattern (CRITICAL)

**ALWAYS invalidate queries after mutations:**

```tsx
const queryClient = useQueryClient();

const createMutation = useMutation({
  mutationFn: createProduct,
  onSuccess: () => {
    // ⚠️ MANDATORY - Invalidate to refresh data
    queryClient.invalidateQueries({ queryKey: ['products'] });
    router.back();
  },
});
```

**Why?** React Query caches data. Without invalidation, users won't see updates.

### Multiple Query Invalidation

```tsx
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['products'] });
  queryClient.invalidateQueries({ queryKey: ['low-stock'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
},
```

---

## 10. Common Mistakes to Avoid

### MISTAKE 1: Missing _layout.tsx

**Problem:** Tab footer disappears when navigating to feature screens.

**Solution:** Every feature directory needs `_layout.tsx`:

```tsx
mobile/app/products/_layout.tsx  ✅
mobile/app/trips/_layout.tsx     ✅
```

### MISTAKE 2: Wrong SafeAreaView Import

```tsx
// ❌ BAD
import { SafeAreaView } from 'react-native';

// ✅ GOOD
import { SafeAreaView } from 'react-native-safe-area-context';
```

### MISTAKE 3: Forgetting Query Invalidation

```tsx
// ❌ BAD - Changes won't reflect
const createMutation = useMutation({
  mutationFn: createProduct,
  onSuccess: () => {
    router.back();
  },
});

// ✅ GOOD
const createMutation = useMutation({
  mutationFn: createProduct,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    router.back();
  },
});
```

### MISTAKE 4: Using Divider Components

```tsx
// ❌ BAD
<Divider />

// ✅ GOOD
<View style={{ marginTop: 16 }} />
```

### MISTAKE 5: Redundant Screen Titles

```tsx
// ❌ BAD
<Text>Product Details</Text>  // Generic

// ✅ GOOD
<Text>{product.name}</Text>   // Specific entity name
```

### MISTAKE 6: Wrong SafeAreaView Edges

```tsx
// ❌ BAD - Tab screens
<SafeAreaView edges={['top', 'bottom']}>  // Conflicts with tab footer

// ✅ GOOD
<SafeAreaView edges={['top']}>  // Tab footer handles bottom
```

### MISTAKE 7: FAB on Wrong Screens

```tsx
// ❌ BAD
<FAB />  // On add/edit screens

// ✅ GOOD
<FAB />  // Only on list/dashboard screens
```

### MISTAKE 8: Hardcoded Spacing

```tsx
// ❌ BAD
marginTop: 18,  // Random value

// ✅ GOOD
marginTop: theme.spacing.md,  // 16px - Standard value
```

### MISTAKE 9: Wrong Back Navigation

```tsx
// ❌ BAD - Detail screen using router.back()
// In products/[id].tsx
<TouchableOpacity onPress={() => router.back()}>
  <Ionicons name="arrow-back" size={24} />
</TouchableOpacity>

// ✅ GOOD - Detail screen returns to list
// In products/[id].tsx
<TouchableOpacity onPress={() => router.push('/products')}>
  <Ionicons name="arrow-back" size={24} />
</TouchableOpacity>

// ✅ ALSO CORRECT - Add/Edit screen using router.back()
// In products/add.tsx or products/edit/[id].tsx
<TouchableOpacity onPress={() => router.back()}>
  <Ionicons name="arrow-back" size={24} />
</TouchableOpacity>
```

### MISTAKE 10: Missing Edit/Delete Buttons on Detail Screens

```tsx
// ❌ BAD - No actions on detail screen
<View style={styles.header}>
  <TouchableOpacity onPress={() => router.push('/entities')}>
    <Ionicons name="arrow-back" size={24} />
  </TouchableOpacity>
  <Text>{entity.name}</Text>
  <View style={{ width: 40 }} />  {/* Empty placeholder */}
</View>

// ✅ GOOD - Edit and Delete actions present
<View style={styles.header}>
  <TouchableOpacity onPress={() => router.push('/entities')}>
    <Ionicons name="arrow-back" size={24} />
  </TouchableOpacity>
  <Text>{entity.name}</Text>
  <View style={styles.headerActions}>
    <TouchableOpacity onPress={() => router.push(`/entities/edit/${id}`)}>
      <Ionicons name="pencil" size={20} />
    </TouchableOpacity>
    <TouchableOpacity onPress={handleDelete}>
      <Ionicons name="trash" size={20} />
    </TouchableOpacity>
  </View>
</View>
```

---

## Checklist for New Screens

When creating a new screen, verify:

- [ ] Feature directory has `_layout.tsx`
- [ ] Uses `SafeAreaView` from `react-native-safe-area-context`
- [ ] Correct `edges` prop (`['top']` for tab screens)
- [ ] Custom header with proper back button (if nested)
- [ ] **Detail screens: back button uses `router.push('/feature-list')`**
- [ ] **Add/Edit screens: back button uses `router.back()`**
- [ ] Detail screens have Edit and Delete buttons in header
- [ ] No `<Divider>` components used
- [ ] Uses `gap` instead of individual margins where possible
- [ ] Information fields follow label/value pattern (left/right or stacked)
- [ ] Mutations invalidate relevant queries
- [ ] FAB included only on appropriate screens
- [ ] Bottom padding accounts for FAB/tab footer (100px)
- [ ] Entity name in header (not "Details")
- [ ] Uses theme spacing values (`theme.spacing.md`)
- [ ] Proper z-index hierarchy maintained

---

## File References

**Key Files:**
- `mobile/app/(tabs)/_layout.tsx` - Tab navigation configuration
- `mobile/components/FAB.tsx` - Floating action button
- `mobile/constants/Colors.ts` - Theme values (colors, spacing)
- `mobile/services/api.ts` - Centralized API client

**Example Implementations:**
- `mobile/app/products/` - Well-structured feature example
- `mobile/app/customers/` - Complete CRUD flow
- `mobile/app/(tabs)/index.tsx` - Dashboard with premium UX

---

## Getting Help

**Before asking for help:**
1. Check this document for the pattern
2. Review similar existing screens
3. Verify `_layout.tsx` exists
4. Check React Query invalidation

**Common Issues:**
- Tab footer missing? → Add `_layout.tsx`
- Content behind header? → Check `SafeAreaView` edges
- Changes not showing? → Add `invalidateQueries()`
- FAB overlapping content? → Add bottom padding

---

**Document Version:** 1.0.0
**Maintained by:** Mobile UX Specialist
**Last Review:** 2025-11-24
