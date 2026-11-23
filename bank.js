const Bank = (() => {
  const chapters = [
    ['职业道德', '职业守则与岗位责任', 5, 'flag'],
    ['基础知识', '燃烧、建筑防火与消防法规', 15, 'book'],
    ['设施监控操作', '报警系统、自动灭火与其他设施', 30, 'target'],
    ['设施维护保养', '设备更换与系统保养', 20, 'settings'],
    ['设施检测', '功能测试、反馈核对与记录', 30, 'check']
  ];
  const types = {single: '单选题', multiple: '多选题', truefalse: '判断题'};
  const theoryExam = {
    id: 'theory-2026',
    minutes: 90,
    perQuestion: 0.5,
    pass: 60,
    sections: Object.freeze({single: 100, multiple: 40, truefalse: 60})
  };
  theoryExam.count = Object.values(theoryExam.sections).reduce((sum, n) => sum + n, 0);
  Object.freeze(theoryExam);
  const letter = index => 'ABCDEF'[index];
  const clean = value => String(value ?? '').trim();
  const canon = value => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu, '');
  const keys = {
    id: ['题号', '题目编号'], chapter: ['章节'], type: ['题型'], text: ['题干', '题目'],
    answer: ['答案'], explanation: ['解析'], source: ['出处', '依据'], edition: ['版本'],
    reviewed: ['已审核', '审核状态']
  };
  const get = (row, name) => [name, ...(keys[name] || [])].map(k => row[k]).find(v => v !== '' && v != null);
  const isReviewed = value => [true, 'true', '已审核', '是', '1', 1].includes(value);
  const fail = message => { throw new Error(message); };

  function answerOf(raw, type) {
    if (type === 'truefalse') {
      if ([true, 'true', '正确', '对', '是', '√', 'A'].includes(raw)) return true;
      if ([false, 'false', '错误', '错', '否', '×', 'B'].includes(raw)) return false;
      fail('判断题答案应为正确或错误');
    }
    if (Array.isArray(raw) || typeof raw === 'number') return Array.isArray(raw) ? raw : [raw];
    const answer = clean(raw).normalize('NFKC').toUpperCase().replace(/[、,，;；\s]/g, '');
    if (!/^[A-F]+$/.test(answer)) fail('选择题答案应为 A–F，例如 A 或 AC');
    return [...answer].map(char => char.charCodeAt(0) - 65);
  }

  function question(row, allowReviewed) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('题目应为对象');
    const chapter = clean(get(row, 'chapter'));
    const typeName = clean(get(row, 'type'));
    const type = Object.keys(types).find(key => key === typeName ||
      types[key] === typeName || types[key].slice(0, -1) === typeName);
    const text = clean(get(row, 'text'));
    const explanation = clean(get(row, 'explanation'));
    const source = clean(get(row, 'source'));
    const edition = clean(get(row, 'edition')) || '未注明';
    const reviewed = edition === '2026' && allowReviewed && isReviewed(get(row, 'reviewed'));
    if (!chapter || !type || !canon(text) || !explanation) fail('须填写章节、有效题型、题干和解析');
    if (reviewed && (!source || !chapters.some(item => item[0] === chapter))) {
      fail('已审核的 2026 题须填写出处并使用新版章节名称');
    }
    let options = Array.isArray(row.options) ? row.options.map(clean) :
      [...'ABCDEF'].map(key => clean(row[key] ?? row['选项' + key]));
    while (options.length && !options.at(-1)) options.pop();
    if (type === 'truefalse') {
      if (options.length && options.join('|') !== '正确|错误') fail('判断题选项请留空或填写“正确”“错误”');
      options = ['正确', '错误'];
    } else if (options.some(value => !canon(value)) || new Set(options.map(canon)).size !== options.length) {
      fail('选项不能留空或重复');
    }
    const answer = answerOf(get(row, 'answer'), type);
    const errors = [];
    App.types[type].validateDef({options, answer, text}, '题目', {
      error: (_, message) => errors.push(message), warn() {}
    });
    if (errors.length) fail(type === 'multiple' ? '多选题需提供 2–6 个选项及至少两个不同的有效答案' :
      '单选题需提供 2–6 个选项及一个有效答案');
    const code = clean(get(row, 'id'));
    if (code && !/^[\p{L}\p{N}_.-]{1,80}$/u.test(code)) fail('题号仅支持字母、数字、点、下划线和连字符');
    if (!/^[\p{L}\p{N}_.-]{1,32}$/u.test(edition)) fail('版本字段格式不正确');
    const updatedAt = Number.isSafeInteger(row.updatedAt) && row.updatedAt >= 0 ? row.updatedAt : 0;
    return {id: code, chapter, type, text, options,
      answer: Array.isArray(answer) ? [...answer].sort((a, b) => a - b) : answer,
      explanation, source, edition, reviewed, updatedAt};
  }

  const fingerprint = q => q.edition + ':' + canon(q.text);
  const uid = q => q.edition + ':' + (q.id ? '#' + q.id : canon(q.text));
  const active = q => q.edition === '2026' && q.reviewed;
  const sameAnswer = (a, b) => a.type === b.type &&
    JSON.stringify(a.options.map(canon).sort()) === JSON.stringify(b.options.map(canon).sort()) &&
    JSON.stringify(Array.isArray(a.answer) ? a.answer.map(i => canon(a.options[i])).sort() : a.answer) ===
    JSON.stringify(Array.isArray(b.answer) ? b.answer.map(i => canon(b.options[i])).sort() : b.answer);

  function merge(existing, rows, allowReviewed, {restore = false} = {}) {
    const byId = new Map(existing.map(q => [uid(q), q]));
    const byText = new Map(existing.map(q => [fingerprint(q), q]));
    const input = new Map();
    const report = {added: 0, updated: 0, duplicates: 0, errors: []};
    rows.forEach((row, i) => {
      try {
        let q = question(row, allowReviewed);
        const identified = byId.get(uid(q));
        const matching = byText.get(fingerprint(q));
        if (identified && matching && identified !== matching) fail('题号与题干分别对应不同题目');
        const prior = identified || matching;
        if (prior) {
          const sameId = uid(q) === uid(prior);
          const mayUpdate = restore ? sameId : sameId && !!q.id;
          if ((restore && (!sameId || q.updatedAt <= (prior.updatedAt || 0))) || (prior.reviewed && !q.reviewed)) {
            report.duplicates++;
            return;
          }
          if (!mayUpdate && !sameAnswer(prior, q)) fail('重复题干的选项或正确答案冲突，请使用原题号更新');
          q = {...q, id: prior.id};
          const sameContent = JSON.stringify({...q, updatedAt: 0}) === JSON.stringify({...prior, updatedAt: 0});
          if ((!restore && sameContent) || (!mayUpdate && prior.reviewed === q.reviewed)) {
            report.duplicates++;
            return;
          }
        }
        const previousInput = input.get(uid(q));
        if (previousInput) fail('同一文件中出现互相冲突的题目');
        if (!restore) q.updatedAt = Date.now();
        input.set(uid(q), q);
        if (prior) {
          byText.delete(fingerprint(prior));
          report.updated++;
        } else {
          report.added++;
        }
        byText.set(fingerprint(q), q);
        byId.set(uid(q), q);
      } catch (error) {
        report.errors.push(`第 ${i + 1} 条 · ${error.message}`);
      }
    });
    return {...report, bank: [...byId.values()]};
  }

  function csvRows(text) {
    const grid = [];
    let row = [], field = '', state = 'plain';
    const push = () => { row.push(field); field = ''; state = 'plain'; };
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (state === 'quoted') {
        if (char !== '"') field += char;
        else if (text[i + 1] === '"') { field += '"'; i++; }
        else state = 'closed';
      } else if (char === ',') push();
      else if (char === '\r' || char === '\n') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        push();
        grid.push(row);
        row = [];
      } else if (char === '"' && !field && state === 'plain') state = 'quoted';
      else if (state === 'plain' && char !== '"') field += char;
      else fail('CSV 引号格式有误');
    }
    if (state === 'quoted') fail('CSV 中有引号未闭合');
    push();
    grid.push(row);
    return fromGrid(grid);
  }

  function fromGrid(grid) {
    const filled = grid.filter(row => row.some(value => clean(value)));
    if (!filled.length) return [];
    const headers = filled.shift().map(value => clean(value).replace(/^\uFEFF/, ''));
    if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) fail('表头存在重复字段');
    return filled.map(row => {
      if (row.slice(headers.length).some(value => clean(value))) fail('部分数据超出了表头列数');
      return Object.fromEntries(headers.flatMap((header, index) => header ? [[header, row[index] ?? '']] : []));
    });
  }

  let excel;
  async function readFile(file) {
    if (file.size > 25 * 1024 * 1024) fail('题库文件须小于 25 MB');
    if (/\.xlsx?$/i.test(file.name)) {
      excel ||= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'vendor/xlsx.full.min.js';
        script.onload = resolve;
        script.onerror = () => { excel = undefined; script.remove(); reject(new Error('Excel 导入组件读取失败')); };
        document.head.append(script);
      });
      await excel;
      const workbook = XLSX.read(await file.arrayBuffer());
      return workbook.SheetNames.flatMap(name => {
        const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], {header: 1, defval: '', raw: true});
        if (!grid[0]?.some(v => ['题目', '题干', 'text'].includes(clean(v)))) return [];
        return fromGrid(grid);
      });
    }
    if (/\.csv$/i.test(file.name)) {
      const bytes = await file.arrayBuffer();
      let contents;
      try { contents = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
      catch { contents = new TextDecoder('gb18030', {fatal: true}).decode(bytes); }
      return csvRows(contents);
    }
    if (!/\.json$/i.test(file.name)) fail('请选择 Excel、CSV 或 JSON 文件');
    const json = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    const list = Array.isArray(json) ? json : json.questions;
    if (!Array.isArray(list)) fail('JSON 必须是题目数组或包含 questions 数组');
    return list;
  }

  function mock(questions) {
    const sections = Object.entries(theoryExam.sections);
    const eligible = [...new Map(questions.filter(active).map(q => [uid(q), q])).values()];
    const rows = App.util.shuffle(chapters).map(([name, , weight]) => ({
      remaining: weight * theoryExam.count / 100,
      cells: App.util.shuffle(sections.map(([type]) => ({
        type, picked: 0, pool: App.util.shuffle(eligible.filter(q => q.chapter === name && q.type === type))
      })))
    }));
    const needs = Object.fromEntries(sections);

    // An augmenting path can reassign a previous seat to another chapter to meet both quotas.
    function assign(row, visited) {
      for (const cell of row.cells) {
        if (visited.has(cell.type) || cell.picked === cell.pool.length) continue;
        visited.add(cell.type);
        if (needs[cell.type] > 0) {
          cell.picked++;
          needs[cell.type]--;
          return true;
        }
        for (const other of rows) {
          if (other === row) continue;
          const occupied = other.cells.find(c => c.type === cell.type && c.picked > 0);
          if (occupied && assign(other, visited)) {
            occupied.picked--;
            cell.picked++;
            return true;
          }
        }
      }
      return false;
    }
    for (const row of rows) {
      for (let i = 0; i < row.remaining; i++) {
        if (!assign(row, new Set())) return [];
      }
    }
    return sections.flatMap(([type]) => App.util.shuffle(rows.flatMap(row => {
      const cell = row.cells.find(c => c.type === type);
      return cell.pool.slice(0, cell.picked);
    })));
  }

  return {chapters, types, theoryExam, letter, uid, fingerprint, active, question, merge, readFile, mock};
})();
