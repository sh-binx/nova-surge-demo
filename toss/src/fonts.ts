// 한글 서브셋 폰트(Pretendard, OFL — src/assets/Pretendard-OFL.txt) 선로딩 — 캔버스 배너(fillText)는 폰트가 준비돼야 한글이 같은 서체로 그려진다.
void Promise.all([
  document.fonts.load('800 16px NSKR', '가'),
  document.fonts.load('900 16px NSKRB', '가'),
]).catch(() => {})
