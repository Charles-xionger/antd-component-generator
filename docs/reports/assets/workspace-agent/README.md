# Workspace Agent 浏览器验收截图

这些 JPEG 来自隔离 PostgreSQL、固定脚本模型和真实 Next.js 页面；不含用户项目数据。截图由 `test/workspace-agent-browser-fixture.ts` 的本机截图入口接收，Go Preview 两张来自 `test/workspace-go-preview-e2e.ts` 的浏览器夹具。所有测试数据库和容器已清理。

| 验收场景 | 归档画面 |
| --- | --- |
| BOT-1 首次生成 | [编译诊断与目标文件](bot-1-diagnostic.jpg)、[定向修复后 v1](bot-1-final-version.jpg) |
| BOT-2 普通修改 | [目标文件变化、代码检查通过、v2](bot-2-file-change.jpg) |
| BOT-3 恢复 | [刷新前的两文件草稿](bot-3-before-refresh.jpg)、[刷新后修订仍在](bot-3-after-refresh.jpg)、[Worker 恢复后提交](bot-3-after-worker-recovery.jpg)；另有 [先前一次恢复结果](bot-3-recovered-version.jpg) |
| BOT-4 取消/提问 | [取消保留草稿](bot-4-cancelled-draft.jpg)、[等待回答](bot-4-needs-input.jpg)、[回答后新执行段](bot-4-answered-new-run.jpg) |
| BOT-5 并发 | [第二标签看到同项目任务占用](bot-5-same-project-busy.jpg)、[另一项目同时运行](bot-5-second-project-running.jpg) |
| BOT-6 Preview | [提交后验证中](bot-6-preview-verifying.jpg)、[Go Preview 成功](bot-6-preview-success.jpg)、[Go Preview 失败](bot-6-preview-failure.jpg) |
| BOT-7 兼容 | [旧 XML 历史可读](bot-7-legacy-history.jpg)、[同项目的新诊断 Item](bot-7-new-diagnostic-item.jpg) |
| 暗色主题 | [真实暗色诊断](dark-diagnostic.jpg)、[真实暗色提交](dark-final-version.jpg) |

BOT-6 的验证中截图来自真实 `FULLSTACK_PREVIEW` BuildJob `QUEUED` 状态，尚未运行构建 Worker；成功/失败截图来自另一次隔离 Go E2E，不能把三张图解读为同一 Job 的时间线。
