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

// 입력 index.html 은 scripts/prepare.mjs 가 ../slice/index.html 에서 생성한다(직접 편집 금지).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [releaseAdIds(mode)],
  build: { target: 'es2020', assetsInlineLimit: 0, outDir: 'dist', emptyOutDir: true, modulePreload: false },
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
}))
