// 앱인토스 SDK this-엄격 mock — Playwright addInitScript 로 주입(window.__TOSS_SDK__).
// 모든 메서드는 소유 객체에 바인딩된 점 호출이 아니면 throw 한다(메서드를 떼어 부르는 버그를 잡는다 — 2026-09-27 교훈).
// 제어: window.__mock.adMode = 'reward' | 'skip' | 'fail' | 'noload' · __mock.back() · __mock.calls · __mock.store
;(() => {
  const cfg = Object.assign({ adMode: 'reward', insets: { top: 0, left: 47, right: 47, bottom: 21 }, loadMs: 150, adMs: 400 }, window.__MOCK_CFG__ || {})
  const calls = []
  const STORE_KEY = '__mockTossStorage'
  const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} } }
  const writeStore = o => localStorage.setItem(STORE_KEY, JSON.stringify(o))
  const strict = (owner, name, fn) => {
    const f = function (...args) {
      if (this !== owner()) { violations.push(name); throw new TypeError(`[mock] ${name} 가 소유 객체 없이 호출됨(this=${this === undefined ? 'undefined' : typeof this})`) }
      calls.push({ name, args: JSON.parse(JSON.stringify(args, (k, v) => typeof v === 'function' ? '[fn]' : v)) })
      return fn.apply(this, args)
    }
    return f
  }
  const violations = []
  const supported = (fnOwner, fn, on = true) => { fn.isSupported = function () { if (this !== fnOwner()) { violations.push('isSupported'); throw new TypeError('[mock] isSupported this 불일치') } return on }; return fn }

  const back = []
  const sdk = {}
  const S = () => sdk
  sdk.loadFullScreenAd = supported(() => sdk.loadFullScreenAd, strict(S, 'loadFullScreenAd', ({ options, onEvent, onError }) => {
    let dead = false
    if (cfg.adMode === 'noload') return () => { dead = true }
    setTimeout(() => { if (!dead) onEvent({ type: 'loaded' }) }, cfg.loadMs)
    return () => { dead = true }
  }))
  sdk.showFullScreenAd = supported(() => sdk.showFullScreenAd, strict(S, 'showFullScreenAd', ({ options, onEvent, onError }) => {
    const mode = window.__mock.adMode
    window.__mock.adShows.push({ id: options.adGroupId, mode, t: Date.now() })
    window.__mock.adVisible = true
    const seq = mode === 'fail' ? [['failedToShow', 50]]
      : [['requested', 20], ['show', 40], ['impression', 60], ...(mode === 'reward' ? [['userEarnedReward', cfg.adMs - 50]] : []), ['dismissed', cfg.adMs]]
    for (const [type, ms] of seq) setTimeout(() => {
      if (type === 'dismissed' || type === 'failedToShow') window.__mock.adVisible = false
      onEvent(type === 'userEarnedReward' ? { type, data: { unitType: 'reward', unitAmount: 1 } } : { type })
    }, ms)
    return () => {}
  }))
  sdk.Storage = {}
  const St = () => sdk.Storage
  sdk.Storage.getItem = strict(St, 'Storage.getItem', async k => { const o = readStore(); return k in o ? o[k] : null })
  sdk.Storage.setItem = strict(St, 'Storage.setItem', async (k, v) => { const o = readStore(); o[k] = String(v); writeStore(o) })
  sdk.Storage.removeItem = strict(St, 'Storage.removeItem', async k => { const o = readStore(); delete o[k]; writeStore(o) })
  sdk.Storage.clearItems = strict(St, 'Storage.clearItems', async () => writeStore({}))
  sdk.User = {}
  sdk.User.getAnonymousKey = supported(() => sdk.User.getAnonymousKey, strict(() => sdk.User, 'User.getAnonymousKey', async () => ({ type: 'HASH', hash: 'mockUserHash01' })))
  sdk.SafeArea = {}
  sdk.SafeArea.get = strict(() => sdk.SafeArea, 'SafeArea.get', () => ({ ...cfg.insets }))
  sdk.SafeArea.subscribe = strict(() => sdk.SafeArea, 'SafeArea.subscribe', () => () => {})
  sdk.graniteEvent = {}
  sdk.graniteEvent.addEventListener = strict(() => sdk.graniteEvent, 'graniteEvent.addEventListener', (ev, h) => { if (ev === 'backEvent') back.push(h); return () => {} })
  sdk.Screen = {}
  sdk.Screen.setOrientation = supported(() => sdk.Screen.setOrientation, strict(() => sdk.Screen, 'Screen.setOrientation', async o => { window.__mock.orientation = o.type }))
  sdk.Screen.close = strict(() => sdk.Screen, 'Screen.close', async () => { window.__mock.closed = true })
  sdk.Game = {}
  sdk.Game.setLeaderboardScore = supported(() => sdk.Game.setLeaderboardScore, strict(() => sdk.Game, 'Game.setLeaderboardScore', async p => { window.__mock.scores.push(p.score); return { statusCode: 'SUCCESS' } }))
  sdk.Game.openLeaderboard = supported(() => sdk.Game.openLeaderboard, strict(() => sdk.Game, 'Game.openLeaderboard', async () => { window.__mock.lbOpened++ }))
  sdk.Device = {}
  sdk.Device.triggerHaptic = strict(() => sdk.Device, 'Device.triggerHaptic', async () => { window.__mock.haptics++ })

  window.__TOSS_SDK__ = sdk
  window.__mock = {
    adMode: cfg.adMode, adShows: [], adVisible: false, calls, scores: [], lbOpened: 0, haptics: 0, closed: false, orientation: null,
    back: () => back.forEach(h => h.onEvent()),
    store: readStore,
    violations,
  }
})()
