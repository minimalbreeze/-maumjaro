// 맘운자로 게임 레이어 데이터 (마음약 / 희귀도 / 레벨 / 연속출석 보상)
//
// 이 파일에는 "데이터"만 둔다. 규칙을 코드 곳곳에 하드코딩하지 않기 위한 분리다.
// 마음약을 100종까지 늘리려면 MEDICINES 배열에 항목만 추가하면 되고,
// 확률·보상·레벨명은 아래 표만 고쳐도 전부 반영된다.
//
// prescriptions-data.js / fortune-data.js와 동일한 단일 IIFE + window export 패턴.
(() => {
  'use strict';

  // ---------- 희귀도 ----------
  // weight는 "기본 뽑기"에서의 상대 가중치다(합이 100이 되도록 두었지만 합계는 자유).
  // 연속출석 특별 보상은 이 확률을 쓰지 않고 최소 등급을 강제한다(아래 STREAK_REWARDS).
  const RARITIES = [
    { key: 'normal', label: 'NORMAL', order: 1, weight: 65, color: '#8e93a8', tint: 'rgba(142,147,168,0.16)' },
    { key: 'rare', label: 'RARE', order: 2, weight: 25, color: '#4f86e8', tint: 'rgba(79,134,232,0.16)' },
    { key: 'epic', label: 'EPIC', order: 3, weight: 9, color: '#b779ef', tint: 'rgba(183,121,239,0.18)' },
    { key: 'legendary', label: 'LEGENDARY', order: 4, weight: 1, color: '#f0a12e', tint: 'rgba(240,161,46,0.20)' },
  ];

  // ---------- 카테고리 ----------
  const MED_CATEGORIES = [
    { key: 'work', label: '직장·학교', emoji: '🏢' },
    { key: 'love', label: '연애', emoji: '💕' },
    { key: 'social', label: '인간관계', emoji: '👥' },
    { key: 'mind', label: '멘탈', emoji: '🧠' },
  ];

  // ---------- 마음약 ----------
  // id는 저장된 컬렉션의 키가 되므로 한 번 정하면 바꾸지 않는다(바꾸면 기존 보유분을 잃는다).
  // hint는 아직 못 얻은 칸에 보여줄 문구다.
  // season/limited/availableFrom/availableUntil은 시즌 한정용 자리(PHASE 3). 지금은 비워둔다.
  const MEDICINES = [
    // ── 직장·학교 ──────────────────────────────────────────
    { id: 'w_monday', name: '월요일해독제', category: 'work', rarity: 'normal', icon: '💊',
      description: '월요일 아침에만 듣는다는 그 약. 화요일엔 효과가 없다.',
      hint: '한 주가 시작될 때 흔히 발견된다.',
      shareText: '월요일을 해독했습니다' },
    { id: 'w_meeting', name: '회의졸림방지제', category: 'work', rarity: 'normal', icon: '💊',
      description: '눈은 뜨고 있게 해주지만 내용까지 들리게 하진 않는다.',
      hint: '긴 회의 끝에 남는다.', shareText: '회의를 버텼습니다' },
    { id: 'w_homework', name: '과제삭제정', category: 'work', rarity: 'normal', icon: '💊',
      description: '과제가 사라지진 않는다. 잠깐 잊게 해줄 뿐이다.',
      hint: '마감이 다가올 때 나타난다.', shareText: '과제를 잠시 잊었습니다' },
    { id: 'w_commute', name: '출근길멍때림정', category: 'work', rarity: 'normal', icon: '💊',
      description: '지하철에서 아무 생각 없이 창밖을 보게 해준다.',
      hint: '아침 이동 중에 자주 보인다.', shareText: '출근길을 멍하게 통과했습니다' },
    { id: 'w_lunch', name: '점심메뉴결정제', category: 'work', rarity: 'normal', icon: '💊',
      description: '"아무거나"라고 말하는 사람에게 특히 권장된다.',
      hint: '정오 무렵에 흔하다.', shareText: '드디어 점심을 정했습니다' },
    { id: 'w_leave', name: '퇴근기원정', category: 'work', rarity: 'rare', icon: '💊',
      description: '시계를 봐도 시간이 안 가는 증상에 쓴다. 6시가 되면 자동으로 분해된다.',
      hint: '오후 늦게 간절해진다.', shareText: '퇴근을 기원했습니다' },
    { id: 'w_boss', name: '상사시야차단제', category: 'work', rarity: 'rare', icon: '💊',
      description: '내가 안 보이게 되는 건 아니다. 내 마음이 안 보이게 될 뿐이다.',
      hint: '누군가 뒤에 서 있을 때.', shareText: '오늘도 무사히 넘겼습니다' },
    { id: 'w_deadline', name: '마감임박각성제', category: 'work', rarity: 'rare', icon: '💊',
      description: '평소 실력의 3배가 나오지만 다음 날 하루치를 미리 당겨 쓴다.',
      hint: '마감 직전에만 생성된다.', shareText: '마감을 막판에 붙잡았습니다' },
    { id: 'w_payday', name: '월급실감주사', category: 'work', rarity: 'epic', icon: '💉',
      description: '통장을 스쳐 지나간 그것을 아주 잠깐 붙잡아 준다. 지속시간 매우 짧음.',
      hint: '한 달에 한 번쯤 만날 수 있다.', shareText: '월급을 실감했습니다' },
    { id: 'w_quit', name: '퇴사각계산기정', category: 'work', rarity: 'legendary', icon: '🧪',
      description: '누르면 숫자가 나온다. 대부분은 그 숫자를 보고 조용히 닫는다.',
      hint: '아주 가끔, 아주 지친 날에.', shareText: '퇴사각을 계산해봤습니다' },

    // ── 연애 ────────────────────────────────────────────
    { id: 'l_reply', name: '답장기다림완화제', category: 'love', rarity: 'normal', icon: '💊',
      description: '휴대폰을 5분에 한 번만 보게 해준다. 원래는 30초였다.',
      hint: '답장을 기다릴 때.', shareText: '답장을 기다리는 중입니다' },
    { id: 'l_seen', name: '읽씹진정제', category: 'love', rarity: 'normal', icon: '💊',
      description: '"바쁜가 보다"라고 세 번 되뇌게 해준다.',
      hint: '숫자 1이 사라졌는데 조용할 때.', shareText: '읽씹을 견뎠습니다' },
    { id: 'l_selfie', name: '셀카보정정', category: 'love', rarity: 'normal', icon: '💊',
      description: '사진이 아니라 자신감을 보정한다.',
      hint: '사진을 스무 장쯤 찍은 날.', shareText: '오늘 사진은 잘 나왔습니다' },
    { id: 'l_hello', name: '첫인사연습정', category: 'love', rarity: 'normal', icon: '💊',
      description: '머릿속으로만 백 번 연습한 그 문장을 실제로 보내게 해준다.',
      hint: '말을 걸까 말까 할 때.', shareText: '드디어 인사를 건넸습니다' },
    { id: 'l_course', name: '데이트코스탐색제', category: 'love', rarity: 'normal', icon: '💊',
      description: '지도 앱을 40분 붙잡고 있어도 결국 그 카페로 간다.',
      hint: '약속을 앞둔 날.', shareText: '데이트 코스를 짰습니다' },
    { id: 'l_some', name: '썸촉진제', category: 'love', rarity: 'rare', icon: '💊',
      description: '애매한 상태를 조금 앞으로 민다. 방향까지 정해주진 않는다.',
      hint: '애매한 사이일 때.', shareText: '썸이 한 걸음 나아갔습니다' },
    { id: 'l_confess', name: '고백용기충전제', category: 'love', rarity: 'rare', icon: '💊',
      description: '용기는 채워주지만 결과는 책임지지 않는다.',
      hint: '마음을 전하고 싶은 날.', shareText: '용기를 충전했습니다' },
    { id: 'l_push', name: '밀당중화제', category: 'love', rarity: 'rare', icon: '💊',
      description: '재고 따지느라 지친 마음을 원래대로 돌려놓는다.',
      hint: '계산이 길어질 때.', shareText: '그냥 솔직해지기로 했습니다' },
    { id: 'l_ex', name: '전애인기억삭제정', category: 'love', rarity: 'epic', icon: '💉',
      description: '기억은 안 지워진다. 다만 그 기억이 오늘을 망치지 않게 해준다.',
      hint: '문득 떠오르는 밤에.', shareText: '지난 일을 흘려보냈습니다' },
    { id: 'l_solo', name: '솔로면역항체', category: 'love', rarity: 'epic', icon: '💉',
      description: '"너 언제 결혼하니"에 웃으며 답하게 해주는 항체.',
      hint: '명절이나 모임 뒤에.', shareText: '솔로 면역이 생겼습니다' },

    // ── 인간관계 ─────────────────────────────────────────
    { id: 's_eyes', name: '눈치차단제', category: 'social', rarity: 'normal', icon: '💊',
      description: '남이 나를 어떻게 볼까 하는 생각을 30% 줄여준다.',
      hint: '사람 많은 곳에 다녀온 날.', shareText: '눈치를 조금 껐습니다' },
    { id: 's_mute', name: '단톡방음소거정', category: 'social', rarity: 'normal', icon: '💊',
      description: '알림은 꺼도 되지만 마음까지 끄긴 어렵다. 그걸 도와준다.',
      hint: '알림이 쉴 새 없을 때.', shareText: '단톡방을 잠시 껐습니다' },
    { id: 's_awkward', name: '어색함완화제', category: 'social', rarity: 'normal', icon: '💊',
      description: '엘리베이터에서 마주쳤을 때의 그 3초를 견디게 해준다.',
      hint: '어색한 순간 뒤에.', shareText: '어색함을 넘겼습니다' },
    { id: 's_react', name: '리액션생성제', category: 'social', rarity: 'normal', icon: '💊',
      description: '"헐 진짜?"를 자동으로 만들어 준다. 남용하면 티가 난다.',
      hint: '대화가 길어질 때.', shareText: '리액션을 장착했습니다' },
    { id: 's_name', name: '이름기억보조정', category: 'social', rarity: 'normal', icon: '💊',
      description: '분명 어제 들었는데. 그 이름을 붙잡아 준다.',
      hint: '새로운 사람을 만난 날.', shareText: '이름을 기억해냈습니다' },
    { id: 's_detox', name: '인간관계해독제', category: 'social', rarity: 'rare', icon: '💊',
      description: '오늘은 굳이 모두에게 잘할 필요 없습니다.',
      hint: '사람에 지친 날.', shareText: '관계를 해독했습니다' },
    { id: 's_alone', name: '혼자있고싶음정', category: 'social', rarity: 'rare', icon: '💊',
      description: '혼자 있고 싶은 게 이상한 일이 아니라고 알려준다.',
      hint: '약속을 미루고 싶을 때.', shareText: '혼자만의 시간을 챙겼습니다' },
    { id: 's_no', name: '거절연습캡슐', category: 'social', rarity: 'rare', icon: '💊',
      description: '"어려울 것 같아요" 한 문장을 말할 수 있게 해준다.',
      hint: '부탁을 받은 날.', shareText: '거절을 연습했습니다' },
    { id: 's_cut', name: '손절결심주사', category: 'social', rarity: 'epic', icon: '💉',
      description: '누구를 미워하기 위한 게 아니다. 나를 덜 소모하기 위한 것이다.',
      hint: '오래 참아온 뒤에.', shareText: '나를 아끼기로 했습니다' },
    { id: 's_faith', name: '인류애회복제', category: 'social', rarity: 'legendary', icon: '🧪',
      description: '아주 사소한 친절 하나로 만들어진다. 그래서 귀하다.',
      hint: '뜻밖의 다정함을 만난 날.', shareText: '인류애가 회복됐습니다' },

    // ── 멘탈 ────────────────────────────────────────────
    { id: 'm_stop', name: '생각멈춤제', category: 'mind', rarity: 'normal', icon: '💊',
      description: '생각이 꼬리를 무는 걸 잠깐 끊어준다.',
      hint: '머리가 복잡한 날.', shareText: '생각을 잠시 멈췄습니다' },
    { id: 'm_nothing', name: '아무것도안해도됨정', category: 'mind', rarity: 'normal', icon: '💊',
      description: '오늘 아무것도 못 했어도 하루는 지나간다.',
      hint: '아무것도 못 한 날.', shareText: '오늘은 쉬어가기로 했습니다' },
    { id: 'm_sigh', name: '한숨정화제', category: 'mind', rarity: 'normal', icon: '💊',
      description: '한숨을 참으라고 하지 않는다. 다 쉬고 나서 한 번 더 쉬게 해준다.',
      hint: '한숨이 잦은 날.', shareText: '한숨을 정화했습니다' },
    { id: 'm_night', name: '새벽감성차단제', category: 'mind', rarity: 'normal', icon: '💊',
      description: '새벽 2시에 쓴 문장은 아침에 대부분 지워진다는 사실을 알려준다.',
      hint: '늦은 밤에 나타난다.', shareText: '새벽 감성을 넘겼습니다' },
    { id: 'm_worry', name: '걱정보류정', category: 'mind', rarity: 'normal', icon: '💊',
      description: '걱정을 없애진 못한다. 내일로 미뤄줄 뿐이다.',
      hint: '걱정이 많은 날.', shareText: '걱정을 내일로 미뤘습니다' },
    { id: 'm_esteem', name: '자존감충전주사', category: 'mind', rarity: 'rare', icon: '💉',
      description: '남이 채워주길 기다리지 않아도 되게 만든다.',
      hint: '스스로가 작게 느껴질 때.', shareText: '자존감을 충전했습니다' },
    { id: 'm_compare', name: '비교금지캡슐', category: 'mind', rarity: 'rare', icon: '💊',
      description: 'SNS를 봐도 마음이 덜 깎이게 해준다.',
      hint: '남의 소식을 오래 본 날.', shareText: '비교를 멈췄습니다' },
    { id: 'm_today', name: '오늘만사는정', category: 'mind', rarity: 'rare', icon: '💊',
      description: '먼 미래를 잠시 접어두고 오늘 하루만 보게 해준다.',
      hint: '앞날이 막막할 때.', shareText: '오늘 하루만 살기로 했습니다' },
    { id: 'm_armor', name: '멘탈방탄코팅제', category: 'mind', rarity: 'epic', icon: '💉',
      description: '상처를 안 받게 하진 못한다. 다만 덜 깊게 들어오게 한다.',
      hint: '단단해지고 싶은 날.', shareText: '멘탈을 코팅했습니다' },
    { id: 'm_reset', name: '마음리셋주사', category: 'mind', rarity: 'epic', icon: '💉',
      description: '어제의 나와 오늘의 나를 분리해 준다. 어제는 어제로 두자.',
      hint: '다시 시작하고 싶을 때.', shareText: '마음을 리셋했습니다' },

    // ── 시즌 한정 ────────────────────────────────────────
    // season이 지금과 맞을 때만 뽑기 후보에 들어간다. 기간이 지나면 새로 얻을 수 없지만,
    // 이미 얻은 사람의 컬렉션에는 그대로 남는다(잠금이 아니라 '기간 지남'으로 표시).
    // weekday: 0=일 … 6=토 / months: 1~12
    { id: 'se_monday', name: '월요병긴급주사', category: 'work', rarity: 'rare', icon: '💉',
      description: '월요일에만 조제된다. 화요일이 오면 저절로 사라진다.',
      hint: '월요일에만 만날 수 있어요.', shareText: '월요병을 넘겼습니다',
      limited: true, season: '월요일', weekday: 1 },
    { id: 'se_friday', name: '불금점화제', category: 'work', rarity: 'rare', icon: '💊',
      description: '금요일 오후에 효과가 가장 세다. 주말을 미리 당겨 쓰게 해준다.',
      hint: '금요일에만 만날 수 있어요.', shareText: '불금에 불을 붙였습니다',
      limited: true, season: '금요일', weekday: 5 },
    { id: 'se_exam', name: '벼락치기각성제', category: 'work', rarity: 'epic', icon: '💉',
      description: '시험 기간에만 유통된다. 복용 후 기억력은 24시간만 유지된다.',
      hint: '시험 기간(4·6·10·12월)에만 나타나요.', shareText: '벼락치기에 성공했습니다',
      limited: true, season: '시험기간', months: [4, 6, 10, 12] },
    { id: 'se_xmas', name: '솔로생존정', category: 'love', rarity: 'epic', icon: '💊',
      description: '12월에만 조제된다. 거리의 캐럴을 배경음악으로 바꿔준다.',
      hint: '12월에만 만날 수 있어요.', shareText: '연말을 무사히 살아냈습니다',
      limited: true, season: '크리스마스', months: [12] },
    { id: 'se_yearend', name: '약속과다해독제', category: 'social', rarity: 'rare', icon: '💊',
      description: '연말에만 필요한 약. 이번 주 약속이 네 개를 넘겼을 때 쓴다.',
      hint: '11~12월에만 만날 수 있어요.', shareText: '연말 약속을 버텼습니다',
      limited: true, season: '연말', months: [11, 12] },
    { id: 'se_newyear', name: '새해다짐보존제', category: 'mind', rarity: 'legendary', icon: '🧪',
      description: '1월에만 만들어진다. 다짐이 2월까지 가게 해준다는 소문이 있다.',
      hint: '1월에만 만날 수 있어요.', shareText: '새해 다짐을 지키는 중입니다',
      limited: true, season: '새해', months: [1] },
  ];

  // ---------- 레벨 ----------
  // 이름은 도달 레벨 기준. 사이 구간은 바로 아래 이름을 그대로 쓴다.
  const LEVEL_TITLES = [
    { level: 1, title: '마음 새싹' },
    { level: 5, title: '마음 관찰자' },
    { level: 10, title: '마음 약사' },
    { level: 20, title: '마음 전문약사' },
    { level: 30, title: '멘탈 연금술사' },
    { level: 50, title: '마음의 달인' },
  ];

  // 다음 레벨까지 필요한 XP. 초반은 3일이면 오르고 점점 완만해진다.
  const LEVEL_CURVE = { base: 30, step: 15 };

  // ---------- 연속 출석 보상 ----------
  // minRarity가 있으면 그 등급 이상이 확정된다(기본 확률을 무시).
  // 여기에 항목만 추가하면 50일·100일 보상도 코드 수정 없이 생긴다.
  const STREAK_REWARDS = [
    { days: 3, minRarity: 'rare', label: 'RARE 이상 확정', bonusXp: 10 },
    { days: 7, minRarity: 'epic', label: 'EPIC 이상 확정', bonusXp: 25, vacationTickets: 1 },
    { days: 14, minRarity: 'epic', label: '특별 마음약', bonusXp: 40, vacationTickets: 1 },
    { days: 30, minRarity: 'legendary', label: 'LEGENDARY 확정', bonusXp: 100, vacationTickets: 2 },
  ];

  // ---------- 설정값 ----------
  const GAME_CONFIG = {
    dailyBaseXp: 10,          // 그날 첫 처방 완료 시
    rarityBonusXp: { normal: 0, rare: 5, epic: 15, legendary: 40 },
    openTapCount: 5,          // 보상 상자를 여는 데 필요한 탭 수
    bonusBoxEnabled: true,    // 낮은 확률로 추가 보상 상자
    bonusBoxChance: 0.08,
    bonusBoxXp: 15,
    shareMinRarity: 'rare',   // 이 등급 이상일 때 공유를 권한다
    // 같은 마음약을 이만큼 모으면 등급 표시가 올라간다(중복이 꽝으로 느껴지지 않게).
    duplicateTiers: [
      { count: 3, label: 'SILVER', color: '#9fb2c4' },
      { count: 5, label: 'GOLD', color: '#e0a83c' },
      { count: 10, label: 'PRISM', color: '#b779ef' },
    ],
    // 친구 링크로 처음 들어온 사람에게 줄 환영 보상(가입 없이 바로 체험시키기 위함)
    inviteWelcomeXp: 10,
  };

  window.MAUMJARO_GAME_DATA = {
    RARITIES, MED_CATEGORIES, MEDICINES,
    LEVEL_TITLES, LEVEL_CURVE, STREAK_REWARDS, GAME_CONFIG,
  };
})();
