/**
 * SelectField: campo de seleção (lista suspensa) com a aparência dos campos outlined do app.
 * Usa o Menu do react-native-paper, então funciona igual em iOS, Android e web.
 */

import { useState } from 'react';
import { StyleProp, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Menu, TextInput } from 'react-native-paper';

interface SelectFieldProps {
  label: string;
  value?: string;
  options: readonly string[];
  onChange: (value: string | undefined) => void;
  /** Ícone à esquerda (nome do MaterialCommunityIcons, igual aos outros campos) */
  icon?: string;
  /** Mostra o item "Limpar" quando há valor selecionado (para campos opcionais) */
  allowClear?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  icon,
  allowClear = false,
  disabled = false,
  style,
}: SelectFieldProps) {
  const [visible, setVisible] = useState(false);

  const close = () => setVisible(false);
  const pick = (next: string | undefined) => {
    onChange(next);
    close();
  };

  return (
    <View style={style}>
      <Menu
        visible={visible}
        onDismiss={close}
        anchorPosition="bottom"
        anchor={
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={disabled}
            onPress={() => setVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${value || 'não selecionado'}`}
          >
            {/* pointerEvents none: o toque é do TouchableOpacity, o campo é só visual */}
            <View pointerEvents="none">
              <TextInput
                label={label}
                value={value ?? ''}
                mode="outlined"
                editable={false}
                disabled={disabled}
                left={icon ? <TextInput.Icon icon={icon} /> : undefined}
                right={<TextInput.Icon icon={visible ? 'menu-up' : 'menu-down'} />}
              />
            </View>
          </TouchableOpacity>
        }
      >
        {options.map((option) => (
          <Menu.Item
            key={option}
            title={option}
            leadingIcon={option === value ? 'check' : undefined}
            onPress={() => pick(option)}
          />
        ))}
        {allowClear && value ? <Menu.Item title="Limpar" onPress={() => pick(undefined)} /> : null}
      </Menu>
    </View>
  );
}

export default SelectField;
