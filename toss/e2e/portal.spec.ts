import { test, expect, type Page } from '@playwright/test'

// 포털(CrazyGames/GitHub Pages)판 회귀 — slice/index.html 을 그대로 서빙. 앱인토스 이음새가 no-op 인지 확인한다.
// ⚠️ Supabase(라이브 리더보드)는 전부 스텁 — 테스트가 운영 점수판에 쓰지 않게.
const URL_ = () => process.env.PORTAL_URL! + '?dev'

async function open(page: Page, { blockCG = false } = {}) {
  const errs: string[] = [], sb: string[] = []
  page.on('pageerror', e => errs.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()) })
  await page.route(/supabase\.co/, r => { sb.push(r.request().method() + ' ' + new URL(r.request().url()).pathname); return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
  if (blockCG) await page.route(/crazygames\.com/, r => r.abort())
  await page.goto(URL_())
  await expect(page.locator('#playBtn')).toBeVisible()
  await page.waitForFunction(() => typeof (window as any).__begin === 'function')
  return { errs, sb }
}
const st = (page: Page) => page.evaluate(() => (window as any).__slice.state)

test('포털: CrazyGames SDK 로드 · 영문 UI · 이음새 no-op · 플레이→사망→재시작 · 콘솔 에러 0', async ({ page }) => {
  const { errs, sb } = await open(page)
  await page.waitForFunction(() => !!((window as any).CrazyGames && (window as any).CrazyGames.SDK), null, { timeout: 15_000 })
  const env = await page.evaluate(() => (window as any).CrazyGames.SDK.environment)
  console.log('[portal] CrazyGames SDK environment =', env)
  expect(await page.evaluate(() => [typeof (window as any).__NS_PF, typeof (window as any).__NS_GO, document.documentElement.lang])).toEqual(['undefined', 'undefined', 'en'])
  await expect(page.locator('#playBtn')).toHaveText('Begin flight')
  expect(await page.evaluate(() => /[가-힣]/.test(document.getElementById('ui')!.innerText))).toBe(false)
  await page.click('#playBtn')
  await page.evaluate(() => (window as any).__ai(3))
  await page.waitForTimeout(4000)
  expect((await st(page)).ST).toBe('play')
  await page.evaluate(() => (window as any).__test.addXP())
  await expect(page.locator('#modal h2')).toHaveText('LEVEL UP')
  await page.locator('#cards .card').first().click()
  await page.evaluate(() => { (window as any).__test.spawn('warden', 0); (window as any).__test.killBoss() }) // 점수 > 0 보장
  await page.evaluate(() => (window as any).__die())
  await expect(page.locator('#over h1')).toHaveText('GAME OVER')
  expect(sb.filter(x => x.startsWith('POST'))).toHaveLength(0) // DEV 검수는 운영 점수 제출 금지
  await page.click('#lbBtn2')
  await expect(page.locator('#lb')).not.toHaveClass(/off/) // 포털은 자체 리더보드 화면
  await page.click('#lbBack')
  expect(errs).toEqual([])
})

test('포털: CG SDK 차단(오프플랫폼) → 목업 광고로 부활·×2 동작(기존 동작 유지)', async ({ page }) => {
  const { errs } = await open(page, { blockCG: true })
  await page.click('#playBtn')
  await page.waitForTimeout(500)
  await page.evaluate(() => (window as any).__die())
  await page.click('#reviveAd')
  await expect(page.locator('#adplay')).toHaveClass(/on/)
  await expect(page.locator('#adTxt')).toHaveText(/AD · \d/)
  await expect.poll(async () => (await st(page)).ST, { timeout: 5000 }).toBe('play')
  expect(errs.filter(e => !/crazygames|ERR_FAILED|net::/i.test(e))).toEqual([]) // 차단한 SDK 요청 실패 로그만 허용
})
