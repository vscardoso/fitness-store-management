// Por que a câmera não abriu: classificação do erro e frase para a pessoa. Rodar: node scripts/test-camera-error.mts
import assert from 'node:assert/strict';
import { cameraFailureText, classifyCameraError } from '../utils/cameraError.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };

t('permissão negada, câmera ocupada, sem câmera, sem imagem e navegador sem suporte são tipos diferentes', () => {
  for (const e of ['NotAllowedError', 'PermissionDeniedError', 'SecurityError']) assert.equal(classifyCameraError(e), 'denied');
  for (const e of ['NotReadableError', 'TrackStartError', 'AbortError']) assert.equal(classifyCameraError(e), 'busy');
  for (const e of ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError']) assert.equal(classifyCameraError(e), 'missing');
  assert.equal(classifyCameraError('NoImage'), 'no_image');
  assert.equal(classifyCameraError('NotSupportedError'), 'unsupported');
  assert.equal(classifyCameraError('Qualquer'), 'other');
  assert.equal(classifyCameraError(undefined), 'other');
  assert.equal(classifyCameraError(null), 'other');
});
t('só a permissão negada diz como liberar nos Ajustes; o resto manda tentar de novo', () => {
  const d = cameraFailureText('denied');
  assert.ok(d.title.includes('bloqueada') && d.steps.some((s) => s.includes('Ajustes')) && d.retryHelps === false);
  for (const k of ['busy', 'missing', 'no_image', 'other'] as const) {
    const x = cameraFailureText(k);
    assert.ok(x.title.length > 5 && x.steps.length >= 1 && x.retryHelps === true, k);
  }
  assert.equal(cameraFailureText('unsupported').retryHelps, false);
});
console.log(`${n} testes ok`);
