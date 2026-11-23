import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {chromium, webkit, devices} from 'playwright';

const projects = [
  ['android', chromium, devices['Pixel 7'], process.env.FIRE_DRILL_CHROMIUM],
  ['ios', webkit, devices['iPhone 13'], undefined]
].filter(([name]) => !process.env.FIRE_DRILL_DEVICE || process.env.FIRE_DRILL_DEVICE === name);
const {questions} = JSON.parse(await readFile(new URL('../banks/2026.json', import.meta.url)));
const {questions: draft} = JSON.parse(await readFile(new URL('../banks/audit/2026-original.json', import.meta.url)));
const baseCount = questions.filter(q => q.chapter === '基础知识').length;
const afterImport = archived => `2026 版可练习 ${questions.length + 1} 题 · 待审核或历史题 ${archived} 题`;
const excel = {};
runInNewContext(await readFile(new URL('../vendor/xlsx.full.min.js', import.meta.url), 'utf8'), excel);
const {XLSX} = excel;
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
  题号: 'QA-XLSX', 版本: '2019', 章节: '基础知识', 题型: '判断题',
  题干: '用于验证 Excel 文件格式的归档题。', 答案: '正确', 解析: '导入流程测试用。'
}]), '试题');
const xlsx = Buffer.from(XLSX.write(workbook, {type: 'array', bookType: 'xlsx'}));
const file = (name, buffer) => ({name, mimeType: 'application/octet-stream', buffer: Buffer.from(buffer)});
const csv = '题号,版本,已审核,章节,题型,题干,A,B,C,答案,解析,出处\r\n' +
  'QA-CSV,2026,已审核,基础知识,单选题,"测试题，含逗号,及\r\n换行",甲,乙,丙,B,固定解析,测试依据\r\n' +
  'QA-CSV,2026,已审核,基础知识,单选题,"测试题，含逗号,及\r\n换行",甲,乙,丙,B,固定解析,测试依据\r\n' +
  'QA-BAD,2026,已审核,基础知识,多选题,无效测试题,甲,乙,丙,AF,固定解析,测试依据\r\n';

async function serve(port = '0') {
  const script = fileURLToPath(new URL('../tools/site.mjs', import.meta.url));
  const child = spawn(process.execPath, [script, '--preview'], {
    env: {...process.env, FIRE_DRILL_PORT: port, FIRE_DRILL_BASE_PATH: '/fire-exam/'},
    stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true
  });
  const url = await new Promise((resolve, reject) => {
    child.stdout.once('data', data => resolve(String(data).trim()));
    child.once('error', reject);
    child.once('exit', code => reject(new Error('测试服务器退出，退出码 ' + code)));
  });
  return {url, async stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const ended = once(child, 'exit');
    child.kill();
    await ended;
  }};
}

async function visible(page, text) {
  await page.getByText(text, {exact: true}).first().waitFor();
}

async function pick(page, index) {
  await page.locator('.option-card').nth(index).tap();
}

async function importBank(page, upload, expected) {
  await page.getByLabel('选择题库文件').setInputFiles(upload);
  await visible(page, expected);
  await page.getByRole('button', {name: '保存有效题目'}).tap();
  await visible(page, '题库已保存到本机');
}

await mkdir('test-results', {recursive: true});
for (const [name, engine, device, executablePath] of projects) {
  const browser = await engine.launch({executablePath});
  let server;
  try {
    server = await serve();
    const {url} = server;
    const context = await browser.newContext({...device, acceptDownloads: true});
    const page = await context.newPage();
    const errors = [];
    const external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(url).origin) external.push(request.url());
    });
    page.on('dialog', dialog => dialog.accept());
    await page.goto(url);
    assert.equal(new URL(page.url()).pathname, '/fire-exam/');
    await visible(page, '可离线使用');
    await visible(page, `0 / ${questions.length} 题`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (name === 'android') {
      const devtools = await context.newCDPSession(page);
      const {installabilityErrors} = await devtools.send('Page.getInstallabilityErrors');
      assert.deepEqual(installabilityErrors, []);
      await devtools.detach();
    }
    await page.screenshot({path: `test-results/${name}-home.png`});
    await page.getByRole('button', {name: '开始顺序练习'}).tap();
    await visible(page, questions[0].text);
    await pick(page, 1);
    await page.getByRole('button', {name: '确认答案'}).tap();
    await visible(page, '回答错误');
    await page.getByRole('button', {name: '收藏', exact: true}).tap();
    await visible(page, '已收藏');
    await page.getByRole('button', {name: '下一题', exact: true}).tap();
    await visible(page, '多选题');
    await pick(page, 0);
    await pick(page, 1);
    await page.getByRole('button', {name: '确认答案'}).tap();
    await visible(page, '回答正确');
    await page.screenshot({path: `test-results/${name}-question.png`});
    await page.getByRole('button', {name: '返回', exact: true}).tap();
    await page.getByRole('link', {name: '复习', exact: true}).tap();
    await visible(page, '错题本 1');
    await page.getByRole('button', {name: '重练全部错题'}).tap();
    await pick(page, 0);
    await page.getByRole('button', {name: '确认答案'}).tap();
    await visible(page, '回答正确');
    await page.getByRole('button', {name: '完成练习'}).tap();
    await page.getByRole('link', {name: '复习', exact: true}).tap();
    await visible(page, '错题本 0');
    await page.getByRole('button', {name: '收藏 1'}).tap();
    await visible(page, questions[0].text);
    await page.getByRole('link', {name: '练习', exact: true}).tap();
    await page.getByRole('link', {name: /基础知识/}).tap();
    await page.getByRole('button', {name: '随机练习'}).tap();
    await visible(page, `第 1 / ${baseCount} 题`);
    await page.getByRole('button', {name: '返回', exact: true}).tap();
    await page.getByRole('button', {name: /模拟考试/}).tap();
    await visible(page, '单选题 100 题 · 多选题 40 题 · 判断题 60 题');
    assert.equal(await page.locator('select').count(), 0);
    await page.getByRole('button', {name: '开始模拟'}).tap();
    await visible(page, '第 1 / 200 题');
    assert.match(await page.locator('.timer').textContent(), /^(90:00|89:\d\d)$/);
    const stem = await page.locator('.question-title').textContent();
    const first = questions.find(question => question.text === stem);
    assert.equal(first.type, 'single');
    await pick(page, first.answer.charCodeAt(0) - 65);
    await visible(page, '答题卡 · 已答 1/200');
    await page.locator('.question-grid summary').tap();
    await page.getByRole('button', {name: '第 101 题，未答', exact: true}).tap();
    await visible(page, '第 101 / 200 题');
    const multiStem = await page.locator('.question-title').textContent();
    const multi = questions.find(q => q.text === multiStem);
    assert.equal(multi.type, 'multiple');
    await pick(page, multi.answer.charCodeAt(0) - 65);
    await visible(page, '答题卡 · 已答 2/200');
    assert.equal(await page.locator('.explanation').count(), 0);
    await page.reload();
    await visible(page, '第 101 / 200 题');
    await visible(page, '答题卡 · 已答 2/200');
    await page.evaluate(() => { location.hash = 'home'; });
    await page.waitForURL('**/#session');
    await page.getByRole('button', {name: '交卷', exact: true}).tap();
    await visible(page, '0.5 分');
    await visible(page, '答对 1 题 · 答错 1 题 · 未答 198 题');

    await page.getByRole('link', {name: '题库', exact: true}).tap();
    await page.getByRole('checkbox').check();
    await importBank(page, file('test.csv', csv), '新增 1 · 更新 0 · 重复 1 · 错误 1');
    await visible(page, afterImport(0));
    await importBank(page, file('test.xlsx', xlsx), '新增 1 · 更新 0 · 重复 0 · 错误 0');
    await visible(page, afterImport(1));
    await page.getByRole('checkbox').check();
    const revision = {...questions[0], explanation: '更新后的固定解析。'};
    await importBank(page, file('update.json', JSON.stringify([revision])), '新增 0 · 更新 1 · 重复 0 · 错误 0');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', {name: '下载备份'}).tap();
    const download = await downloadPromise;
    const backup = await readFile(await download.path());
    const snapshot = JSON.parse(backup);
    assert.equal(snapshot.bank.find(q => q.id === revision.id).explanation, revision.explanation);
    assert.equal(snapshot.events.filter(e => e.kind === 'exam').length, 1);

    await page.reload();
    await visible(page, afterImport(1));
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    // WebKit for Windows rejects navigation at the emulation layer when setOffline is used.
    if (name === 'ios') await server.stop();
    else await context.setOffline(true);
    const reopened = await context.newPage();
    reopened.on('pageerror', error => errors.push(error.message));
    await reopened.goto(url + '#manage');
    await visible(reopened, afterImport(1));
    await reopened.getByRole('link', {name: '练习', exact: true}).tap();
    await reopened.getByRole('button', {name: '开始顺序练习'}).tap();
    await visible(reopened, questions[0].text);
    await pick(reopened, 0);
    await reopened.getByRole('button', {name: '确认答案'}).tap();
    await visible(reopened, revision.explanation);
    if (name === 'ios') server = await serve(new URL(url).port);
    else await context.setOffline(false);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);

    const restored = await browser.newContext(device);
    const restoredPage = await restored.newPage();
    await restoredPage.goto(url + '#manage');
    await restoredPage.getByLabel('选择学习备份').setInputFiles(file('backup.json', backup));
    await visible(restoredPage, '已合并备份中的题目和学习记录');
    await visible(restoredPage, afterImport(1));
    await restoredPage.getByLabel('选择学习备份').setInputFiles(file('backup.json', backup));
    await visible(restoredPage, '已合并备份中的题目和学习记录');
    await restoredPage.getByRole('link', {name: '进度', exact: true}).tap();
    await visible(restoredPage, '0.5 分 · 未合格');
    assert.equal(await restoredPage.getByText('0.5 分 · 未合格', {exact: true}).count(), 1);
    await restoredPage.getByRole('link', {name: '练习', exact: true}).tap();
    await restoredPage.getByRole('button', {name: '开始顺序练习'}).tap();
    await visible(restoredPage, questions[0].text);
    await pick(restoredPage, 0);
    await restoredPage.getByRole('button', {name: '确认答案'}).tap();
    await visible(restoredPage, revision.explanation);

    const judging = questions.find(q => q.type === 'truefalse');
    await restoredPage.getByRole('button', {name: '返回', exact: true}).tap();
    await restoredPage.getByRole('link', {name: /基础知识/}).tap();
    restoredPage.on('dialog', dialog => dialog.accept());
    await restoredPage.getByRole('button', {name: '顺序练习', exact: true}).tap();
    for (const q of questions.filter(q => q.chapter === judging.chapter).slice(0, 2)) {
      await visible(restoredPage, q.text);
      for (const key of q.answer) await pick(restoredPage, key.charCodeAt(0) - 65);
      await restoredPage.getByRole('button', {name: '确认答案'}).tap();
      await restoredPage.getByRole('button', {name: '下一题', exact: true}).tap();
    }
    await visible(restoredPage, '判断题');
    await visible(restoredPage, judging.text);
    await pick(restoredPage, 0);
    await restoredPage.getByRole('button', {name: '确认答案'}).tap();
    await visible(restoredPage, '正确答案：正确');

    await restoredPage.getByRole('button', {name: '返回', exact: true}).tap();
    await restoredPage.getByRole('button', {name: /模拟考试/}).tap();
    await restoredPage.clock.install();
    await restoredPage.getByRole('button', {name: '开始模拟'}).tap();
    await restoredPage.locator('.timer').waitFor();
    await restoredPage.clock.fastForward(90 * 60 * 1000 + 1000);
    await visible(restoredPage, '0 分');
    await visible(restoredPage, '答对 0 题 · 答错 0 题 · 未答 200 题');
    await visible(restoredPage, '考试时间到，已自动交卷。');
    const migrated = await browser.newContext(device);
    const migrationPage = await migrated.newPage();
    await migrationPage.goto(url);
    await visible(migrationPage, '可离线使用');
    await migrationPage.evaluate(async legacy => {
      const oldBank = legacy.map(q => {
        const stored = Bank.question(q, true);
        if (stored.id === 'D02') {
          stored.explanation = '使用者自行修改的解析';
          stored.updatedAt = Date.now();
        }
        return stored;
      });
      const current = await LocalStore.read();
      await LocalStore.change(current.revision, next => {
        next.bank = oldBank;
        next.events = [{id: 'migration-attempt', kind: 'practice', at: Date.now(),
          answers: [{id: '2026:#D01', picked: 1, ok: false}]}];
        next.favorites = {'2026:#D01': {on: true, at: Date.now()}};
        next.session = {id: 'migration-session', kind: 'sequence', title: '旧版练习',
          questions: [oldBank[0]], index: 0, replies: {0: 1}, checked: {0: true}, deadline: null};
      });
    }, draft.slice(0, 40));
    await migrationPage.reload();
    await visible(migrationPage, `1 / ${questions.length} 题`);
    const carried = await migrationPage.evaluate(async () => {
      const state = await LocalStore.read();
      return {text: state.bank.find(q => q.id === 'D01').text,
        custom: state.bank.find(q => q.id === 'D02').explanation,
        bookmarked: state.favorites['2026:#D01'].on,
        event: state.events[0].id, resume: state.session.questions[0].text};
    });
    assert.deepEqual(carried, {text: questions[0].text, custom: '使用者自行修改的解析',
      bookmarked: true, event: 'migration-attempt', resume: draft[0].text});
    console.log(`${name}: practice, wrong question retry, favorites, mock scoring, imports, offline and backup passed`);
  } finally {
    await browser.close();
    await server?.stop();
  }
}
