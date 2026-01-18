# DateTimeInput UX Fix - Light Theme on Android

## Problema Identificado

O componente `DateTimeInput` estava usando `react-native-modal-datetime-picker`, que apresentava os seguintes problemas no Android:

1. **Fundo escuro/preto** mesmo com `themeVariant="light"`
2. **Inconsistência visual** com o tema claro do app
3. **Baixa legibilidade** devido ao contraste inadequado
4. **Experiência fragmentada** entre iOS e Android

## Solução Implementada

Substituímos `react-native-modal-datetime-picker` por uso direto do `@react-native-community/datetimepicker` com customizações específicas por plataforma.

### Mudanças Técnicas

#### 1. Imports Atualizados
```typescript
// ANTES
import DateTimePickerModal from 'react-native-modal-datetime-picker';

// DEPOIS
import DateTimePicker from '@react-native-community/datetimepicker';
import { Modal, TouchableOpacity } from 'react-native';
import { Button } from 'react-native-paper';
```

#### 2. Comportamento Específico por Plataforma

**Android:**
- Usa o picker nativo do sistema com `themeVariant="light"`
- Exibe modais sequenciais para `datetime` mode (primeiro date, depois time)
- Fecha automaticamente ao confirmar/cancelar (comportamento nativo)

**iOS:**
- Modal customizado com fundo overlay semi-transparente
- Header com botões "Cancelar" e "Confirmar" seguindo padrões iOS
- Picker spinner inline dentro do modal
- Fundo branco forçado via StyleSheet

#### 3. Gerenciamento de Estado Aprimorado

```typescript
const [tempDate, setTempDate] = useState<Date | undefined>(value);
const [currentMode, setCurrentMode] = useState<'date' | 'time'>(
  mode === 'datetime' ? 'date' : mode
);
```

- `tempDate`: Armazena data temporária enquanto usuário faz seleção (iOS)
- `currentMode`: Gerencia transição date → time no Android para `datetime` mode

#### 4. Lógica de Confirmação Aprimorada

```typescript
const handleDateChange = (event: any, selectedDate?: Date) => {
  if (Platform.OS === 'android') {
    if (event.type === 'set' && selectedDate) {
      if (mode === 'datetime' && currentMode === 'date') {
        // Primeiro mostra date, depois time
        setTempDate(selectedDate);
        setCurrentMode('time');
        setPickerVisible(true);
      } else {
        onChange(selectedDate);
        setCurrentMode('date');
      }
    }
  } else {
    // iOS: atualização em tempo real
    if (selectedDate) {
      setTempDate(selectedDate);
    }
  }
};
```

### Estilos Aplicados

```typescript
modalOverlay: {
  flex: 1,
  backgroundColor: Colors.light.overlay,  // rgba(0, 0, 0, 0.5)
  justifyContent: 'flex-end',
},
modalContent: {
  backgroundColor: Colors.light.background,  // #fff
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
},
pickerHeader: {
  backgroundColor: Colors.light.backgroundSecondary,  // #F8F9FA
  borderBottomColor: Colors.light.border,  // #E5E7EB
},
iosPicker: {
  backgroundColor: Colors.light.background,  // #fff
  height: 260,
},
```

## Vantagens da Solução

### 1. Controle Total do Tema
- Fundo branco garantido no iOS via StyleSheet
- `themeVariant="light"` funciona corretamente no Android (nativo)

### 2. Consistência com Design System
- Usa `Colors.light.*` do projeto
- Segue padrões React Native Paper (outlined inputs)
- Mantém consistência visual em ambas plataformas

### 3. Melhor UX no Android
- Pickers nativos do sistema (familiares ao usuário)
- Transição suave date → time no modo `datetime`
- Respeita tema claro do dispositivo

### 4. Melhor UX no iOS
- Modal bottom sheet moderno
- Botões Cancelar/Confirmar claros
- Spinner inline com preview instantâneo

### 5. Menos Dependências
- Removida biblioteca intermediária (`react-native-modal-datetime-picker`)
- Usa apenas componente oficial do React Native Community
- Reduz surface de bugs e problemas de compatibilidade

## Casos de Uso

### Modo Date
```tsx
<DateTimeInput
  label="Data de Nascimento"
  value={birthDate}
  onChange={setBirthDate}
  mode="date"
/>
```

### Modo Time
```tsx
<DateTimeInput
  label="Horário"
  value={time}
  onChange={setTime}
  mode="time"
/>
```

### Modo DateTime (padrão)
```tsx
<DateTimeInput
  label="Data/Hora de Ida"
  value={departureDateTime}
  onChange={setDepartureDateTime}
  mode="datetime"
  minimumDate={new Date()}
/>
```

## Testes Recomendados

- [ ] Android: Verificar tema claro em dispositivos com tema escuro do sistema
- [ ] Android: Testar transição date → time no modo `datetime`
- [ ] Android: Confirmar cancelamento retorna ao estado anterior
- [ ] iOS: Verificar modal aparece com fundo branco
- [ ] iOS: Testar botões Cancelar/Confirmar funcionam corretamente
- [ ] iOS: Verificar safe area no iPhone com notch
- [ ] Ambos: Validar `minimumDate` e `maximumDate` funcionam
- [ ] Ambos: Verificar modo disabled desabilita input
- [ ] Ambos: Testar exibição de erros com HelperText

## Impacto em Outras Telas

O componente é usado em:
- **Conditional Shipments** (`mobile/app/(tabs)/conditional/create.tsx`):
  - Data/Hora de Ida
  - Data/Hora de Devolução

Todas as telas que usam `DateTimeInput` automaticamente se beneficiam do tema claro.

## Justificativa Técnica

**Por que não ajustar `react-native-modal-datetime-picker`?**
- A biblioteca é um wrapper que abstrai o controle de estilos
- Props de customização são limitadas e inconsistentes entre plataformas
- Não permite forçar tema claro de forma confiável no Android

**Por que usar componente nativo diretamente?**
- Controle total sobre estilos e comportamento
- Melhor performance (uma dependência a menos)
- Mais alinhado com guidelines de cada plataforma
- Fácil manutenção e debugging

**Por que modais customizados no iOS?**
- DateTimePicker nativo do iOS não tem controle de tema via props
- Modal customizado garante fundo branco independente do tema do sistema
- Experiência mais moderna e consistente com apps iOS nativos

## Conformidade com Padrões do Projeto

- **NO Dividers**: Usa `marginBottom` para espaçamento
- **Consistent Spacing**: Usa valores de `Colors.light.*`
- **React Native Paper**: Integração perfeita com TextInput outlined
- **Platform-Specific**: Respeita convenções iOS e Android
- **Accessibility**: Mantém labels e touch targets adequados (44x44 points)

## Referências

- [React Native DateTimePicker Docs](https://github.com/react-native-datetimepicker/datetimepicker)
- [Material Design Date Pickers](https://m3.material.io/components/date-pickers)
- [iOS Human Interface Guidelines - Date Pickers](https://developer.apple.com/design/human-interface-guidelines/date-pickers)
