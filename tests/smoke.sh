#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

npm run lint
npm test -- --run
npm run build

# O componente pode conhecer apenas o contrato do Google Translate. Qualquer
# navegação por rota, query string, post ou filtro de conteúdo é uma regressão.
if grep -RIn --include='*.ts' --include='*.tsx' --exclude='*.test.ts' --exclude='*.test.tsx' \
  -E 'useNavigate|navigate\(|URLSearchParams|filterPosts|postId|window\.location\.(reload|assign|replace|search|pathname)' \
  src; then
  echo 'Regressão: o Language Switcher contém lógica de rota, post ou filtro de conteúdo.' >&2
  exit 1
fi

grep -q 'googtrans' src/googleTranslate.ts
grep -q 'goog-te-combo' src/googleTranslate.ts
grep -q 'componentLanguageSwitcherGoogleTranslateInit' src/googleTranslate.ts
grep -q 'gt_translate_script' src/googleTranslate.ts
grep -q 'options.length' src/googleTranslate.ts
test "$(grep -c 'dispatchEvent(new Event' src/googleTranslate.ts)" -ge 2
grep -q 'aria-haspopup="listbox"' src/LanguageSwitcher.tsx
grep -q 'role="listbox"' src/LanguageSwitcher.tsx
grep -q 'ls-permission-notice' src/LanguageSwitcher.tsx
grep -q 'support.brave.com' src/LanguageSwitcher.tsx
grep -q 'role="alert"' src/LanguageSwitcher.tsx
grep -q 'notranslate' src/LanguageSwitcher.tsx
grep -q 'translate="no"' src/LanguageSwitcher.tsx
grep -q 'notifyLanguageApplied' src/LanguageSwitcher.tsx
grep -q 'resolveTargetId' src/LanguageSwitcher.tsx

# Versão vanilla (backup da implementação em produção).
bash vanilla/tests/smoke.sh

echo 'Smoke test do Language Switcher passou.'
