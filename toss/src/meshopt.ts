import { MeshoptDecoder } from 'meshoptimizer'

/**
 * 앱인토스 번들의 기체 GLB 는 EXT_meshopt_compression(prepare.mjs)이다. 게임 소스는 `new THREE.GLTFLoader()` 를
 * 그대로 부르므로, 생성자를 감싸 모든 로더에 디코더를 붙인다(포털판 소스 무수정).
 * 디코더(WebAssembly)를 못 쓰는 환경이면 로드가 실패하고 게임의 기존 폴백(로프트 기체)이 표시된다.
 */
export function installMeshopt(): void {
  const T = (window as unknown as { THREE?: { GLTFLoader?: new (m?: unknown) => { setMeshoptDecoder(d: unknown): unknown } } }).THREE
  if (!T || !T.GLTFLoader) return
  const Base = T.GLTFLoader
  const Wrapped = function (this: unknown, manager?: unknown) {
    const l = new Base(manager)
    l.setMeshoptDecoder(MeshoptDecoder)
    return l
  } as unknown as typeof Base
  Wrapped.prototype = Base.prototype
  T.GLTFLoader = Wrapped
}
