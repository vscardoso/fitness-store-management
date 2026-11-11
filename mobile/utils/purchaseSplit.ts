/**
 * Compra paga com a Gaveta + um banco (regra do Victor): a gaveta paga TUDO o que tiver, até o valor da compra, e o banco
 * paga o resto. Sem digitar valor; se precisar, ele lança dinheiro no caixa depois. Sem imports do React Native
 * (testes: node scripts/test-purchase-split.mts). O servidor faz a mesma conta e grava a parte da gaveta na hora.
 */
const cents = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100);

export interface PurchaseSplit {
  /** Quanto sai da gaveta */
  cash: number;
  /** Quanto sai do banco */
  bank: number;
  /** Quanto sobra na gaveta e no banco depois */
  cashLeft: number;
  bankLeft: number;
}

export function splitPurchase(amount: number, cashBalance: number, bankBalance: number): PurchaseSplit {
  const total = Math.max(0, cents(amount));
  const have = Math.max(0, cents(cashBalance));
  const cash = Math.min(have, total);
  const bank = total - cash;
  return { cash: cash / 100, bank: bank / 100, cashLeft: (cents(cashBalance) - cash) / 100, bankLeft: (cents(bankBalance) - bank) / 100 };
}
