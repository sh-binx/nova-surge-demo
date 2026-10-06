import { defineConfig } from '@playwright/test'
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'

// 포트 대역 3030–3034(PORTS.md)에서 비어 있는 포트만 쓴다 — 점유 포트는 절대 재사용·종료하지 않는다.
function freePorts(n: number): number[] {
  const out: number[] = []
  for (let p = 3030; p <= 3034 && out.length < n; p++) {
    try { execSync(`lsof -iTCP:${p} -sTCP:LISTEN`, { stdio: 'ignore' }) } catch { out.push(p) }
  }
  if (out.length < n) throw new Error('3030–3034 에 빈 포트가 부족하다')
  return out
}
const [TOSS, PORTAL] = process.env.TOSS_URL && process.env.PORTAL_URL ? [0, 0] : freePorts(2)
// e2e 는 테스트 채널 dist 에서만 — 출시 번들(운영 광고 ID)이 dist 에 있으면 시작하지 않는다.
for (const f of readdirSync(new URL('./dist/assets/', import.meta.url))) {
  if (f.endsWith('.js') && readFileSync(new URL(`./dist/assets/${f}`, import.meta.url), 'utf8').includes('ait.v2.live.'))
    throw new Error('dist 가 출시(release) 번들이다 — `npm run build:toss`(테스트 채널)로 다시 빌드한 뒤 e2e 를 돌린다')
}
const TOSS_URL = process.env.TOSS_URL ?? `http://127.0.0.1:${TOSS}/`
const PORTAL_URL = process.env.PORTAL_URL ?? `http://127.0.0.1:${PORTAL}/slice/`
process.env.TOSS_URL = TOSS_URL
process.env.PORTAL_URL = PORTAL_URL

const gpu = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 2,
  reporter: [['list']],
  use: { launchOptions: { args: process.platform === 'darwin' ? gpu : [] } },
  webServer: process.env.TOSS_URL_EXTERNAL ? [] : [
    { command: `npx vite preview --port ${TOSS}`, url: TOSS_URL, reuseExistingServer: false, timeout: 30_000 },
    { command: `python3 -m http.server ${PORTAL} --bind 127.0.0.1 --directory ..`, url: PORTAL_URL, reuseExistingServer: false, timeout: 30_000 },
  ],
  projects: [
    { name: 'toss', testMatch: /toss\.spec\.ts/, use: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
    { name: 'portal', testMatch: /portal\.spec\.ts/, use: { viewport: { width: 1280, height: 720 } } },
  ],
})
