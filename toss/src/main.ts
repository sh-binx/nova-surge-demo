import * as ait from '@apps-in-toss/web-framework'
import { TossPlatform, type TossSdk } from './platform'
import { tr, installDomTranslation } from './i18n/translate'
import './fonts'
import { installMeshopt } from './meshopt'

/**
 * 앱인토스 부트 — 게임 스크립트는 __NS_DEFER 로 멈춰 있다. 번역 설치 → 플랫폼 init(safe area · 유저 키 ·
 * Storage 하이드레이션 · 가로 고정 · 뒤로가기 · 광고 프리로드, 단계별 2.5초 상한) → window.__NS_PF 주입 → __NS_GO().
 *
 * 시험 주입점: Playwright 가 addInitScript 로 `window.__TOSS_SDK__`(this-엄격 mock)를 넣으면 실제 SDK 대신 쓴다.
 * 토스 웹뷰에는 외부 스크립트 주입 수단이 없으므로 운영 영향은 없다(주입 없으면 항상 실제 SDK).
 */
declare global {
  interface Window { __TOSS_SDK__?: TossSdk; __NS_PF?: TossPlatform; __NS_GO?: () => void; __toss?: unknown; __bootT?: number }
}

async function boot() {
  const t0 = performance.now()
  installDomTranslation()
  installMeshopt()
  const sdk: TossSdk = window.__TOSS_SDK__ ?? ait
  const pf = new TossPlatform(sdk, tr)
  try { await pf.init() } catch (e) { console.warn('[toss] init 실패 — 폴백 진행', e) }
  window.__NS_PF = pf
  window.__toss = { state: () => pf.debugState(), platform: pf }
  if (typeof window.__NS_GO === 'function') window.__NS_GO()
  else console.error('[toss] 게임 부트 훅(__NS_GO)이 없다 — slice/index.html 의 NS_BOOT 마커 확인')
  window.__bootT = Math.round(performance.now() - t0)
}
void boot()
