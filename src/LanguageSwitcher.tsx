import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import brFlag from './assets/flags/br.svg'
import ptFlag from './assets/flags/pt.svg'
import gbFlag from './assets/flags/gb.svg'
import esFlag from './assets/flags/es.svg'
import frFlag from './assets/flags/fr.svg'
import itFlag from './assets/flags/it.svg'
import cnFlag from './assets/flags/cn.svg'
import jpFlag from './assets/flags/jp.svg'
import {
  applyGoogleTranslateLanguage,
  ensureGoogleTranslate,
  GOOGLE_TRANSLATE_DEFAULTS,
  readGoogleTranslateLanguage,
  writeGoogleTranslateLanguage,
  clearGoogleTranslateLanguage,
} from './googleTranslate'

export interface LanguageOption {
  code: string
  label: string
  flag: string
}

export interface LanguageSwitcherProps {
  /** The language used by the host page and Google Translate's source language. */
  pageLanguage?: string
  /** Comma-separated Google Translate language codes. */
  includedLanguages?: string
  /** Let the component load Google's script, or let the host page manage it. */
  loadGoogleTranslate?: boolean
  /** Public script URL, useful for a proxy or a pinned host integration. */
  googleTranslateScriptUrl?: string
  /** Stable target ID for hosts that initialize Google Translate themselves. */
  translateTargetId?: string
  /** Initial label shown before Google's cookie becomes available. */
  defaultLanguage?: string
  /** Optional class name for the host layout. */
  className?: string
  /** Optional callback after the Google Translate request is dispatched. */
  onLanguageChange?: (languageCode: string) => void
  /** Language list override; codes are passed through to Google Translate only. */
  languages?: LanguageOption[]
}

export const DEFAULT_LANGUAGES: LanguageOption[] = [
  { code: 'pt', label: 'Português BR', flag: brFlag },
  { code: 'pt-PT', label: 'Português PT', flag: ptFlag },
  { code: 'en', label: 'English', flag: gbFlag },
  { code: 'es', label: 'Español', flag: esFlag },
  { code: 'fr', label: 'Français', flag: frFlag },
  { code: 'it', label: 'Italiano', flag: itFlag },
  { code: 'zh-CN', label: '中文', flag: cnFlag },
  { code: 'ja', label: '日本語', flag: jpFlag },
]

/*
 * Estado compartilhado entre instâncias na mesma página (header, drawer...).
 * Fica em memória do módulo: não é evento global nem estado de conteúdo.
 */
type LanguageListener = (languageCode: string) => void
const languageListeners = new Set<LanguageListener>()
let sharedTargetId: string | null = null

function notifyLanguageApplied(languageCode: string): void {
  languageListeners.forEach((listener) => listener(languageCode))
}

/**
 * Sem `translateTargetId`, a primeira instância montada é dona do alvo do
 * Google; as demais reutilizam esse alvo. Assim o widget (e a restauração do
 * idioma salvo no cookie) acontece uma única vez por página.
 */
function resolveTargetId(ownTargetId: string, hostTargetId?: string): string {
  if (hostTargetId) return hostTargetId
  if (sharedTargetId && typeof document !== 'undefined' && document.getElementById(sharedTargetId)) {
    return sharedTargetId
  }
  sharedTargetId = ownTargetId
  return ownTargetId
}

const FLAG_STYLE = {
  width: '20px',
  height: '14px',
  objectFit: 'cover' as const,
  borderRadius: '2px',
  flexShrink: 0,
  display: 'block',
}

export default function LanguageSwitcher({
  pageLanguage = GOOGLE_TRANSLATE_DEFAULTS.pageLanguage,
  includedLanguages = GOOGLE_TRANSLATE_DEFAULTS.includedLanguages,
  loadGoogleTranslate = true,
  googleTranslateScriptUrl = GOOGLE_TRANSLATE_DEFAULTS.scriptUrl,
  translateTargetId,
  defaultLanguage = 'pt',
  className = '',
  onLanguageChange,
  languages = DEFAULT_LANGUAGES,
}: LanguageSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [currentCode, setCurrentCode] = useState(() => readGoogleTranslateLanguage(defaultLanguage))
  const [permissionNotice, setPermissionNotice] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listId = useId().replace(/:/g, '')
  const ownTargetId = translateTargetId || `${listId}-google-translate-target`
  const current = languages.find((language) => language.code === currentCode) ||
    languages.find((language) => language.code === defaultLanguage) ||
    languages[0]

  useEffect(() => {
    const code = readGoogleTranslateLanguage(defaultLanguage)
    if (languages.some((language) => language.code === code)) setCurrentCode(code)
  }, [defaultLanguage, languages])

  useEffect(() => {
    const listener: LanguageListener = (code) => {
      if (languages.some((language) => language.code === code)) setCurrentCode(code)
    }
    languageListeners.add(listener)
    return () => { languageListeners.delete(listener) }
  }, [languages])

  useEffect(() => {
    if (!loadGoogleTranslate) return
    void ensureGoogleTranslate({
      targetId: resolveTargetId(ownTargetId, translateTargetId),
      pageLanguage,
      includedLanguages,
      scriptUrl: googleTranslateScriptUrl,
    })
  }, [googleTranslateScriptUrl, includedLanguages, loadGoogleTranslate, ownTargetId, pageLanguage, translateTargetId])

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const focusOption = useCallback((index: number) => {
    const normalizedIndex = (index + languages.length) % languages.length
    optionRefs.current[normalizedIndex]?.focus()
  }, [languages.length])

  const select = useCallback((language: LanguageOption) => {
    const previousCode = currentCode
    const targetId = resolveTargetId(ownTargetId, translateTargetId)
    setOpen(false)
    setPermissionNotice(false)

    const rollback = () => {
      if (previousCode === defaultLanguage) clearGoogleTranslateLanguage()
      else writeGoogleTranslateLanguage(previousCode)
      setCurrentCode(previousCode)
      setPermissionNotice(true)
    }

    const applySelection = () => {
      const applied = applyGoogleTranslateLanguage(language.code, targetId)
      if (applied) {
        writeGoogleTranslateLanguage(language.code)
        setCurrentCode(language.code)
        setPermissionNotice(false)
        notifyLanguageApplied(language.code)
        onLanguageChange?.(language.code)
      }
      return applied
    }

    if (applySelection()) return

    if (loadGoogleTranslate) {
      void ensureGoogleTranslate({
        targetId,
        pageLanguage,
        includedLanguages,
        scriptUrl: googleTranslateScriptUrl,
      }).then((ready) => {
        if (!ready || !applySelection()) rollback()
      })
      return
    }

    rollback()
  }, [currentCode, defaultLanguage, googleTranslateScriptUrl, includedLanguages, loadGoogleTranslate, onLanguageChange, ownTargetId, pageLanguage, translateTargetId])

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
      window.setTimeout(() => focusOption(Math.max(0, languages.findIndex((language) => language.code === currentCode))), 0)
    }
  }

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption(index + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusOption(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusOption(languages.length - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      rootRef.current?.querySelector<HTMLButtonElement>('.ls-trigger')?.focus()
    }
  }

  if (!current) return null

  return (
    <div
      ref={rootRef}
      className={`ls-root notranslate ${className}`.trim()}
      translate="no"
      aria-label="Seletor de idioma"
    >
      <button
        type="button"
        className="ls-trigger"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
      >
        <span className="ls-label">{current.label}</span>
        <img src={current.flag} alt="" style={FLAG_STYLE} />
        <svg
          className={`ls-chevron${open ? ' ls-chevron--open' : ''}`}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <path d="M1.5 3.5L5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div id={listId} className="ls-dropdown" role="listbox" aria-label="Idiomas disponíveis">
          {languages.map((language, index) => {
            const selected = current.code === language.code
            return (
              <button
                key={language.code}
                ref={(element) => { optionRefs.current[index] = element }}
                type="button"
                className={`ls-option${selected ? ' ls-option--active' : ''}`}
                onClick={() => select(language)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                role="option"
                aria-selected={selected}
              >
                <img src={language.flag} alt="" style={FLAG_STYLE} />
                <span className="ls-option-label">{language.label}</span>
                {selected && (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="ls-check" aria-hidden="true">
                    <path d="M1.5 5.5l2.8 2.8 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div id={ownTargetId} className="ls-google-translate-target" aria-hidden="true" />

      {permissionNotice && (
        <aside className="ls-permission-notice" role="alert" aria-live="assertive">
          <div className="ls-permission-notice__content">
            <strong className="ls-permission-notice__title">Google Tradutor bloqueado</strong>
            <p className="ls-permission-notice__message">
              No Brave, clique no ícone do leão (Shields) ao lado da barra de endereço e permita este site. Se necessário, permita JavaScript e cookies ou desative o Shields somente para este site; depois, recarregue a página.
            </p>
            <a
              className="ls-permission-notice__help"
              href="https://support.brave.com/hc/en-us/articles/360023646212-How-do-I-configure-global-and-site-specific-Shields-settings"
              target="_blank"
              rel="noopener noreferrer"
            >
              Como ajustar o Shields no Brave
            </a>
          </div>
          <button
            type="button"
            className="ls-permission-notice__close"
            aria-label="Fechar aviso do Google Tradutor"
            onClick={() => setPermissionNotice(false)}
          >
            ×
          </button>
        </aside>
      )}
    </div>
  )
}
