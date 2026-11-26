import type * as Ait from '@apps-in-toss/web-framework'
import {
  tossAdGroupIds, INTERSTITIAL_COOLDOWN_MS, AD_NOTICE_MS, NAV_RESERVE_PX, BOOT_STEP_TIMEOUT_MS,
} from './config'
import { showToast, showAdNotice, showExitConfirm, mountSoundToggle, type ConfirmHandle } from './ui'

/**
 * 플랫폼이 쓰는 SDK 표면 — `@apps-in-toss/web-framework` 3.5.0 의 실제 export 타입에서 뽑는다.
 * (문서의 submitGameCenterLeaderBoardScore / openGameCenterLeaderboard / getUserKeyForGame 은 3.x 타입 정의상
 *  `Game.setLeaderboardScore` / `Game.openLeaderboard` / `User.getAnonymousKey` 의 @deprecated 별칭이다 — 같은 구현.)
 *
 * 호출 규칙: SDK 메서드는 **항상 소유 객체에 바인딩된 점 호출**로만 부른다(`this.sdk.Storage.getItem(k)`).
 * 메서드를 변수로 떼어 부르지 않는다 — 테스트 mock 도 this 를 검사한다.
 */
export type TossSdk = Pick<typeof Ait,
  'loadFullScreenAd' | 'showFullScreenAd' | 'Storage' | 'User' | 'SafeArea' | 'graniteEvent' | 'Screen' | 'Game' | 'Device'>

/** 게임(slice/index.html)이 PF.attach 로 넘겨주는 훅. */
export interface GameHooks {
  AU: { ac: AudioContext | null; muted: boolean; sysMuted: boolean }
  state(): string
  pause(): void
  resume(): void
  isPaused(): boolean
}

type Insets = { top: number; bottom: number; left: number; right: number }

/** 영구 저장 키 — 게임 메타(샐비지·기체·강화·난이도) · 최고 점수 · 이름 · 사운드 설정. */
export const PERSIST_KEYS = ['ns2_meta', 'ns2_best', 'ns2_name', 'ns2_snd'] as const
const OWNER_KEY = 'ns2_toss_owner' // localStorage 미러의 주인(유저 식별키) — 같은 기기에서 토스 계정이 바뀌면 미러를 비운다

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

/** 광고 그룹 1개의 load → loaded → show → 재로드 수명주기(그룹당 동시에 1개만 미리 로드). */
class AdSlot {
  state: 'idle' | 'loading' | 'loaded' = 'idle'
  private unsub: (() => void) | null = null
  private retries = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly RETRY_MS = [5_000, 15_000, 45_000]

  constructor(private readonly sdk: TossSdk, readonly adGroupId: string, private readonly supported: () => boolean) {}

  load(): void {
    if (this.state !== 'idle' || !this.supported()) return
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null }
    this.state = 'loading'
    try {
      const u = this.sdk.loadFullScreenAd({
        options: { adGroupId: this.adGroupId },
        onEvent: e => { if (e.type === 'loaded' && this.state === 'loading') { this.state = 'loaded'; this.retries = 0 } },
        onError: err => {
          console.warn('[toss] 광고 로드 실패', this.adGroupId, err)
          this.release(); this.state = 'idle'; this.retry()
        },
      })
      if ((this.state as AdSlot['state']) === 'idle') { try { u?.() } catch { /* no-op */ } }
      else this.unsub = typeof u === 'function' ? u : null
    } catch (e) {
      console.warn('[toss] 광고 로드 호출 실패', e)
      this.state = 'idle'; this.retry()
    }
  }
  consumeAndReload(): void { this.release(); this.state = 'idle'; this.load() }
  private release() { const u = this.unsub; this.unsub = null; try { u?.() } catch { /* no-op */ } }
  private retry() {
    if (this.retries >= AdSlot.RETRY_MS.length) return
    const wait = AdSlot.RETRY_MS[this.retries++]!
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.load() }, wait)
  }
}

/**
 * 앱인토스 플랫폼 — 게임 소스가 `window.__NS_PF` 로 받는 객체. 모든 메서드는 실패해도 게임을 멈추지 않는다
 * (브리지가 없는 일반 브라우저에서는 SDK 가 throw → localStorage · 광고 없음으로 강등).
 */
export class TossPlatform {
  t: (s: string) => string
  private game: GameHooks | null = null
  private userKey = 'anon'
  private storageOk = false
  private readonly chains = new Map<string, Promise<void>>()
  private readonly persisted = new Map<string, string | null>()
  private readonly ads: { interstitial: AdSlot; rewarded: AdSlot }
  private lastInterstitialAt: number
  private adShowing = false
  private exitModal: ConfirmHandle | null = null
  private exiting = false
  private readonly holds = new Set<string>()
  private hapticAt = 0
  private insets: Insets = { top: 0, bottom: 0, left: 0, right: 0 }
  private soundOn = true
  private repaintSound: (() => void) | null = null

  constructor(private readonly sdk: TossSdk, translate: (s: string) => string, private readonly opts: {
    now?: () => number; noticeMs?: number; stepTimeoutMs?: number; cooldownMs?: number
  } = {}) {
    this.t = translate
    const ids = tossAdGroupIds()
    const ok = () => this.adsSupported()
    this.ads = { interstitial: new AdSlot(sdk, ids.interstitial, ok), rewarded: new AdSlot(sdk, ids.rewarded, ok) }
    this.lastInterstitialAt = this.now() // 부트 직후 전면형 금지 — 첫 전면형은 부트 후 쿨다운 경과 뒤
  }
  private now() { return (this.opts.now ?? Date.now)() }
  private get stepMs() { return this.opts.stepTimeoutMs ?? BOOT_STEP_TIMEOUT_MS }

  // ── 부트(게임 시작 전) ───────────────────────────────────────────────────────────────
  async init(): Promise<void> {
    this.applyInsets(this.readInsets())
    try { this.sdk.SafeArea.subscribe({ onEvent: i => this.applyInsets(i) }) } catch (e) { console.warn('[toss] SafeArea.subscribe 실패', e) }

    const orient = (async () => {
      try {
        if (this.sdk.Screen.setOrientation.isSupported()) await withTimeout(this.sdk.Screen.setOrientation({ type: 'landscape' }), this.stepMs)
      } catch (e) { console.warn('[toss] 가로 고정 실패 — 무시', e) }
    })()

    try {
      const r = await withTimeout(this.sdk.User.getAnonymousKey(), this.stepMs)
      if (r && r.type === 'HASH' && r.hash) this.userKey = r.hash
    } catch (e) { console.warn('[toss] 유저 식별키 조회 실패 — anon 키로 진행', e) }

    await this.hydrate()
    await orient

    try {
      this.sdk.graniteEvent.addEventListener('backEvent', { onEvent: () => this.onBack(), onError: e => console.warn('[toss] backEvent 오류', e) })
    } catch (e) { console.warn('[toss] backEvent 구독 실패', e) }

    document.addEventListener('visibilitychange', () => { if (document.hidden) this.onBackground(); else this.onForeground() })
    window.addEventListener('pagehide', () => {
      this.onBackground()
      try { if (this.sdk.Screen.setOrientation.isSupported()) void this.sdk.Screen.setOrientation({ type: 'portrait' }).catch(() => {}) } catch { /* no-op */ }
    })
    window.addEventListener('pageshow', () => { if (!document.hidden) this.onForeground() })

    this.ads.interstitial.load()
    this.ads.rewarded.load()
  }

  private scoped(k: string) { return `u:${this.userKey}:${k}` }

  private async hydrate(): Promise<void> {
    let values: (string | null)[]
    try {
      values = await withTimeout(Promise.all(PERSIST_KEYS.map(k => this.sdk.Storage.getItem(this.scoped(k)))), this.stepMs)
    } catch (e) { console.warn('[toss] Storage 하이드레이션 실패 — localStorage 폴백', e); this.readSoundPref(); return }
    this.storageOk = true
    try {
      const owner = localStorage.getItem(OWNER_KEY)
      if (owner !== null && owner !== this.userKey) for (const k of PERSIST_KEYS) localStorage.removeItem(k)
      localStorage.setItem(OWNER_KEY, this.userKey)
      PERSIST_KEYS.forEach((k, i) => {
        const remote = values[i] ?? null
        if (remote !== null) { localStorage.setItem(k, remote); this.persisted.set(k, remote) }
        else {
          this.persisted.set(k, null)
          const local = localStorage.getItem(k)
          if (local !== null) this.persist(k, local) // 미러에만 있는 기록은 위로 이관
        }
      })
    } catch (e) { console.warn('[toss] 미러 동기화 실패', e) }
    this.readSoundPref()
  }

  /** 게임 pSet() 이 localStorage 에 쓴 뒤 부른다 — 토스 Storage 로 비동기 write-through(키별 직렬, 마지막 쓰기 승리). */
  persist(k: string, v: string | null): void {
    if (!this.storageOk || !(PERSIST_KEYS as readonly string[]).includes(k)) return
    if (this.persisted.get(k) === v) return
    this.persisted.set(k, v)
    const key = this.scoped(k)
    const next = (this.chains.get(k) ?? Promise.resolve()).then(async () => {
      try {
        if (v === null) await this.sdk.Storage.removeItem(key)
        else await this.sdk.Storage.setItem(key, v)
      } catch (e) { console.warn('[toss] Storage 쓰기 실패', k, e); this.persisted.delete(k) }
    })
    this.chains.set(k, next)
  }
  async flushAll(ms = 1500): Promise<void> {
    try { await withTimeout(Promise.all([...this.chains.values()]).then(() => {}), ms) } catch { /* 종료 우선 */ }
  }

  // ── 게임 연결 ────────────────────────────────────────────────────────────────────────
  attach(g: GameHooks): void {
    this.game = g
    this.applySound()
    this.repaintSound = mountSoundToggle(() => this.soundOn, on => this.setSound(on))
    this.applyAudio()
  }

  private readSoundPref() {
    try { this.soundOn = localStorage.getItem('ns2_snd') !== '0' } catch { this.soundOn = true }
  }
  setSound(on: boolean): void {
    this.soundOn = on
    try { localStorage.setItem('ns2_snd', on ? '1' : '0') } catch { /* no-op */ }
    this.persist('ns2_snd', on ? '1' : '0')
    this.applySound()
    this.repaintSound?.()
  }
  private applySound() { if (this.game) this.game.AU.sysMuted = !this.soundOn }

  /** 오디오 홀드(백그라운드·광고·종료 모달) — 하나라도 있으면 AudioContext 를 즉시 suspend. */
  private hold(r: string) { this.holds.add(r); this.applyAudio() }
  private release(r: string) { this.holds.delete(r); this.applyAudio() }
  private applyAudio() {
    const au = this.game?.AU
    if (!au) return
    const held = this.holds.size > 0
    au.muted = held
    const ac = au.ac
    if (!ac) return
    try {
      if (held && ac.state === 'running') void ac.suspend()
      else if (!held && ac.state !== 'running') void ac.resume().catch(() => {}) // iOS interrupted 포함
    } catch { /* no-op */ }
  }
  audioState() { return { holds: [...this.holds], ctx: this.game?.AU.ac?.state ?? 'none', muted: this.game?.AU.muted, sysMuted: this.game?.AU.sysMuted } }

  // ── 생명주기 ─────────────────────────────────────────────────────────────────────────
  private onBackground() {
    if (this.game && this.game.state() === 'play') this.game.pause() // 돌아왔을 때 갑자기 맞지 않게 일시정지
    this.hold('bg')
  }
  private onForeground() { this.release('bg') }

  private onBack() {
    if (this.adShowing || this.exiting) return
    if (this.exitModal?.open) { this.exitModal.close(); return }
    if (this.game && this.game.state() === 'play') this.game.pause()
    this.hold('exit')
    this.exitModal = showExitConfirm(
      () => { void this.exitApp() },
      () => { this.exitModal = null; this.release('exit') }, // 계속하기 → 일시정지 화면에서 이어서
    )
  }
  private async exitApp() {
    this.exiting = true
    await this.flushAll()
    try { await this.sdk.Screen.close() } catch (e) {
      console.warn('[toss] Screen.close 실패', e)
      this.exiting = false; this.exitModal = null; this.release('exit')
      showToast('지금은 종료할 수 없어요. 상단의 X 버튼으로 닫아 주세요')
    }
  }

  // ── 레이아웃 ─────────────────────────────────────────────────────────────────────────
  private readInsets(): Insets {
    try { const i = this.sdk.SafeArea.get(); if (i && typeof i.top === 'number') return i } catch (e) { console.warn('[toss] SafeArea.get 실패 — 0 인셋', e) }
    return { top: 0, bottom: 0, left: 0, right: 0 }
  }
  private applyInsets(i: Insets) {
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0)
    this.insets = { top: n(i?.top), bottom: n(i?.bottom), left: n(i?.left), right: n(i?.right) }
    const s = document.documentElement.style
    s.setProperty('--sa-t', this.insets.top + 'px')
    s.setProperty('--sa-b', this.insets.bottom + 'px')
    s.setProperty('--sa-l', this.insets.left + 'px')
    s.setProperty('--sa-r', this.insets.right + 'px')
    s.setProperty('--nav', NAV_RESERVE_PX + 'px')
  }

  // ── 광고 ─────────────────────────────────────────────────────────────────────────────
  private adsSupported(): boolean {
    try { return !!this.sdk.loadFullScreenAd.isSupported() && !!this.sdk.showFullScreenAd.isSupported() } catch { return false }
  }

  private showAd(slot: AdSlot, done: (rewarded: boolean) => void): void {
    let finished = false, rewarded = false
    let unsub: (() => void) | null = null
    let watchdog: ReturnType<typeof setTimeout> | null = null
    const arm = (ms: number) => { if (watchdog) clearTimeout(watchdog); watchdog = setTimeout(finish, ms) }
    const finish = () => {
      if (finished) return
      finished = true
      if (watchdog) clearTimeout(watchdog)
      try { unsub?.() } catch { /* no-op */ }
      this.adShowing = false
      this.release('ad')
      slot.consumeAndReload()
      done(rewarded)
    }
    this.adShowing = true
    if (this.game && this.game.state() === 'play') this.game.pause()
    this.hold('ad')
    arm(10_000) // 표시 신호가 10초 안에 없으면 포기 — 게임 재개 우선
    try {
      const u = this.sdk.showFullScreenAd({
        options: { adGroupId: slot.adGroupId },
        onEvent: e => {
          switch (e.type) {
            case 'requested': case 'show': case 'impression': arm(180_000); break
            case 'userEarnedReward': rewarded = true; break // 보상은 이 이벤트로만
            case 'dismissed': case 'failedToShow': finish(); break
            default: break
          }
        },
        onError: err => { console.warn('[toss] 광고 표시 실패', err); finish() },
      })
      if (typeof u === 'function') { if (finished) { try { u() } catch { /* no-op */ } } else unsub = u }
    } catch (e) { console.warn('[toss] showFullScreenAd 호출 실패', e); finish() }
  }

  /** 판과 판 사이(다시 시작) — 사전 고지 → 전면형. 쿨다운·미로드면 광고 없이 바로 진행. */
  midgame(then: () => void): void {
    const slot = this.ads.interstitial, now = this.now()
    if (this.adShowing || now - this.lastInterstitialAt < (this.opts.cooldownMs ?? INTERSTITIAL_COOLDOWN_MS)) { then(); return }
    if (slot.state !== 'loaded') { slot.load(); then(); return } // 실시간 로딩 금지
    this.lastInterstitialAt = now
    void showAdNotice(this.opts.noticeMs ?? AD_NOTICE_MS).then(() => this.showAd(slot, () => then()))
  }

  /** 보상형(부활 · 샐비지 ×2 · 보너스 강화) — userEarnedReward 를 받았을 때만 onReward. */
  rewarded(onReward: () => void, onNope: () => void): void {
    const slot = this.ads.rewarded
    if (this.adShowing) { onNope(); return }
    if (slot.state !== 'loaded') {
      showToast(this.adsSupported() ? '광고를 준비하고 있어요. 잠시 후 다시 눌러 주세요' : '이 환경에서는 광고를 볼 수 없어요')
      slot.load(); onNope(); return
    }
    this.showAd(slot, ok => {
      if (ok) { try { onReward() } catch (e) { console.warn('[toss] 보상 지급 예외', e) } }
      else { showToast('광고를 끝까지 보면 보상을 받을 수 있어요'); onNope() }
    })
  }

  // ── 게임센터 리더보드 · 햅틱 ─────────────────────────────────────────────────────────
  submitScore(score: number): void {
    const s = Math.floor(score)
    if (!Number.isFinite(s) || s <= 0) return
    try {
      if (!this.sdk.Game.setLeaderboardScore.isSupported()) return
      void this.sdk.Game.setLeaderboardScore({ score: String(s) })
        .then(r => { if (r && r.statusCode !== 'SUCCESS') console.warn('[toss] 점수 제출 응답', r.statusCode) })
        .catch(e => console.warn('[toss] 점수 제출 실패', e))
    } catch (e) { console.warn('[toss] 점수 제출 호출 실패', e) }
  }
  openLeaderboard(): void {
    const fail = (e: unknown) => { console.warn('[toss] 리더보드 열기 실패', e); showToast('지금은 랭킹을 열 수 없어요. 잠시 후 다시 시도해 주세요') }
    try {
      if (!this.sdk.Game.openLeaderboard.isSupported()) { showToast('토스 앱을 업데이트하면 랭킹을 볼 수 있어요'); return }
      void this.sdk.Game.openLeaderboard().catch(fail)
    } catch (e) { fail(e) }
  }
  haptic(ms: number): void {
    const now = this.now()
    if (now - this.hapticAt < 120) return // 연타 스로틀
    this.hapticAt = now
    const type = ms >= 60 ? 'basicMedium' : ms >= 30 ? 'tickMedium' : 'tickWeak'
    try { void this.sdk.Device.triggerHaptic({ type }).catch(() => {}) } catch { /* 미지원 */ }
  }

  debugState() {
    return {
      userKey: this.userKey, storageOk: this.storageOk, insets: { ...this.insets },
      ads: { interstitial: this.ads.interstitial.state, rewarded: this.ads.rewarded.state },
      adShowing: this.adShowing, exitModalOpen: !!this.exitModal?.open, sound: this.soundOn, audio: this.audioState(),
    }
  }
}
