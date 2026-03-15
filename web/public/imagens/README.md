# 📁 Pasta de Imagens da Loja

Coloque as imagens aqui antes de fazer deploy.

## Estrutura

```
imagens/
├── hero/           ← Foto principal do hero (1920x1080 ou 1200x800)
│                     Nome sugerido: hero-principal.jpg
│
├── produtos/       ← Fotos dos produtos (quadradas, 800x800 ou 1200x1200)
│                     Use o mesmo nome do SKU: ex. WHY-001.jpg
│
├── looks/          ← Fotos de looks montados (4:3 ou quadrado)
│                     ex. look-treino-01.jpg
│
└── marca/          ← Logo e identidade visual
                      logo.png       ← Logo principal (PNG com fundo transparente)
                      logo-branco.png ← Versão branca para fundo escuro
                      favicon.ico    ← Ícone do site (coloque em web/public/)
```

## Formatos recomendados

| Uso | Formato | Tamanho máx |
|-----|---------|-------------|
| Hero | `.jpg` / `.webp` | 500 KB |
| Produtos | `.jpg` / `.webp` | 200 KB |
| Looks | `.jpg` / `.webp` | 300 KB |
| Logo | `.png` (transparente) | 100 KB |

## Como usar no código

```tsx
// Hero
<Image src="/imagens/hero/hero-principal.jpg" ... />

// Produto
<Image src="/imagens/produtos/WHY-001.jpg" ... />

// Logo
<Image src="/imagens/marca/logo-branco.png" ... />
```

## Dicas

- Prefira `.webp` para melhor performance (menor tamanho, mesma qualidade)
- Comprima as imagens antes: https://squoosh.app
- Fotos quadradas funcionam melhor nos cards de produtos
