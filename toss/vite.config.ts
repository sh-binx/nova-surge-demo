import { defineConfig, loadEnv, type Plugin } from 'vite'
import { adChannelOf, TOSS_LIVE_AD_ID } from './src/config.ts'

// release 모드면 운영 광고 ID 두 개가 형식에 맞고 서로 다른지 빌드 전에 확인한다 — 빠지거나 테스트 ID 면 빌드 실패.
function releaseAdIds(mode: string): Plugin {
  return {
    name: 'nova-surge:release-ad-ids',
    configResolved() {
      if (adChannelOf(mode) !== 'release') return
      const env = loadEnv(mode, process.cwd(), 'VITE_TOSS_AD_')
      const ids = [env.VITE_TOSS_AD_INTERSTITIAL_ID, env.VITE_TOSS_AD_REWARDED_ID]
      if (ids.some(v => !v || !TOSS_LIVE_AD_ID.test(v)) || ids[0] === ids[1])
        throw new Error(`[release] 운영 광고 그룹 ID 가 올바르지 않다(.env.release 확인): ${JSON.stringify(ids)}`)
    },
  }
}

// 테스트 채널 전용 실기기 진단 띠 — 토스 웹뷰에는 콘솔을 볼 방법이 없어서, 부트 단계·오류·WebGL 컨텍스트 손실을 화면 아래에 작게 적는다.
// 운영(release) 번들에는 넣지 않는다. 회귀 시험(모의 SDK 주입)에서는 띠를 띄우지 않는다 — 화면 글자 전수 검사에 걸린다. main.ts 의 window.__nsDiag?.() 호출은 운영에서 함수가 없어 아무 일도 하지 않는다.
const DIAG_SNIPPET = `(function(){if(window.__TOSS_SDK__)return;var L=[],el;function show(){if(!document.body)return;if(!el){el=document.createElement('div');el.id='nsdiag';el.style.cssText='position:fixed;left:50%;bottom:2px;transform:translateX(-50%);z-index:99999;font:9px/1.25 ui-monospace,Menlo,monospace;color:#9f9;background:rgba(0,0,0,.66);padding:2px 5px;pointer-events:none;max-width:72vw;white-space:pre-wrap;text-align:left';document.body.appendChild(el)}el.textContent=L.slice(-7).join('\\n')}
window.__nsDiag=function(m){L.push((performance.now()/1000).toFixed(1)+' '+m);show()};
addEventListener('error',function(e){var t=e.target;window.__nsDiag('ERR '+(e.message||(t&&(t.src||t.href))||'?')+(e.lineno?' @'+e.lineno:''))},true);
addEventListener('unhandledrejection',function(e){var r=e.reason;window.__nsDiag('REJ '+(r&&r.message||r))});
addEventListener('DOMContentLoaded',function(){show();['c','hcv'].forEach(function(id){var c=document.getElementById(id);if(!c)return;c.addEventListener('webglcontextlost',function(){window.__nsDiag('GL lost '+id)});c.addEventListener('webglcontextrestored',function(){window.__nsDiag('GL restored '+id)});c.addEventListener('webglcontextcreationerror',function(e){window.__nsDiag('GL createErr '+id+' '+(e.statusMessage||''))})})});
document.addEventListener('visibilitychange',function(){window.__nsDiag('vis '+document.visibilityState)});
window.__nsDiag('html');})();`
function diagOverlay(mode: string): Plugin {
  return {
    name: 'nova-surge:test-diag-overlay',
    transformIndexHtml(html) {
      if (adChannelOf(mode) === 'release') return html
      return { html, tags: [{ tag: 'script', children: DIAG_SNIPPET, injectTo: 'head-prepend' }] }
    },
  }
}

// 입력 index.html 은 scripts/prepare.mjs 가 ../slice/index.html 에서 생성한다(직접 편집 금지).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [releaseAdIds(mode), diagOverlay(mode)],
  build: { target: 'es2020', assetsInlineLimit: 0, outDir: 'dist', emptyOutDir: true, modulePreload: false },
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
}))
