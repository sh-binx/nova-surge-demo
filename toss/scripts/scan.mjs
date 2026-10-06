// 번들 정적 스캔 — dist/ 에 금지 패턴이 있으면 실패(exit 1). 앱인토스 보안 체크리스트 + 오너 결정(외부 네트워크 0) 기준.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnv } from 'vite'

// 채널 명시 필수: test = dev·e2e·QR 번들(테스트 광고 ID 만) · release = 출시 번들(.env.release 의 운영 ID 만).
const CHANNEL = process.argv[process.argv.indexOf('--channel') + 1]
if (!process.argv.includes('--channel') || !['test', 'release'].includes(CHANNEL)) {
  console.error('[scan] 사용법: node scripts/scan.mjs --channel test|release'); process.exit(2)
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const TEST_IDS = ['ait-ad-test-interstitial-id', 'ait-ad-test-rewarded-id']
const live = loadEnv('release', ROOT, 'VITE_TOSS_AD_')
const LIVE_IDS = [live.VITE_TOSS_AD_INTERSTITIAL_ID, live.VITE_TOSS_AD_REWARDED_ID]
const files = []
;(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p) } })(DIST)

const FORBID = [
  [/crazygames/i, 'CrazyGames SDK/URL'],
  [/supabase/i, 'Supabase'],
  [/poki/i, 'Poki'],
  [/\beval\s*\(/, 'eval('],
  [/new\s+Function\s*\(/, 'new Function('],
  [/<iframe/i, 'iframe'],
  [/location\.(replace|assign)\s*\(/, 'location.replace/assign'],
  [/location\.href\s*=/, 'location.href='],
  [/window\.open\s*\(/, 'window.open('],
  [/ait-ad-test-(?!interstitial-id|rewarded-id)/, '알 수 없는 광고 ID'],
]
if (CHANNEL === 'test') FORBID.push([/ait\.v2\.live\./, '운영 광고 ID(테스트 번들)'])
else FORBID.push([/ait-ad-test-/, '테스트 광고 ID(출시 번들)'], [new RegExp(`ait\\.v2\\.live\\.(?!${LIVE_IDS.map(i => i.slice(12)).join('|')})`), '.env.release 에 없는 운영 ID'])
let bad = 0
const hosts = new Map()
const need = new Set(CHANNEL === 'test' ? TEST_IDS : LIVE_IDS)
for (const f of files) {
  if (!['.html', '.js', '.css', '.json'].includes(extname(f))) continue
  const s = readFileSync(f, 'utf8')
  for (const id of need) if (s.includes(id)) need.delete(id)
  for (const [re, label] of FORBID) {
    const m = s.match(re)
    if (m) { bad++; console.error(`✗ ${label} — ${f.slice(DIST.length + 1)} @${m.index}: …${s.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}…`) }
  }
  for (const m of s.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.set(m[1], (hosts.get(m[1]) || 0) + 1)
}
const size = files.reduce((a, f) => a + statSync(f).size, 0)
console.log(`[scan] 파일 ${files.length}개 · ${(size / 1e6).toFixed(2)}MB`)
console.log('[scan] 문자열로 등장하는 URL 호스트(주석·네임스페이스 포함, 호출 아님):', Object.fromEntries(hosts))
for (const id of need) { bad++; console.error(`✗ ${CHANNEL} 번들에 광고 ID 가 없다: ${id}`) }
if (bad) { console.error(`[scan] 실패 ${bad}건`); process.exit(1) }
console.log('[scan] 통과 — crazygames/supabase/poki/eval/new Function/iframe/외부 이동 0건')
console.log(`[scan] 광고 채널 ${CHANNEL} — ${(CHANNEL === 'test' ? TEST_IDS : LIVE_IDS).join(' · ')} 만 포함`)
