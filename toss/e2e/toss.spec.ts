import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// 앱인토스 빌드(dist/) e2e — 폰 가로(844×390, 터치) + this-엄격 SDK mock(e2e/mock-sdk.js) + safe area 인셋 모의.
const MOCK = fileURLToPath(new URL('./mock-sdk.js', import.meta.url))
const URL_ = () => process.env.TOSS_URL! + '?dev'
const INSETS = { top: 0, left: 47, right: 47, bottom: 21 }

type Errs = string[]
async function open(page: Page, opts: { mockCfg?: object; mock?: boolean } = {}): Promise<{ errs: Errs; bootMs: number }> {
  const errs: Errs = []
  page.on('pageerror', e => errs.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()) })
  if (opts.mock !== false) {
    await page.addInitScript(cfg => { (window as any).__MOCK_CFG__ = cfg }, { insets: INSETS, ...(opts.mockCfg ?? {}) })
    await page.addInitScript({ path: MOCK })
  }
  const t0 = Date.now()
  await page.goto(URL_())
  await expect(page.locator('#playBtn')).toBeVisible()
  await page.waitForFunction(() => (window as any).__bootT != null && typeof (window as any).__begin === 'function')
  const bootMs = Date.now() - t0
  return { errs, bootMs }
}
const st = (page: Page) => page.evaluate(() => (window as any).__slice.state)
const pf = (page: Page) => page.evaluate(() => (window as any).__toss.state())
const mock = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>

/** 한국어 스캔: #ui 전체 텍스트 노드(숨김 포함) + 오버레이. 영문 단어 = 실패(브랜드·약어 허용 목록 제외). 보이는 요소 넘침도 검사. */
async function koScan(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const ALLOW = /^(NOVA|SURGE|LV\d*|L\d+|W\d+|HP|XP|[EHN])$/
    const bad: string[] = []
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const p = n.parentElement
      if (!p || p.closest('script,style')) continue
      for (const word of (n.textContent || '').match(/[A-Za-z]{2,}[A-Za-z0-9]*/g) || []) if (!ALLOW.test(word)) bad.push(`${word} ← "${(n.textContent || '').trim().slice(0, 60)}"`)
    }
    const over: string[] = []
    const vw = innerWidth, vh = innerHeight
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('#ui *, .ait-snd, .ait-card *'))) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || !el.offsetParent) continue
      if (!el.childNodes.length || ![...el.childNodes].some(c => c.nodeType === 3 && c.textContent!.trim())) continue
      const rc = el.getBoundingClientRect()
      if (rc.width === 0) continue
      if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'visible') over.push(`넘침 ${el.className || el.id}: ${el.textContent!.trim().slice(0, 30)}`)
      if (rc.right > vw + 1 || rc.left < -1 || rc.bottom > vh + 1) over.push(`화면밖 ${el.className || el.id}: ${el.textContent!.trim().slice(0, 30)}`)
    }
    return { bad: [...new Set(bad)], over }
  })
  expect(r.bad, `${label}: 미번역 영문`).toEqual([])
  expect(r.over, `${label}: 넘침/화면 밖`).toEqual([])
}

/** 토스 내비게이션 바(우상단 더보기·X) 영역에 게임 조작 요소가 없어야 한다. */
async function navZoneClear(page: Page, label: string) {
  const hits = await page.evaluate(() => {
    const zone = { l: innerWidth - 130, t: 0, r: innerWidth, b: 52 }
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, .btn, .play, .hbtn, .dchip, .card, .wchip, #pauseBtn, #sbtn, .pcard, .hnav button, .ait-snd'))) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || !el.offsetParent) continue
      const r = el.getBoundingClientRect()
      if (r.width && r.right > zone.l && r.left < zone.r && r.top < zone.b && r.bottom > zone.t) out.push((el.id || el.className) + ` @${Math.round(r.left)},${Math.round(r.top)}`)
    }
    return out
  })
  expect(hits, `${label}: 우상단 토스 X 영역 침범`).toEqual([])
}

test('부트 · 가로 고정 · 식별키 저장소 · safe area · 첫 화면 10초 이내 · 콘솔 에러 0', async ({ page }) => {
  const { errs, bootMs } = await open(page)
  const s = await pf(page)
  console.log(`[boot] 첫 화면까지 ${bootMs}ms · 플랫폼 init ${await page.evaluate(() => (window as any).__bootT)}ms`)
  expect(bootMs).toBeLessThan(10_000)
  expect(await mock(page, 'window.__mock.orientation')).toBe('landscape')
  expect(s.userKey).toBe('mockUserHash01')
  expect(s.storageOk).toBe(true)
  await expect.poll(async () => (await pf(page)).ads).toEqual({ interstitial: 'loaded', rewarded: 'loaded' }) // 부트 직후 사전 로드
  const ui = await page.locator('#ui').boundingBox()
  expect(ui!.x).toBe(INSETS.left)
  expect(844 - (ui!.x + ui!.width)).toBe(INSETS.right)
  expect(390 - (ui!.y + ui!.height)).toBe(INSETS.bottom)
  await expect(page.locator('.ait-modal, .ait-notice')).toHaveCount(0) // 진입 즉시 모달·바텀시트 없음
  await koScan(page, '타이틀')
  await navZoneClear(page, '타이틀')
  expect(await mock(page, 'window.__mock.violations')).toEqual([])
  expect(errs).toEqual([])
})

test('한 판 플레이 — 레벨업 카드 · 보스 · 크레이트 보너스(보상형) · 사망 · 부활(보상형) · 한국어 스캔', async ({ page }) => {
  const { errs } = await open(page)
  await page.click('#playBtn')
  expect((await st(page)).ST).toBe('play')
  await page.evaluate(() => (window as any).__ai(3))
  await page.waitForTimeout(6000)
  const s1 = await st(page)
  console.log(`[run] 6초: kills ${s1.kills} · fps ${s1.fps} · hp ${s1.hp}`)
  expect(s1.kills).toBeGreaterThan(0)
  await koScan(page, '인게임 HUD'); await navZoneClear(page, '인게임 HUD')

  await page.evaluate(() => (window as any).__test.addXP())
  await expect(page.locator('#modal')).toHaveClass(/on/)
  await expect(page.locator('#modal h2')).toHaveText('레벨 업')
  await koScan(page, '레벨업 카드')
  await page.locator('#cards .card').first().click()
  await expect(page.locator('#modal')).not.toHaveClass(/on/)

  await page.evaluate(() => (window as any).__test.spawn('warden', 0))
  await expect(page.locator('#ebar')).toBeVisible()
  await expect(page.locator('#ebar span')).toHaveText('워든')
  await koScan(page, '보스'); await navZoneClear(page, '보스')
  expect(await page.evaluate(() => (window as any).__test.killBoss())).toBe(true)

  // 크레이트 → 기본 픽 → 보너스 프롬프트 → 보상형(보상 지급)
  await page.evaluate(() => (window as any).__test.grab())
  while (await page.locator('#modal.on').count()) { await page.locator('#cards .card').first().click(); await page.waitForTimeout(80) }
  await expect(page.locator('#reward')).toHaveClass(/on/)
  await koScan(page, '보너스 프롬프트')
  await page.click('#rwAd')
  await expect.poll(() => mock(page, 'window.__mock.adShows.length')).toBe(1)
  expect(await mock(page, 'window.__mock.adShows[0].id')).toBe('ait-ad-test-rewarded-id')
  expect((await pf(page)).audio.holds).toContain('ad') // 광고 중 오디오 정지
  await expect(page.locator('#modal')).toHaveClass(/on/) // 보상 = BONUS 픽
  await expect(page.locator('#modal h2')).toHaveText('보너스')
  expect((await pf(page)).audio.holds).toEqual([])
  await page.locator('#cards .card').first().click()

  // 사망 → 부활(보상형)
  await page.evaluate(() => (window as any).__die())
  await expect(page.locator('#over')).not.toHaveClass(/off/)
  await koScan(page, '게임 오버'); await navZoneClear(page, '게임 오버')
  expect((await mock(page, 'window.__mock.scores')) as string[]).toHaveLength(1) // 게임센터 점수 제출
  await page.click('#reviveAd')
  await expect.poll(async () => (await st(page)).ST).toBe('play')
  const s2 = await st(page)
  expect(s2.hp).toBeGreaterThan(0)
  expect(await mock(page, 'window.__mock.adShows.length')).toBe(2)
  await page.evaluate(() => (window as any).__die())
  await expect(page.locator('#reviveAd')).toBeHidden() // 부활은 판당 1회
  expect(await mock(page, 'window.__mock.violations')).toEqual([])
  expect(errs).toEqual([])
})

test('보상형 — 끝까지 안 보면(skip) · 표시 실패(fail) 보상 없음 · ×2 샐비지는 보상 시에만', async ({ page }) => {
  const { errs } = await open(page)
  await page.click('#playBtn')
  await page.evaluate(() => (window as any).__test.setSalv(0))
  await page.waitForTimeout(500)
  await page.evaluate(() => (window as any).__die())
  await expect(page.locator('#over')).not.toHaveClass(/off/)
  for (const mode of ['skip', 'fail']) {
    await page.evaluate(m => { (window as any).__mock.adMode = m }, mode)
    await page.click('#reviveAd')
    await expect(page.locator('#aitToast')).toHaveText('광고를 끝까지 보면 보상을 받을 수 있어요')
    await page.waitForTimeout(600)
    expect((await st(page)).ST).toBe('over') // 부활 안 됨
    await expect(page.locator('#reviveAd')).toBeVisible()
  }
  // ×2 샐비지: 이번 판 획득분이 있을 때만 버튼 노출 — 획득분을 만들고 다시 사망
  await page.evaluate(() => { (window as any).__mock.adMode = 'reward' })
  await page.click('#reviveAd')
  await expect.poll(async () => (await st(page)).ST).toBe('play')
  await page.evaluate(() => (window as any).__test.setT(19.6)) // 웨이브 경계 직전 → 웨이브 틱으로 salvRun 누적
  await expect.poll(async () => (await st(page)).salvRun).toBeGreaterThan(0)
  await page.evaluate(() => (window as any).__die())
  const before = (await st(page)).metaSalv
  await expect(page.locator('#salvAd')).toBeVisible()
  {
    const earned = await page.evaluate(() => (window as any).__slice.state.metaSalv)
    await page.evaluate(() => { (window as any).__mock.adMode = 'skip' })
    await page.click('#salvAd'); await page.waitForTimeout(700)
    expect((await st(page)).metaSalv).toBe(earned) // 보상 없음
    await page.evaluate(() => { (window as any).__mock.adMode = 'reward' })
    await page.click('#salvAd')
    await expect(page.locator('#salvAd')).toBeHidden()
    expect((await st(page)).metaSalv).toBeGreaterThan(before)
  }
  expect(await mock(page, 'window.__mock.violations')).toEqual([])
  expect(errs).toEqual([])
})

test('전면형 — 부트 후 180초 전엔 없음 · 이후 다시 시작에서 사전 고지 → 광고 → 새 판 · 연속 차단', async ({ page }) => {
  const { errs } = await open(page)
  await page.click('#playBtn'); await page.waitForTimeout(300)
  await page.evaluate(() => (window as any).__die())
  await page.click('#retryBtn')
  await expect.poll(async () => (await st(page)).ST).toBe('play')
  expect(await mock(page, 'window.__mock.adShows.length')).toBe(0) // 쿨다운(부트 기준)
  await page.evaluate(() => { const o = Date.now.bind(Date); Date.now = () => o() + 200_000 }) // 시계 +200초
  await page.evaluate(() => (window as any).__die())
  await page.click('#retryBtn')
  await expect(page.locator('#aitAdNotice')).toBeVisible()
  await expect(page.locator('#aitAdNotice')).toContainText('잠시 후 광고가 재생돼요')
  expect(await mock(page, 'window.__mock.adShows.length')).toBe(0) // 고지 먼저
  await expect.poll(() => mock(page, 'window.__mock.adShows.length')).toBe(1)
  expect(await mock(page, 'window.__mock.adShows[0].id')).toBe('ait-ad-test-interstitial-id')
  await expect.poll(async () => (await st(page)).ST).toBe('play')
  await page.evaluate(() => (window as any).__die())
  await page.click('#retryBtn')
  await expect.poll(async () => (await st(page)).ST).toBe('play')
  expect(await mock(page, 'window.__mock.adShows.length')).toBe(1) // 연속 차단
  expect(errs).toEqual([])
})

test('안드로이드 뒤로가기 → 종료 확인 모달 → 계속 / 종료(Screen.close)', async ({ page }) => {
  const { errs } = await open(page)
  await page.click('#playBtn'); await page.waitForTimeout(500)
  await page.evaluate(() => (window as any).__mock.back())
  await expect(page.locator('#aitExit')).toBeVisible()
  await expect(page.locator('#aitExit')).toContainText('게임을 종료할까요?')
  expect((await st(page)).ST).toBe('pause') // 모달 뒤에서 게임 정지
  await koScan(page, '종료 모달')
  await page.evaluate(() => (window as any).__mock.back()) // 모달 위 뒤로가기 = 계속하기
  await expect(page.locator('#aitExit')).toHaveCount(0)
  expect((await st(page)).ST).toBe('pause')
  await page.evaluate(() => (window as any).__mock.back())
  await page.getByRole('button', { name: '계속하기' }).last().click()
  await expect(page.locator('#aitExit')).toHaveCount(0)
  await page.evaluate(() => (window as any).__mock.back())
  await page.getByRole('button', { name: '종료하기' }).click()
  await expect.poll(() => mock(page, 'window.__mock.closed')).toBe(true)
  expect(errs).toEqual([])
})

test('백그라운드 → 오디오 즉시 정지 · 게임 일시정지 / 복귀 → 재생 · 사운드 토글 저장', async ({ page }) => {
  const { errs } = await open(page)
  await page.click('#playBtn'); await page.waitForTimeout(600)
  expect(await page.evaluate(() => (window as any).__NS_PF && (window as any).__toss.state().audio.ctx)).toBe('running')
  const setHidden = (h: boolean) => page.evaluate(v => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => v })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'hidden' : 'visible') })
    document.dispatchEvent(new Event('visibilitychange'))
  }, h)
  await setHidden(true)
  await expect.poll(async () => (await pf(page)).audio.ctx).toBe('suspended')
  expect((await st(page)).ST).toBe('pause')
  await setHidden(false)
  await expect.poll(async () => (await pf(page)).audio.ctx).toBe('running')

  await page.click('#resumeBtn').catch(() => {})
  await page.click('#pauseBtn')
  await expect(page.locator('#aitSnd')).toBeVisible()
  await koScan(page, '일시정지')
  await page.click('#aitSnd')
  expect((await pf(page)).audio.sysMuted).toBe(true)
  await expect(page.locator('#aitSnd')).toContainText('사운드 꺼짐')
  const store = await mock<Record<string, string>>(page, 'window.__mock.store()')
  expect(store['u:mockUserHash01:ns2_snd']).toBe('0')
  await page.reload()
  await page.waitForFunction(() => (window as any).__bootT != null)
  await expect(page.locator('#aitSnd')).toContainText('사운드 꺼짐')
  expect(errs).toEqual([])
})

test('기록 유지 — 토스 Storage(유저 키 단위)에서 복원 · 계정 바뀌면 미러 비움 · 리더보드 열기', async ({ page }) => {
  const { errs } = await open(page)
  await page.evaluate(() => (window as any).__test.setSalv(12345))
  await expect.poll(async () => JSON.parse((await mock<Record<string, string>>(page, 'window.__mock.store()'))['u:mockUserHash01:ns2_meta'] || '{}').salv).toBe(12345)
  await page.evaluate(() => { for (const k of ['ns2_meta', 'ns2_best', 'ns2_name', 'ns2_snd']) localStorage.removeItem(k) }) // 웹뷰 localStorage 유실 가정
  await page.reload()
  await page.waitForFunction(() => (window as any).__bootT != null)
  await expect(page.locator('#startBalV')).toHaveText('◆ 12,345')
  await page.click('#hangarBtn')
  await koScan(page, '기체 화면 A'); await navZoneClear(page, '기체 화면')
  for (const _ of [1, 2]) { await page.click('#hNext'); await page.waitForTimeout(250); await koScan(page, '기체 화면 B/C') }
  await page.click('#hBack')
  await page.click('#lbBtn')
  expect(await mock(page, 'window.__mock.lbOpened')).toBe(1)
  await expect(page.locator('#lb')).toHaveClass(/off/) // 자체(외부) 리더보드 화면은 쓰지 않는다
  expect(errs).toEqual([])
})

test('캔버스 문구(배너·수치) 번역 — 게임이 만드는 문자열 전수', async ({ page }) => {
  await open(page)
  const res = await page.evaluate(() => {
    const t = (window as any).__NS_PF.t as (s: string) => string
    const boss = ['WARDEN', 'DREAD CROWN', 'MONARCH', 'HIVE MOTHER', 'TWIN VIPERS', 'MINELAYER', 'AEGIS RING', 'GATEKEEPER']
    const zones = ['DEEP SPACE', 'MARS ORBIT', 'ION NEBULA', 'RED GIANT', 'WORMHOLE']
    const W = ['PULSE', 'SPREAD', 'LASER', 'RAIL']
    const evo = ['TWIN STREAM', 'PIERCING ROUNDS', 'WIDE ARC', 'BACK SPREAD', 'CHARGE LANCE', 'CHAIN ARC', 'WIDE BEAM', 'SPLIT BEAM']
    const s: string[] = ['◆ WAVE 1', '◆ WAVE 17', 'stay sharp', 'BOSS — stand your ground', 'GRAZE', 'safe', 'AEGIS SHIELDS DOWN', 'WINGMAN DOWN — VIPER ENRAGED', 'GATEKEEPER — FINAL PHASE',
      'WEAVER — evasive fliers', 'SPLITTER — splits on death', 'LANCER pincer attack', 'high-density swarm', 'TURRET emplacements', 'CRAB flankers', 'WORM chains', 'LAMPREY — curving shots',
      '✦ RAPID FIRE · LV3', '✦ OVERCHARGE · LV2 ×2', '✦ Emergency Repair', '✦ PULSE +1 · LV4', 'Joined fleet — VOID RAY', 'EVOLVE — VULCAN STORM']
    for (const b of boss) s.push('⚠ ' + b, '⚠ ' + b + ' ++', b + ' DOWN')
    for (const z of zones) s.push('▸ ENTERING ' + z)
    for (const w of W) s.push('▸ ' + w + ' · LV3')
    W.forEach((w, i) => s.push('✦ ' + w + ' EVOLVED — ' + evo[i * 2], '✦ ' + w + ' EVOLVED — ' + evo[i * 2 + 1]))
    const ALLOW = /^(NOVA|SURGE|LV\d*|HP)$/
    return s.map(x => [x, t(x)]).filter(([, y]) => (y!.match(/[A-Za-z]{2,}/g) || []).some(w => !ALLOW.test(w)))
  })
  expect(res).toEqual([])
})

test('SDK 없는 일반 브라우저(브리지 부재)에서도 10초 안에 로컬 폴백으로 부팅 · 페이지 에러 0', async ({ page }) => {
  const { errs, bootMs } = await open(page, { mock: false })
  console.log(`[no-bridge boot] ${bootMs}ms`)
  expect(bootMs).toBeLessThan(10_000)
  await page.click('#playBtn')
  await page.waitForTimeout(1500)
  expect((await st(page)).ST).toBe('play')
  expect(errs.filter(e => e.startsWith('pageerror'))).toEqual([])
})
