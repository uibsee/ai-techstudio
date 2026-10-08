/** 큰 분류 (위 분류 줄 · 홈 타일 · AI 용 목록) — 화면 코드 없이 데이터만 (scripts/export-ai 도 쓴다) */
export interface Domain {
  id: string;
  name: string;
  desc: string;
  cats: string[];
  /** 대표 견본 (홈 타일) */
  hero: string;
}
export const DOMAINS: Domain[] = [
  { id: 'look', name: '그래픽 · 셰이더', desc: '재질 · 빛 · 후처리 · 셰이더로 화면의 느낌을 만들어요', cats: ['재질 · 그림체', '빛 · 환경', '후처리', '셰이더', 'WebGPU · 최신 렌더링', '우주 표현'], hero: 'u01' },
  { id: 'model', name: '3D 모델 · 캐릭터', desc: '블렌더 없이 코드로 — 나무 · 바위 · 캐릭터 · 뼈대 · 걷기 · 표정', cats: ['3D 모델링 · 절차', '캐릭터 · 리깅', '하드서피스 · 실사 렌더링'], hero: 'i446' },
  { id: 'fx', name: '이펙트 · 연출', desc: '마법 · 입자 · 손맛 · 카메라 · 움직임으로 순간을 극적으로', cats: ['스킬 VFX (마법 · 미사일)', '입자 · 연출', '화려한 효과 (VFX)', '손맛 · 주스', '모션 그래픽', '카메라'], hero: 'i182' },
  { id: 'game', name: '게임 시스템 · AI', desc: '조작 · 충돌 · 전투 · 컴퓨터 상대 · 입력 · 성능 · 온라인', cats: ['3D 게임 기본기', '게임 AI', '입력', '온라인 대전', '속도 기법', '플랫폼 · 성능', '배움 · 피드백'], hero: 'i484' },
  { id: 'ui', name: '2D · 화면', desc: '캔버스 그리기 · 2D 움직임과 충돌 · 손그림 느낌 · 화면 맞춤', cats: ['2D 그리기', '2D 움직임 · 충돌', '2D 그림 효과', '2D 의사 3D', '손그림 그림체 (2D)', '그리기 도구', 'CSS · 화면 틀'], hero: 'u61' },
  { id: 'sim', name: '물리 · 수학 원리', desc: '물리 시뮬레이션 · 구조 설명 · 수학 시각화를 만드는 방법', cats: ['물리 · 시뮬레이션', '원리 설명 · 구조', '수학 시각화 기법'], hero: 'i37' },
  { id: 'mech', name: '기계 · 구조', desc: '톱니 · 엔진 · 로봇 팔 같은 기계 장치와 분해도 · 조립 · 단면으로 구조를 보여 주는 방법', cats: ['기계 장치', '구조 · 조립'], hero: 'i541' },
  { id: 'map', name: '지도 · 길찾기', desc: '지도 만들기 · 격자와 좌표 · 길찾기 · 지도 보여 주기', cats: ['지도 생성 (절차)', '격자 · 좌표', '길찾기 · 이동', '지도 보기 · 표현'], hero: 'i245' },
  { id: 'sound', name: '소리', desc: '파일 없이 코드로 만드는 효과음 · 배경음악 · 공간 소리', cats: ['효과음 (SFX)', '소리'], hero: 'i499' },
];
export const domainOf = (cat: string): Domain => DOMAINS.find((d) => d.cats.includes(cat)) ?? DOMAINS[0]!;
