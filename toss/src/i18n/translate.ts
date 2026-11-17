/**
 * 표시 계층 번역 — 게임 소스(slice/index.html)는 영문 그대로 두고, 화면에 나가는 순간에만 한국어로 바꾼다.
 *  · DOM: MutationObserver 가 텍스트 노드 생성/변경을 잡아 치환(마이크로태스크 → 페인트 전이라 영문 깜빡임 없음)
 *  · 캔버스(배너·데미지 숫자): 게임의 T() 훅이 tr() 를 부른다
 */
import ko from './ko.json'

type Dict = { exact: Record<string, string>; patterns: [string, string][] }

export function makeTranslator(d: Dict) {
  const exact = new Map(Object.entries(d.exact).filter(([k]) => k !== '_comment'))
  const pats = d.patterns.map(([re, to]) => [new RegExp(re), to] as const)
  const cache = new Map<string, string>()

  function core(s: string): string {
    const hit = exact.get(s)
    if (hit !== undefined) return hit
    for (const [re, to] of pats) {
      const m = s.match(re)
      if (!m) continue
      return to.replace(/([$§])(\d)/g, (_, kind: string, i: string) => {
        const g = m[+i] ?? ''
        return kind === '§' ? tr(g) : g
      })
    }
    return s
  }

  function tr(s: string): string {
    if (!s || !/[A-Za-z]/.test(s)) return s
    const c = cache.get(s)
    if (c !== undefined) return c
    let out = core(s)
    if (out === s) {
      // 앞뒤 공백을 보존한 채 본문만 매칭(인라인 텍스트 노드 " · Balance ◆ 3" 류)
      const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/)
      if (m && (m[1] || m[3])) { const inner = core(m[2]!); if (inner !== m[2]) out = m[1] + inner + m[3] }
    }
    if (cache.size < 4000) cache.set(s, out)
    return out
  }
  return tr
}

export const tr = makeTranslator(ko as unknown as Dict)

/** 한 번만 통째로 바꿔야 하는 정적 마크업(텍스트가 <b> 로 쪼개진 안내문 등). */
const STATIC_HTML: [string, string][] = [
  ['#start .hint', '<span>드래그로 좌우 이동 · 자동 사격</span><span>게이지가 차면 <b style="color:#35e6ff">서지</b> 발동</span>'],
]

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { fix(root as Text); return }
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = it.nextNode(); n; n = it.nextNode()) fix(n as Text)
}
function fix(t: Text) {
  const p = t.parentElement
  if (p && (p.tagName === 'SCRIPT' || p.tagName === 'STYLE')) return
  const v = t.data, out = tr(v)
  if (out !== v) t.data = out
}

export function installDomTranslation(root: HTMLElement = document.body) {
  for (const [sel, html] of STATIC_HTML) { const el = document.querySelector(sel); if (el) el.innerHTML = html }
  document.getElementById("pauseBtn")?.setAttribute("aria-label","일시정지")
  document.getElementById("sbtn")?.setAttribute("aria-label","충전된 서지 발동")
  walk(root)
  const mo = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') fix(m.target as Text)
      else m.addedNodes.forEach(walk)
    }
  })
  mo.observe(root, { childList: true, subtree: true, characterData: true })
  return () => mo.disconnect()
}
