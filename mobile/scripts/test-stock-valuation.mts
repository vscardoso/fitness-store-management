// Valor do estoque sem uma categoria (ex.: sem Tênis). Rodar: node scripts/test-stock-valuation.mts
import assert from 'node:assert/strict';
import { stockWithout } from '../utils/stockValuation.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };
const total = { cost_value: 10000.3, retail_value: 25000.6 };
const cats = [
  { category_id: 1, category_name: 'Leggings', cost_value: 4000.1, retail_value: 10000.2 },
  { category_id: 2, category_name: 'Tênis', cost_value: 6000.2, retail_value: 15000.4 },
];
t('sem filtro: total do servidor', () => assert.deepEqual(stockWithout(total, cats, []), { cost: 10000.3, retail: 25000.6, profit: 15000.3 }));
t('sem Tênis: tira só a categoria', () => assert.deepEqual(stockWithout(total, cats, [2]), { cost: 4000.1, retail: 10000.2, profit: 6000.1 }));
t('sem as duas: zero, nunca negativo', () => assert.deepEqual(stockWithout(total, cats, [1, 2]), { cost: 0, retail: 0, profit: 0 }));
t('categoria que não existe não muda nada', () => assert.deepEqual(stockWithout(total, cats, [99]), stockWithout(total, cats, [])));
console.log(`${n} testes ok`);
