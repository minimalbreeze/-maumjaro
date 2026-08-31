// 맘운자로 — 별자리(서양 12궁) · 띠(십이지) 데이터
//
// 사주(fortune-data.js)와 다른 축의 재미를 더한다. 사주는 "나 한 사람"의 기운이라
// 친구와 비교할 수 없는데, 별자리와 띠는 같은 별자리끼리 결과가 같아서
// "나도 사자자리인데!" 같은 대화가 생긴다 — 바이럴 루프에 유리하다.
//
// 결과 내용은 fortune.js가 (별자리키 + 날짜)로 결정론적으로 고른다.
// 같은 별자리인 사람은 같은 날 같은 결과를 본다(그래야 서로 얘기가 된다).
// 카테고리별 별점/처방 연결은 기존 MIND/SOCIAL/WEALTH... 시드를 그대로 재사용하므로
// 이 파일에는 정체성(별자리·띠 자체의 성격)과 하루 기운 풀만 담는다.
(() => {
  'use strict';

  // ---------- 서양 12궁 ----------
  // start/end는 양력 [월, 일]. 염소자리만 해를 넘긴다(12/22 ~ 1/19).
  const ZODIAC_SIGNS = [
    { key: 'aries',       emoji: '♈', name: '양자리',     range: '3/21~4/19',   element: '불',
      trait: '일단 부딪히고 보는 사람', keyword: '추진력' },
    { key: 'taurus',      emoji: '♉', name: '황소자리',   range: '4/20~5/20',   element: '흙',
      trait: '한 번 정하면 잘 안 바꾸는 사람', keyword: '뚝심' },
    { key: 'gemini',      emoji: '♊', name: '쌍둥이자리', range: '5/21~6/21',   element: '바람',
      trait: '머릿속 창이 항상 여러 개인 사람', keyword: '순발력' },
    { key: 'cancer',      emoji: '♋', name: '게자리',     range: '6/22~7/22',   element: '물',
      trait: '겉은 단단하고 속은 말랑한 사람', keyword: '보살핌' },
    { key: 'leo',         emoji: '♌', name: '사자자리',   range: '7/23~8/22',   element: '불',
      trait: '기왕 할 거면 제대로 하는 사람', keyword: '자존심' },
    { key: 'virgo',       emoji: '♍', name: '처녀자리',   range: '8/23~9/22',   element: '흙',
      trait: '남들은 못 보는 1mm가 보이는 사람', keyword: '섬세함' },
    { key: 'libra',       emoji: '♎', name: '천칭자리',   range: '9/23~10/22',  element: '바람',
      trait: '누구 하나 서운하지 않게 하려는 사람', keyword: '균형' },
    { key: 'scorpio',     emoji: '♏', name: '전갈자리',   range: '10/23~11/22', element: '물',
      trait: '겉으로 다 말하지 않는 사람', keyword: '집중력' },
    { key: 'sagittarius', emoji: '♐', name: '사수자리',   range: '11/23~12/21', element: '불',
      trait: '갇혀 있는 걸 제일 못 견디는 사람', keyword: '자유' },
    { key: 'capricorn',   emoji: '♑', name: '염소자리',   range: '12/22~1/19',  element: '흙',
      trait: '조용히 끝까지 가는 사람', keyword: '성실' },
    { key: 'aquarius',    emoji: '♒', name: '물병자리',   range: '1/20~2/18',   element: '바람',
      trait: '남들과 같은 답을 싫어하는 사람', keyword: '독창' },
    { key: 'pisces',      emoji: '♓', name: '물고기자리', range: '2/19~3/20',   element: '물',
      trait: '남의 기분이 나한테 그대로 옮겨오는 사람', keyword: '공감' },
  ];

  // 별자리 경계일(양력). [월, 시작일] — 이 날부터 해당 별자리가 시작된다.
  const ZODIAC_CUTOFFS = [
    [1, 20, 'aquarius'], [2, 19, 'pisces'], [3, 21, 'aries'], [4, 20, 'taurus'],
    [5, 21, 'gemini'], [6, 22, 'cancer'], [7, 23, 'leo'], [8, 23, 'virgo'],
    [9, 23, 'libra'], [10, 23, 'scorpio'], [11, 23, 'sagittarius'], [12, 22, 'capricorn'],
  ];

  // ---------- 십이지(띠) ----------
  // zhi는 사주 계산 결과(연주 지지)와 그대로 맞물린다 — 생년을 따로 나눌 필요가 없다.
  const CHINESE_ZODIAC = [
    { key: 'rat',     zhi: '子', emoji: '🐭', name: '쥐띠',     trait: '눈치와 셈이 빠른 사람', keyword: '기민함' },
    { key: 'ox',      zhi: '丑', emoji: '🐮', name: '소띠',     trait: '느려 보여도 결국 끝내는 사람', keyword: '끈기' },
    { key: 'tiger',   zhi: '寅', emoji: '🐯', name: '호랑이띠', trait: '한번 마음먹으면 밀어붙이는 사람', keyword: '용기' },
    { key: 'rabbit',  zhi: '卯', emoji: '🐰', name: '토끼띠',   trait: '분위기를 부드럽게 만드는 사람', keyword: '온화함' },
    { key: 'dragon',  zhi: '辰', emoji: '🐲', name: '용띠',     trait: '판을 크게 보는 사람', keyword: '기세' },
    { key: 'snake',   zhi: '巳', emoji: '🐍', name: '뱀띠',     trait: '말수는 적고 생각은 깊은 사람', keyword: '통찰' },
    { key: 'horse',   zhi: '午', emoji: '🐴', name: '말띠',     trait: '가만히 있는 걸 못 견디는 사람', keyword: '활력' },
    { key: 'goat',    zhi: '未', emoji: '🐑', name: '양띠',     trait: '주변을 살피느라 자기를 미루는 사람', keyword: '배려' },
    { key: 'monkey',  zhi: '申', emoji: '🐵', name: '원숭이띠', trait: '어떻게든 방법을 찾아내는 사람', keyword: '재치' },
    { key: 'rooster', zhi: '酉', emoji: '🐔', name: '닭띠',     trait: '할 말은 하고 마는 사람', keyword: '분명함' },
    { key: 'dog',     zhi: '戌', emoji: '🐶', name: '개띠',     trait: '한 번 믿으면 끝까지 가는 사람', keyword: '의리' },
    { key: 'pig',     zhi: '亥', emoji: '🐷', name: '돼지띠',   trait: '손해 봐도 사람을 먼저 챙기는 사람', keyword: '너그러움' },
  ];

  // ---------- 오늘의 기운 풀 ----------
  // 별자리키/띠키 + 날짜로 결정론적으로 하나 고른다. 사주와 문장 톤을 맞췄다.
  const SIGN_DAY_SEED = [
    { emoji: '🌤️', title: '흐름이 순한 날', diagnosis: '순풍 감지',
      advice: '평소 미뤄둔 걸 하나만 꺼내 처리하기 딱 좋은 날',
      caution: '너무 순해서 방심하면 마감이 코앞까지 온다' },
    { emoji: '⚡', title: '속도가 붙는 날', diagnosis: '가속 구간 진입',
      advice: '오늘 시작한 건 생각보다 빨리 굴러간다. 첫 삽을 뜨기',
      caution: '빨라진 만큼 확인을 건너뛰기 쉽다' },
    { emoji: '🧱', title: '한 번 막히는 날', diagnosis: '저항 감지',
      advice: '정면으로 뚫기보다 옆문을 찾는 쪽이 이득',
      caution: '억지로 밀면 오늘 안에 안 끝난다' },
    { emoji: '💬', title: '말이 오가는 날', diagnosis: '소통 활성화',
      advice: '묻고 싶었던 걸 오늘 물어보면 답이 잘 돌아온다',
      caution: '말이 많아지면 안 해도 될 말까지 새어 나간다' },
    { emoji: '🌱', title: '채워지는 날', diagnosis: '보충 신호',
      advice: '도움이나 좋은 소식을 사양하지 말고 그냥 받기',
      caution: '받기만 하면 다음 날 마음이 허해진다' },
    { emoji: '🪞', title: '나를 보게 되는 날', diagnosis: '자기 점검 모드',
      advice: '남 눈치 말고 내 페이스대로 가도 괜찮은 날',
      caution: '들여다보다 자책으로 넘어가지 않게' },
    { emoji: '💰', title: '뭔가 들어오는 날', diagnosis: '획득 기운',
      advice: '미뤄둔 협상이나 결정을 오늘 해도 좋다',
      caution: '욕심이 과하면 다 잡으려다 하나도 못 잡는다' },
    { emoji: '🫧', title: '가벼워지는 날', diagnosis: '해소 국면',
      advice: '무거웠던 걸 하나 내려놓기. 오늘은 그게 잘 된다',
      caution: '가벼워진 김에 중요한 것까지 놓지 않게' },
    { emoji: '🔍', title: '디테일이 보이는 날', diagnosis: '관찰력 상승',
      advice: '어제 지나친 것을 오늘 다시 보면 답이 있다',
      caution: '너무 파고들면 큰 그림을 놓친다' },
    { emoji: '🤝', title: '사람이 붙는 날', diagnosis: '인연 활성화',
      advice: '먼저 연락하는 쪽이 이득인 날. 짧게라도 안부 묻기',
      caution: '다 맞춰주려다 정작 내 일이 밀린다' },
    { emoji: '🌙', title: '조용히 가는 날', diagnosis: '저전력 모드',
      advice: '오늘은 벌이지 말고 정리하는 쪽으로',
      caution: '조용한 걸 무기력으로 오해하지 않기' },
    { emoji: '🎯', title: '한 방이 통하는 날', diagnosis: '집중력 집약',
      advice: '여러 개 벌이지 말고 딱 하나만 골라 끝내기',
      caution: '고른 하나가 틀리면 하루가 통째로 날아간다' },
    { emoji: '🌊', title: '기분이 출렁이는 날', diagnosis: '진폭 확대',
      advice: '결정은 저녁으로 미루고, 오전엔 감정만 흘려보내기',
      caution: '출렁일 때 보낸 메시지는 대체로 후회한다' },
    { emoji: '🎁', title: '뜻밖이 있는 날', diagnosis: '변수 발생',
      advice: '계획에 10분쯤 여백을 두면 그 자리에 좋은 게 들어온다',
      caution: '뜻밖이 늘 좋은 쪽만은 아니다' },
  ];

  // ---------- 사주 궁합 (생년월일로 보는 궁합, 궁합의 본편) ----------
  // 두 사람의 일간(태어난 날의 천간) 오행이 서로 어떤 관계인지가 핵심이다.
  //   상생 = 서로를 살림 / 비화 = 결이 같음 / 상극 = 부딪힘
  // 방향까지 구분한다 — 내가 주는 쪽인지 받는 쪽인지에 따라 관계의 느낌이 다르다.
  const SAJU_PAIR_LINES = {
    give:  { stars: 5, label: '내가 살려주는 사이',
      line: '내 기운이 상대를 자라게 합니다. 옆에 있으면 상대가 잘 풀리는 게 눈에 보여요.',
      caution: '주기만 하다 내가 비어버리지 않게, 가끔은 받아도 됩니다.' },
    receive: { stars: 5, label: '나를 살려주는 사이',
      line: '상대가 있으면 내가 편해집니다. 막혔던 게 이 사람 앞에서는 이상하게 풀려요.',
      caution: '기대는 게 습관이 되면 상대가 먼저 지칩니다.' },
    same:  { stars: 4, label: '결이 같은 사이',
      line: '말하지 않아도 통하는 게 많습니다. 취향도 속도도 비슷해서 편안해요.',
      caution: '약한 지점까지 똑같아서, 둘 다 같은 자리에서 막힙니다.' },
    control: { stars: 3, label: '내가 끌고 가는 사이',
      line: '내가 방향을 잡고 상대가 따라오는 구도입니다. 일에서는 잘 굴러가요.',
      caution: '끌기만 하면 상대는 눌린다고 느낍니다. 물어봐 주세요.' },
    pressed: { stars: 3, label: '나를 잡아주는 사이',
      line: '상대 앞에서는 내가 함부로 못 합니다. 그래서 실수가 줄어드는 관계예요.',
      caution: '눌린다는 느낌이 오래가면 마음이 먼저 닫힙니다.' },
  };

  // 사주 궁합에서 띠(연지) 관계는 보조 점수로만 쓴다.
  const SAJU_ZHI_BONUS = { samhap: 1, yukhap: 1, same: 0, plain: 0, chung: -1, wonjin: -1 };

  // ---------- 별자리 궁합 ----------
  // 12×12 = 144쌍을 다 쓸 수는 없다. 서양 점성술이 실제로 쓰는 기준(원소 관계)으로 묶는다.
  //   같은 원소 = 말이 통함 / 불·바람, 흙·물 = 서로를 살림 / 불·물, 흙·바람 = 부딪힘
  // 여기에 "같은 별자리"와 "정반대(6칸 차이)"만 따로 문장을 둔다.
  const ZODIAC_PAIR_LINES = {
    '불-불': { stars: 4, line: '둘 다 앞으로 튀어나가는 쪽이라 같이 있으면 일이 커집니다. 대신 브레이크를 밟을 사람이 없어요.' },
    '불-흙': { stars: 3, line: '한 명은 지르고 한 명은 수습합니다. 역할이 굳어지면 수습하는 쪽이 지쳐요.' },
    '불-바람': { stars: 5, line: '바람이 불을 키우듯 서로를 부추깁니다. 같이 있으면 아이디어가 실제로 벌어져요.' },
    '불-물': { stars: 2, line: '한 명은 속도로, 한 명은 감정으로 움직입니다. 서로 "왜 저래"가 나오기 쉬워요.' },
    '흙-흙': { stars: 4, line: '약속과 현실 감각이 비슷해 편안합니다. 대신 둘 다 변화를 미뤄 정체될 수 있어요.' },
    '흙-바람': { stars: 2, line: '한 명은 땅에 발을 붙이고 한 명은 자꾸 떠오릅니다. 답답함과 갑갑함이 번갈아 나와요.' },
    '흙-물': { stars: 5, line: '흙이 물을 담듯 서로를 안정시킵니다. 말수가 적어도 오래가는 조합이에요.' },
    '바람-바람': { stars: 4, line: '대화가 끊기지 않습니다. 대신 정작 결정을 내릴 사람이 없어요.' },
    '바람-물': { stars: 3, line: '한 명은 머리로, 한 명은 마음으로 옵니다. 서로의 언어를 배우면 깊어져요.' },
    '물-물': { stars: 4, line: '말 안 해도 기분이 옮겨옵니다. 좋을 땐 최고지만 가라앉을 때 같이 가라앉아요.' },
  };
  const ZODIAC_SAME_SIGN = '거울 같은 사이입니다. 좋아하는 것도 지치는 지점도 똑같아서, 이해는 빠르고 충돌은 정확해요.';
  const ZODIAC_OPPOSITE = '정반대 자리라 서로 없는 걸 갖고 있습니다. 끌리는 만큼 부딪히고, 부딪힌 만큼 배웁니다.';

  // ---------- 띠 궁합 ----------
  // 십이지 궁합은 전통적으로 삼합·육합·충·원진이라는 분명한 규칙이 있다.
  // 임의로 점수를 매기지 않고 그 규칙을 그대로 쓴다.
  const ZHI_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  // 삼합: 네 무리, 각 무리 안에서는 서로 최고 궁합
  const SAMHAP = [['申', '子', '辰'], ['巳', '酉', '丑'], ['寅', '午', '戌'], ['亥', '卯', '未']];
  // 육합: 짝지어 서로를 돕는 여섯 쌍
  const YUKHAP = [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']];
  // 충: 정반대(여섯 칸 차이), 부딪히는 관계
  const CHUNG = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
  // 원진: 이유 없이 껄끄럽다고 보는 여섯 쌍
  const WONJIN = [['子', '未'], ['丑', '午'], ['寅', '巳'], ['卯', '辰'], ['申', '亥'], ['酉', '戌']];

  const ANIMAL_PAIR_LINES = {
    samhap: { stars: 5, label: '삼합', line: '예로부터 최고로 치는 짝입니다. 설명 없이 손발이 맞고, 같이 벌인 일이 잘 굴러가요.' },
    yukhap: { stars: 5, label: '육합', line: '서로 부족한 자리를 정확히 채웁니다. 오래 붙어 있어도 지치지 않는 조합이에요.' },
    same:   { stars: 3, label: '같은 띠', line: '결이 똑같아서 이해는 빠릅니다. 대신 둘 다 같은 자리에서 막혀요.' },
    chung:  { stars: 2, label: '충', line: '정면으로 부딪히는 자리입니다. 끌림이 강한 만큼 다툼도 크게 붙어요.' },
    wonjin: { stars: 2, label: '원진', line: '큰 이유가 없는데 어딘가 껄끄럽습니다. 기대를 낮추면 오히려 편해져요.' },
    plain:  { stars: 3, label: '보통', line: '특별히 좋지도 나쁘지도 않습니다. 그래서 서로 하기 나름인 사이예요.' },
  };

  // 별자리·띠 전용 행운 포인트
  const SIGN_LUCKY_TIME = ['이른 아침', '출근길', '점심 직후', '오후 3시쯤', '해 질 무렵', '저녁 식사 뒤', '잠들기 전'];
  const SIGN_LUCKY_PLACE = ['창가 자리', '늘 가던 카페', '집 근처 산책로', '엘리베이터 앞', '편의점', '지하철 한 정거장 전', '책상 위'];
  const SIGN_LUCKY_ACT = [
    '먼저 인사 건네기', '물 한 잔 더 마시기', '10분 일찍 나서기', '안 쓰는 알림 하나 끄기',
    '고맙다고 말하기', '한 번 더 저장하기', '두 정거장 걷기', '오늘 산 것 영수증 보기',
  ];

  window.MAUMJARO_ZODIAC_DATA = {
    ZODIAC_SIGNS, ZODIAC_CUTOFFS, CHINESE_ZODIAC,
    SIGN_DAY_SEED, SIGN_LUCKY_TIME, SIGN_LUCKY_PLACE, SIGN_LUCKY_ACT,
    ZODIAC_PAIR_LINES, ZODIAC_SAME_SIGN, ZODIAC_OPPOSITE,
    ZHI_ORDER, SAMHAP, YUKHAP, CHUNG, WONJIN, ANIMAL_PAIR_LINES,
    SAJU_PAIR_LINES, SAJU_ZHI_BONUS,
  };
})();
