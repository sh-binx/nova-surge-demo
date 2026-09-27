/**
 * 앱인토스 설정의 단일 소스 — apps-in-toss.config.ts(빌드)와 런타임(platform.ts)이 함께 읽는다.
 */

/** appName — 콘솔에 생성된 영구값(2026-09-27). 절대 변경 금지: 배포 도메인·산출물 이름(nova-surge.ait)이 여기서 나온다. */
export const TOSS_APP_NAME = 'nova-surge'

/** 브랜드 대표색 — 게임의 시안 액센트(#35e6ff). */
export const TOSS_PRIMARY_COLOR = '#35E6FF'

/**
 * 광고 그룹 ID. 기본값은 앱인토스 공식 테스트 ID — 로컬·QR 테스트에서 운영 ID를 쓰면 제재 대상이다.
 * TODO(owner): 콘솔에서 운영 광고 그룹(전면형·보상형)을 만든 뒤 **출시 번들을 빌드할 때만** env 로 주입한다.
 *   VITE_TOSS_AD_INTERSTITIAL_ID=<전면형 광고 그룹 ID> VITE_TOSS_AD_REWARDED_ID=<보상형 광고 그룹 ID> npm run build:toss
 *   (또는 toss/.env.production.local — gitignore 대상)
 */
export const TOSS_TEST_AD_GROUP = {
  interstitial: 'ait-ad-test-interstitial-id',
  rewarded: 'ait-ad-test-rewarded-id',
} as const

const envId = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

export function tossAdGroupIds(): { interstitial: string; rewarded: string } {
  const prod = import.meta.env.PROD === true // dev 서버에선 env 가 있어도 테스트 ID 고정
  return {
    interstitial: (prod && envId(import.meta.env.VITE_TOSS_AD_INTERSTITIAL_ID)) || TOSS_TEST_AD_GROUP.interstitial,
    rewarded: (prod && envId(import.meta.env.VITE_TOSS_AD_REWARDED_ID)) || TOSS_TEST_AD_GROUP.rewarded,
  }
}

/** 전면형 광고 최소 간격(부트 시점부터 계산 — 첫 판 직후엔 뜨지 않는다). */
export const INTERSTITIAL_COOLDOWN_MS = 180_000
/** 전면형 광고 사전 고지 시간. */
export const AD_NOTICE_MS = 1200
/**
 * 게임 내비게이션 바(더보기 · X) 자리 — 우상단 코너를 이만큼 비운다(px). 문서에 수치가 없어 보수적 추정치:
 * 실기기 QR 테스트에서 확인 대상(TODO(owner) 체크리스트).
 */
export const NAV_RESERVE_PX = 52
/** 부트 대기(각 SDK 호출) 상한 — 첫 화면 10초 기준 안에서 로컬 폴백으로 넘어간다. */
export const BOOT_STEP_TIMEOUT_MS = 2500
