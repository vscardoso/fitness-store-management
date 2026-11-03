import { useEffect, useState } from 'react';
import { useNavigationContainerRef } from 'expo-router';

/**
 * Verdadeiro quando o navegador raiz já está pronto para navegar. Abrir um endereço direto no
 * app web (ex.: /checkout, /catalog, /login com sessão salva) e chamar router.replace num efeito
 * antes disso derruba a tela com "Attempted to navigate before mounting the Root Layout".
 * O estado da navegação aparece antes de o contêiner ficar pronto, por isso a checagem é no ref.
 * Efeito que redireciona ao abrir a tela deve esperar este valor.
 */
export function useNavReady(): boolean {
  const ref = useNavigationContainerRef();
  const [ready, setReady] = useState(() => !!ref?.isReady?.());
  useEffect(() => {
    if (ready) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      if (stop) return;
      if (ref?.isReady?.()) setReady(true);
      else timer = setTimeout(check, 16);
    };
    check();
    return () => { stop = true; clearTimeout(timer); };
  }, [ready, ref]);
  return ready;
}
