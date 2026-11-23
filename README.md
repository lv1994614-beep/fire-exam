# 2026 中级消防设施操作员练习册

在电脑上运行 `npm start`，打开 [本地预览](http://127.0.0.1:4173/)。运行和构建只需要 Node.js，无需安装依赖。

同一 Wi-Fi 下用手机测试时，在 PowerShell 把 `FIRE_DRILL_HOST` 设置为电脑的 WLAN IPv4 地址，把 `FIRE_DRILL_PORT` 设置为 `4174`，再执行 `npm start`。手机浏览器打开终端显示的地址，电脑需保持服务运行。局域网 HTTP 可测试刷题与本地保存。

## GitHub Pages 与手机使用

在仓库的 Settings → Pages 中将 Source 设为 GitHub Actions。「Deploy GitHub Pages」工作流在默认分支更新后执行测试、构建并部署 `dist/`，也可在 Actions 中手动运行。构建会根据发布文件内容生成离线缓存版本。GitHub Free 的 Pages 站点使用公开仓库。

在 iPhone 的 Safari 或 Android 的 Chrome 中打开部署成功后显示的 HTTPS 地址。iPhone 在 Safari 的分享菜单中选择「添加到主屏幕」，Android 在 Chrome 菜单中选择「安装应用」或「添加到主屏幕」。从主屏幕首次打开应用时，保持联网直到顶部显示「可离线使用」。

学习记录保存在当前站点的浏览器存储中。从旧网址迁移时，先在旧网址进入「题库」下载备份，再在新网址导入。每个使用者可以自行备份和恢复。

## 题库与模拟考试

内置 400 道原创理论模拟题，覆盖四级/中级工五个模块、30 个理论知识点和 63 个中级鉴定点。题目附固定解析和条款索引。[命题风格专项审计](banks/audit/2026-exam-style-audit.md)

模拟考试固定为 200 题，含 100 道单选、40 道多选、60 道判断，每题 0.5 分，错答、空题和多选未全对均为 0 分。按新版国标 4.1 同时约束各章节题量。开考后连续计时 90 分钟，可用答题卡跳题和修改答案。确认交卷或时间到后出分，60 分合格。正式考务以报考鉴定站及准考证为准。[国标正文](https://www.119.gov.cn/images/zfxxgk/fdzdgknr/zcfg/2026/05/10/1778399688277005154.pdf) · [江苏站公告转载](https://m.youlu.com/app/modules/cms/pages/infor-detail/infor-detail?id=CAfv3syaiwa3md) · [题型与分值参考](https://m.youlu.com/app/modules/cms/pages/infor-detail/content?id=CB8u7gncjfds70)

旧版离线用户联网后关闭同站点的页面或桌面应用，再重新打开，即可加载这次题库更新。已有题号、作答记录和收藏可继续使用，用户自行更新的题目优先保留。

- [两部门颁布通知](https://www.119.gov.cn/zfxxgk/fdzdgknr/tzgg/2026/54309.shtml)
- [国家职业标准（2026 年版）正文](https://www.119.gov.cn/images/zfxxgk/fdzdgknr/zcfg/2026/05/10/1778399688277005154.pdf)
- [消防设施操作员职业技能鉴定考核大纲（2026 年版，公开转载）](https://33254279.s21i.faiusr.com/61/ABUIABA9GAAg5p6L0wYoy_zqyAM.pdf)

## 导入、更新和迁移

在「题库」下载 [导入模板](banks/template.csv)。Excel 可有多张带题干表头的工作表。CSV 支持 UTF-8 和 GB18030，带逗号或换行的字段应使用双引号。JSON 支持题目数组或包含 `questions` 的对象，可参考 `banks/2026.json`。

- 列名支持 `题号,版本,已审核,章节,题型,题干,A,B,C,D,E,F,答案,解析,出处`，JSON 对应 `id,edition,reviewed,chapter,type,text,options,answer,explanation,source`。
- 选择题答案用 `A` 或 `AC` 等选项字母。JSON 也接受从零开始的选项下标。判断题选项可留空，答案用「正确」或「错误」，JSON 也接受布尔值。
- 将审过的新版题目标记为 `2026` 及 `已审核`，填写新版章节和出处，并在选文件前勾选核对确认。待审核或历史题归档，导入预览会显示新增、更新、重复及错误数量。应用校验答案结构，题意和出处由人工审核。
- 同版本用原题号可以更新题干、答案或解析并保留学习记录。同版本同题干自动查重，重复题干的答案有冲突时会提示。已保存的模拟试卷保留交卷时的题目和判分。
- 点「下载备份」取出题库、学习记录、收藏及进行中的练习。换设备或浏览器时可导入练习册的 JSON 备份，恢复会合并数据。浏览器和站点地址决定本机数据所在位置。
- 起始工作区为空。保留的上游原始题目和代码位于 `upstream/`，应用使用独立的 IndexedDB，与原 QZ 的浏览器存储隔离。

## 开源项目评估

ExamSimulator / QZ 为 GPL-3.0 项目，前端原生 JavaScript，题型、评分与随机抽题支持纯浏览器运行。本项目在其核心代码上实现中文章节界面、导入和本地数据流程。发布入口仅装载选定的上游模块及本地 Excel 读取库，应用运行所需资源均可离线缓存。

上游版本与第三方许可证见 [NOTICE](NOTICE.md)。运行 `npm test` 可验证上游引擎。手机尺寸回归测试依次运行 `npm ci`、`npx playwright install chromium webkit`、`npm run test:mobile`。测试会启动独立的本地站点。
