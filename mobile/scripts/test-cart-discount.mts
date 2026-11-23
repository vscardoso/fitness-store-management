// Desconto geral do carrinho: em % acompanha o subtotal, em reais nunca passa dele, carrinho vazio zera.
import assert from 'node:assert/strict';
import { effectiveGlobalDiscountCents as f } from '../utils/cartDiscount.ts';

// caso real 23/11: R$ 199,85 sobraram da venda anterior num carrinho de R$ 44,95
assert.equal(f(4495, 199.85, null), 4495);
assert.equal(f(0, 199.85, null), 0);
// 50% acompanha o carrinho
assert.equal(f(39970, 0, 50), 19985);
assert.equal(f(4495, 199.85, 50), 2248);
// reais dentro do subtotal fica igual
assert.equal(f(39970, 50, null), 5000);
assert.equal(f(39970, 0, null), 0);
console.log('test-cart-discount: OK');
