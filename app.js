(() => {
  const {el, icon, uid: newId, shuffle} = App.util;
  const main = document.querySelector('#main');
  const nav = document.querySelector('#nav');
  const offline = document.querySelector('#offline');
  const notice = document.querySelector('#notice');
  const tabs = [
    ['home', '练习', 'home'], ['review', '复习', 'star'],
    ['progress', '进度', 'chart'], ['manage', '题库', 'settings']
  ];
  const theory = Bank.theoryExam;
  const modes = {sequence: '顺序练习', random: '随机练习', wrong: '错题重练', favorites: '收藏练习', exam: '模拟考试'};
  let state, preview, lastResult, installPrompt, cached = false, busy = false, timer, noticeTimer;
  let reviewTab = 'wrong';
  const path = () => location.hash.slice(1) || 'home';
  const activeBank = () => state.bank.filter(Bank.active);
  const favorite = id => state.favorites[id]?.on === true;
  const asTime = value => new Date(value).toLocaleString('zh-CN', {hour12: false});
  const p = (text, cls = 'muted') => el('p', {class: cls, text});
  const h2 = text => el('h2', {text});
  const button = (label, action, cls = '', extra = {}) =>
    el('button', {class: 'btn ' + cls, type: 'button', text: label, onclick: action, ...extra});
  const section = (...children) => el('section', {class: 'panel'}, ...children);
  const row = (...children) => el('div', {class: 'row'}, ...children);
  const label = (text, input) => el('label', {class: 'field'}, el('span', {text}), input);
  const heading = (title, text) => el('div', {class: 'page-heading'}, el('h1', {text: title}), text && p(text));

  function tell(message) {
    clearTimeout(noticeTimer);
    notice.textContent = message;
    noticeTimer = setTimeout(() => { notice.textContent = ''; }, 6000);
  }

  function go(page) {
    if (path() === page) render();
    else location.hash = page;
  }

  async function save(update, after = render) {
    if (busy) return;
    busy = true;
    try {
      state = await LocalStore.change(state.revision, update);
      after();
    } catch (error) {
      if (error.conflict) {
        state = await LocalStore.read();
        render();
      }
      tell(error.conflict ? error.message : '保存失败。请检查浏览器的可用存储空间后重试。');
    } finally {
      busy = false;
    }
  }

  function stats() {
    const questions = new Map();
    const events = [...state.events].sort((a, b) => a.at - b.at);
    for (const event of events) {
      for (const answer of event.answers) {
        if (answer.picked == null) continue;
        const id = answer.bankId || answer.id;
        const result = questions.get(id) || {seen: 0, right: 0};
        result.seen++;
        result.right += Number(answer.ok);
        result.lastOk = answer.ok;
        questions.set(id, result);
      }
    }
    return {questions, exams: events.filter(event => event.kind === 'exam').reverse()};
  }

  function start(questions, kind, title, rules = null) {
    if (!questions.length || busy) return;
    if (state.session && !confirm('已有未完成的答题。开始新练习会结束当前答题，已保存的练习记录会保留。')) return;
    const session = {
      id: newId(), kind, title, questions, index: 0, replies: {}, checked: {},
      deadline: rules ? Date.now() + rules.minutes * 60000 : null,
      ...(rules ? {rules: rules.id} : {})
    };
    save(next => { next.session = session; }, () => go('session'));
  }

  function chooseMode(title, questions) {
    const buttons = row(
      button('顺序练习', () => start(questions, 'sequence', title), 'primary', {disabled: !questions.length}),
      button('随机练习', () => start(shuffle(questions), 'random', title), '', {disabled: !questions.length})
    );
    return buttons;
  }

  function home() {
    const questions = activeBank();
    const history = stats().questions;
    const seen = questions.filter(q => history.has(Bank.uid(q))).length;
    const pct = questions.length ? Math.round(seen * 100 / questions.length) : 0;
    const hero = el('section', {class: 'hero'},
      el('div', {class: 'hero-tag', text: '2026 年版 · 四级 / 中级工'}),
      el('h1', {text: '消防设施操作员'}),
      p('理论知识章节练习', 'hero-sub'),
      el('div', {class: 'hero-progress'},
        el('div', {class: 'split'}, el('span', {text: '学习进度'}), el('strong', {text: seen + ' / ' + questions.length + ' 题'})),
        el('progress', {value: pct, max: 100, 'aria-label': '已做题目的比例'})),
      state.session ?
        button('继续答题', () => go('session'), 'hero-button') :
        button('开始顺序练习', () => start(questions, 'sequence', '全部章节'), 'hero-button', {disabled: !questions.length})
    );
    const actions = el('div', {class: 'quick-grid'},
      quick('refresh', '随机练习', '打乱全部章节题序', () => start(shuffle(questions), 'random', '全部章节')),
      quick('clock', '模拟考试', '章节组卷 · 限时计分', () => go('exam'))
    );
    const chapters = el('section', {class: 'chapter-section'},
      el('div', {class: 'split'}, h2('章节题库'), el('span', {class: 'muted', text: '五个理论模块'})),
      ...Bank.chapters.map(([name, sub, , symbol], i) => {
        const part = questions.filter(q => q.chapter === name);
        const done = part.filter(q => history.has(Bank.uid(q))).length;
        return el('a', {class: 'chapter', href: '#chapter/' + i},
          el('span', {class: 'chapter-icon'}, icon(symbol)),
          el('span', {class: 'item-copy'}, el('strong', {text: name}), el('small', {text: sub})),
          el('span', {class: 'fraction', text: done + '/' + part.length}),
          icon('next', 17));
      }));
    main.append(hero, actions, chapters);
  }

  function quick(symbol, title, subtitle, action) {
    return el('button', {class: 'quick', type: 'button', onclick: action},
      icon(symbol), el('span', {class: 'item-copy'}, el('strong', {text: title}), el('small', {text: subtitle})));
  }

  function chapter(index) {
    const [name, sub, weight] = Bank.chapters[index];
    const questions = activeBank().filter(q => q.chapter === name);
    const learned = stats().questions;
    main.append(heading(name, sub),
      section(h2('章节练习'), p(`共 ${questions.length} 题 · 理论权重 ${weight}%`), chooseMode(name, questions)),
      section(h2('题型分布'), ...Object.entries(Bank.types).map(([type, text]) =>
        el('div', {class: 'list-row split'}, el('span', {text}),
          el('strong', {text: questions.filter(q => q.type === type && learned.has(Bank.uid(q))).length +
            ' / ' + questions.filter(q => q.type === type).length + ' 题已练'})))));
  }

  function exam() {
    const paper = Bank.mock(activeBank());
    main.append(heading('模拟考试', '2026 年版四级 / 中级工理论机考'),
      section(h2('全卷模拟'),
        el('div', {class: 'metrics'}, metric(theory.count, '试题总数'), metric(theory.minutes, '考试分钟'),
          metric(theory.pass, '合格分数')),
        p(Object.entries(theory.sections).map(([type, count]) => Bank.types[type] + ' ' + count + ' 题').join(' · ')),
        p(`满分 ${theory.count * theory.perQuestion} 分，每题 ${theory.perQuestion} 分。多选题少选、多选或错选均为 0 分。`),
        p('开考后连续计时。交卷前可修改答案，时间到自动交卷。交卷后查看成绩。'),
        paper.length ? null : p('当前题库无法同时满足章节权重和题型配额，请补充已审核的题目。', 'wrong'),
        button('开始模拟', () => start(paper, 'exam', '理论模拟', theory), 'primary wide', {disabled: !paper.length}),
        el('details', {}, el('summary', {text: '规则依据'}),
          p(Bank.chapters.map(([name, , weight]) => `${name} ${weight * theory.count / 100} 题`).join(' · ')),
          p('合格线和章节权重采用 2026 版国标。90 分钟参照江苏站公开鉴定公告，题量、题型和单题分值参照公开备考资料。'))));
  }

  function entryFor(session, index, item, value) {
    return {id: Bank.uid(session.questions[index]), picked: value ?? null,
      ok: App.fractionOf(item, value, App.scoring.DEFAULTS) === 1};
  }

  const prepared = q => App.prepareQuestion(q, {shuffleOptions: false});

  function submitExam(session, expired = false) {
    if (busy || session?.kind !== 'exam') return;
    const values = session.questions.map((_, i) => session.replies[i]);
    const answered = values.filter(v => v !== undefined).length;
    let automatic = expired || Date.now() >= session.deadline;
    if (!automatic) {
      const confirmed = confirm(`已答 ${answered}/${values.length} 题，未答 ${values.length - answered} 题。确认交卷？`);
      automatic = Date.now() >= session.deadline;
      if (!confirmed && !automatic) return;
    }
    const items = session.questions.map(prepared);
    const scoring = App.scoring.score(items, values);
    const event = {
      id: session.id, kind: 'exam', at: Date.now(), questions: session.questions,
      answers: items.map((item, i) => entryFor(session, i, item, values[i])),
      score: session.rules === theory.id ? scoring.fully * theory.perQuestion :
        Math.round(10000 * scoring.score / scoring.max) / 100,
      ...(session.rules === theory.id ? {rules: theory.id, automatic} : {})
    };
    save(next => { next.events.push(event); next.session = null; }, () => {
      lastResult = event;
      if (path() === 'session') go('result');
      else {
        render();
        tell('考试时间到，已自动交卷。');
      }
    });
  }

  function explanation(q, item, value) {
    const good = App.fractionOf(item, value, App.scoring.DEFAULTS) === 1;
    const answer = item.answer.map(i => q.type === 'truefalse' ? item.options[i] : Bank.letter(i)).join('、');
    return el('div', {class: 'explanation', role: 'status'},
      el('strong', {class: good ? 'correct' : 'wrong', text: good ? '回答正确' : value === undefined ? '未作答' : '回答错误'}),
      p('正确答案：' + answer, 'answer-key'), p(q.explanation), q.source ? p('依据：' + q.source, 'source') : null);
  }

  // Reuse QZ choice controls while constraining all imported question text to plain text.
  App.loc = value => value;
  App.rich = {inline: value => document.createTextNode(value)};

  function sessionView() {
    const session = state.session;
    if (!session) {
      main.append(heading('当前没有进行中的练习'), button('返回练习', () => go('home'), 'primary'));
      return;
    }
    const i = session.index;
    const q = session.questions[i];
    const id = Bank.uid(q);
    const inExam = session.kind === 'exam';
    const item = prepared(q);
    const value = session.replies[i];
    const locked = session.checked[i] === true;
    const total = session.questions.length;
    const ready = App.typeHandler(item).hasAnswer(item, value);
    let pendingChoice = Promise.resolve();
    const time = el('span', {class: 'timer', 'aria-label': '考试剩余时间'});
    const star = button(favorite(id) ? '已收藏' : '收藏', async () => {
      await pendingChoice;
      save(next => {
        next.favorites[id] = {on: !favorite(id), at: Date.now()};
      });
    }, 'small', {'aria-pressed': String(favorite(id))});
    const jump = async index => {
      await pendingChoice;
      if (state.session?.id !== session.id) return;
      save(next => { next.session.index = index; }, () => {
        render(true);
        document.querySelector('.question-title')?.focus({preventScroll: true});
      });
    };
    const primary = button(inExam ? (i === total - 1 ? '交卷' : '下一题') :
      locked ? (i === total - 1 ? '完成练习' : '下一题') : '确认答案', async () => {
      await pendingChoice;
      if (state.session?.id !== session.id) return;
      if (inExam) {
        if (i === total - 1) submitExam(state.session);
        else jump(i + 1);
      } else if (!locked) {
        save(next => {
          const current = next.session.replies[i];
          if (!App.typeHandler(item).hasAnswer(item, current)) return;
          next.session.checked[i] = true;
          const eventId = session.id + '-' + i;
          if (!next.events.some(event => event.id === eventId)) {
            next.events.push({id: eventId, kind: 'practice', at: Date.now(),
              answers: [entryFor(session, i, item, current)]});
          }
        });
      } else if (i < total - 1) jump(i + 1);
      else save(next => { next.session = null; }, () => {
        go('progress');
        tell('练习记录已保存');
      });
    }, 'primary', {disabled: !inExam && !locked && !ready});
    const choices = App.typeHandler(item).render({
      item, value, uid: session.id + '-' + i, locked, reveal: locked,
      onChange(picked) {
        pendingChoice = pendingChoice.then(() => {
          if (state.session?.id !== session.id) return;
          return save(next => {
            if (inExam && Date.now() >= session.deadline) return;
            if (Array.isArray(picked) && !picked.length) delete next.session.replies[i];
            else next.session.replies[i] = picked;
          }, () => {
            primary.disabled = !inExam && !App.typeHandler(item).hasAnswer(item, state.session.replies[i]);
            paintAnswerSheet();
          });
        });
      }
    });
    choices.setAttribute('aria-label', Bank.types[q.type] + '选项');
    const qtitle = el('h1', {class: 'question-title', tabindex: '-1', text: q.text});
    const top = el('div', {class: 'split session-top'},
      session.rules === theory.id ? el('span', {text: '理论机考'}) :
        button('返回', async () => { await pendingChoice; go('home'); }, 'small'),
      el('strong', {text: `第 ${i + 1} / ${total} 题`}),
      inExam ? time : star);
    const grid = inExam ? el('details', {class: 'question-grid'}) : null;
    const counters = el('summary');
    const questionButtons = [];
    if (grid) {
      grid.append(counters);
      const groups = session.rules === theory.id ? Object.keys(theory.sections) : [''];
      for (const group of groups) {
        const numbers = el('div', {class: 'number-grid'});
        if (group) grid.append(h2(Bank.types[group]));
        session.questions.forEach((question, index) => {
          if (group && question.type !== group) return;
          const target = button(String(index + 1), () => jump(index), '', {
            'aria-current': index === i ? 'true' : undefined
          });
          questionButtons[index] = target;
          numbers.append(target);
        });
        grid.append(numbers);
      }
      paintAnswerSheet();
    }
    function paintAnswerSheet() {
      if (!grid) return;
      const replies = state.session.replies;
      counters.textContent = `答题卡 · 已答 ${Object.keys(replies).length}/${total}`;
      questionButtons.forEach((target, index) => {
        const answered = replies[index] !== undefined;
        target.classList.toggle('answered', answered);
        target.setAttribute('aria-label', `第 ${index + 1} 题，${answered ? '已答' : '未答'}`);
      });
    }
    main.append(top, el('progress', {class: 'session-progress', value: i + 1, max: total, 'aria-label': '答题位置'}),
      el('div', {class: 'question-meta'}, el('span', {class: 'type-tag', text: Bank.types[q.type]}),
        session.rules === theory.id ? null : el('span', {text: q.chapter})),
      qtitle, choices);
    if (locked) main.append(explanation(q, item, value));
    if (grid) main.append(grid);
    nav.append(button('上一题', () => jump(i - 1), '', {disabled: i === 0}), primary);
    if (inExam && i < total - 1) nav.append(button('交卷', async () => {
      await pendingChoice;
      submitExam(state.session);
    }));
    if (inExam) {
      const tick = () => {
        const remaining = Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000));
        time.textContent = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
        if (!remaining) submitExam(state.session, true);
      };
      timer = setInterval(tick, 500);
      tick();
    }
  }

  function review() {
    const history = stats().questions;
    const wrong = state.bank.filter(q => history.get(Bank.uid(q))?.lastOk === false);
    const favorites = state.bank.filter(q => favorite(Bank.uid(q)));
    const pool = reviewTab === 'wrong' ? wrong : favorites;
    const title = reviewTab === 'wrong' ? '错题本' : '题目收藏';
    const changeTab = tab => { reviewTab = tab; render(); };
    main.append(heading('复习', '按最近一次有效作答维护错题本。'),
      row(button('错题本 ' + wrong.length, () => changeTab('wrong'), reviewTab === 'wrong' ? 'selected-tab' : '', {
        'aria-pressed': String(reviewTab === 'wrong')
      }), button('收藏 ' + favorites.length, () => changeTab('favorites'), reviewTab === 'favorites' ? 'selected-tab' : '', {
        'aria-pressed': String(reviewTab === 'favorites')
      })),
      section(h2(title), pool.length ?
        button(reviewTab === 'wrong' ? '重练全部错题' : '练习全部收藏', () => start(pool, reviewTab, title), 'primary wide') :
        p(reviewTab === 'wrong' ? '已答错的题目会出现在这里。' : '答题时点击「收藏」，便可在这里复习。'),
      ...pool.map(q => el('button', {class: 'item-button', type: 'button', onclick: () => start([q], reviewTab, title)},
        el('span', {class: 'item-copy'}, el('strong', {text: q.text}), el('small', {text: q.chapter + ' · ' + Bank.types[q.type]})),
        icon('next', 16)))));
  }

  function progress() {
    const info = stats();
    const questions = activeBank();
    const seen = questions.filter(q => info.questions.has(Bank.uid(q))).length;
    const total = [...info.questions.values()].reduce((n, item) => n + item.seen, 0);
    const right = [...info.questions.values()].reduce((n, item) => n + item.right, 0);
    main.append(heading('学习进度'),
      el('div', {class: 'metrics'}, metric(seen + '/' + questions.length, '新版题库已练'),
        metric(total, '累计作答'), metric(total ? Math.round(100 * right / total) + '%' : '—', '累计正确率')),
      section(h2('章节进度'), ...Bank.chapters.map(([name]) => {
        const part = questions.filter(q => q.chapter === name);
        const count = part.filter(q => info.questions.has(Bank.uid(q))).length;
        return el('div', {class: 'chapter-progress'},
          el('div', {class: 'split'}, el('span', {text: name}), el('span', {text: count + ' / ' + part.length})),
          el('progress', {value: count, max: part.length || 1, 'aria-label': name + '练习进度'}));
      })),
      section(h2('模拟成绩'), info.exams.length ? null : p('完成模拟考试后，成绩会保存在此设备。'),
        ...info.exams.map(event => el('button', {class: 'item-button', type: 'button', onclick() {
          lastResult = event;
          go('result');
        }}, el('span', {class: 'item-copy'}, el('strong', {text: event.score + ' 分 · ' + (event.score >= theory.pass ? '合格' : '未合格')}),
          el('small', {text: asTime(event.at) + ' · ' + event.answers.length + ' 题'})), icon('next', 16)))));
  }

  function metric(value, text) {
    return el('div', {}, el('strong', {text: String(value)}), el('small', {text}));
  }

  function results() {
    const event = lastResult;
    if (!event) { progress(); return; }
    const correct = event.answers.filter(a => a.ok).length;
    main.append(heading('模拟成绩', asTime(event.at)), section(
      el('div', {class: 'score'}, el('strong', {text: event.score + ' 分'}), el('span', {text: event.score >= theory.pass ?
        `达到 ${theory.pass} 分合格线` : `未达到 ${theory.pass} 分合格线`})),
      event.automatic ? p('考试时间到，已自动交卷。') : null,
      p(`答对 ${correct} 题 · 答错 ${event.answers.filter(a => !a.ok && a.picked !== null).length} 题 · 未答 ${event.answers.filter(a => a.picked === null).length} 题`),
      row(button('查看成绩记录', () => go('progress')), button('打开错题本', () => { reviewTab = 'wrong'; go('review'); }, 'primary'))),
      section(h2('试卷解析'), ...event.questions.map((q, i) => {
        const a = event.answers[i];
        const item = prepared(q);
        const value = a.picked ?? undefined;
        const choices = App.typeHandler(item).render({item, value, uid: 'result-' + i, locked: true, reveal: true});
        return el('details', {class: 'result-question'}, el('summary', {text: `${i + 1}. ${q.text}`}),
          choices, explanation(q, item, value));
      })));
  }

  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], {type}));
    el('a', {href: url, download: name}).click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function backup() {
    const date = new Date().toISOString().slice(0, 10);
    download('消控练习册-备份-' + date + '.json', JSON.stringify({format: 'fire-drill-backup', ...state}), 'application/json');
  }

  function assert(value) {
    if (!value) throw new Error('备份文件内容或版本不正确');
  }

  function validatedBackup(data) {
    const obj = App.util.isObj;
    const validDate = t => Number.isFinite(t) && t > 0 && t <= 8640000000000000;
    const validPick = picked => picked === null || (Number.isInteger(picked) && picked >= 0 && picked <= 5) ||
      (Array.isArray(picked) && picked.length > 0 && picked.length <= 6 &&
        new Set(picked).size === picked.length && picked.every(i => Number.isInteger(i) && i >= 0 && i <= 5));
    assert(data?.format === 'fire-drill-backup' && data.schema === 1 && Array.isArray(data.bank) &&
      Array.isArray(data.events) && obj(data.favorites));
    data.bank = data.bank.map(q => Bank.question(q, true));
    const ids = new Set(data.bank.map(Bank.uid));
    for (const event of data.events) {
      assert(obj(event) && typeof event.id === 'string' && validDate(event.at) &&
        ['practice', 'exam'].includes(event.kind) && Array.isArray(event.answers) && event.answers.length);
      for (const answer of event.answers) {
        assert(obj(answer) && typeof answer.id === 'string' && validPick(answer.picked) && typeof answer.ok === 'boolean');
        assert(answer.bankId === undefined || typeof answer.bankId === 'string');
      }
      if (event.kind === 'exam') {
        assert(Array.isArray(event.questions) && event.questions.length === event.answers.length &&
          Number.isFinite(event.score) && event.score >= 0 && event.score <= 100);
        event.questions = event.questions.map(q => Bank.question(q, true));
        assert(event.questions.every((q, i) => Bank.uid(q) === event.answers[i].id));
      }
    }
    for (const [id, entry] of Object.entries(data.favorites)) {
      assert(ids.has(id) && obj(entry) && typeof entry.on === 'boolean' && validDate(entry.at));
    }
    const s = data.session;
    if (s != null) {
      assert(obj(s) && typeof s.id === 'string' && typeof s.title === 'string' && Object.hasOwn(modes, s.kind) &&
        Array.isArray(s.questions) && Number.isInteger(s.index) && s.index >= 0 && s.index < s.questions.length &&
        obj(s.replies) && obj(s.checked) && (s.kind === 'exam' ? validDate(s.deadline) : s.deadline === null));
      s.questions = s.questions.map(q => Bank.question(q, true));
      const validIndex = key => /^(0|[1-9]\d*)$/.test(key) && Number(key) < s.questions.length;
      assert(Object.entries(s.replies).every(([key, pick]) => validIndex(key) && pick !== null && validPick(pick)) &&
        Object.entries(s.checked).every(([key, checked]) => validIndex(key) && checked === true && Object.hasOwn(s.replies, key)));
    }
    return data;
  }

  async function restore(file) {
    if (!file) return;
    try {
      const data = validatedBackup(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
      const restored = Bank.merge(state.bank, data.bank, true, {restore: true});
      const idMap = new Map();
      const stable = new Map(restored.bank.map(q => [Bank.uid(q), q]));
      const fingerprints = new Map(restored.bank.map(q => [Bank.fingerprint(q), q]));
      for (const q of data.bank) {
        const kept = stable.get(Bank.uid(q)) || fingerprints.get(Bank.fingerprint(q));
        if (kept) idMap.set(Bank.uid(q), Bank.uid(kept));
      }
      assert(!restored.errors.length);
      await save(next => {
        next.bank = restored.bank;
        const completed = new Set(next.events.map(entry => entry.id));
        for (const event of data.events) {
          if (completed.has(event.id)) continue;
          completed.add(event.id);
          event.answers.forEach(a => {
            const key = a.bankId || a.id;
            if (idMap.has(key) && idMap.get(key) !== a.id) a.bankId = idMap.get(key);
          });
          next.events.push(event);
        }
        for (const [id, favoriteEntry] of Object.entries(data.favorites)) {
          const key = idMap.get(id) || id;
          if (!next.favorites[key] || next.favorites[key].at < favoriteEntry.at) next.favorites[key] = favoriteEntry;
        }
        if (!next.session && data.session && !completed.has(data.session.id)) next.session = data.session;
      }, () => { render(); tell('已合并备份中的题目和学习记录'); });
    } catch (error) {
      tell('恢复失败：' + error.message);
    }
  }

  function manage() {
    const active = activeBank().length;
    const reviewed = el('input', {type: 'checkbox', checked: preview?.allowReviewed || false});
    const picker = el('input', {type: 'file', accept: '.xlsx,.xls,.csv,.json', 'aria-label': '选择题库文件'});
    let importRequest = 0;
    picker.addEventListener('change', async () => {
      const file = picker.files[0];
      const request = ++importRequest;
      const allowReviewed = reviewed.checked;
      preview = null;
      if (!file) { render(); return; }
      try {
        const rows = await Bank.readFile(file);
        if (request !== importRequest || path() !== 'manage') return;
        if (!rows.length) throw new Error('未找到题目。请检查表头和题目数据。');
        preview = {...Bank.merge(state.bank, rows, allowReviewed), name: file.name, allowReviewed, revision: state.revision};
      } catch (error) {
        if (request !== importRequest || path() !== 'manage') return;
        preview = {errors: [error.message], name: file.name, allowReviewed};
      }
      render();
    });
    reviewed.addEventListener('change', () => {
      importRequest++;
      if (preview) { preview = null; picker.value = ''; render(); }
      else if (picker.files.length) {
        picker.value = '';
        tell('审核状态已更改，请重新选择文件。');
      }
    });
    const restorePicker = el('input', {type: 'file', accept: '.json', 'aria-label': '选择学习备份'});
    restorePicker.addEventListener('change', () => {
      const file = restorePicker.files[0];
      restorePicker.value = '';
      restore(file);
    });
    main.append(heading('题库与数据'),
      section(h2('当前题库'), p(`2026 版可练习 ${active} 题 · 待审核或历史题 ${state.bank.length - active} 题`),
        p('内置题为依据 2026 版国标和鉴定大纲编写的原创练习。'),
        active !== state.bank.length ? el('details', {}, el('summary', {text: '查看待审核或历史题'}),
          ...state.bank.filter(q => !Bank.active(q)).map(q => p(q.edition + ' 版 · ' + q.text))) : null),
      section(h2('导入或更新题库'), p('支持 Excel（.xlsx / .xls）、CSV 和 JSON。带原题号的同版本题目可更新。'),
        el('label', {class: 'check-label'}, reviewed, el('span', {text: '我已核对文件中标记为「已审核」的 2026 版题目及其出处'})),
        label('选择题库文件', picker),
        el('a', {class: 'text-link', href: 'banks/template.csv', download: '消控题库导入模板.csv'}, '下载 CSV / Excel 导入模板'),
        preview ? importPreview() : null),
      section(h2('学习数据备份'), p('备份包含本地题库、学习记录、收藏及进行中的练习。恢复时合并已有数据。'),
        button('下载备份', backup, 'wide'), label('恢复学习备份', restorePicker)),
      section(h2('添加到手机桌面'), installPrompt ?
        button('安装练习册', async () => {
          const prompt = installPrompt;
          installPrompt = null;
          await prompt.prompt();
          render();
        }, 'wide') : null,
      p('iPhone：在 Safari 中打开，点分享，再选「添加到主屏幕」。'),
      p('Android：在 Chrome 菜单中选择「安装应用」或「添加到主屏幕」。'),
      p('顶部显示「可离线使用」后，即可离线重开练习册。')));
  }

  function importPreview() {
    const current = preview;
    const changed = current.added + current.updated;
    return el('div', {class: 'import-result', 'aria-live': 'polite'}, h2('导入预览'),
      p(current.name), current.bank ? p(`新增 ${current.added} · 更新 ${current.updated} · 重复 ${current.duplicates} · 错误 ${current.errors.length}`) : null,
      ...current.errors.slice(0, 12).map(error => p(error, 'wrong')),
      current.errors.length > 12 ? p(`另有 ${current.errors.length - 12} 条错误`) : null,
      current.bank ? button('保存有效题目', () => {
        if (current.revision !== state.revision) {
          preview = null;
          render();
          tell('题库已变化，请重新选择文件。');
          return;
        }
        save(next => { next.bank = current.bank; }, () => {
          preview = null;
          render();
          tell('题库已保存到本机');
        });
      }, 'primary wide', {disabled: !changed}) : null);
  }

  function render(scroll = false) {
    if (!state) return;
    clearInterval(timer);
    const page = path();
    if (state.session?.rules === theory.id && page !== 'session') {
      location.replace('#session');
      return;
    }
    const session = page === 'session';
    main.replaceChildren();
    nav.replaceChildren();
    document.body.classList.toggle('in-session', session);
    if (page !== 'manage') preview = null;
    const chapterIndex = /^chapter\/([0-4])$/.exec(page);
    const view = {review, progress, manage, exam, session: sessionView, result: results};
    if (chapterIndex) chapter(Number(chapterIndex[1]));
    else if (Object.hasOwn(view, page)) view[page]();
    else home();
    if (!session || !state.session) {
      const selected = page === 'result' ? 'progress' : ['review', 'progress', 'manage'].includes(page) ? page : 'home';
      for (const [id, name, symbol] of tabs) {
        nav.append(el('a', {href: '#' + id, class: selected === id ? 'current' : '',
          'aria-current': selected === id ? 'page' : undefined}, icon(symbol, 21), el('span', {text: name})));
      }
      if (state.session?.kind === 'exam') {
        const tick = () => {
          if (state.session?.deadline <= Date.now()) submitExam(state.session, true);
        };
        timer = setInterval(tick, 500);
        tick();
      }
    }
    if (scroll) window.scrollTo(0, 0);
  }

  function connectionStatus() {
    offline.textContent = cached ? (navigator.onLine ? '可离线使用' : '离线模式') :
      ('serviceWorker' in navigator && window.isSecureContext ? '正在准备离线' : '需 HTTPS 启用离线');
    offline.classList.toggle('ready', cached);
  }

  async function init() {
    try {
      await LocalStore.open();
      state = await LocalStore.read();
      const response = await fetch('banks/2026.json');
      if (!response.ok) throw new Error('内置题库读取失败');
      const bundled = await response.json();
      let seed = Bank.merge(state.bank, bundled.questions, true, {restore: true});
      if (seed.errors.length) throw new Error(seed.errors[0]);
      if (seed.added || seed.updated) {
        try {
          state = await LocalStore.change(state.revision, next => { next.bank = seed.bank; });
        } catch (error) {
          if (!error.conflict) throw error;
          state = await LocalStore.read();
          seed = Bank.merge(state.bank, bundled.questions, true, {restore: true});
          if (seed.errors.length) throw new Error(seed.errors[0]);
          if (seed.added || seed.updated) {
            state = await LocalStore.change(state.revision, next => { next.bank = seed.bank; });
          }
        }
      }
      render(true);
      connectionStatus();
      if ('serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).then(() => navigator.serviceWorker.ready).then(() => {
          cached = true;
          connectionStatus();
        }).catch(() => { offline.textContent = '离线准备失败'; });
      }
    } catch (error) {
      if (state?.bank.length) {
        render(true);
        tell('内置题库更新失败，已打开本机题库。');
        return;
      }
      main.replaceChildren(heading('练习册读取失败', error.message || '请检查浏览器存储权限和网络。'),
        button('重试', () => location.reload(), 'primary'));
    }
  }

  window.addEventListener('hashchange', () => { render(true); main.focus({preventScroll: true}); });
  window.addEventListener('online', connectionStatus);
  window.addEventListener('offline', connectionStatus);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    if (path() === 'manage') render();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (path() === 'manage') render();
  });
  init();
})();
