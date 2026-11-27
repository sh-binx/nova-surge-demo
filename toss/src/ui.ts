/**
 * 앱인토스 전용 오버레이 — 게임 DOM(#ui) 위에 뜨는 가벼운 레이어. 바텀시트는 쓰지 않는다(게임 체크리스트).
 * 스타일은 toss.css(.ait-*).
 */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (html) e.innerHTML = html
  return e
}

let toastTimer: ReturnType<typeof setTimeout> | null = null
export function showToast(text: string, ms = 2400): void {
  let t = document.getElementById('aitToast')
  if (!t) { t = el('div', 'ait-toast'); t.id = 'aitToast'; document.body.appendChild(t) }
  t.textContent = text
  t.classList.add('on')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t!.classList.remove('on'), ms)
}

/** 전면형 광고 사전 고지 — 예고 없이 광고가 뜨지 않게 ms 동안 보여 준 뒤 resolve. */
export function showAdNotice(ms: number): Promise<void> {
  return new Promise(resolve => {
    const n = el('div', 'ait-notice', '<div class="ait-card"><b>잠시 후 광고가 재생돼요</b><span>광고가 끝나면 바로 다음 판이 시작돼요</span></div>')
    n.id = 'aitAdNotice'
    document.body.appendChild(n)
    setTimeout(() => { n.remove(); resolve() }, ms)
  })
}

export interface ConfirmHandle { open: boolean; close(): void }

/** 종료 확인 모달(가운데 카드 — 바텀시트 아님). 뒤로가기를 한 번 더 누르면 계속하기. */
export function showExitConfirm(onExit: () => void, onStay: () => void): ConfirmHandle {
  const m = el('div', 'ait-modal', `<div class="ait-card" role="dialog" aria-modal="true" aria-labelledby="aitExitT">
    <b id="aitExitT">게임을 종료할까요?</b><span>진행 중인 판은 저장되지 않아요. 보유 자원과 기체 강화는 유지돼요.</span>
    <div class="ait-row"><button type="button" class="ait-btn ghost" data-a="stay">계속하기</button><button type="button" class="ait-btn" data-a="exit">종료하기</button></div></div>`)
  m.id = 'aitExit'
  const h: ConfirmHandle = {
    open: true,
    close() { if (!h.open) return; h.open = false; m.remove(); onStay() },
  }
  m.addEventListener('click', e => {
    const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a')
    if (a === 'stay') h.close()
    else if (a === 'exit') { h.open = false; m.remove(); onExit() }
  })
  document.body.appendChild(m)
  return h
}

const ICON_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.6 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
const ICON_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'

const ICON_MUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V6l10-2v11.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="2.5" fill="currentColor"/><circle cx="16.5" cy="15.5" r="2.5" fill="currentColor"/></svg>'
const ICON_MUS_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V6l10-2v11.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="2.5" fill="currentColor"/><circle cx="16.5" cy="15.5" r="2.5" fill="currentColor"/><path d="M3.5 3.5l17 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'

export type SoundKind = 'music' | 'sfx'
/** 음악·효과음을 따로 켜고 끄는 버튼 두 개 — 타이틀·일시정지·결과·기체 화면 좌상단(우상단은 토스 내비게이션 바 자리). */
export function mountSoundToggle(get: (k: SoundKind) => boolean, set: (k: SoundKind, on: boolean) => void): () => void {
  const wrap = el('div', 'ait-snds')
  wrap.id = 'aitSnd'
  const defs: [SoundKind, string, string, string, string][] = [
    ['music', 'aitMus', '음악', ICON_MUS, ICON_MUS_OFF],
    ['sfx', 'aitSfx', '효과음', ICON_ON, ICON_OFF],
  ]
  const paints = defs.map(([k, id, nm, on1, off1]) => {
    const b = el('button', 'ait-snd') as HTMLButtonElement
    b.id = id
    b.type = 'button'
    const paint = () => {
      const on = get(k)
      b.innerHTML = (on ? on1 : off1) + `<span>${nm} ${on ? '켜짐' : '꺼짐'}</span>`
      b.setAttribute('aria-pressed', String(on))
      b.setAttribute('aria-label', `${nm} ${on ? '끄기' : '켜기'}`)
    }
    b.addEventListener('click', e => { e.stopPropagation(); set(k, !get(k)); paint() })
    wrap.appendChild(b)
    paint()
    return paint
  })
  document.getElementById('ui')?.appendChild(wrap)
  return () => paints.forEach(p => p())
}
