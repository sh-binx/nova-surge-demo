# 소리 재료와 사용 조건 (2026-11-27)

## 효과음 — `slice/sfx.wav`
45종 가운데 32종(33조각)을 제작된 소리로 재생한다. 재료는 모두 CC0(퍼블릭 도메인 기증 · 상업 이용 가능 · 출처 표기 의무 없음)이고, 조각마다 자르기·겹치기·속도·페이드·음량을 가공해 한 파일로 묶었다.

| 재료 | 만든 이 | 받은 곳 | 조건 |
|---|---|---|---|
| Sci-Fi Sounds | Kenney | opengameart.org/content/sci-fi-sounds | CC0 |
| Interface Sounds | Kenney | opengameart.org/content/interface-sounds | CC0 |
| Digital SFX Set (63 Digital sound effects) | Kenney | opengameart.org/content/63-digital-sound-effects-lasers-phasers-space-etc | CC0 |

- 합성으로 남긴 13종: 치명타·경험치(음이 올라감)·스치기·방어선 돌파·저체력 심장음·경고·공격 예고·웨이브 시작·보스 등장·보스 2단계·최고 기록·적 부화·기뢰, 그리고 레이저·보스 빔 지속음. 음정이 음악 조성과 맞아야 하거나 길이가 상황에 따라 변하는 소리다.
- 파일을 못 읽으면 전 종이 합성음으로 대신 난다(시험으로 확인).
- 조합표(어느 재료를 어떻게 겹쳤는지)는 엔진의 `SMP` 표와 이 문서 아래 목록이 정본이다. 재제작 스크립트는 레포 밖 임시 폴더에서 돌렸으므로, 다시 만들 때는 아래 목록대로 한다.

사격 laserSmall_001·003 / 레일 laserLarge_000 / 적 사격 laserRetro_004(0.8배) / 명중 impactMetal_004 / 격추 explosionCrunch_000(1.2배) / 연쇄 explosionCrunch_002(1.5배) / 작은 폭발 explosionCrunch_002 / 큰 폭발 explosionCrunch_001+lowFrequency_explosion_001 / 대형 격추 explosionCrunch_003+lowFrequency_explosion_001 / 폭탄 explosionCrunch_004+lowFrequency_explosion_000+explosionCrunch_002 / 보스 격파 explosionCrunch_001+003+lowFrequency_explosion_000 / 격추당함 explosionCrunch_004+lowDown / 피격 impactMetal_001+003 / 서지 lowFrequency_explosion_001+explosionCrunch_002+phaserUp1 / 방어막 막음 forceField_002 / 방어막 생성 powerUp6 / 적 방패 파괴 glass_001+explosionCrunch_002 / 수리 powerUp4 / 자석 phaseJump1 / 획득 confirmation_003 / 자원 pluck_001 / 보급 상자 powerUp11 / 서지 준비 highUp / 레벨 업 zapThreeToneUp / 에픽 powerUp1 / 진화 powerUp3+lowFrequency_explosion_001 / 구매 confirmation_002 / 다시 뽑기 switch_002 / 부활 powerUp12 / 버튼 click_001 / 돌진 thrusterFire_000 / 순간 이동 phaseJump3

### 2차 보정 (같은 날) — 귀 기준 음량과 휴대폰 대역

첫 판은 음량을 피크 dB 로 맞춰서 저음 위주 재료가 휴대폰에서 음악에 묻혔다(피격음이 전투 음악 큰 구간보다 17dB 아래, 명중음 20dB 아래, 보상음은 14dB 위). 엔진 렌더에 휴대폰 스피커 근사(4차 고역통과 500Hz)와 A 가중을 걸어 다시 재고, 사건별 목표에 맞춰 `SMP` 음량을 보정했다. 절차·스크립트·목표값·재제작 스크립트(`sfxbuild.py`)는 `~/dev/dev-env/tools/game-audio-judge/` 에 있다.

바뀐 재료: 사격 laserSmall_003(1.3배·1.12배 — 8kHz 이상 잡음이 많던 001 제외) / 피격 explosionCrunch_002+impactMetal_003(2배)+phaserDown2 / 획득 phaserUp7(1.3배 — 2~5kHz 순음이던 confirmation_003 제외) / 막음 forceField_002(2배) / 버튼 select_005 / 돌진 phaseJump4+thrusterFire_001 / 대형 격추에 spaceTrash1 파편 / 보스 격파는 폭발 세 번을 0·0.28·0.62초에 나눠 겹치고 spaceTrash3 파편 / 격추당함 explosionCrunch_000+zapThreeToneDown+phaserDown3(내려가는 음 — 폭탄 소리와 구분) / 큰 폭발류의 초저역 층(lowFrequency_explosion)은 절반 이하로.

합성음 보강: 적 돌파·심장 박동·경고·기뢰·보스 2단계·치명타·경험치·스치기·공격 예고·웨이브·부화에 300Hz 위 성분과 음량을 더했다.

독립 검토 반영: 음악 기준을 파일×게인으로 계산해 압축기 보상 이득(약 6dB)이 빠져 있었다. 음악도 엔진으로 렌더해(`__test.auRender` 의 `bgm`) 125ms 창으로 다시 재니 효과음 대부분이 목표보다 5dB 낮았고, 효과음은 피크 상한에 막혀 있어 **전투·보스 음악을 4.7dB 내렸다**(`BGM` 표 .55→.32, .48→.28). 명중음은 에너지가 3ms 에 몰린 재료라 drop_004(1.25배)+impactMetal_004(2배) 로 바꿨다. 최종 표: `~/dev/dev-env/tools/game-audio-judge/nova-surge/final-level-20261127.txt`.

## 배경 음악 — `slice/bgm-*.mp3`
Suno(Pro 구독 · 구독 중 생성·내려받은 곡은 상업 이용 가능)로 만든 연주곡 3곡을 마디 경계에서 잘라 루프로 만들었다. Suno 작업 공간 「NOVA SURGE」.
