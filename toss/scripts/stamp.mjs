// `ait build` 산출물(<appName>.ait)을 채널 이름이 붙은 out/nova-surge.<channel>.ait 로 옮기고 영수증 JSON 을 남긴다.
// 루트에 .ait 를 두지 않는다 — `ait deploy` 는 --location 없으면 루트의 첫 .ait 를 올리므로, QR 번들과 출시 번들이 섞이지 않게
// 배포는 반드시 `npm run deploy:toss:<channel>` 로 경로를 지정한다.
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { TOSS_APP_NAME, TOSS_TEST_AD_GROUP } from '../src/config.ts'

const CHANNEL = process.argv[2]
if (!['test', 'release'].includes(CHANNEL)) { console.error('[stamp] 사용법: node scripts/stamp.mjs test|release'); process.exit(2) }
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, `${TOSS_APP_NAME}.ait`)
if (!existsSync(SRC)) { console.error(`[stamp] ${SRC} 없음 — ait build 를 먼저`); process.exit(1) }
const OUT = join(ROOT, 'out')
mkdirSync(OUT, { recursive: true })
const dst = join(OUT, `${TOSS_APP_NAME}.${CHANNEL}.ait`)
renameSync(SRC, dst)

const sha = buf => createHash('sha256').update(buf).digest('hex')
const dist = []
;(function walk(d) { for (const n of readdirSync(d).sort()) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : dist.push(p) } })(join(ROOT, 'dist'))
const git = cmd => execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8' }).trim()
const live = loadEnv('release', ROOT, 'VITE_TOSS_AD_')
const receipt = {
  channel: CHANNEL,
  adGroupIds: CHANNEL === 'release'
    ? { interstitial: live.VITE_TOSS_AD_INTERSTITIAL_ID, rewarded: live.VITE_TOSS_AD_REWARDED_ID }
    : { ...TOSS_TEST_AD_GROUP },
  commit: git('rev-parse HEAD'),
  dirty: git('status --porcelain -- . ../slice') !== '',
  builtAt: new Date().toISOString(),
  ait: { file: relative(ROOT, dst), bytes: statSync(dst).size, sha256: sha(readFileSync(dst)) },
  dist: { files: dist.length, sha256: sha(dist.map(p => `${relative(ROOT, p)}\0${sha(readFileSync(p))}\n`).join('')) },
}
writeFileSync(join(OUT, `${TOSS_APP_NAME}.${CHANNEL}.json`), JSON.stringify(receipt, null, 2) + '\n')
console.log(`[stamp] ${receipt.ait.file} · ${CHANNEL} · ${receipt.commit.slice(0, 7)}${receipt.dirty ? '+dirty' : ''} · sha256 ${receipt.ait.sha256.slice(0, 16)}…`)
console.log(`[stamp] 광고 ID: ${receipt.adGroupIds.interstitial} · ${receipt.adGroupIds.rewarded}`)
