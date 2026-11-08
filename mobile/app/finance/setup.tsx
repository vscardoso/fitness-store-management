/**
 * Implantar a loja que já funcionava: data de corte, dinheiro na gaveta, saldo de cada banco, cartão que a maquininha
 * ainda vai repassar e as contas a pagar que já existem. Grava tudo ou nada, uma vez (backend: POST /finance/setup).
 * Estoque não entra aqui: tem a importação por planilha (Mais > Importar estoque).
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { moneyInput, parseMoneyBr } from '@/utils/cashMoney';
import { isoDay, setupFinance } from '@/services/financeService';

interface BankRow { name: string; balance: string; negative: boolean; pix: boolean }
interface PayRow { description: string; amount: string; due: Date | undefined }

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export default function FinanceSetupScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const [start, setStart] = useState<Date | undefined>(today());
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [banks, setBanks] = useState<BankRow[]>([{ name: '', balance: '', negative: false, pix: true }]);
  const [pays, setPays] = useState<PayRow[]>([]);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const num = (s: string) => parseMoneyBr(s) ?? 0;
  const bankValue = (b: BankRow) => (b.negative ? -1 : 1) * num(b.balance);
  const usedBanks = banks.filter((b) => b.name.trim() || b.balance.trim());
  const usedPays = pays.filter((p) => p.description.trim() || p.amount.trim());
  const totalMoney = num(cash) + num(card) + usedBanks.reduce((s, b) => s + bankValue(b), 0);
  const totalPay = usedPays.reduce((s, p) => s + num(p.amount), 0);

  const setBank = (i: number, patch: Partial<BankRow>) =>
    setBanks((rows) => rows.map((r, k) => (k === i ? { ...r, ...patch } : patch.pix ? { ...r, pix: false } : r)));
  const setPay = (i: number, patch: Partial<PayRow>) => setPays((rows) => rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  // confere antes de perguntar: a mensagem diz qual linha corrigir
  const check = (): string => {
    if (!start) return 'Informe o dia em que o app começa a contar.';
    for (const [k, v] of [['Dinheiro na gaveta', cash], ['Cartão a receber', card]] as const) {
      if (v.trim() && parseMoneyBr(v) === null) return `${k}: valor inválido.`;
    }
    for (const [i, b] of usedBanks.entries()) {
      if (!b.name.trim()) return `Banco ${i + 1}: informe o nome (ex.: Nubank, Itaú).`;
      if (b.balance.trim() && parseMoneyBr(b.balance) === null) return `Banco ${b.name}: saldo inválido.`;
    }
    for (const [i, p] of usedPays.entries()) {
      const nome = p.description.trim() || `Conta ${i + 1}`;
      if (!p.description.trim()) return `Conta a pagar ${i + 1}: informe o que é (ex.: boleto, aluguel).`;
      if (!(num(p.amount) > 0)) return `${nome}: informe o valor.`;
      if (!p.due) return `${nome}: informe o vencimento.`;
    }
    return '';
  };

  const ask = () => {
    const msg = check();
    setError(msg);
    if (!msg) setConfirm(true);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await setupFinance({
        start_date: isoDay(start!),
        cash_balance: num(cash),
        card_balance: num(card),
        banks: usedBanks.map((b) => ({ name: b.name.trim(), balance: bankValue(b), receives_pix: b.pix })),
        payables: usedPays.map((p) => ({ description: p.description.trim(), amount: num(p.amount), due_date: isoDay(p.due!) })),
      });
      await queryClient.invalidateQueries();
      router.replace('/finance' as any);
    } catch (e) {
      setError(parseApiError(e) || 'Não foi possível implantar. Nada foi gravado.');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  const money = (label: string, value: string, set: (v: string) => void, hint?: string) => (
    <View style={styles.field}>
      <TextInput mode="outlined" label={label} value={value} onChangeText={(t) => set(moneyInput(t))} keyboardType="decimal-pad"
        left={<TextInput.Affix text="R$" />} placeholder="0,00" activeOutlineColor={brand.primary} />
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      <PageHeader title="Começar a controlar o dinheiro" subtitle="Para quem já vendia antes do Provador" showBackButton backFallback="/finance" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} keyboardShouldPersistTaps="handled">
        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.card}>
          <Text style={styles.title}>1. Contar a partir de</Text>
          <Text style={styles.note}>Os saldos abaixo são deste dia; o que aconteceu antes dele não entra. Daí em diante o app soma as vendas, as despesas e as contas pagas sozinho.</Text>
          <DateTimeInput label="Contar a partir de" value={start} onChange={setStart} mode="date" maximumDate={today()} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>2. Dinheiro de hoje</Text>
          {money('Dinheiro na gaveta', cash, setCash, 'Conte o dinheiro em espécie da loja.')}
          {money('Cartão a receber da maquininha', card, setCard, 'Vendas no cartão que a maquininha ainda vai depositar.')}
          <Text style={styles.subtitle}>Contas no banco</Text>
          {banks.map((b, i) => (
            <View key={i} style={styles.row}>
              <View style={{ flex: 1, gap: 8 }}>
                <TextInput mode="outlined" label="Banco" value={b.name} onChangeText={(t) => setBank(i, { name: t })}
                  placeholder="Nubank, Itaú, Sicoob..." activeOutlineColor={brand.primary} />
                <View style={styles.inline}>
                  <TextInput mode="outlined" label="Saldo hoje" value={b.balance} style={{ flex: 1 }}
                    onChangeText={(t) => setBank(i, { balance: moneyInput(t) })} keyboardType="decimal-pad"
                    left={<TextInput.Affix text={b.negative ? '- R$' : 'R$'} />} activeOutlineColor={brand.primary} />
                  <TouchableOpacity onPress={() => setBank(i, { negative: !b.negative })} style={styles.signBtn}
                    accessibilityRole="button" accessibilityLabel="Saldo negativo">
                    <Text style={[styles.signText, b.negative && { color: Colors.light.error }]}>{b.negative ? 'Negativo' : 'Positivo'}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.pix} onPress={() => setBank(i, { pix: true })} accessibilityRole="radio"
                  accessibilityState={{ selected: b.pix }}>
                  <Ionicons name={b.pix ? 'radio-button-on' : 'radio-button-off'} size={18} color={b.pix ? brand.primary : Colors.light.textTertiary} />
                  <Text style={styles.pixText}>Recebe o PIX das vendas</Text>
                </TouchableOpacity>
              </View>
              {banks.length > 1 && (
                <TouchableOpacity onPress={() => setBanks((r) => r.filter((_, k) => k !== i).map((x, k, all) => (b.pix && k === 0 ? { ...x, pix: true } : x)))}
                  accessibilityLabel="Tirar banco" hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={22} color={Colors.light.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <Button mode="text" icon="plus" textColor={brand.primary} style={styles.add}
            onPress={() => setBanks((r) => [...r, { name: '', balance: '', negative: false, pix: false }])}>
            Adicionar banco
          </Button>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>3. Contas a pagar que já existem</Text>
          <Text style={styles.note}>Boletos de fornecedor, aluguel, parcelas. Pode deixar em branco e lançar depois.</Text>
          {pays.map((p, i) => (
            <View key={i} style={styles.row}>
              <View style={{ flex: 1, gap: 8 }}>
                <TextInput mode="outlined" label="O que é" value={p.description} onChangeText={(t) => setPay(i, { description: t })}
                  placeholder="Boleto fornecedor, aluguel..." activeOutlineColor={brand.primary} />
                <View style={styles.inline}>
                  <TextInput mode="outlined" label="Valor" value={p.amount} style={{ flex: 1 }} keyboardType="decimal-pad"
                    onChangeText={(t) => setPay(i, { amount: moneyInput(t) })} left={<TextInput.Affix text="R$" />}
                    activeOutlineColor={brand.primary} />
                  <View style={{ flex: 1 }}>
                    <DateTimeInput label="Vencimento" value={p.due} onChange={(d) => setPay(i, { due: d })} mode="date" />
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => setPays((r) => r.filter((_, k) => k !== i))} accessibilityLabel="Tirar conta" hitSlop={8}>
                <Ionicons name="close-circle-outline" size={22} color={Colors.light.textTertiary} />
              </TouchableOpacity>
            </View>
          ))}
          <Button mode="text" icon="plus" textColor={brand.primary} style={styles.add}
            onPress={() => setPays((r) => [...r, { description: '', amount: '', due: undefined }])}>
            Adicionar conta a pagar
          </Button>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Resumo</Text>
          <View style={styles.sum}><Text style={styles.sumLabel}>Dinheiro (gaveta, bancos e maquininha)</Text><Text style={styles.sumValue}>{formatCurrency(totalMoney)}</Text></View>
          <View style={styles.sum}><Text style={styles.sumLabel}>Contas a pagar ({usedPays.length})</Text><Text style={[styles.sumValue, { color: Colors.light.error }]}>{formatCurrency(totalPay)}</Text></View>
          <Button mode="contained" buttonColor={brand.primary} style={styles.save} onPress={ask} disabled={busy} loading={busy}>
            Começar a controlar o dinheiro
          </Button>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirm}
        title="Começar a controlar o dinheiro?"
        message={`Dinheiro hoje: ${formatCurrency(totalMoney)}. Contas a pagar: ${formatCurrency(totalPay)}. Isto é feito uma vez; depois os saldos andam sozinhos com as vendas e os pagamentos.`}
        confirmText="Começar"
        type="info"
        loading={busy}
        onConfirm={save}
        onCancel={() => setConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 10 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.light.text },
  subtitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text, marginTop: 6 },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  hint: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 4 },
  field: {},
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.light.border },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  signBtn: { paddingHorizontal: 10, paddingVertical: 14, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: Colors.light.border },
  signText: { fontSize: 12, fontWeight: '700', color: Colors.light.textSecondary },
  pix: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  pixText: { fontSize: 13, color: Colors.light.text },
  add: { alignSelf: 'flex-start' },
  sum: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumLabel: { fontSize: 14, color: Colors.light.textSecondary, flex: 1 },
  sumValue: { fontSize: 16, fontWeight: '800', color: Colors.light.text },
  save: { marginTop: 8, alignSelf: 'flex-start' },
  error: { color: Colors.light.error, fontWeight: '600' },
});
