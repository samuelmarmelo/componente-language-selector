// Testes da versão vanilla (node:test + jsdom). Rode com `npm run test:vanilla`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const switcherUrl = new URL('../language-switcher.js', import.meta.url).href;
const bootstrapUrl = new URL('../google-translate-bootstrap.js', import.meta.url);

function installDom({ cookie } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://example.com/',
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.MutationObserver = dom.window.MutationObserver;
  if (cookie) document.cookie = cookie;
  return dom;
}

function removeDom(dom) {
  dom.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.location;
  delete globalThis.Event;
  delete globalThis.CustomEvent;
  delete globalThis.MutationObserver;
}

function freshModule(tag) {
  return import(`${switcherUrl}?${tag}=${Date.now()}-${Math.random()}`);
}

function appendGoogleCombo(onChange) {
  const target = document.createElement('div');
  target.id = 'google_translate_element2';
  target.innerHTML = '<select class="goog-te-combo"><option value="pt">Português</option><option value="en">English</option><option value="es">Español</option></select>';
  document.body.appendChild(target);
  const combo = target.querySelector('.goog-te-combo');
  if (onChange) combo.addEventListener('change', () => onChange(combo.value));
  return { target, combo };
}

test('bootstrap só define o callback; nunca constrói o TranslateElement', async () => {
  const bootstrapJs = await readFile(bootstrapUrl, 'utf8');
  assert.match(bootstrapJs, /window\.googleTranslateElementInit2\s*=\s*function/);
  assert.doesNotMatch(bootstrapJs, /new window\.google\.translate\.TranslateElement\(\{/);
  assert.doesNotMatch(bootstrapJs, /includedLanguages/);
  assert.doesNotMatch(bootstrapJs, /gtInitialization/);
  assert.doesNotMatch(bootstrapJs, /window\.gt_translate_script/);
  assert.doesNotMatch(bootstrapJs, /translate\.google\.com/);
});

test('ativação assíncrona: o loader do Google só é injetado sob demanda', async () => {
  const dom = installDom();
  try {
    const switcher = await freshModule('ondemand');
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    switcher.renderLanguageSwitcher(slot);

    assert.equal(document.querySelector('script[src*="translate.google.com"]'), null, 'nada é carregado no boot sem idioma salvo');

    slot.querySelector('.lang-switcher__trigger').dispatchEvent(new window.Event('pointerenter'));
    const script = document.querySelector('script[data-samuel-google-translate]');
    assert.ok(script, 'hover no seletor injeta o loader');
    assert.equal(script.async, false);
    assert.match(script.src, /translate\.google\.com\/translate_a\/element\.js\?cb=googleTranslateElementInit2$/);
    assert.equal(document.querySelectorAll('script[src*="translate.google.com"]').length, 1);
  } finally {
    removeDom(dom);
  }
});

test('Language Switcher altera somente o combo do Google Translate', async () => {
  const dom = installDom();
  try {
    const switcher = await freshModule('combo');
    const slot = document.createElement('div');
    const content = document.createElement('section');
    content.innerHTML = '<article data-post="example">Conteúdo original</article>';
    document.body.append(slot, content);
    const { combo } = appendGoogleCombo();

    const unrelatedSelect = document.createElement('select');
    unrelatedSelect.className = 'post-language-filter';
    unrelatedSelect.innerHTML = '<option value="all">Todos</option><option value="en">English</option>';
    document.body.appendChild(unrelatedSelect);
    const unrelatedChange = [];
    unrelatedSelect.addEventListener('change', () => unrelatedChange.push(unrelatedSelect.value));

    let legacyEventCount = 0;
    window.addEventListener('lang-change', () => { legacyEventCount += 1; });
    const beforeContent = content.innerHTML;
    const beforePath = window.location.pathname;
    const beforeSearch = window.location.search;

    switcher.renderLanguageSwitcher(slot);
    slot.querySelector('.lang-switcher__trigger').click();
    slot.querySelector('[data-lang="en"]').click();

    // Sucesso é confirmado assim que o combo nativo recebe o valor.
    assert.equal(slot.querySelector('.lang-switcher__trigger-label')?.textContent, 'English');
    assert.equal(combo.value, 'en');
    assert.match(document.cookie, /(?:^|;\s*)googtrans=\/pt\/en(?:;|$)/);
    assert.deepEqual(unrelatedChange, []);
    assert.equal(legacyEventCount, 0);
    assert.equal(content.innerHTML, beforeContent);
    assert.equal(window.location.pathname, beforePath);
    assert.equal(window.location.search, beforeSearch);
    assert.equal(switcher.getCurrentLang(), 'en');
    assert.equal(document.querySelector('[data-lang-permission-notice="brave-google-translate"]'), null);

    window.localStorage.setItem('sn_lang', 'pt');
    assert.equal(switcher.getCurrentLang(), 'en', 'localStorage não pode controlar o idioma nem o conteúdo');
  } finally {
    removeDom(dom);
  }
});

test('sucesso não é desfeito depois: não depende da classe translated-* no body', async () => {
  const dom = installDom();
  const originalSetTimeout = window.setTimeout.bind(window);
  try {
    const switcher = await freshModule('nobodyclass');
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    appendGoogleCombo();
    // Acelera todos os timers para cobrir o antigo limite de 15 s.
    window.setTimeout = (callback, _delay, ...args) => originalSetTimeout(callback, 0, ...args);

    switcher.renderLanguageSwitcher(slot);
    slot.querySelector('[data-lang="en"]').click();
    // O Google marca o <html>, não o <body>.
    document.documentElement.classList.add('translated-ltr');
    await new Promise((resolve) => originalSetTimeout(resolve, 50));

    assert.equal(slot.querySelector('.lang-switcher__trigger-label')?.textContent, 'English');
    assert.equal(switcher.getCurrentLang(), 'en');
    assert.equal(document.querySelector('[data-lang-permission-notice]'), null, 'o aviso do Brave não pode aparecer');
  } finally {
    window.setTimeout = originalSetTimeout;
    removeDom(dom);
  }
});

test('sem combo do Google a troca falha, restaura o idioma e mostra o aviso', async () => {
  const dom = installDom();
  const originalSetTimeout = window.setTimeout.bind(window);
  try {
    const switcher = await freshModule('timeout');
    const slot = document.createElement('div');
    const googleTarget = document.createElement('div');
    googleTarget.id = 'google_translate_element2';
    document.body.append(slot, googleTarget);
    switcher.renderLanguageSwitcher(slot);

    // Google nunca cria o combo (bloqueador, rede, Brave Shields): esgota as tentativas.
    window.setTimeout = ((callback, delay, ...args) => {
      if (delay === 500) return originalSetTimeout(callback, 0, ...args);
      return originalSetTimeout(callback, delay, ...args);
    });

    slot.querySelector('[data-lang="en"]').click();
    await new Promise((resolve) => originalSetTimeout(resolve, 600));

    assert.equal(slot.querySelector('.lang-switcher__trigger-label')?.textContent, 'Português BR');
    assert.equal(switcher.getCurrentLang(), 'pt');
    const notice = document.querySelector('[data-lang-permission-notice="brave-google-translate"]');
    assert.ok(notice, 'o aviso deve aparecer quando o Google não responde');
    assert.ok(notice.classList.contains('notranslate'));
    assert.equal(notice.getAttribute('translate'), 'no');
    assert.match(notice.textContent, /Brave/);
    assert.match(notice.textContent, /Shields/);
    assert.match(notice.querySelector('a')?.href || '', /support\.brave\.com/);
    notice.querySelector('button')?.click();
    assert.equal(document.querySelector('[data-lang-permission-notice="brave-google-translate"]'), null);
  } finally {
    window.setTimeout = originalSetTimeout;
    removeDom(dom);
  }
});

test('todas as instâncias sincronizam o rótulo (syncAllTriggers)', async () => {
  const dom = installDom();
  try {
    const switcher = await freshModule('sync');
    const header = document.createElement('div');
    const drawer = document.createElement('div');
    document.body.append(header, drawer);
    appendGoogleCombo();

    switcher.renderLanguageSwitcher(header);
    switcher.renderLanguageSwitcher(drawer, { direction: 'down' });
    header.querySelector('[data-lang="es"]').click();

    assert.equal(header.querySelector('.lang-switcher__trigger-label').textContent, 'Español');
    assert.equal(drawer.querySelector('.lang-switcher__trigger-label').textContent, 'Español');
    assert.match(drawer.querySelector('.lang-switcher__trigger-flag').src, /\/es\.svg$/);
  } finally {
    removeDom(dom);
  }
});

test('seletor, portal e selo são notranslate + translate="no"', async () => {
  const dom = installDom();
  try {
    const switcher = await freshModule('notranslate');
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    appendGoogleCombo();

    switcher.renderLanguageSwitcher(slot, { direction: 'down-portal' });
    const root = slot.querySelector('.lang-switcher');
    assert.ok(root.classList.contains('notranslate'));
    assert.equal(root.getAttribute('translate'), 'no');

    slot.querySelector('.lang-switcher__trigger').click();
    const portal = document.querySelector('.lang-portal');
    assert.ok(portal, 'o portal deve abrir');
    assert.ok(portal.classList.contains('notranslate'));
    assert.equal(portal.getAttribute('translate'), 'no');

    portal.querySelector('[data-lang="en"]').click();
    const badge = document.querySelector('.lang-translating-badge');
    assert.ok(badge, 'o selo aparece durante a troca');
    assert.ok(badge.classList.contains('notranslate'));
    assert.equal(badge.getAttribute('translate'), 'no');
  } finally {
    removeDom(dom);
  }
});

test('idioma salvo é restaurado uma única vez por página, mesmo com várias instâncias', async () => {
  const dom = installDom({ cookie: 'googtrans=/pt/en;path=/' });
  try {
    const switcher = await freshModule('restore');
    const changes = [];
    appendGoogleCombo((value) => changes.push(value));
    const a = document.createElement('div');
    const b = document.createElement('div');
    const c = document.createElement('div');
    document.body.append(a, b, c);

    switcher.renderLanguageSwitcher(a);
    switcher.renderLanguageSwitcher(b);
    switcher.renderLanguageSwitcher(c, { direction: 'down-portal' });

    // Uma restauração = um doGTranslate = dois `change` (sequência de compatibilidade).
    assert.deepEqual(changes, ['en', 'en']);
    for (const slot of [a, b, c]) {
      assert.equal(slot.querySelector('.lang-switcher__trigger-label').textContent, 'English');
    }
  } finally {
    removeDom(dom);
  }
});

test('ativação aguarda o combo nativo e dispara dois eventos sem tocar no conteúdo', async () => {
  const dom = installDom();
  try {
    const switcher = await freshModule('delayed');
    const target = document.createElement('div');
    target.id = 'google_translate_element2';
    document.body.appendChild(target);

    const changeEvents = [];
    const TranslateElement = function (_options, targetId) {
      window.setTimeout(() => {
        const combo = document.createElement('select');
        combo.className = 'goog-te-combo';
        combo.innerHTML = '<option value="pt">Português</option><option value="en">English</option>';
        combo.addEventListener('change', () => changeEvents.push(combo.value));
        document.getElementById(targetId)?.appendChild(combo);
      }, 20);
    };
    window.google = { translate: { TranslateElement } };

    assert.equal(switcher.gtLoadTlib(), true);
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    assert.ok(document.querySelector('#google_translate_element2 .goog-te-combo'));

    const content = document.createElement('article');
    content.textContent = 'Conteúdo original';
    document.body.appendChild(content);
    const beforeContent = content.innerHTML;
    switcher.setLang('en');
    assert.deepEqual(changeEvents, ['en', 'en']);
    assert.equal(document.body.querySelectorAll('.goog-te-combo').length, 1);
    assert.equal(content.innerHTML, beforeContent);
  } finally {
    removeDom(dom);
  }
});

test('caminho das bandeiras é configurável', async () => {
  const dom = installDom();
  try {
    const switcher = await freshModule('flags');
    assert.equal(switcher.LANGUAGES[0].flagSrc, '/icons/flags/br.svg');
    switcher.configureLanguageSwitcher({ flagBasePath: '/assets/flags' });
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    switcher.renderLanguageSwitcher(slot);
    assert.match(slot.querySelector('.lang-switcher__trigger-flag').getAttribute('src'), /^\/assets\/flags\/br\.svg$/);
    assert.ok(switcher.LANGUAGES.every((language) => language.flagSrc.startsWith('/assets/flags/')));
  } finally {
    removeDom(dom);
  }
});
