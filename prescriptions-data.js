(() => {
  'use strict';

  // ---------- 처방 카테고리 메타 ----------
  // "emotion"은 기존 SYMPTOMS(app.js)를 어댑터로 감싼 것이며, 여기엔 콘텐츠를 직접 넣지 않는다.
  // 콘텐츠가 아직 없는 카테고리(sleep/social/study/fun/random)는 처방센터에서 "곧 추가돼요"로 표시된다.
  const RX_CATEGORIES = [
    { id: 'emotion', label: '감정', emoji: '❤️', color: '#ff9166' },
    { id: 'work', label: '직장', emoji: '💼', color: '#9aa8e0' },
    { id: 'love', label: '연애', emoji: '💕', color: '#ff8fb3' },
    { id: 'money', label: '돈', emoji: '💰', color: '#ffc66b' },
    { id: 'food', label: '음식', emoji: '🍗', color: '#ffb37a' },
    { id: 'travel', label: '여행', emoji: '✈️', color: '#5fb3a3' },
    { id: 'daily', label: '일상', emoji: '🛋️', color: '#b79aef' },
    { id: 'sleep', label: '수면', emoji: '💤', color: '#8aa0c9' },
    { id: 'social', label: '인간관계', emoji: '👥', color: '#7ec8e3' },
    { id: 'study', label: '공부', emoji: '📚', color: '#8fd694' },
    { id: 'fun', label: '재미', emoji: '🎉', color: '#ffd166' },
    { id: 'random', label: '랜덤', emoji: '🎲', color: '#ef6a5a' },
  ];

  // ---------- 처방 시드 콘텐츠 (21개, emotion 6종은 app.js SYMPTOMS 어댑터로 별도 제공) ----------
  const PRESCRIPTIONS_SEED = [
    // ---- work ----
    { id: 'work-monday-survival', category: 'work', title: '월요병 생존 주사', diagnosis: '월요병 3기',
      symptom: '월요일 아침만 되면 몸이 무거워지고 눈이 안 떠짐',
      prescription: '이불 밖으로 나온 당신에게 박수를. 커피 한 잔과 함께 천천히 시동을 걸어드립니다',
      sideEffect: '화요일부터는 또 괜찮아짐 (단, 다음 주 월요일 재발 가능)',
      warning: '실제 병가 사유로 사용 시 상사가 처방전을 믿지 않을 수 있어요',
      emoji: '😩', color: '#ff9166', rarity: 'common',
      shareText: '나 지금 월요병 3기래... 너도 처방받아봐 😩💉', isPremium: false },

    { id: 'work-quit-time-craving', category: 'work', title: '퇴근 욕구 과다증', diagnosis: '조기퇴근 갈망 증후군',
      symptom: '출근 30분 만에 시계를 다섯 번 이상 확인함',
      prescription: '남은 시간을 잘게 쪼개어 버틸 수 있게 도와드립니다. 6시가 되면 증상은 기적처럼 사라집니다',
      sideEffect: '지하철역까지 발걸음이 갑자기 빨라질 수 있음',
      warning: '상사 앞에서 처방전을 흔들지 마세요',
      emoji: '🏃', color: '#ffb37a', rarity: 'common',
      shareText: '퇴근 욕구 과다증 처방받고 왔어요 🏃💨', isPremium: false },

    { id: 'work-boss-response', category: 'work', title: '상사 대응 처방', diagnosis: '눈치 과부하 증후군',
      symptom: '상사 목소리만 들려도 어깨가 굳음',
      prescription: '"네, 알겠습니다"를 자연스럽게 발음할 수 있는 텐션을 처방해드립니다',
      sideEffect: '퇴근 후 그 대사가 꿈에 나올 수 있음',
      warning: '실제 반박은 각자 책임입니다',
      emoji: '😐', color: '#9aa8e0', rarity: 'rare',
      shareText: '상사 대응 처방 받고 정신 챙김 😐', isPremium: false },

    { id: 'work-meeting-fatigue', category: 'work', title: '회의 피로 증후군', diagnosis: '이거 이메일로 될 걸 회의로 함 병',
      symptom: '"그래서 결론이 뭐죠"가 목구멍까지 차오름',
      prescription: '회의실 산소 부족 상태에서도 끄덕임을 유지할 수 있는 기력을 보충합니다',
      sideEffect: '다음 회의도 똑같이 늘어질 수 있음',
      warning: '이 처방은 회의 시간 단축을 보장하지 않습니다',
      emoji: '😶', color: '#b79aef', rarity: 'common',
      shareText: '회의 피로 증후군... 나만 그런 거 아니지?', isPremium: false },

    { id: 'work-procrastination', category: 'work', title: '업무 미루기 처방', diagnosis: '내일의 나에게 위임 장애',
      symptom: '마감 전날에만 폭발적인 집중력이 생김',
      prescription: '지금 당장 손가락 하나만 움직이게 하는 최소 동력을 주입합니다',
      sideEffect: '갑자기 책상 정리가 하고 싶어질 수 있음 (가짜 생산성 주의)',
      warning: '실제 마감은 이 주사로 늦춰지지 않습니다',
      emoji: '📎', color: '#ff8fb3', rarity: 'common',
      shareText: '업무 미루기 처방 맞고 일 시작함(진짜임)', isPremium: false },

    // ---- love ----
    { id: 'love-text-urge', category: 'love', title: '연락 충동 억제 주사', diagnosis: '답장 기다림 과열 증후군',
      symptom: '핸드폰을 30초마다 확인하고 있음',
      prescription: '"먼저 연락할까 말까" 사이에서 흔들리는 마음을 진정시켜드립니다',
      sideEffect: '갑자기 쿨한 척 잠수를 타고 싶어질 수 있음',
      warning: '진짜 연락 여부는 본인 판단으로',
      emoji: '📱', color: '#ff9166', rarity: 'rare',
      shareText: '연락 충동 억제 주사 맞고 폰 내려놓음 📱', isPremium: false },

    { id: 'love-read-no-reply', category: 'love', title: '읽씹 후유증 처방', diagnosis: '1이 사라진 자리 증후군',
      symptom: '"읽음" 표시만 보고 하루 종일 딴생각',
      prescription: '상상력을 현실로 착각하지 않도록 마음을 다독여드립니다',
      sideEffect: '답장이 오면 급격히 괜찮아짐',
      warning: '처방 효과는 실제 답장 전까지만 지속됩니다',
      emoji: '💬', color: '#9aa8e0', rarity: 'rare',
      shareText: '읽씹 후유증... 이거 처방 필요해', isPremium: false },

    { id: 'love-blind-date-trauma', category: 'love', title: '소개팅 흑역사 회복 처방', diagnosis: '그때 왜 그 말을 했지 증후군',
      symptom: '갑자기 이불킥하고 싶은 충동이 듦',
      prescription: '지나간 대화는 지나간 대로 흘려보낼 수 있게 도와드립니다',
      sideEffect: '다음 소개팅에서 같은 실수를 반복할 수 있음',
      warning: '완치 아님, 재발 잦음',
      emoji: '🙈', color: '#ef6a5a', rarity: 'epic',
      shareText: '소개팅 흑역사 회복 처방... 만인 필수템', isPremium: false },

    { id: 'love-alone-day', category: 'love', title: '혼자 있고 싶은 날 처방', diagnosis: '사회적 배터리 방전',
      symptom: '아무리 좋아하는 사람도 오늘은 만나기 싫음',
      prescription: '혼자만의 시간을 죄책감 없이 즐길 수 있는 마음을 처방합니다',
      sideEffect: '다음 날 갑자기 사람이 그리워질 수 있음',
      warning: '정상입니다. 걱정 마세요',
      emoji: '🛌', color: '#b79aef', rarity: 'common',
      shareText: '혼자 있고 싶은 날 처방 받는 중 🛌', isPremium: false },

    // ---- food ----
    { id: 'food-chicken-deficiency', category: 'food', title: '치킨 결핍증', diagnosis: '튀김 갈망 3단계',
      symptom: '이유 없이 자꾸 배달 앱을 켜게 됨',
      prescription: '눈으로만 봐도 배부른 치킨 사진 감상 처방을 내려드립니다',
      sideEffect: '결국 시킬 수 있음',
      warning: '실제 배달비는 처방 범위 밖입니다',
      emoji: '🍗', color: '#ffc66b', rarity: 'common',
      shareText: '치킨 결핍증 진단받음... 오늘은 참는다', isPremium: false },

    { id: 'food-late-night-craving', category: 'food', title: '야식 욕구 과다증', diagnosis: '밤 11시 이후 식욕 폭주',
      symptom: '분명 저녁을 먹었는데 또 배가 고픔',
      prescription: '물 한 잔과 함께 "이건 진짜 배고픔이 아니다"라는 최면을 처방합니다',
      sideEffect: '최면 실패 시 라면행',
      warning: '다음 날 아침 체중계가 무서울 수 있음',
      emoji: '🍜', color: '#ff9166', rarity: 'common',
      shareText: '야식 욕구 과다증... 못 참겠다', isPremium: false },

    { id: 'food-coffee-deficiency', category: 'food', title: '커피 부족 증후군', diagnosis: '카페인 혈중 농도 저하',
      symptom: '눈은 떴는데 뇌가 안 켜짐',
      prescription: '각성 상태로 복귀할 수 있도록 가상의 카페인을 주입합니다',
      sideEffect: '진짜 커피를 마시기 전까지는 효과 미미',
      warning: '오후 늦게 처방받으면 밤잠을 설칠 수 있음',
      emoji: '☕', color: '#b98a6f', rarity: 'common',
      shareText: '커피 부족 증후군 처방받고 겨우 눈뜸 ☕', isPremium: false },

    // ---- money ----
    { id: 'money-payday-illusion', category: 'money', title: '월급날 착각 증후군', diagnosis: '내가 부자가 된 줄 아는 병',
      symptom: '월급 찍힌 날 갑자기 씀씀이가 커짐',
      prescription: '통장은 스쳐 지나가는 정거장일 뿐임을 상기시켜드립니다',
      sideEffect: '카드값 명세서 확인 시 급격한 현실 자각',
      warning: '이 처방은 지출을 막아주지 않습니다',
      emoji: '💸', color: '#ffc66b', rarity: 'common',
      shareText: '월급날 착각 증후군 진단 완료 💸', isPremium: false },

    { id: 'money-balance-shock', category: 'money', title: '통장 잔고 쇼크', diagnosis: '잔액 조회 후 심정지 위험군',
      symptom: '앱을 열자마자 눈을 질끈 감게 됨',
      prescription: '숫자를 마주할 용기와 함께 약간의 위로를 처방합니다',
      sideEffect: '확인 후 극단적 절약 모드로 전환될 수 있음',
      warning: '실제 재정 계획은 전문가와 상담하세요 (이 앱은 장난입니다)',
      emoji: '😱', color: '#ef6a5a', rarity: 'rare',
      shareText: '통장 잔고 쇼크... 처방 시급함', isPremium: false },

    { id: 'money-impulse-buy-permit', category: 'money', title: '충동구매 허가증', diagnosis: '장바구니 담기 억제 실패',
      symptom: '"이건 꼭 사야 해"라는 확신이 매일 듦',
      prescription: '오늘 하루만 특별히 허락해드립니다 (내일부터는 각자도생)',
      sideEffect: '택배 도착 후 현타가 올 수 있음',
      warning: '이 허가증은 법적 효력이 없습니다',
      emoji: '🛒', color: '#ff8fb3', rarity: 'epic',
      shareText: '충동구매 허가증 발급받음... 위험하다', isPremium: false },

    // ---- daily ----
    { id: 'daily-do-nothing-syndrome', category: 'daily', title: '아무것도 하기 싫음 증후군', diagnosis: '만사 귀찮음 4기',
      symptom: '물 마시러 가는 것도 미룸',
      prescription: '아무것도 안 해도 괜찮다는 마음의 면죄부를 처방합니다',
      sideEffect: '하루가 순삭될 수 있음',
      warning: '장기 방치 시 배달 음식 쓰레기가 쌓일 수 있음',
      emoji: '🫠', color: '#9aa8e0', rarity: 'common',
      shareText: '만사 귀찮음 4기 처방받고 그냥 누워있음 🫠', isPremium: false },

    { id: 'daily-bed-exit-disorder', category: 'daily', title: '침대 이탈 장애', diagnosis: '이불 중력 과다',
      symptom: '알람을 다섯 번 끄고도 그대로임',
      prescription: '이불 밖으로 한 발짝 내디딜 최소한의 의지를 주입합니다',
      sideEffect: '다시 눕고 싶어질 수 있음',
      warning: '지각 책임은 본인에게 있습니다',
      emoji: '🛏️', color: '#ff9166', rarity: 'common',
      shareText: '침대 이탈 장애 처방받고 겨우 일어남', isPremium: false },

    { id: 'daily-cleaning-avoidance', category: 'daily', title: '청소 회피 증후군', diagnosis: '안 보이면 없는 것 병',
      symptom: '옷더미를 의자라고 우기게 됨',
      prescription: '딱 한 곳만 치울 수 있는 최소 동력을 처방합니다',
      sideEffect: '청소 시작하면 갑자기 대청소로 번질 수 있음',
      warning: '청소 도중 잃어버렸던 물건 발견 시 그리움 유발',
      emoji: '🧹', color: '#5fb3a3', rarity: 'common',
      shareText: '청소 회피 증후군 처방받고 방 치우는 중 🧹', isPremium: false },

    { id: 'daily-weekend-hangover', category: 'daily', title: '주말 후유증', diagnosis: '일요일 저녁 우울',
      symptom: '해가 지면 갑자기 마음이 무거워짐',
      prescription: '월요일이 온다는 사실을 부드럽게 받아들이도록 도와드립니다',
      sideEffect: '갑자기 다음 주말 계획을 세우고 싶어짐',
      warning: '이 증상은 매주 반복됩니다 (정상입니다)',
      emoji: '🌇', color: '#b79aef', rarity: 'common',
      shareText: '일요일 저녁... 주말 후유증 처방 필요', isPremium: false },

    // ---- travel ----
    { id: 'travel-deficiency', category: 'travel', title: '여행 결핍증', diagnosis: '어디든 떠나고 싶음 증후군',
      symptom: '지도 앱을 이유 없이 켜보게 됨',
      prescription: '떠나지 못하는 마음을 여행 사진 감상으로 달래드립니다',
      sideEffect: '결국 항공권 검색까지 이어질 수 있음',
      warning: '통장 잔고와 상의 후 예약하세요',
      emoji: '✈️', color: '#ffc66b', rarity: 'rare',
      shareText: '여행 결핍증 진단... 어디든 떠나고 싶다 ✈️', isPremium: false },

    { id: 'travel-vacation-need', category: 'travel', title: '휴가 필요성 과다증', diagnosis: '연차 소진 지연 위기',
      symptom: '남은 연차를 보며 한숨을 쉼',
      prescription: '지금 당장 캘린더에 연차를 박아 넣을 용기를 처방합니다',
      sideEffect: '상사에게 연차 사유를 설명해야 할 수 있음',
      warning: '연차 승인은 이 앱이 대신 받아주지 않습니다',
      emoji: '🏖️', color: '#ff9166', rarity: 'rare',
      shareText: '휴가 필요성 과다증... 연차 씁니다', isPremium: false },

    // ---- sleep ----
    { id: 'sleep-insomnia-scroll', category: 'sleep', title: '불면의 밤 처방', diagnosis: '누웠는데 정신 말짱 증후군',
      symptom: '불 끄고 누우면 갑자기 온갖 생각이 다 남',
      prescription: '생각 스위치를 서서히 꺼드립니다. 양 대신 처방전 세는 걸 추천드려요',
      sideEffect: '다음 날 알람 소리를 못 들을 수 있음',
      warning: '실제 수면제가 아닙니다',
      emoji: '🌙', color: '#8aa0c9', rarity: 'common',
      shareText: '누웠는데 정신 말짱... 불면 처방 필요함 🌙', isPremium: false },

    { id: 'sleep-naptime-overdose', category: 'sleep', title: '낮잠 남용 처방', diagnosis: '30분 낮잠이 3시간 된 병',
      symptom: '눈떠보니 해가 지고 있음',
      prescription: '죄책감 대신 개운함을 느낄 수 있도록 마음을 다독여드립니다',
      sideEffect: '오늘 밤 다시 불면증 콤보가 발생할 수 있음',
      warning: '낮잠 남용 시 밤낮이 바뀔 수 있습니다',
      emoji: '😴', color: '#7ec8e3', rarity: 'rare',
      shareText: '낮잠 30분이 3시간 됨... 이거 병인가요', isPremium: false },

    { id: 'sleep-nightowl', category: 'sleep', title: '올빼미 전환 처방', diagnosis: '밤 12시부터 눈이 초롱초롱 증후군',
      symptom: '낮엔 좀비, 밤엔 쌩쌩함',
      prescription: '내일의 나에게 미안함을 잠시 잊게 해드립니다',
      sideEffect: '다음 날 카페인 부족 증후군과 콤보로 발생할 수 있음',
      warning: '출근 시간은 이 처방으로 조정되지 않습니다',
      emoji: '🦉', color: '#b79aef', rarity: 'epic',
      shareText: '밤 12시부터 눈이 초롱초롱... 올빼미 확정', isPremium: false },

    // ---- social (인간관계) ----
    { id: 'social-groupchat-lurker', category: 'social', title: '단톡방 눈팅 처방', diagnosis: '낄 타이밍 상실 증후군',
      symptom: '메시지는 다 읽었는데 낄 타이밍을 영영 놓침',
      prescription: '"ㅋㅋㅋ" 하나라도 보낼 수 있는 용기를 처방합니다',
      sideEffect: '타이밍 놓친 드립이 3일 후에 생각날 수 있음',
      warning: '실제 대화 참여는 본인 몫입니다',
      emoji: '👀', color: '#7ec8e3', rarity: 'common',
      shareText: '단톡방 눈팅만 3일째... 처방 필요함 👀', isPremium: false },

    { id: 'social-awkward-aftermath', category: 'social', title: '갑분싸 회복 처방', diagnosis: '방금 그 말 왜 했지 증후군',
      symptom: '집에 오는 길에 갑자기 이불킥하고 싶어짐',
      prescription: '지나간 정적은 지나간 대로 흘려보내는 마음을 처방합니다',
      sideEffect: '다음 만남에서 똑같은 실수를 반복할 수 있음',
      warning: '완치 아님, 평생 함께 갈 수 있음',
      emoji: '😬', color: '#8aa0c9', rarity: 'rare',
      shareText: '갑분싸 회복 처방 받는 중... 이불킥 방지', isPremium: false },

    { id: 'social-detox-urge', category: 'social', title: '인맥 디톡스 처방', diagnosis: '연락 다 끊고 싶음 증후군',
      symptom: '핸드폰 연락처를 보다가 한숨이 나옴',
      prescription: '잠시 혼자만의 시간을 가져도 괜찮다는 마음을 처방합니다',
      sideEffect: '며칠 뒤 다시 사람이 그리워질 수 있음',
      warning: '실제 연락처 삭제는 신중히 결정하세요',
      emoji: '🚪', color: '#b79aef', rarity: 'epic',
      shareText: '인맥 디톡스 처방... 연락 다 끊고 싶다', isPremium: false },

    // ---- study (공부) ----
    { id: 'study-cram-chronic', category: 'study', title: '벼락치기 만성 처방', diagnosis: '전날에만 집중력 폭발 증후군',
      symptom: '시험 3일 전엔 여유롭다가 전날 밤 갑자기 초인이 됨',
      prescription: '지금 이 순간의 집중력을 최대한 오래 유지시켜드립니다',
      sideEffect: '시험 끝나자마자 방전될 수 있음',
      warning: '평소 공부는 이 처방으로 대체되지 않습니다',
      emoji: '🔥', color: '#8fd694', rarity: 'common',
      shareText: '벼락치기 만성... 오늘 밤도 초인모드 🔥', isPremium: false },

    { id: 'study-distraction', category: 'study', title: '책상 앞 딴짓 처방', diagnosis: '책만 펴면 청소하고 싶은 병',
      symptom: '공부 시작 3분 만에 책상 정리를 시작함',
      prescription: '가짜 생산성 대신 진짜 집중으로 방향을 잡아드립니다',
      sideEffect: '방은 깨끗해지지만 진도는 그대로일 수 있음',
      warning: '정리정돈은 공부가 아닙니다 (본인도 이미 알고 있음)',
      emoji: '🧽', color: '#7ec8e3', rarity: 'rare',
      shareText: '책상 정리만 하다 30분 지남... 처방 급함', isPremium: false },

    { id: 'study-exam-anxiety', category: 'study', title: '시험 전날 불안 처방', diagnosis: '아는 것도 까먹을 것 같은 공포',
      symptom: '분명 아는 문제인데 시험지만 보면 하얘질 것 같음',
      prescription: '아는 만큼은 확실히 나온다는 믿음을 처방합니다',
      sideEffect: '시험 끝나고 나서야 답이 생각날 수 있음',
      warning: '실제 성적은 이 처방과 무관합니다',
      emoji: '😰', color: '#ef6a5a', rarity: 'epic',
      shareText: '시험 전날 불안 처방... 제발 다 기억나라', isPremium: false },

    // ---- fun (재미) ----
    { id: 'fun-laughter-deficiency', category: 'fun', title: '웃음 결핍 처방', diagnosis: '요즘 크게 웃은 적 없음 증후군',
      symptom: '재밌는 걸 봐도 피식 정도밖에 안 나옴',
      prescription: '아무 이유 없이 웃을 수 있는 여유를 처방합니다',
      sideEffect: '갑자기 옛날 짤을 정주행하고 싶어질 수 있음',
      warning: '웃참 실패 시 주변 시선은 책임지지 않습니다',
      emoji: '😂', color: '#ffd166', rarity: 'common',
      shareText: '요즘 크게 웃은 적이 없어서 처방받음 😂', isPremium: false },

    { id: 'fun-productivity-guilt', category: 'fun', title: '갓생 강박 해소 처방', diagnosis: '놀아도 죄책감 드는 병',
      symptom: '쉬는 중에도 뭔가 해야 할 것 같은 불안',
      prescription: '오늘 하루쯤은 그냥 놀아도 된다는 허락을 내려드립니다',
      sideEffect: '허락받은 김에 계획 없이 하루를 다 쓸 수 있음',
      warning: '내일의 갓생은 내일의 내가 알아서 합니다',
      emoji: '🛋️', color: '#ffc66b', rarity: 'rare',
      shareText: '놀아도 죄책감... 갓생 강박 처방 받음', isPremium: false },

    { id: 'fun-shorts-addiction', category: 'fun', title: '숏폼 무한스크롤 처방', diagnosis: '릴스 3개만 보려다 1시간 증후군',
      symptom: '정신 차려보면 손가락이 알아서 넘기고 있음',
      prescription: '"딱 하나만 더"의 늪에서 잠시 빠져나올 힘을 드립니다',
      sideEffect: '금단 현상으로 무의식적 손가락 스와이프가 남을 수 있음',
      warning: '알고리즘의 유혹은 이 처방보다 강할 수 있습니다',
      emoji: '📱', color: '#ef6a5a', rarity: 'epic',
      shareText: '릴스 3개만 보려다 1시간... 숏폼 중독 확정', isPremium: false },
  ];

  // ---------- 커스텀 진료실 원클릭 템플릿 (환자명/처방의는 템플릿과 무관하게 직접 입력) ----------
  const CUSTOM_TEMPLATES = [
    { label: '직장 상사 저격용', d: '눈치 없음 말기', rx: '눈치껏 좀 하세요 처방', w: '더 눈치 없어질 수 있음' },
    { label: '다이어트 팩폭용', d: '야식 참을성 결핍증', rx: '오늘 저녁은 그냥 굶는 셈 치기', w: '내일 더 배고파질 수 있음' },
    { label: '잠수쟁이 친구용', d: '답장 실종 증후군', rx: '읽었으면 답장 좀 하기', w: '읽씹 재발 가능성 높음' },
  ];

  window.MAUMJARO_RX_DATA = { RX_CATEGORIES, PRESCRIPTIONS_SEED, CUSTOM_TEMPLATES };
})();
