// 맘운자로 타로 — 메이저 아르카나 22장 데이터
//
// prescriptions-data.js / fortune-data.js와 동일한 단일 IIFE + window export 패턴.
//
// 카드 앞면(img)은 1909년 라이더-웨이트 원본 도판을 쓴다. 삽화가 Pamela Colman Smith가
// 1951년에 사망해 한국 저작권법(사망 후 70년)으로 2021년 말 보호기간이 만료된 퍼블릭
// 도메인이며, 위키미디어 공용에서 원본만 받았다(현대 재채색본은 새 저작물이라 제외).
// img가 없는 카드는 이모지 + 금박 프레임으로 자동 대체되므로 일부만 교체해도 동작한다.
// 카드 뒷면은 아래 TAROT_BACK_SVG에 직접 그린 원본이다.
//
// 톤 원칙: 무섭게 겁주지 않는다. '죽음'·'악마'·'탑'처럼 센 카드도 변화/유혹/환기로
// 부드럽게 풀어서, 읽고 나면 마음이 가벼워지는 방향으로만 쓴다.
// 실제 의학·심리 진단명은 절대 쓰지 않는다(앱 전체 원칙).
(() => {
  'use strict';

  // rxCategory는 처방센터의 카테고리 id와 맞춰야 한다
  // (emotion / work / love / money / food / travel / daily / sleep / social / study / fun / random)
  const TAROT_MAJOR = [
    {
      id: 0, name: '바보', en: 'The Fool', emoji: '🃏', rxCategory: 'fun', img: 'tarot/fool.jpg',
      up: { keyword: '새 시작', line: '아직 아무것도 정해지지 않았어요. 그게 이 카드의 가장 큰 강점이에요' },
      rev: { keyword: '섣부름', line: '조금만 더 준비해도 늦지 않아요. 지금은 숨 고르기 구간이에요' },
    },
    {
      id: 1, name: '마법사', en: 'The Magician', emoji: '🎩', rxCategory: 'work', img: 'tarot/magician.jpg',
      up: { keyword: '실행력', line: '필요한 건 이미 다 가지고 있어요. 손만 뻗으면 되는 날이에요' },
      rev: { keyword: '헛도는 힘', line: '에너지는 충분한데 방향이 흩어져 있어요. 하나만 골라보세요' },
    },
    {
      id: 2, name: '여사제', en: 'The High Priestess', emoji: '🌙', rxCategory: 'emotion', img: 'tarot/high-priestess.jpg',
      up: { keyword: '직감', line: '말로 설명 안 되는 그 느낌이 오늘은 꽤 정확해요' },
      rev: { keyword: '외면', line: '알고 있는데 모른 척하는 게 하나 있죠. 그거예요' },
    },
    {
      id: 3, name: '여황제', en: 'The Empress', emoji: '🌷', rxCategory: 'love', img: 'tarot/empress.jpg',
      up: { keyword: '넉넉함', line: '누군가를 챙길 여유가 생기는 날이에요. 나부터 챙겨도 좋고요' },
      rev: { keyword: '과한 돌봄', line: '남 챙기다 정작 내가 비어가고 있어요. 순서를 바꿔보세요' },
    },
    {
      id: 4, name: '황제', en: 'The Emperor', emoji: '🏛️', rxCategory: 'work', img: 'tarot/emperor.jpg',
      up: { keyword: '중심', line: '오늘은 내가 정하면 그게 기준이 돼요. 눈치 볼 필요 없어요' },
      rev: { keyword: '고집', line: '버티는 것과 우기는 것 사이, 지금은 살짝 후자 같아요' },
    },
    {
      id: 5, name: '교황', en: 'The Hierophant', emoji: '📖', rxCategory: 'study', img: 'tarot/hierophant.jpg',
      up: { keyword: '배움', line: '누군가의 말이 오늘 유난히 크게 남을 거예요. 흘려듣지 마세요' },
      rev: { keyword: '틀 깨기', line: '늘 하던 방식이 오늘은 안 맞아요. 한 번은 어겨도 괜찮아요' },
    },
    {
      id: 6, name: '연인', en: 'The Lovers', emoji: '💞', rxCategory: 'love', img: 'tarot/lovers.jpg',
      up: { keyword: '끌림', line: '마음이 기우는 쪽이 분명해요. 이미 답을 알고 있죠' },
      rev: { keyword: '흔들림', line: '둘 다 갖고 싶은 마음이 오늘 좀 시끄러워요' },
    },
    {
      id: 7, name: '전차', en: 'The Chariot', emoji: '🐎', rxCategory: 'work', img: 'tarot/chariot.jpg',
      up: { keyword: '돌파', line: '밀고 나가도 되는 날이에요. 브레이크는 오늘 안 밟아도 돼요' },
      rev: { keyword: '공회전', line: '열심히는 하는데 안 나아가는 느낌. 방향부터 확인해보세요' },
    },
    {
      id: 8, name: '힘', en: 'Strength', emoji: '🦁', rxCategory: 'emotion', img: 'tarot/strength.jpg',
      up: { keyword: '부드러운 강함', line: '세게 나가지 않아도 이길 수 있어요. 오늘은 그게 더 세요' },
      rev: { keyword: '소진', line: '참는 걸로 버텨온 게 티가 나요. 조금 내려놓아도 무너지지 않아요' },
    },
    {
      id: 9, name: '은둔자', en: 'The Hermit', emoji: '🕯️', rxCategory: 'sleep', img: 'tarot/hermit.jpg',
      up: { keyword: '혼자의 시간', line: '오늘은 혼자 있는 게 도망이 아니라 정비예요' },
      rev: { keyword: '과한 고립', line: '혼자가 편해진 게 좀 길어졌어요. 한 사람만 연락해보세요' },
    },
    {
      id: 10, name: '운명의 수레바퀴', en: 'Wheel of Fortune', emoji: '🎡', rxCategory: 'random', img: 'tarot/wheel.jpg',
      up: { keyword: '전환', line: '흐름이 바뀌는 지점이에요. 굳이 붙잡지 않아도 굴러가요' },
      rev: { keyword: '제자리', line: '같은 자리를 도는 기분이죠. 바퀴는 곧 다시 돌아요' },
    },
    {
      id: 11, name: '정의', en: 'Justice', emoji: '⚖️', rxCategory: 'social', img: 'tarot/justice.jpg',
      up: { keyword: '균형', line: '재고 따지는 게 오늘은 미덕이에요. 감정보다 사실을 보세요' },
      rev: { keyword: '억울함', line: '공평하지 않다는 느낌이 남아 있어요. 그 감각, 틀리지 않았어요' },
    },
    {
      id: 12, name: '매달린 사람', en: 'The Hanged Man', emoji: '🙃', rxCategory: 'sleep', img: 'tarot/hanged-man.jpg',
      up: { keyword: '멈춤', line: '멈춘 게 실패가 아니에요. 거꾸로 보니 보이는 게 있어요' },
      rev: { keyword: '버티기만', line: '기다림이 습관이 됐어요. 하나만 움직여봐도 달라져요' },
    },
    {
      id: 13, name: '변화', en: 'Death', emoji: '🦋', rxCategory: 'daily', img: 'tarot/death.jpg',
      up: { keyword: '끝과 시작', line: '하나가 끝나요. 무서운 게 아니라 자리가 비는 거예요' },
      rev: { keyword: '미련', line: '이미 끝난 걸 아직 붙잡고 있어요. 손 펴도 괜찮아요' },
    },
    {
      id: 14, name: '절제', en: 'Temperance', emoji: '🍵', rxCategory: 'food', img: 'tarot/temperance.jpg',
      up: { keyword: '적당함', line: '넘치지도 부족하지도 않게. 오늘은 그 감각이 잘 잡혀요' },
      rev: { keyword: '과함', line: '뭔가 하나가 좀 과해요. 본인도 알고 있죠' },
    },
    {
      id: 15, name: '유혹', en: 'The Devil', emoji: '😈', rxCategory: 'food', img: 'tarot/devil.jpg',
      up: { keyword: '끊기 힘든 것', line: '알면서 또 하게 되는 그거, 오늘 유난히 강해요' },
      rev: { keyword: '풀려남', line: '묶여 있던 게 느슨해져요. 지금이 끊기 좋은 타이밍이에요' },
    },
    {
      id: 16, name: '탑', en: 'The Tower', emoji: '🗼', rxCategory: 'emotion', img: 'tarot/tower.jpg',
      up: { keyword: '갑작스러움', line: '예상 못 한 게 하나 툭 떨어져요. 무너지는 건 낡은 쪽이에요' },
      rev: { keyword: '가까스로', line: '흔들렸지만 안 넘어갔어요. 그거 실력이에요' },
    },
    {
      id: 17, name: '별', en: 'The Star', emoji: '⭐', rxCategory: 'emotion', img: 'tarot/star.jpg',
      up: { keyword: '희망', line: '크게 좋아지진 않아도, 숨 쉴 틈이 생기는 날이에요' },
      rev: { keyword: '흐린 기대', line: '기대를 접어둔 상태죠. 아직 완전히 꺼진 건 아니에요' },
    },
    {
      id: 18, name: '달', en: 'The Moon', emoji: '🌕', rxCategory: 'sleep', img: 'tarot/moon.jpg',
      up: { keyword: '안개', line: '아직 다 안 보여요. 오늘 결론 내리지 않아도 돼요' },
      rev: { keyword: '걷히는 안개', line: '헷갈렸던 게 조금씩 선명해져요. 조금만 더 기다려보세요' },
    },
    {
      id: 19, name: '태양', en: 'The Sun', emoji: '☀️', rxCategory: 'fun', img: 'tarot/sun.jpg',
      up: { keyword: '환함', line: '숨길 게 없는 날이에요. 그냥 나로 있어도 잘 굴러가요' },
      rev: { keyword: '억지 웃음', line: '괜찮은 척이 조금 길었어요. 오늘은 안 웃어도 돼요' },
    },
    {
      id: 20, name: '심판', en: 'Judgement', emoji: '📣', rxCategory: 'social', img: 'tarot/judgement.jpg',
      up: { keyword: '결산', line: '그동안 쌓아온 게 드러나는 날이에요. 부끄러워할 거 없어요' },
      rev: { keyword: '자기 검열', line: '스스로에게 유독 엄격해요. 그 잣대, 남한테는 안 대죠' },
    },
    {
      id: 21, name: '세계', en: 'The World', emoji: '🌍', rxCategory: 'travel', img: 'tarot/world.jpg',
      up: { keyword: '완성', line: '한 바퀴가 마무리돼요. 다음 칸으로 넘어가도 되는 날이에요' },
      rev: { keyword: '거의 다', line: '다 왔는데 마지막이 안 끝나요. 조금만 더예요' },
    },
  ];

  // 타로 주제. 사람들이 실제로 골라 보는 항목들이며, 주제마다 3장의 자리 이름이 달라진다
  // (같은 스프레드라도 무엇을 묻는지에 따라 읽는 지점이 다르기 때문).
  // 세 번째 자리는 항상 "무엇을 할까"에 해당해서, 그대로 처방으로 이어진다.
  // rxCategory는 처방센터 카테고리 id와 맞춘다. null이면 뽑힌 카드의 rxCategory를 따른다.
  const TAROT_TOPICS = [
    {
      key: 'love', label: '연애', emoji: '💕', rxCategory: 'love',
      question: '지금 이 사람과의 관계가 어떻게 흘러갈까요?',
      positions: [
        { label: '상대의 마음', emoji: '💗' },
        { label: '우리 사이의 흐름', emoji: '🌊' },
        { label: '내가 할 수 있는 것', emoji: '💉' },
      ],
    },
    {
      key: 'work', label: '직업', emoji: '💼', rxCategory: 'work',
      question: '지금 일이 어떤 방향으로 가고 있을까요?',
      positions: [
        { label: '지금 나의 자리', emoji: '📍' },
        { label: '앞으로의 흐름', emoji: '🌊' },
        { label: '필요한 태도', emoji: '💉' },
      ],
    },
    {
      key: 'money', label: '재물', emoji: '💰', rxCategory: 'money',
      question: '돈의 흐름이 어떻게 움직일까요?',
      positions: [
        { label: '지금의 흐름', emoji: '📍' },
        { label: '다가오는 변화', emoji: '🌊' },
        { label: '지켜야 할 것', emoji: '💉' },
      ],
    },
    {
      key: 'social', label: '인간관계', emoji: '👥', rxCategory: 'social',
      question: '그 사람과의 관계를 어떻게 풀어갈까요?',
      positions: [
        { label: '이 관계의 지금', emoji: '📍' },
        { label: '상대의 마음', emoji: '💗' },
        { label: '풀어가는 방법', emoji: '💉' },
      ],
    },
    {
      key: 'mind', label: '마음', emoji: '💗', rxCategory: 'emotion',
      question: '지금 내 마음이 어떤 상태일까요?',
      positions: [
        { label: '지금 내 마음', emoji: '💗' },
        { label: '마음의 흐름', emoji: '🌊' },
        { label: '필요한 돌봄', emoji: '💉' },
      ],
    },
    {
      key: 'today', label: '오늘 전체', emoji: '🌤️', rxCategory: null,
      question: '오늘 하루가 어떻게 흘러갈까요?',
      positions: [
        { label: '지금 내 마음', emoji: '💗' },
        { label: '오늘의 흐름', emoji: '🌊' },
        { label: '오늘의 처방 방향', emoji: '💉' },
      ],
    },
  ];

  // 종합 결과: 정방향은 +1, 역방향은 -1로 더해 -3~+3 점수를 낸 뒤 다섯 단계로 읽는다.
  // {topic}에는 주제 이름이 들어간다. 겁주지 않되 솔직하게, 낮은 점수도 "쉬어가라"로 풀어준다.
  const TAROT_VERDICT = [
    { min: 3, stars: 5, title: '아주 좋아요', line: '{topic} 쪽으로 흐름이 시원하게 열려 있어요. 망설이지 않아도 되는 날이에요' },
    { min: 1, stars: 4, title: '좋아요', line: '{topic}에 대해 지금 방향은 맞게 가고 있어요. 속도만 내 페이스로 두세요' },
    { min: 0, stars: 3, title: '아직 반반이에요', line: '{topic}은 어느 쪽으로도 기울지 않았어요. 결론은 조금 뒤에 내도 돼요' },
    { min: -2, stars: 2, title: '천천히 가세요', line: '{topic}에서 서두르면 놓치는 게 생겨요. 한 박자 늦춰도 늦지 않아요' },
    { min: -3, stars: 1, title: '숨 고를 때', line: '{topic}은 지금 밀어붙이기보다 쉬어가는 쪽이 나아요. 잠깐 내려놓아도 괜찮아요' },
  ];

  // 셔플 안내 문구 (섞을 때마다 순서대로 노출)
  const TAROT_SHUFFLE_LINES = [
    '카드를 좌우로 쓸어 섞어주세요',
    '마음속으로 오늘 궁금한 걸 한 가지 떠올려보세요',
    '한 번만 더 섞으면 카드를 펼칠게요',
  ];

  // 3장을 다 뒤집은 뒤 붙는 마무리 한마디 (감정과 무관하게 톤만 잡아주는 역할)
  const TAROT_SUMMARY_SEED = [
    '세 장이 같은 이야기를 조금씩 다르게 하고 있어요.',
    '오늘 뽑힌 카드들은 재촉하지 않는 쪽이네요.',
    '카드가 굳이 정답을 주지 않고 방향만 가리키고 있어요.',
    '오늘의 세 장은 서로를 보완하는 조합이에요.',
    '지금 필요한 말만 딱 골라 나온 느낌이에요.',
  ];

  // 카드 뒷면 — 직접 그린 원본 SVG.
  // 검정 바탕 + 금박 라인아트 + 기하 프레임 + 식물 문양 + 초승달/별이라는 고전 타로 뒷면의
  // 문법을 따르되, 시중 도판을 베끼지 않고 새로 구성했다(저작권 안전).
  // 비율은 실제 타로 카드에 가까운 120:205.
  const GOLD = '#d4af37';
  const TAROT_BACK_SVG = `
    <svg viewBox="0 0 120 205" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <rect width="120" height="205" fill="#0e0b1c"/>
      <g stroke="${GOLD}" fill="none" stroke-width="0.8" stroke-linecap="round">
        <rect x="4" y="4" width="112" height="197" rx="3" opacity="0.9"/>
        <rect x="8.5" y="8.5" width="103" height="188" rx="2" opacity="0.4"/>
        <polygon points="60,42 105,102 60,163 15,102" opacity="0.7"/>
        <polygon points="60,55 94,102 60,149 26,102" opacity="0.3"/>
        <circle cx="60" cy="102" r="29" opacity="0.75"/>
        <circle cx="60" cy="102" r="33.5" opacity="0.35" stroke-dasharray="1 3.2"/>
        <path d="M60 15 C51 20 44 20 37 16" opacity="0.75"/>
        <path d="M60 15 C69 20 76 20 83 16" opacity="0.75"/>
        <path d="M60 190 C51 185 44 185 37 189" opacity="0.75"/>
        <path d="M60 190 C69 185 76 185 83 189" opacity="0.75"/>
        <path d="M14 26 C22 33 24 40 23 47" opacity="0.5"/>
        <path d="M106 26 C98 33 96 40 97 47" opacity="0.5"/>
        <path d="M14 179 C22 172 24 165 23 158" opacity="0.5"/>
        <path d="M106 179 C98 172 96 165 97 158" opacity="0.5"/>
      </g>
      <g fill="${GOLD}">
        <ellipse cx="49" cy="18" rx="3.4" ry="1.5" transform="rotate(-18 49 18)" opacity="0.8"/>
        <ellipse cx="71" cy="18" rx="3.4" ry="1.5" transform="rotate(18 71 18)" opacity="0.8"/>
        <ellipse cx="49" cy="187" rx="3.4" ry="1.5" transform="rotate(18 49 187)" opacity="0.8"/>
        <ellipse cx="71" cy="187" rx="3.4" ry="1.5" transform="rotate(-18 71 187)" opacity="0.8"/>
        <ellipse cx="20" cy="37" rx="3" ry="1.3" transform="rotate(42 20 37)" opacity="0.6"/>
        <ellipse cx="100" cy="37" rx="3" ry="1.3" transform="rotate(-42 100 37)" opacity="0.6"/>
        <ellipse cx="20" cy="168" rx="3" ry="1.3" transform="rotate(-42 20 168)" opacity="0.6"/>
        <ellipse cx="100" cy="168" rx="3" ry="1.3" transform="rotate(42 100 168)" opacity="0.6"/>
        <circle cx="60" cy="30" r="1.5" opacity="0.85"/>
        <circle cx="60" cy="175" r="1.5" opacity="0.85"/>
        <circle cx="9" cy="102" r="1.3" opacity="0.7"/>
        <circle cx="111" cy="102" r="1.3" opacity="0.7"/>
      </g>
      <circle cx="61.5" cy="102" r="14.5" fill="${GOLD}" opacity="0.9"/>
      <circle cx="68" cy="98.5" r="12.5" fill="#0e0b1c"/>
      <g fill="${GOLD}">
        <path d="M44 84 l1.4 3.9 3.9 1.4 -3.9 1.4 -1.4 3.9 -1.4-3.9 -3.9-1.4 3.9-1.4z" opacity="0.95"/>
        <path d="M77 116 l1.2 3.3 3.3 1.2 -3.3 1.2 -1.2 3.3 -1.2-3.3 -3.3-1.2 3.3-1.2z" opacity="0.85"/>
        <path d="M72 78 l0.9 2.5 2.5 0.9 -2.5 0.9 -0.9 2.5 -0.9-2.5 -2.5-0.9 2.5-0.9z" opacity="0.7"/>
        <path d="M45 122 l0.9 2.5 2.5 0.9 -2.5 0.9 -0.9 2.5 -0.9-2.5 -2.5-0.9 2.5-0.9z" opacity="0.7"/>
      </g>
    </svg>`;

  window.MAUMJARO_TAROT_DATA = {
    TAROT_MAJOR,
    TAROT_TOPICS,
    TAROT_VERDICT,
    TAROT_SHUFFLE_LINES,
    TAROT_SUMMARY_SEED,
    TAROT_BACK_SVG,
  };
})();
