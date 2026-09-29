/**
 * Language Switcher — SafeWidget para Google Translate.
 *
 * Contrato deliberadamente estreito:
 * - o idioma selecionado pertence somente ao Google Translate;
 * - a preferência é lida/escrita no cookie `googtrans`;
 * - a troca é aplicada somente ao `.goog-te-combo` dentro do alvo do Google;
 * - o componente não navega, não filtra conteúdo e não emite eventos de idioma.
 *
 * Ativação assíncrona (contrato de samuelmarmelo/componente-language-selector):
 * - o script do Google NÃO é carregado no HTML; ele é injetado sob demanda
 *   (hover/foco/clique no seletor) ou logo após o boot se houver idioma salvo;
 * - a troca é confirmada quando o combo nativo recebe o valor (dois `change`);
 * - falha só quando o combo não aparece dentro do limite de tentativas.
 * Todas as instâncias (header, drawer) exibem o mesmo idioma.
 * O seletor e seus textos são marcados notranslate para não serem traduzidos.
 *
 * Cópia autocontida (sem imports) da implementação em produção do site
 * samuelwebdesign. As bandeiras são servidas por padrão em `/icons/flags/`;
 * use `configureLanguageSwitcher({ flagBasePath })` antes de renderizar para
 * apontar para outra pasta (os SVGs estão em `vanilla/flags/`).
 */

const GT_SOURCE_LANGUAGE = 'pt';
const GT_CONTAINER_ID = 'google_translate_element2';
const GT_SCRIPT_URL = 'https://translate.google.com/translate_a/element.js';
const GT_CALLBACK_NAME = 'googleTranslateElementInit2';
const GT_SCRIPT_ATTRIBUTE = 'data-samuel-google-translate';
const MAX_RETRY = 30;

const GT_MAP = {
  en: 'en',
  es: 'es',
  fr: 'fr',
  it: 'it',
  zh: 'zh-CN',
  ja: 'ja',
};

const GT_TO_UI = Object.fromEntries(
  Object.entries(GT_MAP).map(([uiCode, googleCode]) => [googleCode, uiCode])
);

const DEFAULT_FLAG_BASE_PATH = '/icons/flags/';

export const LANGUAGES = [
  { code: 'pt', label: 'Português BR', flagFile: 'br.svg' },
  { code: 'en', label: 'English', flagFile: 'us.svg' },
  { code: 'es', label: 'Español', flagFile: 'es.svg' },
  { code: 'fr', label: 'Français', flagFile: 'fr.svg' },
  { code: 'it', label: 'Italiano', flagFile: 'it.svg' },
  { code: 'zh', label: '中文', flagFile: 'cn.svg' },
  { code: 'ja', label: '日本語', flagFile: 'jp.svg' },
];

function applyFlagBasePath(basePath) {
  const normalized = basePath.endsWith('/') ? basePath : `${basePath}/`;
  LANGUAGES.forEach((language) => {
    language.flagSrc = normalized + language.flagFile;
  });
}

applyFlagBasePath(DEFAULT_FLAG_BASE_PATH);

/**
 * Configuração opcional do host. Chame antes de `renderLanguageSwitcher`.
 * @param {{ flagBasePath?: string }} options
 */
export function configureLanguageSwitcher({ flagBasePath } = {}) {
  if (typeof flagBasePath === 'string' && flagBasePath.trim()) {
    applyFlagBasePath(flagBasePath.trim());
  }
}

let activePortal = null;
let badge = null;
let badgeTimer = null;
let permissionNotice = null;
let instanceCounter = 0;
let googleCallbackInstalled = false;
let savedLanguageRestoreStarted = false;

function readGoogleTranslateCode() {
  if (typeof document === 'undefined') return null;

  try {
    const match = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
    if (!match || !match[1]) return null;
    const value = decodeURIComponent(match[1]);
    return value.match(/^\/[^/]+\/([^/]+)$/)?.[1] || null;
  } catch (_) {
    return null;
  }
}

/**
 * Returns the UI code from Google's own cookie. No application storage is
 * consulted, so this value cannot become a content/filter state by accident.
 */
export function getCurrentLang() {
  const googleCode = readGoogleTranslateCode();
  return GT_TO_UI[googleCode] || (googleCode === GT_SOURCE_LANGUAGE ? 'pt' : 'pt');
}

function writeGoogleTranslateCookie(googleCode) {
  if (typeof document === 'undefined') return;

  try {
    document.cookie = `googtrans=/${GT_SOURCE_LANGUAGE}/${googleCode};path=/;SameSite=Lax`;
  } catch (_) {
    // SafeWidget: cookie restrictions must never break the page.
  }
}

function clearGoogleTranslateCookie() {
  if (typeof document === 'undefined') return;

  const clear = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  try { document.cookie = clear; } catch (_) {}
  try { document.cookie = `${clear}; domain=${location.hostname}`; } catch (_) {}
  try { document.cookie = `${clear}; domain=.${location.hostname}`; } catch (_) {}
}

function gtEnsureContainer() {
  if (typeof document === 'undefined') return null;

  let container = document.getElementById(GT_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = GT_CONTAINER_ID;
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);
  }
  return container;
}

function getGoogleCombo() {
  const container = gtEnsureContainer();
  return container?.querySelector('select.goog-te-combo') || null;
}

function gtFireChange(element) {
  const dispatch = () => {
    try {
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {
      try {
        const event = document.createEvent('HTMLEvents');
        event.initEvent('change', true, true);
        element.dispatchEvent(event);
      } catch (__) {}
    }
  };

  // Compatibility sequence used by the working GTranslate widget.
  dispatch();
  dispatch();
}

function initializeGoogleTranslate() {
  const container = gtEnsureContainer();
  const TranslateElement = window.google?.translate?.TranslateElement;
  if (!container || typeof TranslateElement !== 'function') return false;

  const combo = container.querySelector('select.goog-te-combo');
  if (combo && combo.options.length > 0) return true;
  if (container.dataset.gtInitialization === 'pending') return false;

  container.dataset.gtInitialization = 'pending';
  try {
    new TranslateElement(
      {
        pageLanguage: GT_SOURCE_LANGUAGE,
        autoDisplay: false,
      },
      GT_CONTAINER_ID,
    );
    const initializedCombo = container.querySelector('select.goog-te-combo');
    return Boolean(initializedCombo && initializedCombo.options.length > 0);
  } catch (error) {
    delete container.dataset.gtInitialization;
    console.warn('[lang-switcher] Falha ao iniciar o widget do Google Translate:', error);
    return false;
  }
}

/**
 * Loads Google's script once and reuses an existing host script when present.
 * The component's hidden target is separate from application controls.
 */
export function gtLoadTlib() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  gtEnsureContainer();

  if (initializeGoogleTranslate()) return true;

  if (!googleCallbackInstalled) {
    const previousCallback = typeof window[GT_CALLBACK_NAME] === 'function'
      ? window[GT_CALLBACK_NAME]
      : null;
    window[GT_CALLBACK_NAME] = function googleTranslateElementInit2() {
      previousCallback?.();
      initializeGoogleTranslate();
    };
    googleCallbackInstalled = true;
  }

  let script = window.gt_translate_script || document.querySelector(`script[${GT_SCRIPT_ATTRIBUTE}]`);
  if (!script) {
    script = document.querySelector(`script[src*="translate.google.com/translate_a/element.js"]`);
  }

  if (!script) {
    try {
      script = document.createElement('script');
      // GTranslate 3.1.1 appends the loader without async. Preserve the
      // callback-before-script order used by the working plugin.
      script.async = false;
      script.src = `${GT_SCRIPT_URL}?cb=${GT_CALLBACK_NAME}`;
      script.setAttribute(GT_SCRIPT_ATTRIBUTE, 'true');
      script.onerror = function () {
        console.warn('[lang-switcher] Script do Google Translate não carregou (rede, CSP ou bloqueador de anúncios).');
      };
      (document.body || document.head).appendChild(script);
    } catch (error) {
      console.warn('[lang-switcher] Não foi possível carregar o Google Translate:', error);
      return false;
    }
  }

  window.gt_translate_script = script;
  return true;
}

function doGTranslate(langPair, onFailure, retry = 0, onSuccess = null) {
  const lang = typeof langPair === 'string' ? langPair.split('|')[1] : langPair?.value?.split('|')[1];
  if (!lang) return false;

  const combo = getGoogleCombo();
  if (combo && combo.options.length > 0) {
    combo.value = lang;
    gtFireChange(combo);
    onSuccess?.();
    return true;
  }

  if (retry >= MAX_RETRY) {
    console.warn('[lang-switcher] Google Translate não carregou a tempo (select goog-te-combo ausente).');
    onFailure?.();
    return false;
  }

  gtLoadTlib();
  window.setTimeout(() => doGTranslate(langPair, onFailure, retry + 1, onSuccess), 500);
  return false;
}

function translateTo(googleCode, onFailure, onSuccess) {
  gtLoadTlib();
  doGTranslate(`${GT_SOURCE_LANGUAGE}|${googleCode}`, onFailure, 0, onSuccess);
}

function resetToPortuguese(onFailure, onSuccess) {
  clearGoogleTranslateCookie();
  gtLoadTlib();
  doGTranslate(`${GT_SOURCE_LANGUAGE}|${GT_SOURCE_LANGUAGE}`, onFailure, 0, onSuccess);
}

/**
 * Public compatibility API. It changes only Google Translate state.
 * It intentionally does not dispatch a custom application event.
 */
export function setLang(lang) {
  const language = LANGUAGES.find((item) => item.code === lang)?.code || 'pt';
  if (language === 'pt') {
    resetToPortuguese();
    return;
  }

  const googleCode = GT_MAP[language];
  if (!googleCode) return;
  writeGoogleTranslateCookie(googleCode);
  translateTo(googleCode);
}

function showTranslatingBadge(text) {
  hideTranslatingBadge(true);
  badge = document.createElement('div');
  badge.className = 'lang-translating-badge notranslate';
  badge.setAttribute('translate', 'no');
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'polite');
  badge.innerHTML =
    '<span class="lang-translating-badge__icon">'
    + '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>'
    + '</span><span>' + text + '<span class="lang-translating-badge__dot" aria-hidden="true"></span></span>';
  document.body.appendChild(badge);
}

function hideTranslatingBadge(immediate = false) {
  clearTimeout(badgeTimer);
  if (!badge) return;

  const currentBadge = badge;
  badge = null;
  if (immediate) {
    currentBadge.remove();
    return;
  }
  currentBadge.classList.add('lang-translating-badge--out');
  badgeTimer = window.setTimeout(() => currentBadge.remove(), 350);
}

function hideGooglePermissionNotice() {
  if (!permissionNotice) return;
  permissionNotice.remove();
  permissionNotice = null;
}

function showGooglePermissionNotice() {
  if (permissionNotice || typeof document === 'undefined') return;

  const notice = document.createElement('aside');
  notice.className = 'lang-permission-notice notranslate';
  notice.setAttribute('translate', 'no');
  notice.setAttribute('data-lang-permission-notice', 'brave-google-translate');
  notice.setAttribute('role', 'alert');
  notice.setAttribute('aria-live', 'assertive');

  const content = document.createElement('div');
  content.className = 'lang-permission-notice__content';

  const title = document.createElement('strong');
  title.className = 'lang-permission-notice__title';
  title.textContent = 'Google Tradutor bloqueado';

  const message = document.createElement('p');
  message.className = 'lang-permission-notice__message';
  message.textContent = 'No Brave, clique no ícone do leão (Shields) ao lado da barra de endereço e permita este site. Se necessário, permita JavaScript e cookies ou desative o Shields somente para este site; depois, recarregue a página.';

  const help = document.createElement('a');
  help.className = 'lang-permission-notice__help';
  help.href = 'https://support.brave.com/hc/en-us/articles/360023646212-How-do-I-configure-global-and-site-specific-Shields-settings';
  help.target = '_blank';
  help.rel = 'noopener noreferrer';
  help.textContent = 'Como ajustar o Shields no Brave';

  const close = document.createElement('button');
  close.className = 'lang-permission-notice__close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Fechar aviso do Google Tradutor');
  close.textContent = '×';
  close.addEventListener('click', hideGooglePermissionNotice, { once: true });

  content.append(title, message, help);
  notice.append(content, close);
  document.body.appendChild(notice);
  permissionNotice = notice;
}

/** Atualiza o rótulo de todas as instâncias (header, drawer, etc.). */
function syncAllTriggers(language) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.lang-switcher[data-language-switcher="google-translate"]')
    .forEach((instance) => updateTrigger(instance, language));
}

function updateTrigger(switcher, language) {
  const flag = switcher.querySelector('.lang-switcher__trigger-flag');
  const label = switcher.querySelector('.lang-switcher__trigger-label');
  if (flag) {
    flag.src = language.flagSrc;
    flag.alt = language.label;
  }
  if (label) label.textContent = language.label;
}

const checkSVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lang-switcher__option-check" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
const chevronSVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" class="lang-switcher__trigger-chevron"><path d="M1.5 3.5L5 7l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function buildOptions(activeCode) {
  return LANGUAGES.map((language) => {
    const active = language.code === activeCode;
    return '<button class="lang-switcher__option' + (active ? ' active' : '')
      + '" data-lang="' + language.code + '" role="option" aria-selected="' + active + '" type="button">'
      + '<img src="' + language.flagSrc + '" alt="" width="20" height="14" loading="lazy" class="ls-flag" />'
      + '<span class="ls-option-label">' + language.label + '</span>'
      + (active ? checkSVG : '')
      + '</button>';
  }).join('');
}

function createPortal(optionsHTML, listId) {
  if (activePortal) closePortal();
  const portal = document.createElement('div');
  portal.className = 'lang-portal notranslate';
  portal.setAttribute('translate', 'no');
  portal.id = listId;
  portal.setAttribute('role', 'listbox');
  portal.setAttribute('aria-label', 'Idiomas disponíveis');
  portal.innerHTML = optionsHTML;
  document.body.appendChild(portal);
  activePortal = portal;
  return portal;
}

function closePortal() {
  if (!activePortal) return;
  if (activePortal._cleanup) activePortal._cleanup();
  activePortal.remove();
  activePortal = null;
}

function positionPortal(portal, trigger, direction) {
  const rect = trigger.getBoundingClientRect();
  if (direction === 'down-portal') {
    portal.style.top = `${rect.bottom + 6}px`;
    portal.style.left = `${rect.left}px`;
    return;
  }

  const sidebar = trigger.closest('.sidebar');
  const anchor = sidebar ? sidebar.getBoundingClientRect() : rect;
  portal.style.top = 'auto';
  portal.style.bottom = `${window.innerHeight - rect.bottom}px`;
  portal.style.left = `${anchor.right + 8}px`;
}

function focusOption(optionsRoot, index) {
  const options = optionsRoot?.querySelectorAll('.lang-switcher__option');
  if (!options?.length) return;
  const normalized = (index + options.length) % options.length;
  options[normalized].focus();
}

function bindOptionKeyboard(optionsRoot) {
  if (!optionsRoot || optionsRoot.dataset.keyboardBound === 'true') return;
  optionsRoot.dataset.keyboardBound = 'true';
  optionsRoot.addEventListener('keydown', (event) => {
    const option = event.target.closest('.lang-switcher__option');
    if (!option) return;
    const options = Array.from(optionsRoot.querySelectorAll('.lang-switcher__option'));
    const index = options.indexOf(option);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusOption(optionsRoot, index + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(optionsRoot, index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusOption(optionsRoot, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusOption(optionsRoot, options.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      optionsRoot.dispatchEvent(new CustomEvent('language-switcher-close', { bubbles: true }));
    }
  });
}

/**
 * @param {HTMLElement} container
 * @param {{ direction?: 'down'|'right'|'down-portal' }} opts
 */
export function renderLanguageSwitcher(container, { direction = 'down' } = {}) {
  if (!container) return null;

  const isPortal = direction === 'right' || direction === 'down-portal';
  const currentCode = getCurrentLang();
  const activeLang = LANGUAGES.find((language) => language.code === currentCode) || LANGUAGES[0];
  const instanceId = `language-switcher-${++instanceCounter}`;
  const listId = `${instanceId}-list`;
  let isOpen = false;
  let inlineOutsideClick = null;

  container.innerHTML =
    '<div class="lang-switcher notranslate" translate="no" data-dir="' + direction + '" data-language-switcher="google-translate">'
      + '<button class="lang-switcher__trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + listId + '" type="button" title="Selecionar idioma">'
        + '<img class="lang-switcher__trigger-flag ls-flag" src="' + activeLang.flagSrc + '" alt="' + activeLang.label + '" width="20" height="14" loading="lazy" />'
        + '<span class="lang-switcher__trigger-label">' + activeLang.label + '</span>'
        + chevronSVG
      + '</button>'
      + (!isPortal ? '<div id="' + listId + '" class="lang-switcher__dropdown" role="listbox" aria-label="Idiomas disponíveis">' + buildOptions(activeLang.code) + '</div>' : '')
    + '</div>';

  const switcher = container.querySelector('.lang-switcher');
  const trigger = container.querySelector('.lang-switcher__trigger');
  if (!switcher || !trigger) return null;

  const selectLanguage = (langCode) => {
    hideGooglePermissionNotice();
    const language = LANGUAGES.find((item) => item.code === langCode) || LANGUAGES[0];
    const previousCode = getCurrentLang();
    const previousLanguage = LANGUAGES.find((item) => item.code === previousCode) || LANGUAGES[0];
    let outcomeHandled = false;

    const restorePreviousLanguage = () => {
      if (previousCode === 'pt') clearGoogleTranslateCookie();
      else writeGoogleTranslateCookie(GT_MAP[previousCode]);
      syncAllTriggers(previousLanguage);
    };

    const onFailure = () => {
      if (outcomeHandled) return;
      outcomeHandled = true;
      restorePreviousLanguage();
      hideTranslatingBadge(true);
      showGooglePermissionNotice();
      showTranslatingBadge('tradução indisponível — tente novamente');
      window.setTimeout(() => hideTranslatingBadge(), 2500);
    };

    const onTranslated = () => {
      if (outcomeHandled) return;
      outcomeHandled = true;
      hideGooglePermissionNotice();
      syncAllTriggers(language);
      // O Google aplica a tradução de forma assíncrona; o selo sai logo depois.
      window.setTimeout(() => hideTranslatingBadge(), 900);
    };

    showTranslatingBadge(language.code === 'pt' ? 'restaurando' : 'traduzindo');

    if (language.code === 'pt') {
      resetToPortuguese(onFailure, onTranslated);
      return;
    }

    // Sucesso = combo nativo aplicado (contrato da referência). Não observe a
    // classe `translated-*` no <body>: o Google a coloca no <html>, e a troca
    // "expirava" e era desfeita mesmo com a página traduzida (bug 2026-09).
    writeGoogleTranslateCookie(GT_MAP[language.code]);
    translateTo(GT_MAP[language.code], onFailure, onTranslated);
  };

  const openInline = () => {
    const dropdown = switcher.querySelector('.lang-switcher__dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = buildOptions(getCurrentLang());
    switcher.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    isOpen = true;
    inlineOutsideClick = (event) => {
      if (!switcher.contains(event.target)) closeInline();
    };
    document.addEventListener('click', inlineOutsideClick, true);
    bindOptionKeyboard(dropdown);
  };

  const closeInline = () => {
    if (inlineOutsideClick) {
      document.removeEventListener('click', inlineOutsideClick, true);
      inlineOutsideClick = null;
    }
    switcher.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    isOpen = false;
  };

  const getOptionsRoot = () => isPortal
    ? activePortal
    : switcher.querySelector('.lang-switcher__dropdown');

  const open = () => {
    if (!isPortal) {
      openInline();
      return;
    }

    const portal = createPortal(buildOptions(getCurrentLang()), listId);
    positionPortal(portal, trigger, direction);
    switcher.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    isOpen = true;
    bindOptionKeyboard(portal);
    portal.addEventListener('language-switcher-close', () => {
      close();
      trigger.focus();
    });
    portal.addEventListener('click', (event) => {
      const button = event.target.closest('[data-lang]');
      if (!button) return;
      selectLanguage(button.dataset.lang);
      close();
    });

    const reposition = () => positionPortal(portal, trigger, direction);
    const outsideClick = (event) => {
      if (!trigger.contains(event.target) && !portal.contains(event.target)) close();
    };
    window.addEventListener('scroll', reposition, { passive: true });
    window.addEventListener('resize', reposition, { passive: true });
    document.addEventListener('click', outsideClick, true);
    portal._cleanup = () => {
      window.removeEventListener('scroll', reposition);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('click', outsideClick, true);
    };
  };

  const close = () => {
    if (isPortal) closePortal();
    else closeInline();
    switcher.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    isOpen = false;
  };

  trigger.addEventListener('pointerenter', gtLoadTlib, { once: true });
  trigger.addEventListener('focusin', gtLoadTlib, { once: true });
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    isOpen ? close() : open();
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && !isOpen) {
      event.preventDefault();
      open();
      window.setTimeout(() => focusOption(getOptionsRoot(), 0), 0);
    }
  });

  switcher.addEventListener('language-switcher-close', () => {
    close();
    trigger.focus();
  });

  if (!isPortal) {
    switcher.querySelector('.lang-switcher__dropdown')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-lang]');
      if (!button) return;
      selectLanguage(button.dataset.lang);
      closeInline();
    });
  }

  // Idioma salvo: ativa o Google de forma assíncrona uma única vez por página
  // (várias instâncias não disparam trocas repetidas).
  const savedCode = readGoogleTranslateCode();
  if (!savedLanguageRestoreStarted && savedCode && savedCode !== GT_SOURCE_LANGUAGE && GT_TO_UI[savedCode]) {
    savedLanguageRestoreStarted = true;
    gtLoadTlib();
    doGTranslate(`${GT_SOURCE_LANGUAGE}|${savedCode}`, showGooglePermissionNotice);
  }

  return switcher;
}
