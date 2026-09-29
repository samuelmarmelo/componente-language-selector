// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LanguageSwitcher from './LanguageSwitcher'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  root = null
  container?.remove()
  container = null
  document.body.innerHTML = ''
  document.cookie = 'googtrans=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
})

describe('LanguageSwitcher', () => {
  it('renders an isolated accessible Google Translate enabler', () => {
    const markup = renderMarkup()

    expect(markup).toContain('aria-haspopup="listbox"')
    expect(markup).toContain('aria-controls="')
    expect(markup).toContain('ls-google-translate-target')
    expect(markup).toContain('apogeo-google-translate')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toMatch(/post|filter|navigate|URLSearchParams/i)
  })

  it('does not show an unapplied language when the Google combo is absent', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <LanguageSwitcher
          loadGoogleTranslate={false}
          translateTargetId="missing-google-target"
        />,
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>('.ls-trigger')
    act(() => trigger?.click())
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>('.ls-option'))
      .find((button) => button.textContent?.includes('English'))
    expect(option).not.toBeUndefined()

    act(() => option?.click())

    expect(trigger?.textContent).toContain('Português BR')
    expect(document.cookie).not.toContain('googtrans=%2Fpt%2Fen')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.textContent).toContain('Brave')
    expect(container.querySelector<HTMLAnchorElement>('a[href*="support.brave.com"]')).not.toBeNull()
  })

  it('changes only the Google combo when a user selects a language', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <LanguageSwitcher
          loadGoogleTranslate={false}
          translateTargetId="test-google-target"
        />,
      )
    })

    const target = document.getElementById('test-google-target')
    expect(target).not.toBeNull()
    target?.insertAdjacentHTML(
      'beforeend',
      '<select class="goog-te-combo"><option value="pt">Português</option><option value="en">English</option></select>',
    )
    const combo = target?.querySelector<HTMLSelectElement>('.goog-te-combo')
    const change = vi.fn()
    combo?.addEventListener('change', change)

    const trigger = container.querySelector<HTMLButtonElement>('.ls-trigger')
    expect(trigger).not.toBeNull()
    act(() => trigger?.click())
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>('.ls-option'))
      .find((button) => button.textContent?.includes('English'))
    expect(option).not.toBeUndefined()

    act(() => option?.click())

    expect(combo?.value).toBe('en')
    expect(change).toHaveBeenCalledTimes(2)
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('')
    expect(document.cookie).toContain('googtrans=%2Fpt%2Fen')
  })
})

function renderMarkup() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  act(() => {
    root?.render(
      <LanguageSwitcher
        loadGoogleTranslate={false}
        translateTargetId="apogeo-google-translate"
      />,
    )
  })

  return container.innerHTML
}

describe('LanguageSwitcher com várias instâncias', () => {
  afterEach(() => {
    delete (window as Window & { google?: unknown }).google
    delete (window as Window & { componentLanguageSwitcherGoogleTranslateInit?: unknown }).componentLanguageSwitcherGoogleTranslateInit
    delete (window as Window & { gt_translate_script?: unknown }).gt_translate_script
  })

  it('marca a raiz como notranslate para o Google não traduzir os nomes dos idiomas', () => {
    renderMarkup()
    const rootElement = container?.querySelector('.ls-root')
    expect(rootElement?.classList.contains('notranslate')).toBe(true)
    expect(rootElement?.getAttribute('translate')).toBe('no')
  })

  it('sincroniza o rótulo de todas as instâncias após uma troca confirmada', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <>
          <div className="header"><LanguageSwitcher loadGoogleTranslate={false} translateTargetId="shared-target" /></div>
          <div className="drawer"><LanguageSwitcher loadGoogleTranslate={false} translateTargetId="shared-target" /></div>
        </>,
      )
    })

    document.getElementById('shared-target')?.insertAdjacentHTML(
      'beforeend',
      '<select class="goog-te-combo"><option value="pt">Português</option><option value="es">Español</option></select>',
    )

    const header = container.querySelector('.header') as HTMLElement
    const drawer = container.querySelector('.drawer') as HTMLElement
    act(() => header.querySelector<HTMLButtonElement>('.ls-trigger')?.click())
    const spanish = Array.from(header.querySelectorAll<HTMLButtonElement>('.ls-option'))
      .find((button) => button.textContent?.includes('Español'))
    act(() => spanish?.click())

    expect(header.querySelector('.ls-trigger')?.textContent).toContain('Español')
    expect(drawer.querySelector('.ls-trigger')?.textContent).toContain('Español')
  })

  it('inicializa o Google uma única vez por página e todas as instâncias usam o mesmo alvo', async () => {
    const constructor = vi.fn(function (_options: unknown, targetId: string) {
      document.getElementById(targetId)?.insertAdjacentHTML(
        'beforeend',
        '<select class="goog-te-combo"><option value="pt">Português</option><option value="en">English</option></select>',
      )
    })
    ;(window as Window & { google?: unknown }).google = { translate: { TranslateElement: constructor } }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <>
          <div className="header"><LanguageSwitcher /></div>
          <div className="drawer"><LanguageSwitcher /></div>
        </>,
      )
    })

    expect(constructor).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('.goog-te-combo')).toHaveLength(1)
    expect(document.querySelectorAll('script[src*="translate.google.com"]')).toHaveLength(1)

    const drawer = container.querySelector('.drawer') as HTMLElement
    act(() => drawer.querySelector<HTMLButtonElement>('.ls-trigger')?.click())
    const english = Array.from(drawer.querySelectorAll<HTMLButtonElement>('.ls-option'))
      .find((button) => button.textContent?.includes('English'))
    act(() => english?.click())

    expect(document.querySelector<HTMLSelectElement>('.goog-te-combo')?.value).toBe('en')
    expect(container.querySelector('.header .ls-trigger')?.textContent).toContain('English')
    expect(drawer.querySelector('[role="alert"]')).toBeNull()
  })
})
