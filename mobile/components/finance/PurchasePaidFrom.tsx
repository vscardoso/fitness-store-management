/**
 * "De onde saiu o dinheiro" da compra de mercadoria (Nova Entrada e entrada já lançada).
 *
 * Só aparece depois que o Financeiro da loja foi implantado. Escolher a conta faz o saldo dela cair sozinho, na hora, pelo
 * que a mercadoria custou (peças x custo menos desconto). Frete e outras despesas têm o próprio "Pago com".
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { getFinanceOverview } from '@/services/financeService';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { splitPurchase } from '@/utils/purchaseSplit';

export interface PurchasePayment {
  accountId: number | null;
  /** Pago por fora das contas do app (ex.: dinheiro pessoal): não tira de nenhuma conta. */
  outside: boolean;
  /** Gaveta + banco: a gaveta paga tudo o que tiver e `accountId` (um banco) paga o resto. */
  withCash?: boolean;
}

export const NO_PURCHASE_PAYMENT: PurchasePayment = { accountId: null, outside: false, withCash: false };

interface Props {
  value: PurchasePayment;
  onChange: (next: PurchasePayment) => void;
  /** O que a mercadoria custa (peças x custo menos desconto), para mostrar quanto sobra na conta. */
  amount: number;
  /** Dia da compra (AAAA-MM-DD): se for antes de o app começar a contar, o dinheiro dela já está no saldo de partida. */
  entryDate?: string;
}

export default function PurchasePaidFrom({ value, onChange, amount, entryDate }: Props) {
  const { data: finance } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  if (!finance?.started) return null;
  const accounts = finance.accounts.filter((a) => a.kind !== 'card');
  if (accounts.length === 0) return null;
  const beforeStart = !!entryDate && !!finance.start_date && entryDate < finance.start_date;

  const chosen = accounts.find((a) => a.id === value.accountId) || null;
  const cash = accounts.find((a) => a.kind === 'cash') || null;
  const withCash = !!value.withCash && !!chosen && chosen.kind === 'bank';
  const split = withCash && cash ? splitPurchase(amount, cash.balance, chosen!.balance) : null;
  const left = chosen ? chosen.balance - amount : 0;
  const tooMuch = !!chosen && chosen.kind === 'cash' && amount > 0 && left < 0;

  const pick = (next: PurchasePayment) => onChange(next);

  return (
    <View style={styles.wrap} testID="purchase-paid-from">
      <Text style={styles.label}>De onde saiu o dinheiro</Text>
      <View style={styles.chips}>
        {accounts.map((a) => {
          const on = value.accountId === a.id && !value.outside && !value.withCash;
          return (
            <Chip
              key={a.id}
              selected={on}
              mode={on ? 'flat' : 'outlined'}
              onPress={() => pick(on ? NO_PURCHASE_PAYMENT : { accountId: a.id, outside: false, withCash: false })}
              style={styles.chip}
              accessibilityLabel={`Pago com ${a.name}, saldo ${formatCurrency(a.balance)}`}
            >
              {`${a.name} · ${formatCurrency(a.balance)}`}
            </Chip>
          );
        })}
        {cash && cash.balance > 0 && accounts.filter((a) => a.kind === 'bank').map((b) => {
          const on = value.accountId === b.id && !!value.withCash && !value.outside;
          return (
            <Chip
              key={`cash-${b.id}`}
              selected={on}
              mode={on ? 'flat' : 'outlined'}
              onPress={() => pick(on ? NO_PURCHASE_PAYMENT : { accountId: b.id, outside: false, withCash: true })}
              style={styles.chip}
              accessibilityLabel={`Pago com a gaveta e o resto de ${b.name}`}
            >
              {`Gaveta + ${b.name}`}
            </Chip>
          );
        })}
        <Chip
          selected={value.outside}
          mode={value.outside ? 'flat' : 'outlined'}
          onPress={() => pick(value.outside ? NO_PURCHASE_PAYMENT : { accountId: null, outside: true, withCash: false })}
          style={styles.chip}
        >
          Não saiu das contas do app
        </Chip>
      </View>
      {beforeStart ? (
        <Text style={styles.help}>
          Esta compra é de antes de o app começar a contar: o dinheiro dela já está dentro do saldo de partida, então
          nada é descontado.
        </Text>
      ) : split && cash ? (
        <Text style={styles.help}>
          {split.cash > 0
            ? `Sai ${formatCurrency(split.cash)} da Gaveta (tudo o que ela tem para esta compra) e ${formatCurrency(split.bank)} de ${chosen!.name}. A gaveta fica em ${formatCurrency(split.cashLeft)} e ${chosen!.name} em ${formatCurrency(split.bankLeft)}. Se precisar, lance dinheiro no caixa depois.`
            : `A gaveta está sem dinheiro: sai tudo de ${chosen!.name} (${formatCurrency(split.bank)}).`}
        </Text>
      ) : tooMuch ? (
        <Text style={[styles.help, { color: Colors.light.error }]}>
          {`A gaveta tem ${formatCurrency(chosen!.balance)} e esta compra custa ${formatCurrency(amount)}. Escolha o banco de onde saiu o dinheiro.`}
        </Text>
      ) : chosen ? (
        <Text style={styles.help}>
          {`Sai ${formatCurrency(amount)} de ${chosen.name} agora e o saldo fica em ${formatCurrency(left)}. O desconto do fornecedor já está abatido; o frete tem o próprio "Pago com".`}
        </Text>
      ) : value.outside ? (
        <Text style={styles.help}>Não desconta de nenhuma conta. Use quando você pagou com dinheiro que não é da loja.</Text>
      ) : (
        <Text style={styles.help}>
          Escolha a conta para o saldo cair sozinho. Sem escolher, o saldo das contas não desconta esta compra e ela fica
          na lista "Compras sem conta" do Financeiro.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: theme.spacing.md },
  label: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, color: Colors.light.text, marginBottom: theme.spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: { marginRight: 0 },
  help: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, marginTop: theme.spacing.sm },
});
