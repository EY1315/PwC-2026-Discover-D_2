(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $('#app');
  var STORE = 'briefcheck.v1';
  var STATUS = { ok: '확인됨', unclear: '불명확', missing: '누락', na: '해당 없음' };
  var LVL = { R: '필수', O: '권장', N: '' };
  var TONES = [
    { key: 'polite', label: '정중한 톤', who: '파트너·상무님, 타 부서 상급자' },
    { key: 'friendly', label: '친근한 톤', who: '직속 사수, 편한 선배' },
    { key: 'clear', label: '명확한 톤', who: '바쁜 매니저, 메신저용 개조식' }
  ];
  var HONORIFICS = ['선배님', '매니저님', '파트너님', '상무님'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function typeOf(k) { for (var i = 0; i < BC.TYPES.length; i++) if (BC.TYPES[i].key === k) return BC.TYPES[i]; return BC.TYPES[4]; }

  // ---------- 저장 ----------
  var briefs = [];
  try { briefs = JSON.parse(localStorage.getItem(STORE) || '[]') || []; } catch (e) { briefs = []; }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(briefs.slice(0, 50))); } catch (e) {} }

  var state = { view: 'home', draft: { text: '', type: null, typeManual: false, honorific: '매니저님' }, brief: null, lint: null, confirmDel: null };

  function current() { return state.brief; }
  function persist() {
    var b = current(); if (!b) return;
    b.updatedAt = Date.now();
    var i = briefs.findIndex(function (x) { return x.id === b.id; });
    if (i >= 0) briefs[i] = b; else briefs.unshift(b);
    save();
  }

  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 1600);
  }
  // 할 일 삭제 되돌리기
  var lastDel = null;
  function showUndo() {
    var bar = $('#undoBar'); $('#toast').classList.remove('on');
    bar.classList.add('on');
    clearTimeout(showUndo._t); showUndo._t = setTimeout(hideUndo, 6000);
  }
  function hideUndo() { $('#undoBar').classList.remove('on'); lastDel = null; }
  function copyText(text, el) {
    function fallback() {
      if (el) { el.focus(); el.select(); }
      try { document.execCommand('copy'); toast('복사했어요'); } catch (e) { toast('텍스트를 선택했어요. Ctrl+C로 복사하세요'); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('복사했어요. 메신저에 붙여넣으세요'); }, fallback);
    } else fallback();
  }

  // ---------- 공통 조각 ----------
  var STEPS = [['input', '업무 입력'], ['check', '누락 점검'], ['message', '질문 초안'], ['todo', '체크리스트']];
  function stepper() {
    var idx = STEPS.findIndex(function (s) { return s[0] === state.view; });
    return '<nav class="steps" aria-label="진행 단계">' + STEPS.map(function (s, i) {
      var can = i < idx || (current() && i <= 3 && i !== idx);
      return '<button class="step ' + (i < idx ? 'done' : i === idx ? 'on' : '') + '" data-go="' + s[0] + '"' + (can ? '' : ' disabled') + '><span class="n">STEP ' + (i + 1) + '</span>' + s[1] + '</button>';
    }).join('') + '</nav>';
  }
  function bar(html) { return '<div class="bar"><div class="bar-in">' + html + '</div></div>'; }

  function highlight(text, items) {
    var spans = [];
    items.forEach(function (it) {
      if (it.status === 'na' || it.status === 'missing') return;
      if (it.status !== it.auto) return;
      (it.evidence || []).forEach(function (e) { spans.push({ s: e.start, e: e.end, k: it.key, st: it.status }); });
    });
    spans.sort(function (a, b) { return a.s - b.s || (b.e - b.s) - (a.e - a.s); });
    var out = '', pos = 0;
    spans.forEach(function (sp) {
      if (sp.s < pos) return;
      out += esc(text.slice(pos, sp.s));
      var def = BC.itemDef(sp.k);
      out += '<mark class="hl s-' + sp.st + '" data-jump="' + sp.k + '" title="' + esc(def.label + ' · ' + STATUS[sp.st]) + '">' + esc(text.slice(sp.s, sp.e)) + '</mark>';
      pos = sp.e;
    });
    return out + esc(text.slice(pos));
  }

  // ---------- 화면: 홈 ----------
  function viewHome() {
    var demo = BC.SAMPLES[0].text;
    var demoItems = BC.analyze(demo, 'research');
    var core = demoItems.filter(function (i) { return BC.itemDef(i.key).core; });
    var recent = briefs.slice(0, 3);
    return '<div class="view">' +
      '<section class="hero">' +
        '<span class="label">신규입사자 업무 지시 점검</span>' +
        '<h1>일을 시작하기 전,<br>질문부터 정리하세요.</h1>' +
        '<p>짧은 업무 지시를 붙여넣으면 목적·범위·마감·산출물·참고자료 중 빠진 것을 찾아, 상사에게 보낼 확인 질문과 할 일 체크리스트로 바꿔 드려요.</p>' +
        '<div class="hero-actions"><button class="btn btn-primary" data-act="new">업무 요청 점검하기</button><button class="btn btn-soft" data-act="example">예시로 시작하기</button></div>' +
      '</section>' +
      '<section class="section"><span class="label">이렇게 점검해요 · 예시</span>' +
        '<div class="card"><div class="demo-req">“' + highlight(demo, demoItems) + '”</div>' +
        '<div class="five">' + core.map(function (i) { return '<div class="s-' + i.status + '"><b>' + BC.itemDef(i.key).label + '</b>' + STATUS[i.status] + '</div>'; }).join('') + '</div></div>' +
      '</section>' +
      '<section class="section"><span class="label">1분 흐름</span><div class="flow">' +
        '<div><b>입력</b>지시 문장 붙여넣기</div><div><b>점검</b>빠진 항목과 근거 확인</div><div><b>질문</b>고치고 점검 후 복사</div><div><b>체크리스트</b>답변 받고 시작</div>' +
      '</div></section>' +
      (recent.length ? '<section class="section"><div class="row"><span class="label grow">최근 점검한 업무</span><button class="ghost" data-go="history">전체 보기</button></div>' + recent.map(histCard).join('') + '</section>' : '') +
      '<section class="section"><p class="note"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><span>점검은 이 브라우저 안에서 규칙으로 해요. STEP 3에서 직접 고친 메시지는 AI 검사를 위해 Claude로 전송돼요. 기록은 이 브라우저에만 저장됩니다.</span></p></section>' +
    '</div>';
  }

  // ---------- 화면: 입력 ----------
  function viewInput() {
    var d = state.draft;
    var det = BC.detectType(d.text);
    var sel = d.typeManual ? d.type : (d.text.trim() ? det.type : d.type);
    return '<div class="view">' + stepper() +
      (d.editId && current() ? '<h2>업무 지시를 고쳐 보세요</h2><p class="sub">문장이나 유형을 바꾸면 다시 점검해요. 고치지 않고 위 단계를 누르면 그대로 돌아가요.</p>'
        : '<h2>어떤 업무 지시를 받으셨나요?</h2><p class="sub">받은 문장 그대로 붙여넣으세요. 메신저 내용도 괜찮아요.</p>') +
      '<textarea id="req" maxlength="600" placeholder="예) 국내 배터리 기업 세 곳 비교해서 금요일까지 정리해 주세요.">' + esc(d.text) + '</textarea>' +
      '<div class="counter"><span id="cnt">' + d.text.length + '</span>/600</div>' +
      '<div class="section" style="margin-top:8px"><span class="label">예시 문장 넣기</span><div class="chips">' +
        BC.SAMPLES.map(function (s, i) { return '<button class="chip" data-sample="' + i + '">' + esc(s.title) + '</button>'; }).join('') + '</div></div>' +
      '<div class="section"><span class="label">누구에게 받았나요? · 질문 호칭</span><div class="chips">' +
        HONORIFICS.map(function (h) { return '<button class="chip' + (d.honorific === h ? ' on' : '') + '" data-hon="' + h + '">' + h + '</button>'; }).join('') +
        '</div><input type="text" id="hon" placeholder="직접 입력 (예: 김 매니저님)" value="' + (HONORIFICS.indexOf(d.honorific) < 0 ? esc(d.honorific) : '') + '"></div>' +
      '<div class="section"><div class="row"><span class="label grow">업무 유형</span><span class="note" id="typeNote">' + (d.typeManual ? '직접 선택함' : (d.text.trim() ? '문장을 보고 자동 추천했어요' : '')) + '</span></div>' +
        '<div class="types" id="types">' + typesHtml(sel, d.text.trim() ? det.type : null) + '</div></div>' +
      bar('<button class="btn btn-line" data-go="home">처음</button><button class="btn btn-primary" id="goCheck"' + (d.text.trim() ? '' : ' disabled') + '>' + (d.editId && current() ? '수정 내용으로 다시 점검' : '누락 항목 점검하기') + '</button>') +
    '</div>';
  }
  function typesHtml(sel, rec) {
    return BC.TYPES.map(function (t) {
      return '<button class="type' + (sel === t.key ? ' on' : '') + '" data-type="' + t.key + '" aria-pressed="' + (sel === t.key) + '">' + (rec === t.key ? '<span class="rec">추천</span>' : '') + '<b>' + t.label + '</b><span>' + t.desc + '</span></button>';
    }).join('');
  }

  // STEP 1로 돌아가 현재 브리프의 업무 지시를 고치기
  function editInput(b) {
    state.draft = { text: b.text, type: b.type, typeManual: true, honorific: b.honorific, editId: b.id };
    go('input');
  }

  function startCheck() {
    var d = state.draft;
    var text = d.text.trim(); if (!text) return;
    var type = d.typeManual && d.type ? d.type : BC.detectType(text).type;
    // 기존 브리프를 STEP 1에서 고친 경우: 새로 만들지 않고 같은 브리프를 갱신
    var eb = d.editId && current() && current().id === d.editId ? current() : null;
    if (eb) {
      eb.honorific = d.honorific || '매니저님';
      if (eb.text !== text || eb.type !== type) {
        eb.text = text; eb.type = type; eb.items = BC.analyze(text, type); eb.edits = {}; eb.todos = null;
        toast('수정한 내용으로 다시 점검했어요');
      } else eb.edits = {};
      persist();
      return go('check');
    }
    state.brief = { id: uid(), createdAt: Date.now(), updatedAt: Date.now(), text: text, type: type, honorific: d.honorific || '매니저님',
      items: BC.analyze(text, type), customs: [], tone: 'polite', edits: {}, answers: {}, todos: null, memo: '' };
    persist();
    go('check');
  }

  // ---------- 화면: 점검 ----------
  function viewCheck() {
    var b = current();
    var act = b.items.filter(function (i) { return i.status !== 'na'; });
    var na = b.items.filter(function (i) { return i.status === 'na'; });
    var cnt = { ok: 0, unclear: 0, missing: 0 };
    act.forEach(function (i) { cnt[i.status]++; });
    var picked = b.items.filter(function (i) { return i.include && i.status !== 'ok' && i.status !== 'na'; }).length + b.customs.filter(function (c) { return c.include; }).length;
    var t = typeOf(b.type);
    return '<div class="view">' + stepper() +
      '<h2>' + (cnt.missing + cnt.unclear ? '시작 전에 확인할 게 ' + (cnt.missing + cnt.unclear) + '개 있어요' : '빠진 항목이 없어요') + '</h2>' +
      '<p class="sub">' + esc(t.label) + ' 기준으로 점검했어요. 판정이 틀렸다면 각 카드에서 직접 바꿀 수 있어요.</p>' +
      '<div class="summary"><div class="s-ok"><b>' + cnt.ok + '</b><span>확인됨</span></div><div class="s-unclear"><b>' + cnt.unclear + '</b><span>불명확</span></div><div class="s-missing"><b>' + cnt.missing + '</b><span>누락</span></div></div>' +
      '<div class="section"><div class="row"><span class="label grow">받은 업무 지시 · 근거 표시</span><button class="ghost" data-act="retype">유형 바꾸기</button></div>' +
        '<div class="card req-box">“' + highlight(b.text, b.items) + '”</div>' +
        '<div class="chips" id="retypeBox" hidden>' + BC.TYPES.map(function (x) { return '<button class="chip' + (x.key === b.type ? ' on' : '') + '" data-retype="' + x.key + '">' + x.label + '</button>'; }).join('') + '</div>' +
      '</div>' +
      '<div class="section"><span class="label">점검 항목 ' + act.length + '개</span>' + act.map(itemCard).join('') +
        (na.length ? '<details class="more"><summary>이 업무 유형에서 제외한 항목 ' + na.length + '개</summary>' +
          na.map(function (i) { var d = BC.itemDef(i.key); return '<div class="na-row"><span><b>' + d.label + '</b> · ' + d.desc + '</span><button class="btn btn-line btn-sm" data-restore="' + i.key + '">점검에 넣기</button></div>'; }).join('') + '</details>' : '') +
      '</div>' +
      '<div class="section"><span class="label">직접 추가할 질문</span><div class="card">' +
        '<div class="add-row"><input type="text" id="customIn" placeholder="예) 클라이언트에게 직접 연락해도 되는지"><button class="btn btn-soft btn-sm" id="addCustom">추가</button></div>' +
        b.customs.map(function (c) { return '<div class="custom"><input type="checkbox" data-cinc="' + c.id + '"' + (c.include ? ' checked' : '') + ' aria-label="질문에 넣기"><span>' + esc(c.text) + '</span><button class="x" data-cdel="' + c.id + '" aria-label="삭제">×</button></div>'; }).join('') +
      '</div></div>' +
      bar('<button class="btn btn-line" data-act="edit">다시 입력</button><button class="btn btn-primary" data-go="message">질문 초안 만들기 (' + picked + ')</button>') +
    '</div>';
  }
  function itemCard(it) {
    var d = BC.itemDef(it.key);
    var ev = (it.evidence || []).map(function (e) { return '<q>' + esc(e.text) + '</q>'; }).join(', ');
    var why;
    if (it.status !== it.auto) why = '직접 ‘' + STATUS[it.status] + '’(으)로 바꿨어요. 자동 판정은 ‘' + STATUS[it.auto] + '’였어요.';
    else if (it.status === 'ok') why = ev + ' 표현이 있어 확인된 것으로 봤어요.';
    else if (it.status === 'unclear') why = ev + ' 표현은 있지만 구체적이지 않아요. ' + d.desc + '을(를) 정확히 물어보세요.';
    else why = d.desc + '에 해당하는 표현을 찾지 못했어요.' + (it.level === 'O' ? ' 이 유형에서는 있으면 좋은 항목이에요.' : '');
    var canAsk = it.status === 'missing' || it.status === 'unclear';
    return '<div class="card item" id="it-' + it.key + '">' +
      '<div class="item-head"><h3>' + d.label + (LVL[it.level] ? '<span class="lvl">' + LVL[it.level] + '</span>' : '') + '</h3><span class="spacer"></span><span class="pill s-' + it.status + '">' + STATUS[it.status] + '</span></div>' +
      '<p class="why">' + why + '</p>' +
      '<div class="item-foot"><div class="seg" role="group" aria-label="' + d.label + ' 판정 바꾸기">' +
        ['ok', 'unclear', 'missing', 'na'].map(function (s) { return '<button class="' + s + (it.status === s ? ' on' : '') + '" data-set="' + it.key + ':' + s + '">' + STATUS[s] + '</button>'; }).join('') +
      '</div>' +
      (canAsk ? '<label class="toggle"><input type="checkbox" data-inc="' + it.key + '"' + (it.include ? ' checked' : '') + '>질문에 넣기</label>' : '') +
      '</div></div>';
  }

  // ---------- 화면: 질문 초안 (01 초안 → 02 직접 수정 → 03 보내기 전 점검) ----------
  function viewMessage() {
    var b = current();
    var tone = b.tone || 'polite';
    var draft = b.edits[tone] != null ? b.edits[tone] : BC.buildMessage(b, tone);
    var askable = b.items.filter(function (i) { return i.status === 'missing' || i.status === 'unclear'; });
    return '<div class="view">' + stepper() +
      '<h2>' + esc(b.honorific) + '께 보낼 질문 초안이에요</h2><p class="sub">톤을 골라 초안을 받고, 직접 고친 뒤, 보내기 전 점검까지 확인하고 복사하세요.</p>' +
      '<div class="section" style="margin-top:8px"><span class="label">01 · 톤 고르고 초안 받기</span>' +
        '<div class="tones">' + TONES.map(function (t) { return '<button class="tone' + (t.key === tone ? ' on' : '') + '" data-tone="' + t.key + '"><b>' + t.label + '</b><span>' + t.who + '</span></button>'; }).join('') + '</div>' +
        (askable.length || b.customs.length ? '<div class="qpick">' +
          askable.map(function (i) { return '<button class="chip' + (i.include ? ' on' : '') + '" data-qinc="' + i.key + '">' + BC.itemDef(i.key).label + '</button>'; }).join('') +
          b.customs.map(function (c) { return '<button class="chip' + (c.include ? ' on' : '') + '" data-qcinc="' + c.id + '">' + esc(c.text.slice(0, 14)) + (c.text.length > 14 ? '…' : '') + '</button>'; }).join('') +
        '</div><p class="why">넣을 질문을 눌러서 켜고 끌 수 있어요.</p>' : '') +
      '</div>' +
      '<div class="section">' +
        '<div class="row"><span class="label grow">02 · 메시지 초안</span>' + (b.edits[tone] != null ? '<span class="edited">수정됨</span><button class="ghost" data-act="regen">초안 다시 만들기</button>' : '') + '</div>' +
        '<p class="why">브리프체크가 초안을 작성했어요. 자유롭게 고쳐 주세요. 고치는 동안 아래 ‘보내기 전 점검’에서 맞춤법과 톤을 바로 확인해 드려요.</p>' +
        '<textarea id="msg" spellcheck="false">' + esc(draft) + '</textarea>' +
      '</div>' +
      '<div class="section"><span class="label">03 · 보내기 전 점검</span>' +
        '<div class="card lint" id="lint">' + lintHtml(draft, tone) + '</div>' +
        '<div class="row"><button class="btn btn-primary grow" data-act="copy">메시지 복사하기</button></div>' +
      '</div>' +
      bar('<button class="btn btn-line" data-go="check">이전</button><button class="btn btn-primary" data-go="todo">체크리스트로 업무 시작</button>') +
    '</div>';
  }
  var KIND_LBL = { typo: '맞춤법', spacing: '띄어쓰기', tone: '톤' };
  function fixRow(f, attr) {
    return '<div class="fix"><span class="pill ' + (f.kind === 'tone' ? 's-unclear' : 's-missing') + '">' + (KIND_LBL[f.kind] || '맞춤법') + '</span>' +
      '<div class="fix-body"><div class="asis-tobe"><del>' + esc(f.from) + '</del><span class="arrow" aria-hidden="true">→</span>' +
      (f.to.trim() ? '<ins>' + esc(f.to) + '</ins>' : '<ins class="rm">삭제</ins>') + (f.count > 1 ? '<span class="cnt">×' + f.count + '</span>' : '') + '</div>' +
      '<span class="why">' + esc(f.why) + '</span></div>' +
      '<button class="btn btn-line btn-sm" ' + attr + '>적용</button></div>';
  }
  function lintHtml(text, tone) {
    // AI 검사 결과만 표시 (규칙 목록 예비 장치 없음)
    state.lint = { fixes: [], warns: [] };
    if (ai.fn && !ai.off) return aiHtml(text, tone, state.lint);
    return '<p class="why" style="margin:0">' + esc(ai.note || 'AI 검사를 불러오는 중이에요. 잠시 후에도 이 문구가 보이면 이 화면에서는 AI 검사를 쓸 수 없어요.') + '</p>';
    var r = BC.lint(text, tone);
    state.lint = r;
    var html;
    if (!r.fixes.length && !r.warns.length) html = '<p class="lint-ok"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>기본 점검에서 걸리는 게 없어요</p>';
    else html = '<div class="row lint-head"><b class="grow">' + (r.fixes.length ? '고칠 곳 ' + r.fixes.length + '건' : '확인할 점') + '</b>' +
        (r.fixes.length > 1 ? '<button class="btn btn-soft btn-sm" data-act="fixAll">모두 적용</button>' : '') + '</div>' +
      r.fixes.map(function (f, i) { return fixRow(f, 'data-fix="' + i + '"'); }).join('') +
      (r.warns.length ? '<ul class="list warn">' + r.warns.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '');
    return html + aiHtml(text, tone, r);
  }

  // ---------- AI 정밀 검사 (Claude, 버튼 누를 때만) ----------
  var ai = { fn: null, off: false, status: 'idle', fixes: [], tone: null, lastText: null, note: '', ctl: null }, aiTimer;
  // 입력을 멈추고 1.5초 뒤 자동 검사 (직접 고친 메시지만, 같은 내용은 다시 보내지 않음)
  function scheduleAI(delay) {
    clearTimeout(aiTimer);
    var b = current(); if (!ai.fn || ai.off || !b || state.view !== 'message' || b.edits[b.tone] == null) return;
    aiTimer = setTimeout(function () { runAI(false); }, delay == null ? 1500 : delay);
  }
  try { if (window.claude && claude.use) claude.use('sample').then(function (s) { ai.fn = s; if (s) { refreshLint(); scheduleAI(300); } }, function () {}); } catch (e) {}
  function aiHtml(text, tone, rule) {
    if (!ai.fn || ai.off) return ai.note ? '<p class="ai-note">' + esc(ai.note) + '</p>' : '';
    var h = '<div class="ai-box">';
    if (ai.status === 'loading') {
      h += '<div class="row"><span class="ai-spin" aria-hidden="true"></span><b class="grow">AI가 오탈자·띄어쓰기·톤을 검사하고 있어요…</b></div>';
    } else {
      // 지금 메시지에 아직 남아 있고, 기본 점검과 겹치지 않는 제안만
      var ruleFrom = {}; rule.fixes.forEach(function (f) { ruleFrom[f.from] = 1; });
      var live = ai.tone === tone ? ai.fixes.filter(function (f) { return text.indexOf(f.from) >= 0 && !ruleFrom[f.from]; }) : [];
      ai.live = live;
      if (ai.status === 'done' && ai.tone === tone) {
        h += (live.length ? '<div class="row lint-head"><b class="grow">고칠 곳 ' + live.length + '건</b>' : '<p class="lint-ok"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>오탈자·띄어쓰기·톤에서 고칠 곳이 없어요</p><div>') +
          (live.length > 1 ? '<button class="btn btn-soft btn-sm" data-act="aiAll">모두 적용</button>' : '') +
          '</div>' +
          live.map(function (f, i) { return fixRow(f, 'data-aifix="' + i + '"'); }).join('');
      } else {
        h += '<div class="row"><div class="grow"><b>AI 자동 검사</b><p class="why">02에서 메시지를 고치면 Claude가 오탈자·띄어쓰기·톤을 자동으로 검사해요. 고치지 않은 초안은 ‘지금 검사’로 확인할 수 있어요.</p></div>' +
          '<button class="btn btn-soft btn-sm" data-act="ai"' + (text.trim() ? '' : ' disabled') + '>지금 검사</button></div>';
      }
      if (ai.note) h += '<p class="ai-note">' + esc(ai.note) + '</p>';
    }
    return h + '</div>';
  }
  var TONE_DESC = { polite: '정중한 톤: 하십시오체(-습니다/-습니까), 격식 있게', friendly: '친근한 톤: 해요체(-요), 부드럽고 예의 있게', clear: '명확한 톤: 인사·군더더기 없이 짧은 개조식, 존댓말' };
  function runAI(force) {
    var b = current(), m = $('#msg'); if (!ai.fn || ai.off || !b || !m) return;
    var text = m.value.trim(); if (!text) return;
    if (!force && ai.status === 'done' && ai.lastText === text && ai.tone === b.tone) return;
    ai.lastText = text;
    if (ai.ctl) ai.ctl.abort();
    var ctl = ai.ctl = new AbortController();
    ai.status = 'loading'; ai.note = ''; ai.tone = b.tone; refreshLint();
    var prompt = '당신은 한국어 업무 메시지 교정 도우미입니다. 회계법인 신입사원이 상사(호칭: ' + b.honorific + ')에게 메신저로 보낼 메시지를 검사하세요.\n' +
      '선택한 톤 → ' + TONE_DESC[b.tone] + '\n\n' +
      '찾을 것:\n1) typo: 맞춤법·오탈자 오류\n2) spacing: 띄어쓰기 오류\n3) tone: 선택한 톤과 맞지 않는 표현 (어미 불일치, 반말, 초성체·이모티콘, 상사에게 실례되는 표현)\n\n' +
      '규칙:\n- from은 메시지에 실제로 있는 그대로의 연속 문자열을 글자 하나 바꾸지 말고 복사하세요. 고칠 부분을 포함한 가장 짧은 어절 단위로 잡으세요.\n' +
      '- to는 바꿀 문자열입니다. 지울 거면 빈 문자열("")로 두세요.\n- 내용과 의미는 바꾸지 마세요. 문제가 없는 문장은 건드리지 마세요.\n' +
      '- 같은 문제는 한 번만, 최대 15개까지. 문제가 없으면 빈 배열로 답하세요.\n- why는 20자 안팎의 한국어 설명입니다.\n\n' +
      '다음 JSON만 답하세요: {"fixes":[{"from":"...","to":"...","kind":"typo|spacing|tone","why":"..."}]}\n\n' +
      '메시지:\n"""\n' + text.slice(0, 3000) + '\n"""';
    ai.fn.json(prompt, { signal: ctl.signal, modelTier: 'quick' }).then(function (res) {
      if (ctl !== ai.ctl) return;
      var arr = res && Array.isArray(res.fixes) ? res.fixes : Array.isArray(res) ? res : [];
      var seen = {};
      ai.fixes = arr.filter(function (f) {
        if (!f || typeof f.from !== 'string' || typeof f.to !== 'string' || !f.from || f.from === f.to) return false;
        if (text.indexOf(f.from) < 0 || seen[f.from]) return false;
        seen[f.from] = 1; return true;
      }).slice(0, 15).map(function (f) { return { from: f.from, to: f.to, kind: KIND_LBL[f.kind] ? f.kind : 'typo', why: String(f.why || '').slice(0, 60), count: text.split(f.from).length - 1 }; });
      ai.status = 'done'; ai.ctl = null; refreshLint();
    }, function (e) {
      if (ctl !== ai.ctl) return;
      ai.ctl = null; ai.status = 'idle'; ai.lastText = null;
      var c = e && e.code;
      if (c === 'cancelled') ai.note = '';
      else if (/^(not_granted|sampling_disabled|not_declared|capability_disabled|capability_removed)$/.test(c)) { ai.off = true; ai.note = 'AI 검사를 사용할 수 없어요. 이 페이지의 Claude 사용을 허용하면 다시 검사할 수 있어요.'; }
      else if (c === 'rate_limited') ai.note = '요청이 많아요. 잠시 후 다시 눌러 주세요.';
      else if (c === 'session_expired') ai.note = '로그인이 만료됐어요. 다시 로그인한 뒤 눌러 주세요.';
      else ai.note = 'AI 검사 결과를 받지 못했어요. 다시 눌러 주세요.';
      refreshLint();
    });
  }
  function refreshLint() { var l = $('#lint'), m = $('#msg'), b = current(); if (l && m && b) l.innerHTML = lintHtml(m.value, b.tone); }
  function setMsg(b, text) { b.edits[b.tone] = text; persist(); render(true); scheduleAI(); }
  function typeLabel(k) { for (var i = 0; i < TONES.length; i++) if (TONES[i].key === k) return TONES[i].label; return ''; }

  // ---------- 화면: 체크리스트 ----------
  function ensureTodos(b) {
    var asks = b.items.filter(function (i) { return i.include && (i.status === 'missing' || i.status === 'unclear'); });
    var cust = b.customs.filter(function (c) { return c.include; });
    if (!b.todos) {
      b.todos = [];
      if (asks.length || cust.length) b.todos.push({ id: uid(), kind: 'send', text: '확인 질문 메시지 보내기', done: false });
      asks.forEach(function (i) { b.todos.push({ id: uid(), kind: 'answer', key: i.key, text: BC.itemDef(i.key).label + ' 답변 받기', done: !!(b.answers[i.key] || '').trim() }); });
      cust.forEach(function (c) { b.todos.push({ id: uid(), kind: 'answer', key: 'c:' + c.id, text: '‘' + c.text + '’ 답변 받기', done: !!(b.answers['c:' + c.id] || '').trim() }); });
      BC.TODOS[b.type].forEach(function (t) { b.todos.push({ id: uid(), kind: 'prep', text: t, done: false }); });
      b.todos.push({ id: uid(), kind: 'final', text: '제출 전, 확정된 브리프와 결과물 대조하기', done: false });
    } else {
      // 점검 단계에서 질문을 새로 넣었다면 답변 항목 추가
      var have = {}; b.todos.forEach(function (t) { if (t.key) have[t.key] = 1; });
      var at = b.todos.findIndex(function (t) { return t.kind === 'prep'; }); if (at < 0) at = b.todos.length;
      asks.forEach(function (i) { if (!have[i.key]) b.todos.splice(at++, 0, { id: uid(), kind: 'answer', key: i.key, text: BC.itemDef(i.key).label + ' 답변 받기', done: false }); });
      cust.forEach(function (c) { if (!have['c:' + c.id]) b.todos.splice(at++, 0, { id: uid(), kind: 'answer', key: 'c:' + c.id, text: '‘' + c.text + '’ 답변 받기', done: false }); });
    }
  }
  var KIND = { send: '질문', answer: '답변', prep: '준비', final: '마무리', user: '내 할 일' };
  function viewTodo() {
    var b = current(); ensureTodos(b); persist();
    var done = b.todos.filter(function (t) { return t.done; }).length, total = b.todos.length;
    var pct = total ? Math.round(done / total * 100) : 0;
    var rows = b.items.filter(function (i) { return i.status !== 'na'; });
    return '<div class="view">' + stepper() +
      '<h2>답변 받고, 이 순서로 시작하세요</h2><p class="sub">상사에게 받은 답을 적어두면 아래 브리프에 정리돼요. 체크 상태는 자동 저장돼요.</p>' +
      '<div class="card"><div class="row" style="margin-bottom:8px"><span class="label grow">진행률</span><b style="font-family:var(--font-mono);font-variant-numeric:tabular-nums">' + done + ' / ' + total + '</b></div><div class="progress"><i style="width:' + pct + '%"></i></div></div>' +
      '<div class="section"><span class="label">할 일</span><div class="card" id="todoList">' + b.todos.map(todoRow).join('') +
        '<div class="add-row" style="margin-top:12px"><input type="text" id="todoIn" placeholder="할 일 추가"><button class="btn btn-soft btn-sm" id="addTodo">추가</button></div></div></div>' +
      '<div class="section"><span class="label">확정 브리프</span><div class="card" style="overflow-x:auto"><table class="brief-table"><tbody>' +
        '<tr><th>업무 지시</th><td>' + esc(b.text) + '</td></tr><tr><th>업무 유형</th><td>' + esc(typeOf(b.type).label) + '</td></tr>' +
        rows.map(function (i) {
          var a = (b.answers[i.key] || '').trim();
          var base = i.status === 'ok' ? esc((i.evidence || []).map(function (e) { return e.text; }).join(', ') || '확인됨') : null;
          return '<tr><th>' + BC.itemDef(i.key).label + '</th><td>' + briefCell(i.key, a, base, i.include ? '답변 대기' : '미확인') + '</td></tr>';
        }).join('') +
        b.customs.filter(function (c) { return c.include; }).map(function (c) { var a = (b.answers['c:' + c.id] || '').trim(); return '<tr><th>추가 질문</th><td>' + esc(c.text) + '<div style="margin-top:6px">' + briefCell('c:' + c.id, a, null, '답변 대기') + '</div></td></tr>'; }).join('') +
      '</tbody></table></div></div>' +
      '<div class="section"><span class="label">메모</span><textarea id="memo" rows="3" placeholder="구두로 들은 내용, 주의할 점 등을 적어두세요">' + esc(b.memo) + '</textarea></div>' +
      bar('<button class="btn btn-line" data-go="message">이전</button><button class="btn btn-primary" data-act="new">새 업무 점검하기</button>') +
    '</div>';
  }
  // 확정 브리프 칸: 탭해서 답변 직접 입력·수정
  function briefCell(key, ans, base, pendingLabel) {
    var k = esc(key);
    if (state.editKey === key) {
      var cur = current().answers[key] || '';
      return '<div class="bedit"><textarea data-bans="' + k + '" rows="2" placeholder="받은 답변 내용 입력">' + esc(cur) + '</textarea>' +
        '<div class="row"><button class="btn btn-line btn-sm" data-bcancel="1">취소</button><button class="btn btn-primary btn-sm" data-bsave="' + k + '">답변 확인</button></div></div>';
    }
    if (ans) return '<div class="bval"><span class="bv">' + esc(ans) + '</span><button class="bedit-btn fix" data-bedit="' + k + '">수정</button></div>';
    if (base) return '<div class="bval"><span class="bv">' + base + '</span><button class="bedit-btn fix" data-bedit="' + k + '">수정</button></div>';
    return '<button class="bedit-btn pending" data-bedit="' + k + '">' + pendingLabel + ' · 답변 입력</button>';
  }
  function saveBriefAnswer(key, val) {
    var b = current(); val = (val || '').trim();
    if (val) b.answers[key] = val; else delete b.answers[key];
    var td = (b.todos || []).find(function (x) { return x.key === key; });
    if (td) td.done = !!val;
    state.editKey = null; persist(); render(true);
    toast(val ? '답변을 저장했어요' : '답변을 비웠어요');
  }
  function todoRow(t) {
    var b = current();
    var ans = t.kind === 'answer' ? '<input type="text" data-ans="' + esc(t.key) + '" placeholder="받은 답변 적기" value="' + esc(b.answers[t.key] || '') + '">' : '';
    return '<div class="todo' + (t.done ? ' done' : '') + '"><button class="chk' + (t.done ? ' on' : '') + '" data-todo="' + t.id + '" aria-label="완료 표시" aria-pressed="' + t.done + '">' + (t.done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><path d="M5 12l5 5L20 7"/></svg>' : '') + '</button>' +
      '<div class="body"><span class="tag">' + KIND[t.kind] + '</span><span class="t">' + esc(t.text) + '</span>' + ans + '</div>' +
      '<button class="x" data-tdel="' + t.id + '" aria-label="삭제">×</button></div>';
  }

  // ---------- 화면: 기록 ----------
  function histCard(b) {
    var total = b.todos ? b.todos.length : 0, done = b.todos ? b.todos.filter(function (t) { return t.done; }).length : 0;
    var need = b.items.filter(function (i) { return i.status === 'missing' || i.status === 'unclear'; }).length;
    var d = new Date(b.createdAt);
    var del = state.confirmDel === b.id;
    return '<div class="card hist" data-open="' + b.id + '" role="button" tabindex="0">' +
      '<span class="req">' + esc(b.text) + '</span>' +
      '<div class="meta"><span class="pill s-na">' + esc(typeOf(b.type).label) + '</span>' + (need ? '<span class="pill s-missing">확인 ' + need + '개</span>' : '<span class="pill s-ok">빠진 항목 없음</span>') +
        '<span>' + (d.getMonth() + 1) + '.' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '</span>' +
        (total ? '<span>할 일 ' + done + '/' + total + '</span>' : '') + '<span style="flex:1"></span>' +
        '<button class="' + (del ? 'btn btn-sm s-missing' : 'ghost') + '" data-hdel="' + b.id + '">' + (del ? '정말 삭제' : '삭제') + '</button></div>' +
      (total ? '<div class="progress"><i style="width:' + Math.round(done / total * 100) + '%"></i></div>' : '') +
    '</div>';
  }
  function viewHistory() {
    return '<div class="view"><h2>내 브리프</h2><p class="sub">점검한 업무는 이 브라우저에 저장돼요. 눌러서 이어서 진행하세요.</p>' +
      '<div class="section" style="margin-top:0">' + (briefs.length ? briefs.map(histCard).join('') : '<div class="empty">아직 점검한 업무가 없어요.<br>업무 지시를 붙여넣고 첫 점검을 시작해 보세요.</div>') + '</div>' +
      bar('<button class="btn btn-line" data-go="home">처음</button><button class="btn btn-primary" data-act="new">새 업무 점검하기</button>') + '</div>';
  }

  // ---------- 렌더 ----------
  function render(keepScroll) {
    var y = window.scrollY;
    var v = state.view;
    if (v !== 'home' && v !== 'input' && v !== 'history' && !current()) v = state.view = 'home';
    var html = v === 'home' ? viewHome() : v === 'input' ? viewInput() : v === 'check' ? viewCheck() : v === 'message' ? viewMessage() : v === 'todo' ? viewTodo() : viewHistory();
    app.innerHTML = html;
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  }
  function go(v) { state.editKey = null; state.view = v; clearTimeout(aiTimer); if (ai.ctl) ai.ctl.abort(); render(false); if (v === 'message') scheduleAI(300); }

  // ---------- 이벤트 ----------
  app.addEventListener('click', function (e) {
    var el = e.target.closest('button, [data-open], mark[data-jump]');
    if (!el) return;
    var ds = el.dataset, b = current();

    if (ds.hdel) {
      e.stopPropagation();
      if (state.confirmDel === ds.hdel) {
        briefs = briefs.filter(function (x) { return x.id !== ds.hdel; }); save();
        if (b && b.id === ds.hdel) state.brief = null;
        state.confirmDel = null; toast('삭제했어요');
      } else state.confirmDel = ds.hdel;
      return render(true);
    }
    if (ds.open) {
      var f = briefs.find(function (x) { return x.id === ds.open; });
      if (f) { state.brief = f; state.confirmDel = null; go(f.todos ? 'todo' : 'check'); }
      return;
    }
    if (ds.go === 'input' && b) return editInput(b);
    if (ds.go) return go(ds.go);
    if (ds.jump) {
      var card = document.getElementById('it-' + ds.jump);
      if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('flash'); setTimeout(function () { card.classList.remove('flash'); }, 1200); }
      return;
    }
    if (ds.act === 'new') { state.brief = null; state.draft = { text: '', type: null, typeManual: false, honorific: state.draft.honorific || '매니저님' }; return go('input'); }
    if (ds.act === 'example') { state.brief = null; state.draft = { text: BC.SAMPLES[0].text, type: null, typeManual: false, honorific: '선배님' }; return go('input'); }
    if (ds.act === 'edit') return editInput(b);
    if (ds.sample) { state.draft.text = BC.SAMPLES[+ds.sample].text; state.draft.typeManual = false; return render(true); }
    if (ds.hon) { state.draft.honorific = ds.hon; return render(true); }
    if (ds.type) { state.draft.type = ds.type; state.draft.typeManual = true; return render(true); }
    if (el.id === 'goCheck') return startCheck();

    if (ds.act === 'retype') { var rb = $('#retypeBox'); rb.hidden = !rb.hidden; return; }
    if (ds.retype) {
      b.type = ds.retype; b.items = BC.analyze(b.text, b.type); b.edits = {}; b.todos = null; persist();
      toast(typeOf(b.type).label + ' 기준으로 다시 점검했어요'); return render(true);
    }
    if (ds.set) {
      var p = ds.set.split(':'), it = b.items.find(function (x) { return x.key === p[0]; });
      it.status = p[1];
      it.include = (p[1] === 'missing' || p[1] === 'unclear');
      b.edits = {}; persist(); return render(true);
    }
    if (ds.restore) {
      var r = b.items.find(function (x) { return x.key === ds.restore; });
      var res = BC.judge(b.text, r.key);
      r.level = 'O'; r.status = res.status; r.auto = res.status; r.evidence = res.evidence; r.include = res.status !== 'ok';
      b.edits = {}; persist(); return render(true);
    }
    if (el.id === 'addCustom') {
      var ci = $('#customIn'), v = ci.value.trim(); if (!v) { ci.focus(); return; }
      b.customs.push({ id: uid(), custom: true, text: v, include: true }); b.edits = {}; persist(); render(true);
      var n = $('#customIn'); if (n) n.focus(); return;
    }
    if (ds.cdel) { b.customs = b.customs.filter(function (c) { return c.id !== ds.cdel; }); b.edits = {}; persist(); return render(true); }

    if (ds.tone) { b.tone = ds.tone; persist(); render(true); return scheduleAI(300); }
    if (ds.act === 'regen') { delete b.edits[b.tone]; persist(); return render(true); }
    if (ds.act === 'copy') { var m = $('#msg'); return copyText(m.value, m); }
    if (ds.qinc) { var q = b.items.find(function (x) { return x.key === ds.qinc; }); q.include = !q.include; delete b.edits[b.tone]; persist(); return render(true); }
    if (ds.qcinc) { var qc = b.customs.find(function (x) { return x.id === ds.qcinc; }); qc.include = !qc.include; delete b.edits[b.tone]; persist(); return render(true); }
    if (ds.fix != null && state.lint) {
      var fx = state.lint.fixes[+ds.fix]; if (!fx) return;
      setMsg(b, BC.applyFix($('#msg').value, fx)); toast('‘' + fx.from + '’ 고쳤어요'); return;
    }
    if (ds.act === 'ai') { clearTimeout(aiTimer); return runAI(true); }
    if (ds.aifix != null && ai.live) {
      var af = ai.live[+ds.aifix]; if (!af) return;
      setMsg(b, $('#msg').value.split(af.from).join(af.to)); toast('‘' + af.from + '’ 고쳤어요'); return;
    }
    if (ds.act === 'aiAll' && ai.live) {
      var at = $('#msg').value; ai.live.forEach(function (f) { at = at.split(f.from).join(f.to); });
      setMsg(b, at); toast(ai.live.length + '곳 고쳤어요'); return;
    }
    if (ds.act === 'fixAll' && state.lint) {
      var txt = $('#msg').value, n = 0;
      for (var k = 0; k < 5; k++) { var lr = BC.lint(txt, b.tone); if (!lr.fixes.length) break; lr.fixes.forEach(function (f) { txt = BC.applyFix(txt, f); n++; }); }
      setMsg(b, txt); toast(n + '곳 고쳤어요'); return;
    }

    if (ds.bedit) {
      state.editKey = ds.bedit; render(true);
      var ta = document.querySelector('textarea[data-bans]'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      return;
    }
    if (ds.bsave) { var bt = document.querySelector('textarea[data-bans]'); return saveBriefAnswer(ds.bsave, bt ? bt.value : ''); }
    if (ds.bcancel) { state.editKey = null; return render(true); }
    if (ds.todo) { var t = b.todos.find(function (x) { return x.id === ds.todo; }); t.done = !t.done; persist(); return render(true); }
    if (ds.tdel) {
      var di = b.todos.findIndex(function (x) { return x.id === ds.tdel; });
      if (di < 0) return;
      lastDel = { brief: b, todo: b.todos[di], index: di };
      b.todos.splice(di, 1); persist(); render(true);
      return showUndo();
    }
    if (el.id === 'addTodo') {
      var ti = $('#todoIn'), tv = ti.value.trim(); if (!tv) { ti.focus(); return; }
      var fi = b.todos.findIndex(function (x) { return x.kind === 'final'; });
      b.todos.splice(fi < 0 ? b.todos.length : fi, 0, { id: uid(), kind: 'user', text: tv, done: false }); persist(); render(true);
      var tn = $('#todoIn'); if (tn) tn.focus(); return;
    }
  });

  app.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'customIn') { e.preventDefault(); $('#addCustom').click(); }
    if (e.key === 'Enter' && e.target.id === 'todoIn') { e.preventDefault(); $('#addTodo').click(); }
    if (e.target.dataset && e.target.dataset.bans) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); saveBriefAnswer(e.target.dataset.bans, e.target.value); }
      if (e.key === 'Escape') { state.editKey = null; render(true); }
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.open) { e.preventDefault(); e.target.click(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id === 'req') startCheck();
  });

  app.addEventListener('change', function (e) {
    var ds = e.target.dataset, b = current();
    if (ds.inc) { var it = b.items.find(function (x) { return x.key === ds.inc; }); it.include = e.target.checked; b.edits = {}; persist(); return render(true); }
    if (ds.cinc) { var c = b.customs.find(function (x) { return x.id === ds.cinc; }); c.include = e.target.checked; b.edits = {}; persist(); return render(true); }
  });

  var typeTimer, lintTimer;
  app.addEventListener('input', function (e) {
    var t = e.target, b = current();
    if (t.id === 'req') {
      state.draft.text = t.value;
      $('#cnt').textContent = t.value.length;
      $('#goCheck').disabled = !t.value.trim();
      clearTimeout(typeTimer);
      typeTimer = setTimeout(function () {
        if (!$('#types')) return;
        var d = state.draft, det = BC.detectType(d.text);
        var sel = d.typeManual ? d.type : (d.text.trim() ? det.type : null);
        $('#types').innerHTML = typesHtml(sel, d.text.trim() ? det.type : null);
        $('#typeNote').textContent = d.typeManual ? '직접 선택함' : (d.text.trim() ? '문장을 보고 자동 추천했어요' : '');
      }, 250);
    }
    if (t.id === 'hon') { state.draft.honorific = t.value.trim() || '매니저님'; document.querySelectorAll('[data-hon]').forEach(function (c) { c.classList.toggle('on', c.dataset.hon === t.value.trim()); }); }
    if (t.id === 'msg') {
      b.edits[b.tone] = t.value; persist();
      clearTimeout(lintTimer); lintTimer = setTimeout(function () { var lb = $('#lint'); if (lb) lb.innerHTML = lintHtml(t.value, b.tone); }, 300);
      if (ai.ctl) { ai.ctl.abort(); }
      scheduleAI();
      if (!$('.edited')) { var row = t.parentNode.querySelector('.row'); row.insertAdjacentHTML('beforeend', '<span class="edited">수정됨</span><button class="ghost" data-act="regen">초안 다시 만들기</button>'); }
    }
    if (t.dataset.ans) {
      b.answers[t.dataset.ans] = t.value;
      var td = b.todos.find(function (x) { return x.key === t.dataset.ans; });
      var was = td.done; td.done = !!t.value.trim(); persist();
      if (was !== td.done) {
        var rowEl = t.closest('.todo'); rowEl.classList.toggle('done', td.done);
        var chk = rowEl.querySelector('.chk'); chk.classList.toggle('on', td.done);
        chk.innerHTML = td.done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><path d="M5 12l5 5L20 7"/></svg>' : '';
        var dn = b.todos.filter(function (x) { return x.done; }).length;
        document.querySelector('.view > .card .progress i').style.width = Math.round(dn / b.todos.length * 100) + '%';
        document.querySelector('.view > .card b').textContent = dn + ' / ' + b.todos.length;
      }
    }
    if (t.id === 'memo') { b.memo = t.value; persist(); }
  });
  // 답변 입력 후 브리프 표 갱신
  app.addEventListener('focusout', function (e) { if (e.target.dataset && e.target.dataset.ans) setTimeout(function () { if (!app.contains(document.activeElement) || !document.activeElement.dataset.ans) render(true); }, 0); });

  $('#undoBtn').addEventListener('click', function () {
    if (!lastDel) return hideUndo();
    var d = lastDel, list = d.brief.todos || (d.brief.todos = []);
    list.splice(Math.min(d.index, list.length), 0, d.todo);
    clearTimeout(showUndo._t); hideUndo();
    state.brief = d.brief; persist(); render(true); toast('되돌렸어요');
  });
  $('#topLogo').addEventListener('click', function () { go('home'); });
  $('#topHist').addEventListener('click', function () { go('history'); });
  render(false);
})();
