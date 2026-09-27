// 앱인토스 빌드 입력 생성 — ../slice/index.html(포털판, 단일 소스)을 읽어 toss/index.html 을 만든다.
//  1) 포털 전용 영역(<!--@portal{-->…<!--@portal}--> · //@portal{ … //@portal}) 제거 — CrazyGames SDK·Supabase·OG 메타
//  2) lang=ko · 제목 · 한글 폰트 폴백을 폰트 스택에 삽입(CSS·캔버스 공용 문자열)
//  3) 게임 부트 지연(__NS_DEFER) + 플랫폼 모듈(src/main.ts) 주입
//  4) 기체 GLB 3종을 WebP 텍스처로 재압축해 public/ 에 배치(파일명 유지 — 게임 코드가 상대경로 'ship.glb' 로 읽는다)
//  5) 한국어 사전에 쓰인 글자만 남긴 Pretendard 서브셋(woff2) 생성
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import subsetFont from 'subset-font'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SLICE = resolve(ROOT, '..', 'slice')
const log = (...a) => console.log('[prepare]', ...a)

// ── 1~3. HTML ────────────────────────────────────────────────────────────────────────
let html = readFileSync(join(SLICE, 'index.html'), 'utf8')

function strip(re, label, expect) {
  const n = (html.match(re) || []).length
  if (n !== expect) throw new Error(`${label}: 영역 ${n}개(기대 ${expect}) — slice/index.html 마커를 확인`)
  html = html.replace(re, '')
}
strip(/<!--@portal\{-->[\s\S]*?<!--@portal\}-->\n?/g, 'HTML 포털 영역', 2)
strip(/^\/\/@portal\{\n[\s\S]*?^\/\/@portal\}\n/gm, 'JS 포털 영역', 2)

function rep(from, to, label, min = 1) {
  const n = html.split(from).length - 1
  if (n < min) throw new Error(`${label}: 대상 없음`)
  html = html.split(from).join(to)
  return n
}
rep('<html lang="en">', '<html lang="ko">', 'lang')
rep('<title>Nova Surge 2.0</title>', '<title>노바 서지</title>', 'title')
// 한글 글리프: 각 스택에 NSKR(서브셋 Pretendard)을 끼운다. 워드마크(Arial Black)는 라틴 그대로, 한글만 NSKRB.
// 모노 스택은 NSKR 을 맨 앞에 — 한글이 섞인 문장에서 모노 공백(0.6em)이 벌어지지 않게. 숫자 폭은 tabular-nums(toss.css)로 고정.
const f1 = rep('ui-monospace,Menlo,monospace', 'NSKR,ui-monospace,Menlo,monospace', 'mono 스택')
const f2 = rep("'Arial Black',sans-serif", "'Arial Black',NSKRB,sans-serif", 'Arial Black 스택')
const f3 = rep("font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", "font-family:system-ui,-apple-system,'Segoe UI',Roboto,NSKR,sans-serif", 'body 스택')
log(`폰트 스택 치환: mono ${f1} · black ${f2} · body ${f3}`)

// 게임 스크립트 직전에 부트 지연 플래그, <head> 끝에 플랫폼 모듈·CSS
rep('<script>\n(function NS_BOOT(){', '<script>window.__NS_DEFER=1</script>\n<script>\n(function NS_BOOT(){', '게임 부트 마커')
rep('</style></head>', '</style>\n<link rel="stylesheet" href="/src/toss.css">\n<script type="module" src="/src/main.ts"></script>\n</head>', 'head 끝')

// 남은 포털 흔적은 주석뿐이다(코드는 위 영역 제거로 사라짐) — 해당 줄 주석을 잘라낸다. 코드 안에서 발견되면 실패.
html = html.split('\n').map(line => {
  const m = line.match(/crazygames|supabase|poki/i)
  if (!m) return line
  const cut = Math.max(line.lastIndexOf(' // ', m.index), line.startsWith('//') ? 0 : -1)
  if (cut < 0) throw new Error(`주석이 아닌 곳에 포털 흔적: ${line.slice(0, 120)}`)
  return line.slice(0, cut)
}).join('\n')
for (const bad of ['crazygames', 'supabase', 'poki', 'sh-binx.github.io']) {
  if (html.toLowerCase().includes(bad)) throw new Error(`제거 후에도 '${bad}' 가 남았다`)
}
writeFileSync(join(ROOT, 'index.html'), html)
log('index.html', (html.length / 1024).toFixed(0) + 'KB')

// ── 4. GLB(WebP 텍스처) ──────────────────────────────────────────────────────────────
// 메시는 UV 분할 정점 때문에 simplify 가 거의 줄지 않아(실측 146k→124k) 단순화 대신 텍스처 WebP(PNG 1.24MB→~70KB) +
// 메시 meshopt 압축(정점 품질 유지, 5.2MB→1.9MB)을 쓴다.
mkdirSync(join(ROOT, 'public'), { recursive: true })
const gt = join(ROOT, 'node_modules', '.bin', 'gltf-transform')
for (const n of ['ship', 'ship-B', 'ship-C']) {
  const src = join(SLICE, `${n}.glb`), out = join(ROOT, 'public', `${n}.glb`)
  if (existsSync(out) && statSync(out).mtimeMs > statSync(src).mtimeMs) continue
  const tmp = join(ROOT, 'public', `${n}.webp.tmp.glb`)
  execFileSync(gt, ['webp', src, tmp, '--quality', '88'], { stdio: 'ignore' })
  execFileSync(gt, ['meshopt', tmp, out, '--level', 'medium'], { stdio: 'ignore' }) // EXT_meshopt_compression — main.ts 가 디코더 연결
  rmSync(tmp)
  log(`${n}.glb ${(statSync(src).size / 1e6).toFixed(2)}MB → ${(statSync(out).size / 1e6).toFixed(2)}MB`)
}

// ── 5. 폰트 서브셋 ───────────────────────────────────────────────────────────────────
const ko = JSON.parse(readFileSync(join(ROOT, 'src', 'i18n', 'ko.json'), 'utf8'))
const extra = readFileSync(join(ROOT, 'src', 'ui.ts'), 'utf8') // 오버레이 한국어 문구
const chars = new Set()
const addText = t => { for (const c of t) chars.add(c) }
addText(JSON.stringify(ko)); addText(extra)
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c))
addText('◆▶◀▸✦⚠·—×←→✓⬢…−+%')
const text = [...chars].join('')
mkdirSync(join(ROOT, 'src', 'assets'), { recursive: true })
const PRET = join(ROOT, 'node_modules', 'pretendard', 'dist', 'web', 'static', 'woff2')
for (const [w, file] of [['800', 'Pretendard-ExtraBold.woff2'], ['900', 'Pretendard-Black.woff2']]) {
  const buf = await subsetFont(readFileSync(join(PRET, file)), text, { targetFormat: 'woff2' })
  writeFileSync(join(ROOT, 'src', 'assets', `nskr-${w}.woff2`), buf)
  log(`폰트 nskr-${w}.woff2 ${(buf.length / 1024).toFixed(1)}KB (${chars.size}자)`)
}
const lic = join(ROOT, 'node_modules', 'pretendard', 'dist', 'LICENSE.txt')
if (existsSync(lic)) copyFileSync(lic, join(ROOT, 'public', 'Pretendard-OFL.txt')) // OFL: 폰트와 함께 라이선스 배포
