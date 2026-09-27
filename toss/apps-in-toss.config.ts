import { defineConfig } from '@apps-in-toss/web-framework/config'
import { TOSS_APP_NAME, TOSS_PRIMARY_COLOR } from './src/config'

// 앱인토스 SDK 3.x 설정 — `npm run build:toss` 의 `ait build` 가 읽어 webBundleDir 를 <appName>.ait 로 포장한다.
// 게임/비게임 구분은 3.x 에서 config 가 아니라 콘솔 앱 유형(게임)으로 정해진다(2.x webViewProps.type 삭제).
export default defineConfig({
  appName: TOSS_APP_NAME,
  brand: { primaryColor: TOSS_PRIMARY_COLOR },
  permissions: [], // 기기 권한 미사용
  navigationBar: { transparentBackground: true, theme: 'dark', withTitle: false },
  webView: {
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
  },
  webBundleDir: 'dist',
})
