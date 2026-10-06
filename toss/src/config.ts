/**
 * 앱인토스 설정의 단일 소스 — apps-in-toss.config.ts(빌드)와 런타임(platform.ts)이 함께 읽는다.
 */

/** appName — 콘솔에 생성된 영구값(2026-09-27). 절대 변경 금지: 배포 도메인·산출물 이름(nova-surge.ait)이 여기서 나온다. */
export const TOSS_APP_NAME = 'nova-surge'

/** 브랜드 대표색 — 게임의 시안 액센트(#35e6ff). */
export const TOSS_PRIMARY_COLOR = '#35E6FF'

/**
 * 광고 그룹 ID — **빌드 채널로만** 고른다. 운영 ID 는 출시 산출물(`npm run build:toss:release` = `vite build --mode release`)
 * 에만 들어가고, 값은 `toss/.env.release`(release 모드에서만 Vite 가 읽는 파일)에 있다.
 * dev 서버·e2e·QR 테스트 번들(`npm run build:toss`)은 env 가 무엇이든 앱인토스 공식 테스트 ID 고정 —
 * 운영 ID 로 테스트하면 제재 대상이다. 예전엔 `PROD` 로만 갈라 QR 번들도 `.env.production.local` 의 운영 ID 를
 * 집어 갈 수 있었다(2026-10-06 수정).
 */
export const TOSS_TEST_AD_GROUP = {
  interstitial: 'ait-ad-test-interstitial-id',
  rewarded: 'ait-ad-test-rewarded-id',
} as const

/** 콘솔이 발급한 운영 광고 그룹 ID 형식. */
export const TOSS_LIVE_AD_ID = /^ait\.v2\.live\.[0-9a-f]{16}$/

export type AdChannel = 'release' | 'test'
/** Vite 모드 → 광고 채널. 'release' 만 출시, 나머지(development·production 등)는 전부 테스트. */
export const adChannelOf = (mode: string | undefined): AdChannel => (mode === 'release' ? 'release' : 'test')

export function tossAdGroupIds(): { interstitial: string; rewarded: string } {
  // MODE 를 직접 비교해야 빌드 때 상수로 접혀 반대 채널의 ID 가 번들에서 빠진다(함수 호출이면 둘 다 남는다 — scan 이 잡음).
  // release 빌드는 vite.config.ts 가 두 값이 운영 형식인지 검사한 뒤에만 통과한다.
  return import.meta.env.MODE === 'release'
    ? { interstitial: import.meta.env.VITE_TOSS_AD_INTERSTITIAL_ID!, rewarded: import.meta.env.VITE_TOSS_AD_REWARDED_ID! }
    : { ...TOSS_TEST_AD_GROUP }
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
