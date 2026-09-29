#!/usr/bin/env bash
# Smoke test da versão vanilla (adaptado de tests/smoke-language-switcher.sh do site).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# `! grep` não interrompe o script sob `set -e`; use forbid para proibir padrões.
forbid() {
  if grep -qF "$1" "$2"; then
    echo "Regressão: '$1' não pode aparecer em $2." >&2
    exit 1
  fi
}

JS=vanilla/language-switcher.js
BOOT=vanilla/google-translate-bootstrap.js

node --check "$JS"
node --check "$BOOT"
npm run test:vanilla

# O idioma da interface nunca pode ser um estado de conteúdo.
if grep -In -E 'lang-change|sn_lang|localStorage\.(getItem|setItem)|URLSearchParams|filterPosts|window\.location\.(reload|assign|replace|search|pathname)|\.lang[[:space:]]*(!==|===|!=|==)' "$JS"; then
  echo 'Regressão: lógica de idioma controla estado de conteúdo ou navegação.' >&2
  exit 1
fi

# Correção 2026-09: nada de esperar a classe translated-* no <body>.
forbid "includes('translated-')" "$JS"
forbid 'MutationObserver' "$JS"

grep -q 'googtrans' "$JS"
grep -q 'goog-te-combo' "$JS"
grep -q 'gt_translate_script' "$JS"
grep -q 'gtInitialization' "$JS"
test "$(grep -c 'element.dispatchEvent(new Event' "$JS")" -ge 1
test "$(grep -c '^[[:space:]]*dispatch();' "$JS")" -eq 2
grep -q 'data-language-switcher="google-translate"' "$JS"
grep -q 'notranslate' "$JS"
grep -q "setAttribute('translate', 'no')" "$JS"
grep -q 'syncAllTriggers' "$JS"
grep -q 'savedLanguageRestoreStarted' "$JS"
grep -q "addEventListener('pointerenter', gtLoadTlib" "$JS"
grep -q 'aria-haspopup="listbox"' "$JS"
grep -q 'data-lang-permission-notice' "$JS"
grep -q 'support.brave.com' "$JS"
forbid 'includedLanguages' "$JS"

grep -q 'window.googleTranslateElementInit2' "$BOOT"
forbid 'new window.google.translate.TranslateElement' "$BOOT"
forbid 'translate.google.com' "$BOOT"

for flag in br us es fr it cn jp; do
  test -s "vanilla/flags/$flag.svg"
done

echo 'Smoke test da versão vanilla passou.'
