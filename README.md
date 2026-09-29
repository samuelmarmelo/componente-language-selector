# Language Switcher com Google Translate

Componente React reutilizável extraído do [Apogeo Nobre](https://github.com/marketingwebsam/apogeonobre). Ele funciona como uma camada de controle para o Google Translate Website Translator: o usuário escolhe um idioma, o componente grava o cookie `googtrans` no formato origem/destino (por exemplo, `/pt/en`) e dispara `change` no select nativo `.goog-te-combo` criado pelo Google.

> **Contrato anti-filtro:** este componente não conhece posts, categorias, rotas, query strings, slugs, `react-router`, `URLSearchParams` ou qualquer estado de conteúdo. O código de idioma é encaminhado exclusivamente ao Google Translate; a página permanece na mesma URL e a lista de conteúdo não é filtrada.

A integração usa o widget de tradução de páginas do Google, que traduz o conteúdo da página para outros idiomas [1]. O projeto mantém o endpoint e o formato de inicialização isolados no adaptador `src/googleTranslate.ts`, sem misturar tradução com navegação da aplicação.

## Conteúdo

| Arquivo | Responsabilidade |
|---|---|
| `src/LanguageSwitcher.tsx` | Dropdown React acessível, flags, seleção e integração com o adaptador. |
| `src/googleTranslate.ts` | Cookie `googtrans`, carregamento idempotente do script e comunicação com `.goog-te-combo`. |
| `src/styles.css` | Estilos isolados do seletor e ocultação apenas da UI auxiliar do Google Translate. |
| `src/assets/flags/*.svg` | Flags autocontidas extraídas do Apogeo. |
| `src/googleTranslate.test.ts` | Testes do contrato do adaptador e do isolamento contra outros selects. |
| `tests/smoke.sh` | Lint, testes, build e bloqueio estático contra rotas/posts/filtros; também roda o smoke da versão vanilla. |
| `vanilla/` | Cópia sem framework da implementação em produção (JS, bootstrap, CSS, bandeiras e testes). Veja a seção Versão vanilla. |

## Instalação

Instale as dependências do pacote no projeto consumidor e importe o componente e os estilos:

```tsx
import { LanguageSwitcher } from '@marketingwebsam/language-switcher'
import '@marketingwebsam/language-switcher/styles.css'

export function Header() {
  return <LanguageSwitcher />
}
```

O pacote foi configurado para React `>=18` e é compilado com Vite como biblioteca ES. Para usar o código diretamente sem publicar no npm, copie `src/` e mantenha os imports relativos dos SVGs.

## Google Translate automático

Por padrão, `loadGoogleTranslate` é `true`. Nesse modo, o componente cria uma única tag do script do Google Translate, inicializa um alvo invisível próprio e reutiliza o script caso o host já tenha uma tag equivalente. O callback é definido antes de o script ser anexado e a tag é inserida sem `async`, como no plugin GTranslate 3.1.1, para preservar a ordem do bootstrap. O construtor não envia `includedLanguages` por padrão: o catálogo oficial completo do Google é carregado, e essa prop só deve ser usada quando o consumidor realmente quiser um subconjunto conhecido:

```tsx
<LanguageSwitcher pageLanguage="pt" />

{/* Restrição opcional, nunca relacionada ao conteúdo da aplicação. */}
<LanguageSwitcher
  pageLanguage="pt"
  includedLanguages="en,es,it,pt,pt-PT,zh-CN,ja,fr"
/>
```

A inicialização é feita com `autoDisplay: false`, portanto a UI visível é somente o seletor customizado. O componente não usa o elemento global `#google_translate_element` do host: cada instância renderiza um alvo invisível com ID próprio, mas só a primeira instância montada inicializa o Google; as demais reutilizam esse alvo, então o `TranslateElement` (e a restauração do idioma salvo no cookie) acontece uma única vez por página. Depois de instanciar `TranslateElement`, o adaptador espera até que o Google crie um `.goog-te-combo` populado. Se o script do host terminar de expor `window.google` depois da primeira tentativa, o polling reentra no inicializador; um marcador pendente recente evita construtores duplicados, mas marcadores antigos são tratados como estado parcial e recuperados. Só então aplica o idioma, atribui o valor ao select nativo e dispara dois eventos `change`, sequência usada pelo plugin para compatibilidade com o Website Translator em diferentes navegadores e versões. A UI React confirma o novo rótulo somente quando a aplicação ao combo retorna sucesso, e então todas as instâncias da página passam a exibir o mesmo idioma; em falha, limpa/restaura o cookie `googtrans` e mantém o idioma anterior visível.

Se o site já inicializa o Google Translate no `index.html`, o host pode manter essa responsabilidade e fornecer um alvo estável:

```tsx
<LanguageSwitcher
  loadGoogleTranslate={false}
  translateTargetId="apogeo-google-translate"
/>
```

O callback do host deve inicializar o Google Translate usando exatamente `apogeo-google-translate`. Nesse modo, o site deve disponibilizar um `.goog-te-combo` dentro desse alvo. A seleção aguarda o combo ficar disponível e populado; não há reload da página, alteração de rota ou consulta a posts. Para reproduzir o contrato do plugin, o adaptador mantém uma referência global ao script (`gt_translate_script`) e nunca insere uma segunda tag equivalente.

## API

| Prop | Padrão | Uso |
|---|---|---|
| `pageLanguage` | `pt` | Idioma original informado ao Google Translate. |
| `includedLanguages` | vazio (catálogo completo) | Restrição opcional do catálogo Google; nunca filtra posts ou projetos. |
| `loadGoogleTranslate` | `true` | Carrega o script do Google ou permite que o host o gerencie. |
| `googleTranslateScriptUrl` | URL oficial | Permite uma URL de script controlada pelo host. |
| `translateTargetId` | ID gerado pelo React | ID estável do alvo Google quando o host gerencia a inicialização. |
| `defaultLanguage` | `pt` | Label inicial antes da leitura do cookie. |
| `className` | vazio | Classe adicional para o layout do host. |
| `onLanguageChange` | não definido | Callback após o `change` ser disparado no select Google. |
| `languages` | 8 idiomas | Lista de `{ code, label, flag }`; os códigos são enviados somente ao Google Translate. |

O adaptador também exporta `readGoogleTranslateLanguage`, `writeGoogleTranslateLanguage`, `applyGoogleTranslateLanguage`, `findGoogleTranslateCombo` e `ensureGoogleTranslate` para integrações avançadas.

## Por que não age como filtro de posts

A versão estabilizada impõe quatro separações importantes:

| Risco | Proteção implementada |
|---|---|
| Um seletor genérico ser confundido com filtro de idioma do conteúdo | A busca pelo select é escopada ao alvo gerado pela própria instância e ao seletor `.goog-te-combo`. |
| O idioma ser transformado em rota ou query string | Não há `useNavigate`, `navigate`, `URLSearchParams`, `window.location`, links de idioma ou reload. |
| A aplicação receber estado de posts | Não há props, imports ou callbacks de posts, categorias, slugs ou filtros de conteúdo. |
| Um script auxiliar duplicar a interface | O carregamento do script é idempotente e o alvo Google fica invisível; o usuário interage somente com a UI customizada. |

O smoke test procura regressões dessas categorias no código de produção e os testes unitários confirmam que um `.goog-te-combo` fora do alvo não é alterado. Há também uma regressão específica que garante que `includedLanguages` não seja enviado por padrão, pois o runtime atual do Google pode deixar o combo vazio quando recebe essa restrição.

## Acessibilidade e UX

O trigger usa `aria-haspopup="listbox"`, `aria-expanded` e `aria-controls`. As opções usam `role="option"` e `aria-selected`; o menu responde a `Enter`, espaço, setas, `Home`, `End` e `Escape`. As flags são decorativas porque o nome do idioma permanece textual. O foco visível e o modo `prefers-reduced-motion` são preservados, e o dropdown fecha quando o usuário clica fora.

Quando o Google não consegue preencher o combo e a tentativa termina em falha, o componente mantém o idioma anterior e mostra um aviso `role="alert"` com instruções para usuários do Brave: abrir o ícone do leão, ajustar Shields para o site e, se necessário, permitir JavaScript e cookies antes de recarregar. O aviso inclui o [Brave Help Center](https://support.brave.com/hc/en-us/articles/360023646212-How-do-I-configure-global-and-site-specific-Shields-settings) e pode ser fechado sem alterar a URL ou o conteúdo.

A direção visual foi mantida próxima ao Apogeo: fundo escuro translúcido, acento dourado, dropdown alinhado à direita, label antes da bandeira e adaptação para telas estreitas. As classes são específicas (`ls-*`) e os principais valores são tokens CSS para reduzir vazamento em sites consumidores.

## Desenvolvimento e validação

```bash
npm install
npm run lint
npm test
npm run build
bash tests/smoke.sh
npm run test:vanilla
```

O pacote foi validado com lint ESLint, nove testes unitários do adaptador, seis testes de interação do componente, dez testes da versão vanilla (`npm run test:vanilla`), typecheck/declaration build e build Vite. O smoke test também bloqueia referências de produção a navegação por locale, filtros de posts e query strings, além de verificar a espera pelo combo, a sequência dupla de `change`, a tag singleton sem `async` e a API do host disponibilizada tardiamente.

## Versão vanilla

A pasta [`vanilla/`](vanilla/README.md) guarda, como backup, a implementação sem framework que está em produção no site samuelwebdesign: `language-switcher.js` (ES module sem imports), `google-translate-bootstrap.js`, `language-switcher.css`, as bandeiras SVG e os testes `node:test` + jsdom. O [README da pasta](vanilla/README.md) explica o uso, as origens liberadas na CSP, o contrato de ativação assíncrona e o contrato anti-filtro.

```bash
npm run test:vanilla
bash vanilla/tests/smoke.sh
```

## Changelog

### 2026-09-29

- **Versão vanilla:** nova pasta `vanilla/` com a cópia da implementação em produção. Ela traz as correções do site: sucesso confirmado assim que o `.goog-te-combo` recebe o valor (a versão antiga esperava a classe `translated-*` no `<body>`, mas o Google a coloca no `<html>`, então a tradução era desfeita após 15 s e o aviso do Brave aparecia sem motivo); loader do Google injetado sob demanda; rótulo sincronizado em todas as instâncias; seletor marcado `notranslate`; idioma salvo restaurado uma única vez por página.
- **React:** o rótulo agora é sincronizado em todas as instâncias da página; a raiz do seletor recebe `notranslate` e `translate="no"`; sem `translateTargetId`, o Google é inicializado uma única vez por página e as instâncias compartilham o alvo. A confirmação pelo combo já existia.
- **Testes:** três testes novos do componente, dez testes da versão vanilla e novas verificações no smoke.

## Integração no Apogeo

O Apogeo já possui o script do Google Translate no `index.html` e renderiza o componente em desktop e mobile dentro de `Header.tsx`. Para migrar sem duplicar o script, a integração deve usar `loadGoogleTranslate={false}` junto com um `translateTargetId` estável, e o callback do host deve apontar para esse mesmo ID. A alternativa é remover a inicialização duplicada do host e deixar o componente controlar automaticamente o alvo do Google Translate.

A extração não modifica o Apogeo, portanto o site atual permanece intacto. O repositório de destino contém a versão portável e estabilizada, pronta para uma integração explícita em cada projeto consumidor.

## Referências

[1]: https://developers.google.com/search/blog/2020/05/google-translates-website-translator "Google Search Central — Google Translate's Website Translator"
[2]: https://react.dev/reference/react/useRef "React — useRef"
[3]: https://testing-library.com/docs/queries/about#priority "Testing Library — About Queries"
