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
  await expect.poll(async () => (await st(page)).kills, { timeout: 20_000 }).toBeGreaterThan(0) // 개전 소강(1.8s) 뒤 첫 격추
  await page.waitForTimeout(4000)
  const s1 = await st(page)
  console.log(`[run] t=${s1.t}s: kills ${s1.kills} · fps ${s1.fps} · hp ${s1.hp}`)
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
  // 시작 60초 전에는 광고를 제안하지 않는다(2026-11-26 UI 1차) — 기본 픽만 주고 바로 전투로
  await page.evaluate(() => (window as any).__test.grab())
  while (await page.locator('#modal.on').count()) { await page.locator('#cards .card').first().click(); await page.waitForTimeout(80) }
  await expect(page.locator('#reward')).not.toHaveClass(/on/)
  await page.evaluate(() => (window as any).__test.setT(61))
  await page.evaluate(() => (window as any).__test.grab())
  while (await page.locator('#modal.on').count()) { await page.locator('#cards .card').first().click(); await page.waitForTimeout(80) }
  await expect(page.locator('#reward')).toHaveClass(/on/)
  { // 거절 버튼은 광고 버튼과 같은 크기
    const [ad, skip] = await page.locator('#rwAd,#rwCont').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [r.width, r.height] }))
    expect(Math.abs(ad![0]! - skip![0]!)).toBeLessThan(1); expect(Math.abs(ad![1]! - skip![1]!)).toBeLessThan(1)
  }
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
  expect((await mock(page, 'window.__mock.scores')) as string[]).toHaveLength(0) // 개발 검수 점수는 게임센터에 제출하지 않음
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
  await page.waitForFunction(()=>(window as any).__hangar.state().ready);
  await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
  await page.screenshot({path:'/tmp/nova-toss-hangar.png'});
  console.log('[hangar]',await page.locator('.hwrap').boundingBox());
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
    const s: string[] = ['◆ WAVE 1', '◆ WAVE 17', 'stay sharp', 'BOSS — stand your ground', 'GRAZE', 'safe', 'AEGIS SHIELDS DOWN', 'WINGMAN DOWN — VIPER ENRAGED', 'GATEKEEPER — FINAL PHASE', 'WARDEN — OVERLOAD', 'DREAD CROWN — FRENZY', 'MONARCH — MIRAGE', 'HIVE MOTHER — BROOD FRENZY', 'MINELAYER — BROADSIDE',
      '✦ REPAIR', '✦ MAGNET', '✦ BOMB', '✦ BARRIER', '✦ SECOND WIND', 'CRIT', 'BLOCK',
      'CHAFF wings — both flanks', 'SCOUT line & WEAVER', 'SPLITTER & BOMBER', 'WEAVER — evasive fliers', 'SPLITTER — splits on death', 'LANCER pincer attack', 'high-density swarm', 'TURRET emplacements', 'CRAB flankers', 'WORM chains', 'LAMPREY — curving shots',
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
  await page.evaluate(() => (window as any).__die())
  await page.click('#reviveAd') // 광고 불가 환경 — 안내 후 보상 없음
  await expect(page.locator('#aitToast')).toHaveText('이 환경에서는 광고를 볼 수 없어요')
  expect((await st(page)).ST).toBe('over')
  expect(errs.filter(e => e.startsWith('pageerror'))).toEqual([])
})

test('가로 결과 화면은 모든 보상 버튼이 보여도 겹치지 않는다', async ({ page }) => {
  await open(page)
  await page.click('#playBtn')
  await page.evaluate(() => (window as any).__test.setT(19.6))
  await expect.poll(async () => (await st(page)).salvRun).toBeGreaterThan(0)
  await page.evaluate(() => (window as any).__die())
  await expect(page.locator('#over')).not.toHaveClass(/off/)
  await expect(page.locator('#salvAd')).toBeVisible()
  await koScan(page,'최종 결과')
  const boxes = await page.locator('#over h1,#overStats,#reviveAd,#salvAd,#retryBtn,#hgBtn2,#lbBtn2').evaluateAll(els => els.map(el=>{const r=el.getBoundingClientRect();return {id:el.id||'heading',x:r.x,y:r.y,right:r.right,bottom:r.bottom}}))
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i]!,b=boxes[j]!
    expect(a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y,`${a.id} / ${b.id} 겹침`).toBe(false)
  }
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())))})
  await page.screenshot({path:'/tmp/nova-toss-results.png'})
  for (const width of [667, 740, 932]) {
    await page.setViewportSize({width,height:375})
    const layout=await page.evaluate(()=>{
      const stats=document.querySelector('#overStats')!.getBoundingClientRect()
      const btns=['reviveAd','salvAd','retryBtn'].map(id=>document.getElementById(id)!.getBoundingClientRect())
      const half=['hgBtn2','lbBtn2'].map(id=>document.getElementById(id)!.getBoundingClientRect())
      return {gap:Math.min(...btns.map(r=>r.left))-stats.right,widths:btns.map(r=>r.width),bottom:Math.max(stats.bottom,...btns.map(r=>r.bottom),...half.map(r=>r.bottom)),height:innerHeight,
        halfSpan:half[1]!.right-half[0]!.left,halfH:Math.min(...half.map(r=>r.height)),full:btns[2]!.width}
    })
    expect(Math.abs(layout.halfSpan-layout.full)).toBeLessThan(1) // 기체 강화 · 랭킹 두 칸이 주 버튼 폭과 맞는다
    expect(layout.halfH).toBeGreaterThanOrEqual(44)
    expect(layout.gap).toBeGreaterThanOrEqual(36)
    expect(Math.max(...layout.widths)-Math.min(...layout.widths)).toBeLessThan(1)
    expect(layout.bottom).toBeLessThanOrEqual(layout.height-21)
    await page.screenshot({path:`/tmp/nova-toss-results-${width}.png`})
  }


})

test('전체 한글 화면 가로 폭별 시각 검수 자료', async ({ page }) => {
  await open(page)
  async function capture(name: string) {
    for (const width of [667,844,932]) {
      await page.setViewportSize({width,height:390})
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())))})
      await koScan(page,`${name}-${width}`)
      await page.screenshot({path:`/tmp/nova-audit-${name}-${width}.png`})
    }
  }
  await capture('start')
  await page.click('#hangarBtn')
  await page.waitForFunction(()=>(window as any).__hangar.state().ready)
  await capture('hangar')
  await page.click('#hBack')
  await page.click('#playBtn')
  await page.click('#pauseBtn')
  await capture('pause')
  await page.click('#resumeBtn')
  await page.evaluate(()=>(window as any).__test.addXP())
  await expect(page.locator('#modal')).toHaveClass(/on/)
  await capture('growth')
})

// WKWebView의 회전 완료 뒤 window.resize 통지가 누락되어도 실제 표시 영역을 채워야 한다.
test('세로 진입 뒤 resize 통지 누락 · 가로 전장 전체 폭과 렌더 버퍼 복구', async ({ page }) => {
  await page.setViewportSize({width:390,height:844})
  await page.addInitScript(() => {
    window.addEventListener('resize', e => e.stopImmediatePropagation(), true)
  })
  const { errs } = await open(page)
  await page.setViewportSize({width:844,height:390})
  await expect.poll(() => page.evaluate(() => {
    const c=document.querySelector<HTMLCanvasElement>('#c')!
    const r=c.getBoundingClientRect()
    return {width:r.width,height:r.height,bufferW:c.width,bufferH:c.height}
  })).toEqual({width:844,height:390,bufferW:1688,bufferH:780})
  await page.click('#playBtn')
  await expect(page.locator('#pauseBtn')).toBeVisible()
  await page.screenshot({path:'/tmp/nova-toss-rotation-recovery.png'})
  expect(errs).toEqual([])
})

test('3차-A — 초반 사수 등장 · 웨이브 특집 편대 · 방어선 표시 · 보스전 누수 절반 · 난이도별 탄속·피해', async ({ page }) => {
  const { errs } = await open(page)
  await page.click('#playBtn')
  const T = () => page.evaluate(() => (window as any).__test)
  await T()
  // 15초 안에 사수가 한 번은 나온다(격추돼도 기록되도록 스폰을 센다)
  const seen = await page.evaluate(() => { const w = window as any; w.__ai(3); let seen = false
    for (let i = 0; i < 30 && !seen; i++) { w.__fast(0.5, 25); seen = w.__test.foeTypes().includes('scout')
      const b = document.querySelector('#modal button') as HTMLElement | null; if (b && w.__slice.state.ST === 'levelup') b.click() }
    return { seen, t: w.__fast(0).t } })
  expect(seen.seen, `사수 등장(${seen.t}초)`).toBe(true); expect(seen.t).toBeLessThanOrEqual(15)
  // 웨이브 특집: 3 = 사수 횡대, 8 = 크랩 2 + 방패병
  const feat = await page.evaluate(() => { const w = window as any, c = (t: string) => w.__test.foeTypes().filter((x: string) => x === t).length
    const s0 = c('scout'); w.__test.feature(3); const s1 = c('scout'); w.__test.feature(8)
    return { scouts: s1 - s0, crab: c('crab'), shielded: c('shielded') } })
  expect(feat.scouts).toBeGreaterThanOrEqual(2); expect(feat.crab).toBe(2); expect(feat.shielded).toBeGreaterThanOrEqual(1)
  // 방어선: 플레이 중 항상 보이고, 적이 선에 다가오면 밝아진다
  await page.waitForTimeout(400)
  const idle = await page.evaluate(() => (window as any).__test.lineOp())
  expect(idle).toBeGreaterThan(0.1)
  // 난이도 계수
  const diff = await page.evaluate(() => (window as any).__test.diffK())
  expect(diff.eb).toBe(1); expect(diff.ed).toBe(1)
  // 보스전 중 놓친 적 피해는 평소의 절반
  const leak = await page.evaluate(() => (window as any).__test.leakDmg())
  expect(leak.boss).toBeLessThanOrEqual(Math.ceil(leak.normal / 2)); expect(leak.normal).toBeGreaterThan(0)
  expect(errs, errs.join(' | ')).toHaveLength(0)
})

test('3차-B — 카드 재뽑기 · 필드 아이템 4종 · 방어막 · 진화 · 불사조 · 한국어', async ({ page }) => {
  const { errs } = await open(page)
  await page.click('#playBtn')
  const T = <R>(fn: string) => page.evaluate(fn) as Promise<R>
  // 카드 3장 + 재뽑기 2회
  await T('__test.offerNow()')
  await expect(page.locator('#cards .card')).toHaveCount(3)
  await expect(page.locator('#rerollBtn')).toHaveText('다시 뽑기 · 2회 남음')
  expect(await T<number>("(()=>{const s=new Set(__test.cardIcons());return s.size})()"), '카드 아이콘이 서로 다름').toBe(await T<number>('__test.cardIcons().length'))
  await koScan(page, '강화 카드')
  await page.click('#rerollBtn'); await page.click('#rerollBtn')
  await expect(page.locator('#rerollBtn')).toBeDisabled()
  await expect(page.locator('#cards .card')).toHaveCount(3)
  await page.locator('#cards .card').first().click()
  expect((await st(page)).ST).toBe('play')
  // 방어막 아이템 → 피격 1회 무효
  const px = async () => (await page.evaluate(() => (window as any).__snap())).px as number
  await page.evaluate(x => (window as any).__test.drop('barrier', x, 4.2), await px())
  await expect.poll(() => T<any>('__test.b3().barrier')).toBe(1)
  const hp0 = await T<number>('__test.hp()')
  await T('__test.hurtNow(30)')
  expect(await T<number>('__test.hp()')).toBe(hp0); expect(await T<number>('__test.b3().barrier')).toBe(0)
  // 수리 아이템
  await T('__test.setHp(40)')
  await page.evaluate(x => (window as any).__test.drop('heal', x, 4.2), await px())
  await expect.poll(() => T<number>('__test.hp()')).toBeGreaterThanOrEqual(64)
  // 폭탄: 적탄 소거 + 화면 안 적 피해
  await T("(()=>{for(let i=0;i<6;i++)__test.spawnAt('drone',-5+i*2,-8)})()")
  const n0 = await T<number>('__test.foeCount()')
  await page.evaluate(x => (window as any).__test.drop('bomb', x, 4.2), await px())
  await expect.poll(() => T<number>('__test.foeCount()')).toBeLessThan(n0 - 3)
  // 자석
  await page.evaluate(x => (window as any).__test.drop('magnet', x, 4.2), await px())
  await expect.poll(() => T<boolean>('__test.b3().mag')).toBe(true)
  // 진화: PULSE 6 + 속사 3 → 벌컨 스톰
  await T("(()=>{__test.setWeapon('pulse',6);__test.setWeapon('rapid',3);__test.evoCheck()})()")
  expect(await T<string[]>('__test.b3().evo')).toContain('vulcan')
  // 불사조: 치명 피해를 한 번 버틴다
  await T('(()=>{__test.setPhoenix();__test.hurtNow(9999)})()')
  const s2 = await st(page); expect(s2.ST).toBe('play'); expect(s2.hp).toBeGreaterThan(0)
  // 그 뒤의 치명 피해는 격추(도중에 주운 방어막이 한 번 막을 수 있어 최대 3번까지 가한다)
  for (let i = 0; i < 3 && (await st(page)).ST === 'play'; i++) await T('__test.hurtNow(9999)')
  expect((await st(page)).ST).toBe('over'); expect(await T<number>('__test.b3().phoenix')).toBe(2)
  expect(errs, errs.join(' | ')).toHaveLength(0)
})

test('3차-C — 보스 5종 2단계 전환 · 단계별 탄 패턴 · 페이지 에러 0', async ({ page }) => {
  const { errs } = await open(page)
  await page.click('#playBtn')
  const T = <R>(fn: string) => page.evaluate(fn) as Promise<R>
  await T('__ai(3)')
  for (const type of ['warden', 'elite', 'monarch', 'hive', 'minelayer']) {
    await T(`(()=>{__test.setHp(9999);__test.spawnBoss('${type}')})()`)
    // 입장 → 호버까지 고속 진행(강화 창이 뜨면 닫는다)
    const adv = (secs: number) => page.evaluate(secs => { const w = window as any; let left = secs
      while (left > 0) { w.__test.setHp(9999); const r = w.__fast(Math.min(.5, left), 25); left -= .5
        if (r.ST === 'levelup') (document.querySelector('#cards .card') as HTMLElement).click()
        else if (r.ST === 'reward') (document.getElementById('rwCont') as HTMLElement).click() } }, secs)
    await adv(6)
    const b1 = await T<any>('__test.boss()')
    expect(b1, type + ' 생존').not.toBeNull(); expect(b1.p2 === 0 || b1.hp <= b1.max * .5, type + ' 체력 절반 전에는 1단계').toBe(true) // 자동 조종 화력이 6초 안에 절반을 깎는 경우는 허용
    await T('__test.bossHp(.45)')
    let b2: any = null // 돌진·점멸 중인 보스는 다음 대기 단계에서 전환한다(최대 5초)
    for (let i = 0; i < 10; i++) { await adv(.5); b2 = await T<any>('__test.boss()'); if (b2 && b2.p2) break }
    expect(b2 && b2.p2, type + ' 2단계 전환').toBe(1)
    let maxEb = 0 // 2단계에서 탄을 쏘는지: 8초 동안 0.5초마다 본 최댓값(연사 사이 빈 순간에 걸리지 않게)
    for (let i = 0; i < 16; i++) { await adv(.5); maxEb = Math.max(maxEb, await T<number>('__test.ebCount()')) }
    expect(maxEb, type + ' 2단계 탄').toBeGreaterThan(0)
  }
  expect(errs, errs.join(' | ')).toHaveLength(0)
})
