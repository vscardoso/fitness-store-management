# UI Research — Fitness Store Web

Resultados de busca no ui-ux-pro-max coletados em 2026-03-27.

---

## Paletas de Cor — "fitness health energy"

### Opção 1 — Fitness/Gym App (Energia)
| Token       | Hex       | Nota                  |
|-------------|-----------|-----------------------|
| Primary     | `#F97316` | Energy orange         |
| Secondary   | `#FB923C` | Orange suave          |
| CTA         | `#22C55E` | Success green         |
| Background  | `#1F2937` | Dark (modo escuro)    |
| Text        | `#F8FAFC` | Quase branco          |

### Opção 2 — Healthcare App (Calma)
| Token       | Hex       | Nota                  |
|-------------|-----------|-----------------------|
| Primary     | `#0891B2` | Calm cyan             |
| Secondary   | `#22D3EE` | Cyan claro            |
| CTA         | `#059669` | Health green          |
| Background  | `#ECFEFF` | Fundo claro           |
| Text        | `#164E63` | Azul escuro           |

### Opção 3 — Medical Clinic (Teal)
| Token       | Hex       | Nota                  |
|-------------|-----------|-----------------------|
| Primary     | `#0891B2` | Medical teal          |
| Secondary   | `#22D3EE` | Cyan claro            |
| CTA         | `#22C55E` | Health green          |
| Background  | `#F0FDFA` | Teal clarinho         |
| Text        | `#134E4A` | Teal escuro           |

---

## Next.js — Performance Guidelines

| Severidade | Diretriz                  | Do                                          | Don't                        | Docs |
|------------|---------------------------|---------------------------------------------|------------------------------|------|
| Medium     | Analisar bundle size      | `ANALYZE=true npm run build`                | Subir bundles sem análise    | [bundle-analyzer](https://nextjs.org/docs/app/building-your-application/optimizing/bundle-analyzer) |
| Medium     | Usar dynamic imports      | `dynamic(() => import('./Chart'))`          | Importar tudo estaticamente  | [lazy-loading](https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading) |
| **High**   | Evitar layout shifts      | `<Skeleton className="h-48"/>` para async   | Conteúdo piscando sem placeholder | — |
