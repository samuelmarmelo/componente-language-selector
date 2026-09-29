# Language Switcher — versão vanilla (sem framework)

Cópia autocontida da implementação que está em produção no site samuelwebdesign (`src/js/components/language-switcher.js`), guardada aqui como backup e referência. É um ES module sem dependências: basta servir os arquivos desta pasta.

| Arquivo | Função |
|---|---|
| `language-switcher.js` | Seletor (dropdown inline ou portal), cookie `googtrans`, loader do Google sob demanda, selo "traduzindo" e aviso do Brave. |
| `google-translate-bootstrap.js` | Define apenas o callback `googleTranslateElementInit2` (vazio). Arquivo externo por causa da CSP. |
| `language-switcher.css` | Regras `lang-switcher`, `lang-portal`, `lang-translating-badge`, `lang-permission-notice` e ocultação da UI do Google. |
| `flags/*.svg` | Bandeiras usadas (br, us, es, fr, it, cn, jp). |
| `tests/` | Testes `node:test` + jsdom (`npm run test:vanilla`) e `smoke.sh`. |

## Uso

```html
<head>
  <link rel="stylesheet" href="/vanilla/language-switcher.css" />
  <!-- Síncrono, no <head>: o callback precisa existir antes do loader do Google. -->
  <script src="/vanilla/google-translate-bootstrap.js"></script>
</head>
<body>
  <div id="google_translate_element2" aria-hidden="true"></div>
  <div id="lang-slot"></div>
  <script type="module">
    import { configureLanguageSwitcher, renderLanguageSwitcher } from '/vanilla/language-switcher.js'

    // Opcional: padrão é /icons/flags/. Copie vanilla/flags/ para a pasta escolhida.
    configureLanguageSwitcher({ flagBasePath: '/vanilla/flags/' })
    renderLanguageSwitcher(document.getElementById('lang-slot'), { direction: 'down' })
  </script>
</body>
```

`direction` aceita `'down'` (dropdown inline), `'right'` (portal fixed ao lado de uma sidebar) e `'down-portal'` (portal fixed abaixo do botão, útil dentro de containers com `overflow`). Se o alvo `#google_translate_element2` não existir, o componente o cria no fim do `<body>`.

API exportada: `renderLanguageSwitcher`, `configureLanguageSwitcher`, `getCurrentLang`, `setLang`, `gtLoadTlib` e `LANGUAGES`.

## CSP

- O bootstrap é um arquivo externo justamente para funcionar sem `'unsafe-inline'`.
- Origens do Google liberadas na CSP de produção do site (`vercel.json`), que funciona com esta versão:
  - `script-src`: `https://translate.google.com` `https://translate.googleapis.com` `https://www.gstatic.com` `https://www.google.com` (o site também mantém `'unsafe-eval'`)
  - `style-src`: `https://translate.googleapis.com` `https://www.gstatic.com` (mais `'unsafe-inline'`, por causa dos estilos que o Google injeta)
  - `connect-src`: `https://translate.google.com` `https://translate.googleapis.com` `https://translate-pa.googleapis.com`
  - `frame-src`: `https://translate.google.com` `https://translate.googleapis.com`
  - `img-src`: o site usa `https:` (qualquer origem HTTPS); numa CSP mais restrita, verifique no console quais origens de imagem o Google usa.
- O Google muda domínios de tempos em tempos: depois de uma troca real de idioma, confira no console se há bloqueios de CSP.

## Contrato de ativação assíncrona

1. O `element.js` do Google **não** fica no HTML. Ele é injetado uma única vez (`window.gt_translate_script`) no primeiro hover, foco ou clique no seletor, ou logo no boot se o cookie `googtrans` guardar outro idioma.
2. A troca é confirmada assim que o `.goog-te-combo` nativo recebe o valor (dois eventos `change`, sequência de compatibilidade do GTranslate). Não se espera a classe `translated-*`: o Google a coloca no `<html>`, e a versão antiga, que olhava o `<body>`, desfazia a tradução após 15 s e mostrava o aviso do Brave sem motivo.
3. Falha só quando o combo não aparece após 30 tentativas (≈15 s). Nesse caso o idioma anterior é restaurado e aparece o aviso do Brave/Shields.
4. Todas as instâncias exibem o mesmo idioma (`syncAllTriggers`), e o idioma salvo é restaurado uma única vez por página, mesmo com várias instâncias.
5. Seletor, portal, selo e aviso são `notranslate` + `translate="no"`, para o Google não traduzir os nomes dos idiomas.

## Contrato anti-filtro

O seletor é só um controle do Google Translate. Ele não navega, não altera URL nem query string, não emite eventos de idioma (`lang-change`), não usa `localStorage` e não filtra posts, projetos ou qualquer conteúdo. O único estado persistido é o cookie `googtrans`. Não coloque o seletor em barras de filtro de conteúdo. O `smoke.sh` bloqueia esses padrões.

## Testes

```bash
npm run test:vanilla
bash vanilla/tests/smoke.sh
```
