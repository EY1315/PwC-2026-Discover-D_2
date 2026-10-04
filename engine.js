/* ===== 브리프체크 규칙 엔진 (AI API 없이 키워드·패턴 규칙으로 동작) ===== */
var BC = (function () {
  var NUM_KO = '(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)';

  var TYPES = [
    { key: 'data', label: '수치 및 증빙 확인', desc: '원장 대사, 기초 데이터 취합, 실사 등 수치와 팩트를 확인하는 업무' },
    { key: 'research', label: '규정 및 동향 리서치', desc: '세법, 판례, 시장 규모, 경쟁사 등 외부 자료를 조사하고 분석하는 업무' },
    { key: 'report', label: '조서 및 보고서 작성', desc: '감사조서, 세무신고서, 피치북 등 문서 초안을 작성하거나 수정하는 업무' },
    { key: 'admin', label: '일정 및 행정 지원', desc: '미팅 조율, 회의실 예약, 조회서 관리 등 커뮤니케이션 및 단순 행정' },
    { key: 'general', label: '기타 일반 업무', desc: '위 4가지 분류에 명확히 속하지 않는 모호하거나 일반적인 지시' }
  ];

  var TYPE_HINTS = {
    data: /(증빙|샘플링|대사|원장|취합|기초\s*데이터|수치|금액|잔액|실사|조정\s*항목|EBITDA|검증|맞는지|확인해|발라|집계|합계|계정|매출채권|재고)/gi,
    research: /(조사|리서치|찾아|판례|동향|시장|경쟁사|비교|사례|규정|기준서|세법|점유율|플레이어|업계|트렌드|알아봐)/gi,
    report: /(조서|보고서|장표|PPT|ppt|피피티|작성|업데이트|초안|주석|피치북|IM\b|구조도|신고서|문서|슬라이드|만들어)/gi,
    admin: /(일정|미팅|회의실|예약|조율|회식|식당|발송|회수|조회서|출장|참석|잡아|공지|장소)/gi
  };

  // level: R 필수, O 권장, N 해당 없음
  var LEVELS = {
    data:     { purpose: 'R', scope: 'R', deadline: 'R', output: 'R', reference: 'O', criteria: 'R', source: 'O', people: 'N', place: 'N', budget: 'N', priority: 'O' },
    research: { purpose: 'R', scope: 'R', deadline: 'R', output: 'R', reference: 'O', criteria: 'R', source: 'O', people: 'N', place: 'N', budget: 'N', priority: 'O' },
    report:   { purpose: 'R', scope: 'O', deadline: 'R', output: 'R', reference: 'R', criteria: 'N', source: 'O', people: 'N', place: 'N', budget: 'N', priority: 'O' },
    admin:    { purpose: 'O', scope: 'N', deadline: 'R', output: 'N', reference: 'N', criteria: 'N', source: 'N', people: 'R', place: 'R', budget: 'O', priority: 'N' },
    general:  { purpose: 'R', scope: 'R', deadline: 'R', output: 'R', reference: 'O', criteria: 'N', source: 'N', people: 'N', place: 'N', budget: 'N', priority: 'O' }
  };

  var ITEMS = [
    { key: 'purpose', label: '목적', core: true, desc: '결과물이 쓰이는 상황(보고·제출·회의)이나 받는 사람',
      spec: /((?:임원|파트너|상무|전무|본부장|대표|고객사|클라이언트|감사위원회|이사회|과세관청|국세청|금감원|투자자|인수자|매수자|매도자)\s*(?:님)?\s*(?:보고|제출|미팅|회의|발표|에게|께|용|앞)|(?:보고|제출|회의|미팅|발표|검토|내부\s*공유|의사\s*결정|입찰|협상|실사|참고|공유)\s*용|보고(?:드릴|드리|할|하려)|위해서?|위한|때문에|(?<!인수)목적(?!회사)|용도|대비해|대비하여|하려고|하려는|(?:회의|미팅|발표)\s*(?:때|에서|자리|에\s*쓸))/g,
      vague: /(그냥|한번\s*봐|대충|알아서)/g },
    { key: 'scope', label: '범위', core: true, desc: '조사 기간, 대상 수 등 작업의 경계',
      spec: new RegExp('(최근\\s*\\d+\\s*(?:년|개년|분기|개월|주)|\\d{4}\\s*년(?:\\s*\\d\\s*분기)?|\\d\\s*분기|[상하]반기|당기|전기|전년(?:도)?|작년|올해|금년|이번\\s*달|지난\\s*달|\\d+\\s*(?:개사|개|곳|社|건|개월|년치|개년|종)|' + NUM_KO + '\\s*(?:개사|개|곳|군데|건|종)|상위\\s*\\d+|top\\s*\\d+|국내|해외|글로벌|전수|샘플\\s*\\d+|[A-Z]사|[가-힣]{2,6}(?:전자|화학|은행|증권|건설|제약|바이오|그룹|업계))', 'gi'),
      vague: /(몇\s*(?:개|곳|군데|건)|여러|주요|일부|등등|대충|적당히|이것저것|전반)/g },
    { key: 'deadline', label: '마감', core: true, desc: '명확한 완료 일자와 시간',
      spec: /(\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\s*\/\s*\d{1,2}|\d{1,2}\s*일\s*까지|(?:(?:이번|다음)\s*주\s*|차주\s*|금주\s*)?[월화수목금토일]요일|오늘|내일|모레|금일|익일|당일|(?:오전|오후)\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?|\d{1,2}\s*시\s*(?:까지|전)|EOD|퇴근\s*전|점심\s*전|\d+\s*시간\s*(?:안|내|이내))/gi,
      vague: /(다음\s*주|이번\s*주|차주|금주|다음\s*달|월말|월초|주말|조만간|빨리|급하게|급히|가능한\s*(?:한\s*)?빨리|ASAP|시간\s*(?:날|나실)\s*때|여유\s*있을\s*때|틈틈이|나중에|며칠\s*(?:안|내)|천천히)/gi },
    { key: 'output', label: '산출물', core: true, desc: '엑셀·PPT·메일 등 결과물 형식과 분량',
      spec: new RegExp('(엑셀|excel|xlsx|스프레드시트|PPT|피피티|파워포인트|장표|슬라이드|워드|word|docx|한글\\s*파일|hwp|PDF|메일\\s*본문|메일로|이메일로|메신저로|표로|표\\s*형태|그래프|차트|\\d+\\s*(?:장|페이지|쪽)|' + NUM_KO + '\\s*(?:장|페이지)|원\\s*페이저|요약\\s*메모|조서|신고서|주석)', 'gi'),
      vague: /(정리|보고서|리포트|요약|결과물|문서로|자료로|알아서)/g },
    { key: 'reference', label: '참고자료', core: true, desc: '과거 문서, 사내 양식, 관련 링크',
      spec: /(참고|첨부|양식|템플릿|서식|기존|지난\s*번|전년도?\s*(?:조서|자료|보고서|파일)|작년\s*(?:조서|자료|보고서|파일)|폴더|링크|URL|https?:\/\/\S+|드라이브|파일|VDR|데이터룸|예시|레퍼런스|포맷)/gi,
      vague: /(그거|그\s*자료|그\s*파일|저번\s*거|아까\s*(?:그|말한)|이전\s*거)/g },
    { key: 'criteria', label: '판단 기준', core: false, desc: '비교·검토할 기준이나 지표, 샘플 기준',
      spec: /(기준|지표|항목별|관점|매출액|영업이익|점유율|시가총액|중요성|materiality|샘플\s*(?:수|크기)|\d+\s*억|만\s*원\s*이상|비율|KPI|재무\s*지표|밸류에이션|멀티플)/gi,
      vague: /(비교|분석|검토|살펴|체크|샘플링)/g },
    { key: 'source', label: '데이터 출처', core: false, desc: '어느 자료·시스템에서 가져올지, 접근 권한',
      spec: /(ERP|SAP|원장|DART|다트|전자공시|KISVALUE|블룸버그|Bloomberg|Capital\s*IQ|CapIQ|택스넷|Taxnet|로앤비|판례\s*DB|조세심판원|국세법령|클라이언트\s*(?:자료|제공)|PBC|VDR|데이터룸|공시|사업보고서|감사보고서|통계청|KOSIS)/gi,
      vague: /(자료|데이터)/g },
    { key: 'people', label: '참석자·인원', core: false, desc: '참석 대상과 인원, 명단',
      spec: new RegExp('(\\d+\\s*(?:명|인)|' + NUM_KO + '\\s*(?:명|분)|팀\\s*전체|전원|참석자\\s*명단|[A-Z]사\\s*(?:담당자|CFO|대표))', 'g'),
      vague: /(임원진|팀|다\s*같이|담당자|관련\s*(?:분|인원))/g },
    { key: 'place', label: '장소·방식', core: false, desc: '장소, 대면·화상 여부, 선호 지역',
      spec: /(회의실|[가-힣A-Za-z0-9]{1,6}역|근처|본사|사무실|\d+\s*층|비대면|대면|화상|온라인|Zoom|줌|Teams|팀즈|웹엑스|방문)/gi,
      vague: /(장소|어디|식당|맛집|자리)/g },
    { key: 'budget', label: '예산', core: false, desc: '인당 금액, 결제 수단',
      spec: /(\d+\s*만\s*원|인당|예산|\d+\s*원|법인\s*카드)/g,
      vague: /(비용)/g },
    { key: 'priority', label: '우선순위', core: false, desc: '다른 업무와 겹칠 때 무엇을 먼저 할지',
      spec: /(최우선|우선|먼저|급한|중요한|ASAP)/gi,
      vague: /$^/g }
  ];

  // 질문 템플릿: m = 누락, u = 불명확({ev} = 근거 문구)
  var Q = {
    purpose: {
      m: { polite: '이번 자료가 최종적으로 어떤 목적(내부 보고, 고객사 제출, 회의 자료 등)으로 활용되는지 여쭙고 싶습니다.',
           friendly: '이 자료 주로 어디에 쓰시는 건지(보고용인지, 회의용인지) 살짝 알려주시면 방향 잡는 데 큰 도움이 될 것 같아요!',
           clear: '활용 목적: (예: 내부 보고 / 고객사 제출 / 회의 자료)' },
      u: { polite: '‘{ev}’라고 말씀해주셨는데, 결과물이 구체적으로 어떤 자리에서 활용되는지 여쭙고 싶습니다.',
           friendly: '‘{ev}’라고 하셨는데, 혹시 어떤 자리에서 쓰시는 건지 조금만 더 알려주실 수 있을까요?',
           clear: '활용 목적: ‘{ev}’ → 구체적 용도' } },
    scope: {
      m: { polite: '작업 범위(대상 기간, 대상 회사·항목 수 등)를 어느 정도로 잡으면 될지 여쭙고 싶습니다.',
           friendly: '범위는 어디까지 보면 될까요? 기간이나 대상 개수를 대략이라도 알려주시면 좋을 것 같아요.',
           clear: '작업 범위: (예: 최근 3개년 / 상위 3개사)' },
      u: { polite: '‘{ev}’의 범위를 구체적으로 어디까지로 보면 될지 여쭙고 싶습니다.',
           friendly: '‘{ev}’라고 하셨는데, 대상을 몇 개 정도까지 보면 될까요?',
           clear: '작업 범위: ‘{ev}’ → 구체적 대상·개수' } },
    deadline: {
      m: { polite: '본 업무의 마감 기한을 언제까지로 생각하고 계신지 여쭙고 싶습니다.',
           friendly: '말씀해주신 업무는 혹시 언제까지 정리해서 드리면 될까요?',
           clear: '마감 기한: (예: 10/10(금) 오전)' },
      u: { polite: '‘{ev}’라고 말씀해주셨는데, 정확히 며칠 몇 시까지 보고드리면 되겠습니까?',
           friendly: '‘{ev}’라고 하셨는데, 정확히 무슨 요일 몇 시쯤까지 드리면 될까요?',
           clear: '마감 기한: ‘{ev}’ → 정확한 날짜·시간' } },
    output: {
      m: { polite: '결과물은 어떤 형태(엑셀, PPT, 메일 본문 등)로 준비하면 좋을지 여쭙고 싶습니다.',
           friendly: '결과물은 엑셀이 편하실까요, 아니면 PPT나 메일로 정리해 드릴까요?',
           clear: '산출물 형태: (예: 엑셀 / PPT 3장 내외 / 메일 본문)' },
      u: { polite: '‘{ev}’의 형식과 분량(예: PPT 몇 장, 엑셀 표 등)을 어떻게 맞추면 될지 여쭙고 싶습니다.',
           friendly: '‘{ev}’는 어떤 형식으로 드리면 될까요? 엑셀 표인지 PPT인지, 분량도 대략 알려주시면 좋겠어요.',
           clear: '산출물 형태: ‘{ev}’ → 형식·분량' } },
    reference: {
      m: { polite: '참고할 만한 기존 자료나 사내 양식이 있다면 위치를 여쭙고 싶습니다.',
           friendly: '혹시 참고할 만한 지난 자료나 양식이 있을까요? 위치만 알려주셔도 큰 도움이 될 것 같아요!',
           clear: '참고자료: (예: 전년도 조서 / 사내 양식 위치)' },
      u: { polite: '말씀하신 ‘{ev}’가 정확히 어떤 파일인지, 저장 위치와 함께 여쭙고 싶습니다.',
           friendly: '‘{ev}’가 어떤 파일인지 헷갈려서요, 파일명이나 위치 알려주실 수 있을까요?',
           clear: '참고자료: ‘{ev}’ → 파일명·위치' } },
    criteria: {
      m: { polite: '검토 시 중점적으로 볼 기준(예: 매출액, 점유율, 샘플 기준 등)이 있으신지 여쭙고 싶습니다.',
           friendly: '어떤 기준으로 보면 될까요? 중요하게 보시는 지표가 있으면 알려주세요!',
           clear: '판단 기준: (예: 매출액·영업이익률 / 샘플 선정 기준)' },
      u: { polite: '‘{ev}’ 시 어떤 기준과 지표를 중심으로 보면 될지 여쭙고 싶습니다.',
           friendly: '‘{ev}’할 때 어떤 기준으로 보면 될까요? 중요하게 보시는 지표가 있으면 맞춰서 할게요!',
           clear: '판단 기준: ‘{ev}’ 기준·지표' } },
    source: {
      m: { polite: '데이터는 어느 자료나 시스템(ERP, DART, 클라이언트 제공 자료 등)을 기준으로 하면 될지 여쭙고 싶습니다.',
           friendly: '자료는 어디서 가져오면 될까요? 접근 권한이 필요한 폴더가 있으면 같이 알려주세요!',
           clear: '데이터 출처: (예: DART / 클라이언트 PBC / ERP)' },
      u: { polite: '말씀하신 ‘{ev}’는 어느 출처를 기준으로 하면 되는지 여쭙고 싶습니다.',
           friendly: '‘{ev}’는 어디에 있는 걸 쓰면 될까요?',
           clear: '데이터 출처: ‘{ev}’ → 출처·위치' } },
    people: {
      m: { polite: '참석 대상(인원과 명단)을 어떻게 잡으면 될지 여쭙고 싶습니다.',
           friendly: '참석하시는 분은 몇 분 정도이고, 누구누구 모시면 될까요?',
           clear: '참석 대상: (예: 팀원 8명 / 파트너·매니저 포함 여부)' },
      u: { polite: '‘{ev}’의 정확한 참석 범위(인원, 명단)를 여쭙고 싶습니다.',
           friendly: '‘{ev}’는 몇 분 정도 참석하시는 걸로 생각하면 될까요?',
           clear: '참석 대상: ‘{ev}’ → 인원·명단' } },
    place: {
      m: { polite: '장소나 진행 방식(대면·화상, 선호 지역)에 대해 염두에 두신 부분이 있으신지 여쭙고 싶습니다.',
           friendly: '장소는 어디쯤이 좋으실까요? 대면인지 화상인지도 알려주시면 바로 알아볼게요!',
           clear: '장소·방식: (예: 사무실 근처 / 화상회의)' },
      u: { polite: '‘{ev}’ 관련해서 선호하시는 지역이나 조건이 있으신지 여쭙고 싶습니다.',
           friendly: '‘{ev}’는 혹시 생각해두신 지역이나 메뉴가 있으세요?',
           clear: '장소·방식: ‘{ev}’ → 지역·조건' } },
    budget: {
      m: { polite: '예산 범위(인당 금액 등)가 정해져 있는지 여쭙고 싶습니다.',
           friendly: '예산은 인당 어느 정도로 생각하면 될까요?',
           clear: '예산: (예: 인당 3만 원 / 법인카드 사용 여부)' },
      u: { polite: '‘{ev}’ 관련해서 예산 범위를 여쭙고 싶습니다.',
           friendly: '‘{ev}’는 어느 정도까지 괜찮을까요?',
           clear: '예산: ‘{ev}’ → 금액 범위' } },
    priority: {
      m: { polite: '현재 진행 중인 다른 업무와 겹칠 경우, 어느 업무를 우선하면 될지 여쭙고 싶습니다.',
           friendly: '지금 하고 있는 다른 업무랑 겹치면 어떤 걸 먼저 하면 될까요?',
           clear: '우선순위: (예: 기존 업무보다 우선 여부)' },
      u: { polite: '우선순위를 여쭙고 싶습니다.', friendly: '어떤 걸 먼저 하면 될까요?', clear: '우선순위: 확인 필요' } }
  };

  var TODOS = {
    data: ['전년도 조서 폴더와 관련 명세서 미리 열람하기', '클라이언트 VDR 또는 사내 공유 폴더 접근 권한 확인하기', '대사·검증 결과를 기록할 작업 시트 만들기'],
    research: ['주요 리서치 DB(DART, 택스넷 등) 로그인 확인하기', '찾은 자료를 스크랩할 빈 문서 만들기', '자료마다 출처와 검색일 함께 적어두기'],
    report: ['사내 표준 템플릿과 폰트 설정 확인하기', '기존 장표·조서 파일 내려받아 바뀔 부분 표시하기', '초안 1차 완성 후 중간 공유 시점 정하기'],
    admin: ['참석자 캘린더에서 가능한 시간대 3~4개 뽑기', '인원에 맞는 회의실·장소 예약 현황 확인하기', '확정되면 참석자에게 일정과 장소 공지하기'],
    general: ['업무를 작은 단계로 나눠 적어보기', '중간 공유 시점 정하기', '제출 전 요청 내용과 결과물을 한 번 더 대조하기']
  };

  var SAMPLES = [
    { title: '배터리 3사 비교', text: '국내 배터리 기업 세 곳 비교해서 금요일까지 정리해 주세요.' },
    { title: '매출 보고서', text: '이번 달 매출 자료 정리해서 다음 주까지 보고서 만들어주세요.' },
    { title: '매출채권 증빙', text: '작년 삼일전자 매출채권 증빙 샘플링해서 확인해 줘.' },
    { title: '판례 리서치', text: '최근 3년 제약업계 합병평가차익 관련 조세심판원 판례 찾아 줘.' },
    { title: '회식 장소 예약', text: '이번 주 팀 회식 장소 예약해 줘.' },
    { title: '구조도 장표', text: 'A사 인수목적회사(SPV) 거래 구조도 장표 업데이트해 줘.' }
  ];

  function findAll(re, text) {
    var out = [];
    if (!re) return out;
    re.lastIndex = 0;
    var m, guard = 0;
    while ((m = re.exec(text)) && guard++ < 50) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      out.push({ start: m.index, end: m.index + m[0].length, text: m[0].trim() });
    }
    return out;
  }

  function detectType(text) {
    var best = 'general', bestScore = 0, scores = {};
    Object.keys(TYPE_HINTS).forEach(function (k) {
      var s = findAll(TYPE_HINTS[k], text).length;
      scores[k] = s;
      if (s > bestScore) { best = k; bestScore = s; }
    });
    return { type: best, scores: scores };
  }

  // 업무 유형 + 요청 문장 → 항목별 상태
  function analyze(text, type) {
    var lv = LEVELS[type] || LEVELS.general;
    return ITEMS.map(function (def) {
      var level = lv[def.key];
      var spec = findAll(def.spec, text);
      var vague = findAll(def.vague, text);
      // 같은 위치를 구체 표현이 덮으면 모호 표현은 버림 (예: '다음 주 금요일')
      vague = vague.filter(function (v) { return !spec.some(function (s) { return v.start < s.end && s.start < v.end; }); });
      var status, evidence;
      if (level === 'N') { status = 'na'; evidence = []; }
      else if (spec.length) { status = 'ok'; evidence = spec; }
      else if (vague.length) { status = 'unclear'; evidence = vague; }
      else { status = 'missing'; evidence = []; }
      return {
        key: def.key, level: level, status: status, auto: status,
        evidence: evidence.slice(0, 3),
        include: (status === 'missing' && level === 'R') || (status === 'unclear' && level !== 'N')
      };
    });
  }

  // 유형과 무관하게 한 항목만 판정 (제외 항목을 다시 넣을 때 사용)
  function judge(text, key) {
    var def = itemDef(key);
    var spec = findAll(def.spec, text), vague = findAll(def.vague, text);
    vague = vague.filter(function (v) { return !spec.some(function (s) { return v.start < s.end && s.start < v.end; }); });
    if (spec.length) return { status: 'ok', evidence: spec.slice(0, 3) };
    if (vague.length) return { status: 'unclear', evidence: vague.slice(0, 3) };
    return { status: 'missing', evidence: [] };
  }

  function itemDef(key) { for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].key === key) return ITEMS[i]; return null; }

  function questionFor(item, tone) {
    if (item.custom) return tone === 'clear' ? item.text : item.text;
    var t = Q[item.key];
    if (!t) return '';
    var useU = item.status === 'unclear' && item.evidence && item.evidence.length;
    var s = (useU ? t.u : t.m)[tone];
    return s.replace('{ev}', useU ? item.evidence[0].text : '');
  }

  function buildMessage(brief, tone) {
    var h = (brief.honorific || '').trim() || '매니저님';
    var picked = brief.items.filter(function (it) { return it.include && (it.status === 'missing' || it.status === 'unclear'); })
      .concat((brief.customs || []).filter(function (c) { return c.include; }));
    var qs = picked.map(function (it) { return questionFor(it, tone); });
    if (!qs.length) {
      if (tone === 'polite') return h + ', 말씀해주신 업무 내용 확인했습니다. 말씀하신 내용대로 바로 진행하겠습니다. 감사합니다.';
      if (tone === 'friendly') return h + ', 말씀해주신 업무 확인했어요! 바로 진행할게요. 감사합니다!';
      return h + ', 요청 내용 확인했습니다. 바로 진행하겠습니다.';
    }
    if (tone === 'polite') {
      return h + ', 말씀해주신 업무와 관련하여 원활히 진행하고자 몇 가지 여쭙고 싶습니다.\n\n' +
        qs.map(function (q, i) { return (i + 1) + '. ' + q; }).join('\n') +
        '\n\n확인해주시면 그에 맞춰 꼼꼼히 준비하겠습니다. 감사합니다.';
    }
    if (tone === 'friendly') {
      return h + ', 말씀해주신 업무 바로 시작하려고 하는데요, 바쁘시겠지만 몇 가지만 여쭤봐도 될까요?\n\n' +
        qs.map(function (q) { return '- ' + q; }).join('\n') +
        '\n\n알려주시면 방향 잘 잡아서 진행할게요. 감사합니다!';
    }
    return h + ', 업무 시작 전 아래 ' + qs.length + '가지 확인 부탁드립니다.\n' +
      qs.map(function (q) { return '• ' + q; }).join('\n');
  }

  // ===== 보내기 전 점검: 오탈자·톤 불일치 → As-is / To-be 제안 (규칙 기반) =====
  // to: 문자열 또는 { polite, friendly, clear } (톤별 제안), '' 이면 삭제 제안
  var TYPO = [
    [/됬/g, '됐', '‘됬’은 ‘됐’의 잘못된 표기예요'],
    [/(할|드릴|갈|볼|올릴|보낼|챙길|여쭐)께/g, '$1게', '‘-ㄹ께’가 아니라 ‘-ㄹ게’가 맞아요'],
    [/몇\s?일/g, '며칠', '‘몇 일’이 아니라 ‘며칠’이 맞아요'],
    [/되요/g, '돼요', '‘되어요’의 준말은 ‘돼요’예요'],
    [/되서/g, '돼서', '‘되어서’의 준말은 ‘돼서’예요'],
    [/안되([요는나지겠])/g, '안 되$1', '‘안 되다’는 띄어 써요'],
    [/안됩니다/g, '안 됩니다', '‘안 되다’는 띄어 써요'],
    [/뵈요/g, '봬요', '‘뵈어요’의 준말은 ‘봬요’예요'],
    [/할려고/g, '하려고', '‘할려고’가 아니라 ‘하려고’가 맞아요'],
    [/할려면/g, '하려면', '‘할려면’이 아니라 ‘하려면’이 맞아요'],
    [/오랫만/g, '오랜만', '‘오랫만’이 아니라 ‘오랜만’이 맞아요'],
    [/금새/g, '금세', '‘금새’가 아니라 ‘금세’가 맞아요'],
    [/왠만하면/g, '웬만하면', '‘왠만하면’이 아니라 ‘웬만하면’이 맞아요'],
    [/웬지/g, '왠지', '‘웬지’가 아니라 ‘왠지’가 맞아요'],
    [/일일히/g, '일일이', '‘일일히’가 아니라 ‘일일이’가 맞아요'],
    [/틈틈히/g, '틈틈이', '‘틈틈히’가 아니라 ‘틈틈이’가 맞아요'],
    [/꼼꼼이/g, '꼼꼼히', '‘꼼꼼이’가 아니라 ‘꼼꼼히’가 맞아요'],
    [/역활/g, '역할', '‘역활’이 아니라 ‘역할’이 맞아요'],
    [/희안/g, '희한', '‘희안’이 아니라 ‘희한’이 맞아요'],
    [/어떻해/g, '어떡해', '‘어떻해’가 아니라 ‘어떡해’가 맞아요'],
    [/바래요/g, '바라요', '‘바래요’가 아니라 ‘바라요’가 맞아요'],
    [/바램/g, '바람', '‘바램’이 아니라 ‘바람’이 맞아요'],
    [/결제(\s?)(올리|올려|라인|받|요청)/g, '결재$1$2', '승인은 ‘결제(돈 지불)’가 아니라 ‘결재’예요'],
    [/메세지/g, '메시지', '표준어는 ‘메시지’예요'],
    [/스케쥴/g, '스케줄', '표준어는 ‘스케줄’이에요']
  ];

  var TONE = {
    polite: [
      [/할게요/g, '하겠습니다'], [/드릴게요/g, '드리겠습니다'], [/볼게요/g, '보겠습니다'],
      [/될까요\?/g, '되겠습니까?'], [/할까요\?/g, '할지 여쭙고 싶습니다.'],
      [/있나요\?/g, '있으십니까?'], [/없나요\?/g, '없으십니까?'], [/되나요\?/g, '됩니까?'], [/맞나요\?/g, '맞습니까?'], [/인가요\?/g, '입니까?'],
      [/주실 수 있을까요\?/g, '주실 수 있으신지 여쭙고 싶습니다.'],
      [/주세요/g, '주시면 감사하겠습니다'],
      [/했어요/g, '했습니다'], [/있어요/g, '있습니다'], [/없어요/g, '없습니다'], [/같아요/g, '같습니다'],
      [/거예요/g, '것입니다'], [/이에요/g, '입니다'], [/(?<![거이])예요/g, '입니다'],
      [/해요(?=[.!?\s]|$)/g, '합니다'], [/돼요/g, '됩니다'], [/감사해요/g, '감사합니다']
    ],
    friendly: [],
    clear: [
      [/바쁘신\s*(?:와중|중)에\s*/g, ''], [/죄송하지만\s*/g, ''], [/혹시\s+/g, '']
    ]
  };
  var TONE_WHY = { polite: '정중한 톤인데 해요체가 섞였어요', clear: '명확한 톤에서는 군더더기 표현을 빼면 좋아요' };

  var COMMON = [
    [/[ㅋㅎ]{2,}|[ㅠㅜ]{2,}|\^\^|;;+|~{2,}/g, '', '업무 메시지에는 ㅎㅎ·^^·;; 같은 표현을 빼는 게 좋아요', 'tone'],
    [/(?<![ㄱ-ㅎㅏ-ㅣ])ㄹㅇ(?![ㄱ-ㅎㅏ-ㅣ])/g, '정말', '‘ㄹㅇ’ 같은 초성 줄임말은 업무 메시지에 쓰지 않는 게 좋아요', 'tone'],
    [/(?<![ㄱ-ㅎㅏ-ㅣ])ㅇㅇ(?![ㄱ-ㅎㅏ-ㅣ])/g, { polite: '네', friendly: '네', clear: '네' }, '‘ㅇㅇ’ 같은 초성 줄임말은 업무 메시지에 쓰지 않는 게 좋아요', 'tone'],
    [/(?<![ㄱ-ㅎㅏ-ㅣ])ㅇㅋ(?![ㄱ-ㅎㅏ-ㅣ])/g, { polite: '알겠습니다', friendly: '알겠어요', clear: '확인했습니다' }, '‘ㅇㅋ’ 같은 초성 줄임말은 업무 메시지에 쓰지 않는 게 좋아요', 'tone'],
    [/(?<![ㄱ-ㅎㅏ-ㅣ])ㄱㅅ(?![ㄱ-ㅎㅏ-ㅣ])/g, '감사합니다', '‘ㄱㅅ’ 같은 초성 줄임말은 업무 메시지에 쓰지 않는 게 좋아요', 'tone'],
    [/(?<![ㄱ-ㅎㅏ-ㅣ])ㅈㅅ(?![ㄱ-ㅎㅏ-ㅣ])/g, '죄송합니다', '‘ㅈㅅ’ 같은 초성 줄임말은 업무 메시지에 쓰지 않는 게 좋아요', 'tone'],
    [/(?<![ㄱ-ㅎㅏ-ㅣ])ㄴㄴ(?![ㄱ-ㅎㅏ-ㅣ])/g, '아니요', '‘ㄴㄴ’ 같은 초성 줄임말은 업무 메시지에 쓰지 않는 게 좋아요', 'tone'],
    [/(?<![ㄱ-ㅎㅏ-ㅣ])ㅊㅋ(?![ㄱ-ㅎㅏ-ㅣ])/g, '축하드립니다', '‘ㅊㅋ’ 같은 초성 줄임말은 업무 메시지에 쓰지 않는 게 좋아요', 'tone'],
    [/(?<![ㄱ-ㅎㅏ-ㅣ])ㅎㅇ(?![ㄱ-ㅎㅏ-ㅣ])/g, '안녕하세요', '‘ㅎㅇ’ 같은 초성 줄임말은 업무 메시지에 쓰지 않는 게 좋아요', 'tone'],
    [/(?<![ㄱ-ㅎㅏ-ㅣ])ㅂㅂ(?![ㄱ-ㅎㅏ-ㅣ])/g, '감사합니다', '‘ㅂㅂ’ 같은 초성 줄임말은 업무 메시지에 쓰지 않는 게 좋아요', 'tone'],
    [/(?<![ㄱ-ㅎㅏ-ㅣ])ㅅㄱ(?![ㄱ-ㅎㅏ-ㅣ])/g, '감사합니다', '‘ㅅㄱ’ 같은 초성 줄임말은 업무 메시지에 쓰지 않는 게 좋아요', 'tone'],
    [/(?<![ㄱ-ㅎㅏ-ㅣ])[ㄱ-ㅎㅏ-ㅣ]{2,}(?![ㄱ-ㅎㅏ-ㅣ])/g, '', '자음·모음만 쓴 줄임말은 상사가 알아보기 어려워요', 'tone'],
    [/!{2,}/g, '!', '느낌표는 하나면 충분해요', 'tone'],
    [/\?{2,}/g, '?', '물음표는 하나면 충분해요', 'tone'],
    [/(해|알려|보내|확인해|말해|정리해)\s?줘(?!요)/g, { polite: '$1 주시기 바랍니다', friendly: '$1 주세요', clear: '$1 주세요' }, '상사에게 반말이 들어갔어요', 'tone'],
    [/(했|됐|봤)어\?/g, { polite: '$1습니까?', friendly: '$1나요?', clear: '$1나요?' }, '상사에게 반말이 들어갔어요', 'tone'],
    [/맞아\?/g, { polite: '맞습니까?', friendly: '맞나요?', clear: '맞나요?' }, '상사에게 반말이 들어갔어요', 'tone'],
    [/언제야\?/g, { polite: '언제입니까?', friendly: '언제인가요?', clear: '언제인가요?' }, '상사에게 반말이 들어갔어요', 'tone'],
    [/수고하세요|수고하셨습니다/g, { polite: '감사합니다', friendly: '감사합니다', clear: '감사합니다' }, '‘수고하세요’는 윗사람에게 쓰기 어색한 표현이에요', 'tone']
  ];

  function lint(raw, tone) {
    var text = raw || '';
    var out = [], taken = [];
    function overlaps(s, e) { return taken.some(function (t) { return s < t[1] && t[0] < e; }); }
    function scan(re, to, why, kind) {
      re.lastIndex = 0; var m, g = 0;
      while ((m = re.exec(text)) && g++ < 50) {
        if (!m[0]) { re.lastIndex++; continue; }
        var s = m.index, e = s + m[0].length;
        if (overlaps(s, e)) continue;
        var rep = typeof to === 'string' ? to : to[tone];
        if (rep == null) continue;
        var after = m[0].replace(new RegExp(re.source, re.flags.replace('g', '')), rep);
        if (after === m[0]) continue;
        taken.push([s, e]);
        var hit = out.find(function (o) { return o.from === m[0] && o.to === after; });
        if (hit) hit.count++; else out.push({ from: m[0], to: after, why: why, kind: kind, count: 1, at: s });
      }
    }
    TYPO.forEach(function (r) { scan(r[0], r[1], r[2], 'typo'); });
    COMMON.forEach(function (r) { scan(r[0], r[1], r[2], r[3]); });
    (TONE[tone] || []).forEach(function (r) { scan(r[0], r[1], TONE_WHY[tone], 'tone'); });
    out.sort(function (a, b) { return a.at - b.at; });

    var warns = [];
    var t = text.trim();
    if (t && !/\?|여쭙|부탁|확인|알려/.test(t)) warns.push('질문이나 요청 문장이 없어요. 무엇을 확인하고 싶은지 한 문장 넣어 주세요.');
    if ((t.match(/죄송/g) || []).length > 1) warns.push('‘죄송’이 여러 번 나와요. 한 번이면 충분해요.');
    if (/대충|적당히|아무거나/.test(t)) warns.push('‘대충·적당히’ 같은 표현은 상사가 오해할 수 있어요.');
    if (t.length > 400) warns.push('메시지가 깁니다(' + t.length + '자). 핵심 질문만 남겨 보세요.');
    return { fixes: out, warns: warns };
  }

  // 제안 하나(또는 전부)를 본문에 적용
  function applyFix(text, fix) { return text.split(fix.from).join(fix.to).replace(/[ \t]{2,}/g, ' '); }

  return { TYPES: TYPES, ITEMS: ITEMS, LEVELS: LEVELS, TODOS: TODOS, SAMPLES: SAMPLES,
    detectType: detectType, analyze: analyze, judge: judge, itemDef: itemDef, questionFor: questionFor, buildMessage: buildMessage, lint: lint, applyFix: applyFix };
})();
if (typeof module !== 'undefined') module.exports = BC;
