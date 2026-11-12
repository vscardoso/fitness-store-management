/**
 * Implantar a loja que já funcionava: data de corte, dinheiro na gaveta, saldo de cada banco, cartão que a maquininha
 * ainda vai repassar e as contas a pagar que já existem. Grava tudo ou nada, uma vez (backend: POST /finance/setup).
 * Estoque não entra aqui: tem a importação por planilha (Mais > Importar estoque).
 * Um passo por vez (quando começa, dinheiro de hoje, contas a pagar, conferir); o erro de cada passo aparece perto dos botões
 * e a última tela lista tudo o que será gravado antes de a pessoa confirmar. Nada é gravado até o fim.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
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
const dayBR = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

const STEPS = ['Quando começa', 'Dinheiro de hoje', 'Contas a pagar', 'Conferir'] as const;

export default function FinanceSetupScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const [step, setStep] = useState(0);
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

  // confere cada passo antes de avançar: a mensagem diz qual linha corrigir
  const checkStart = (): string => (!start ? 'Informe o dia em que o app começa a contar.' : '');
  const checkMoney = (): string => {
    for (const [k, v] of [['Dinheiro na gaveta', cash], ['Cartão a receber', card]] as const) {
      if (v.trim() && parseMoneyBr(v) === null) return `${k}: valor inválido.`;
    }
    for (const [i, b] of usedBanks.entries()) {
      if (!b.name.trim()) return `Banco ${i + 1}: informe o nome (ex.: Nubank, Itaú).`;
      if (b.balance.trim() && parseMoneyBr(b.balance) === null) return `Banco ${b.name}: saldo inválido.`;
    }
    return '';
  };
  const checkPays = (): string => {
    for (const [i, p] of usedPays.entries()) {
      const nome = p.description.trim() || `Conta ${i + 1}`;
      if (!p.description.trim()) return `Conta a pagar ${i + 1}: informe o que é (ex.: boleto, aluguel).`;
      if (!(num(p.amount) > 0)) return `${nome}: informe o valor.`;
      if (!p.due) return `${nome}: informe o vencimento.`;
    }
    return '';
  };
  const check = (): string => checkStart() || checkMoney() || checkPays();
  const checkers = [checkStart, checkMoney, checkPays];

  const next = () => {
    const msg = checkers[step]();
    setError(msg);
    if (!msg) setStep(step + 1);
  };
  const back = () => { setError(''); setStep(Math.max(0, step - 1)); };

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

  const progress = (
    <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel={`Passo ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}>
      <Text style={styles.stepText}>{`Passo ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}</Text>
      <View style={styles.bars}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.bar, i <= step && { backgroundColor: brand.primary }]} />
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <PageHeader title="Começar a controlar o dinheiro" subtitle="Para quem já vendia antes do Provador" showBackButton backFallback="/finance" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} keyboardShouldPersistTaps="handled">
        {progress}

        {step === 0 && (
          <View style={styles.card}>
            <Text style={styles.title}>Contar a partir de</Text>
            <Text style={styles.note}>Os saldos do próximo passo são deste dia; o que aconteceu antes dele não entra. Daí em diante o app soma as vendas, as despesas e as contas pagas sozinho.</Text>
            <DateTimeInput label="Contar a partir de" value={start} onChange={setStart} mode="date" maximumDate={today()} />
          </View>
        )}

        {step === 1 && (
          <View style={styles.card}>
            <Text style={styles.title}>Dinheiro de hoje</Text>
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
                    <AppButton variant="outlined" size="sm" label={b.negative ? 'Negativo' : 'Positivo'}
                      textColor={b.negative ? Colors.light.error : undefined} onPress={() => setBank(i, { negative: !b.negative })} />
                  </View>
                  <TouchableOpacity style={styles.pix} onPress={() => setBank(i, { pix: true })} accessibilityRole="radio"
                    accessibilityState={{ selected: b.pix }}>
                    <Ionicons name={b.pix ? 'radio-button-on' : 'radio-button-off'} size={18} color={b.pix ? brand.primary : Colors.light.textTertiary} />
                    <Text style={styles.pixText}>Recebe o PIX das vendas</Text>
                  </TouchableOpacity>
                </View>
                {banks.length > 1 && (
                  <TouchableOpacity onPress={() => setBanks((r) => r.filter((_, k) => k !== i).map((x, k) => (b.pix && k === 0 ? { ...x, pix: true } : x)))}
                    accessibilityLabel="Tirar banco" hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={22} color={Colors.light.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <AppButton variant="ghost" size="sm" icon="add" label="Adicionar banco" style={styles.add}
              onPress={() => setBanks((r) => [...r, { name: '', balance: '', negative: false, pix: false }])} />
            <View style={styles.sum}>
              <Text style={styles.sumLabel}>Dinheiro (gaveta, bancos e maquininha)</Text>
              <Text style={styles.sumValue}>{formatCurrency(totalMoney)}</Text>
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.card}>
            <Text style={styles.title}>Contas a pagar que já existem</Text>
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
            {pays.length === 0 && <Text style={styles.empty}>Nenhuma conta a pagar lançada. Se não houver, é só continuar.</Text>}
            <AppButton variant="ghost" size="sm" icon="add" label="Adicionar conta a pagar" style={styles.add}
              onPress={() => setPays((r) => [...r, { description: '', amount: '', due: undefined }])} />
            <View style={styles.sum}>
              <Text style={styles.sumLabel}>{`Contas a pagar (${usedPays.length})`}</Text>
              <Text style={[styles.sumValue, { color: Colors.light.error }]}>{formatCurrency(totalPay)}</Text>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.card} testID="setup-review">
            <Text style={styles.title}>Confira o que será gravado</Text>
            <Text style={styles.note}>Isto é feito uma vez. Depois os saldos andam sozinhos com as vendas e os pagamentos.</Text>
            <View style={styles.sum}><Text style={styles.sumLabel}>O app começa a contar em</Text><Text style={styles.sumValue}>{start ? dayBR(start) : ''}</Text></View>
            <Text style={styles.subtitle}>Dinheiro de hoje</Text>
            <View style={styles.sum}><Text style={styles.sumLabel}>Gaveta</Text><Text style={styles.sumValue}>{formatCurrency(num(cash))}</Text></View>
            <View style={styles.sum}><Text style={styles.sumLabel}>Cartão a receber da maquininha</Text><Text style={styles.sumValue}>{formatCurrency(num(card))}</Text></View>
            {usedBanks.map((b, i) => (
              <View key={i} style={styles.sum}>
                <Text style={styles.sumLabel}>{`${b.name.trim() || `Banco ${i + 1}`}${b.pix ? ' (recebe o PIX)' : ''}`}</Text>
                <Text style={[styles.sumValue, bankValue(b) < 0 && { color: Colors.light.error }]}>{formatCurrency(bankValue(b))}</Text>
              </View>
            ))}
            <View style={styles.sum}><Text style={[styles.sumLabel, styles.strong]}>Dinheiro total</Text><Text style={styles.sumValue}>{formatCurrency(totalMoney)}</Text></View>
            <Text style={styles.subtitle}>{`Contas a pagar (${usedPays.length})`}</Text>
            {usedPays.length === 0 && <Text style={styles.empty}>Nenhuma. Dá para lançar depois.</Text>}
            {usedPays.map((p, i) => (
              <View key={i} style={styles.sum}>
                <Text style={styles.sumLabel}>{`${p.description.trim()}${p.due ? ` · vence ${dayBR(p.due)}` : ''}`}</Text>
                <Text style={[styles.sumValue, { color: Colors.light.error }]}>{formatCurrency(num(p.amount))}</Text>
              </View>
            ))}
            <View style={styles.sum}><Text style={[styles.sumLabel, styles.strong]}>Total a pagar</Text><Text style={[styles.sumValue, { color: Colors.light.error }]}>{formatCurrency(totalPay)}</Text></View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.footerRow}>
          {step > 0 && <AppButton variant="outlined" size="lg" label="Voltar" onPress={back} disabled={busy} style={styles.footerBack} />}
          {step < STEPS.length - 1 ? (
            <AppButton variant="primary" size="lg" label="Continuar" onPress={next} style={styles.footerMain} />
          ) : (
            <AppButton variant="primary" size="lg" label="Começar a controlar o dinheiro" onPress={ask} disabled={busy} loading={busy} style={styles.footerMain} />
          )}
        </View>
      </View>

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
  content: { padding: 16, paddingBottom: 24, gap: 12 },
  progress: { gap: 8 },
  stepText: { fontSize: 13, fontWeight: theme.fontWeight.extrabold, color: Colors.light.textSecondary },
  bars: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.light.border },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 10 },
  title: { fontSize: 16, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  subtitle: { fontSize: 14, fontWeight: theme.fontWeight.bold, color: Colors.light.text, marginTop: 6 },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  hint: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 4 },
  empty: { fontSize: 13, color: Colors.light.textSecondary, fontStyle: 'italic' },
  field: {},
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.light.border },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pix: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  pixText: { fontSize: 13, color: Colors.light.text },
  add: { alignSelf: 'flex-start' },
  sum: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  sumLabel: { fontSize: 14, color: Colors.light.textSecondary, flex: 1 },
  strong: { fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  sumValue: { fontSize: 16, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  footer: { padding: 12, gap: 8, backgroundColor: Colors.light.card, borderTopWidth: 1, borderTopColor: Colors.light.border },
  footerRow: { flexDirection: 'row', gap: 10 },
  footerBack: { flexShrink: 0 },
  footerMain: { flex: 1 },
  error: { color: Colors.light.error, fontWeight: theme.fontWeight.semibold },
});
