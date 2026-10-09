# 爆款自动发

把喜欢的爆款丢给 Claude Code，拆解结构、写出自己的 X / Threads 两版，确认后排队发布。

丢爆款 → 拆解并仿写 → 你说「发」并确认版本 → 入队推送，GitHub Actions 到点发布

## 你需要准备

- GitHub 账号、Claude Code、Git 和 Node.js 22 或更新版本。无需安装第三方依赖。
- X 开发者账号：API 付费按量，[以官方定价页为准](https://docs.x.com/x-api/getting-started/pricing)。
- Meta 开发者应用，添加 Threads API 用例。只用一个平台也可以。

## 安装：可以让 Claude 带着你做

1. 在 GitHub 模板页面点 **Use this template → Create a new repository**，建议选 **Private**。待发帖子和拆解记录会提交到仓库，公开仓库别人能提前看到。私有仓库每月有免费 Actions 额度；每小时检查一次通常足够本项目，是否够用取决于运行耗时及同账号其他工作流，见 [Actions 额度](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。维护者需先把本项目发布并启用 Template repository；当前本地版本没有 GitHub 远端。
2. 把自己的新仓库 clone 到电脑。可以对 Claude 说「把我的这个仓库 clone 下来，并安装技能」。把整个 skill/viral-autopost 文件夹复制到：
   - Windows：%USERPROFILE%\.claude\skills\viral-autopost
   - macOS：~/.claude/skills/viral-autopost
   自定义了 CLAUDE_CONFIG_DIR 时以自己的配置目录为准。见 [Claude 技能说明](https://code.claude.com/docs/en/skills)。在仓库目录运行 node --test 确认环境正常。
3. 在 [X 开发者后台](https://developer.x.com/) 创建 App，开启 OAuth 1.0a，App 权限设为 **Read and Write**。取得四个值：API Key、API Secret、Access Token、Access Token Secret。修改权限后必须重新生成 Access Token；Bearer Token 不能代替这四个值。不要把值发进对话或文件。
4. 在 [Meta 开发者后台](https://developers.facebook.com/) 创建应用 → 添加 Threads 用例 → 添加自己的测试用户并接受邀请 → 授权 threads_basic、threads_content_publish → 生成短期用户令牌。按 [长期令牌文档](https://developers.facebook.com/docs/threads/get-started/long-lived-tokens/) 在官方工具或安全环境中换成 60 天长期令牌：向 https://graph.threads.net/access_token 传 grant_type=th_exchange_token、client_secret 和短期 access_token。应用密钥只用于这一步，不需要放进仓库。过期令牌不能续期，要重新授权。需要互动数据时还要授权 threads_manage_insights 并重新取得令牌；对其他用户开放应用可能需要审核。
5. 打开自己的仓库 **Settings → Secrets and variables → Actions → New repository secret**。只填要用的平台：

   | Secret | 填什么 |
   | --- | --- |
   | X_API_KEY / X_API_SECRET | X App 的 API Key / Secret |
   | X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET | OAuth 1.0a 用户 Token / Secret |
   | THREADS_ACCESS_TOKEN | Threads 长期令牌 |
   | PRIVACY_BLOCKLIST（可选） | 每行一个隐私词 |
   | GH_PAT（可选） | 允许每月回写 Threads Secret 的专用令牌 |

   GH_PAT 创建位置：GitHub 个人 Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token。选正确的 Resource owner，Repository access 选 **Only select repositories**，仅选择本仓库；Repository permissions 只加 **Secrets: Read and write**（Metadata 只读会自动附带），设置有效期。保存为 GH_PAT Secret。此权限支持 [仓库 Secret 更新](https://docs.github.com/en/rest/actions/secrets)。不配置时，月度任务只打印手动续期提醒，不报错。每月 1 日调用 th_refresh_token，再通过 gh secret set 从 stdin 回写，不在日志打印令牌。令牌需未过期且已使用至少 24 小时；GH_PAT 到期也要更新。
6. 在仓库 **Settings → Actions → General → Workflow permissions** 允许 Read and write permissions，启用 Actions。工作流使用仓库自动提供的认证写回队列，不需要额外内容写入 PAT。分支保护若禁止直接推送，需为自己的自动化配置适用规则，否则 posting 持久化失败会停止发送。
7. 在 Claude Code 打开仓库目录，说「帮我填账号定位」。五个问题回答完就能开始。无需把任何密钥交给 Claude。

## 日常怎么用

说「帮我拆这条爆款」，附链接、正文或截图。
说「按我的定位仿写 X 和 Threads」，修改到满意后明确说「发这两版」。
说「最近什么钩子效果好」，Claude 会读归档和数据；没有数据时可让它运行手动回收任务。

## 常见问题

- **X 403**：检查 Read and Write、重新生成权限修改后的 Access Token，并查看开发者后台余额和应用限制。
- **Threads 令牌过期**：重新授权并换长期令牌，更新 THREADS_ACCESS_TOKEN；月度续期不能恢复已过期令牌。GH_PAT 没填、过期或权限不足时也需处理。
- **blocked 怎么看**：让 Claude 打开 queue 中对应条目的 error。隐私、字数、繁体、链接和 API 权限问题都可能阻止发布。failed 中的“状态不确定”可能表示已发，请先在平台人工核对，不要直接重置重发。
- **怎么改时间**：让 Claude 修改 config/settings.json 的 timezone、window.start、window.end 和 min_interval_minutes，然后提交推送。默认上海时间 08:30–23:00，同平台至少 90 分钟；仅支持同一天时间窗。已入队时间不会自动重排，请让 Claude 检查并重排未来 pending 条目。
- **到点没发**：Actions 每小时 UTC 的第 17 分钟检查，并可能延迟。scheduled_at 是最早可发时间，实际仍受当前时间窗和同平台实际发布间隔约束，超过 6 小时未发就 failed。想让 08:30 的帖子更准时，可调整检查频率，但需关注额度。短于检查周期的时间窗可能没有运行机会。
- **只用一个平台**：另一个平台的到期帖子会 failed，error 写明未配置密钥；不会影响已配置平台。
- **看互动数据**：Actions → Publish → Run workflow → task 选 metrics。结果提交到 metrics/。本地也能 node src/metrics.mjs，但需自行在终端配置环境变量；本项目不会自动加载 .env，也不要提交本地密钥。X 数据请求也可能收费。

## 安全与范围

只调用 api.x.com 和 graph.threads.net，拒绝其他 API 域名和重定向。真实发帖只允许 GitHub Actions，先持久化并推送 posting，再发送；发生不确定状态时不自动重试。这里提供纯文字发布，不含图片上传。

不模拟点击，不自动点赞、关注。密钥仅放 GitHub Secrets，不放正文、profile 或提交历史。隐私词本地文件已忽略，但 Actions 必须配置 PRIVACY_BLOCKLIST 才能使用自己的词表。
仓库公开时 profile、library、queue、posted、metrics 都可被看到；推荐私有使用。template 提供代码，不保证内容会火。

## 开发验证

node --test 使用假发送和假请求，测试不联网。运行队列工具：node src/queue-add.mjs --file <draft.json>。draft 格式见 skill/viral-autopost/references/queue-format.md。
MIT 开源；Threads 简体专用字符表来自 OpenCC，许可证单独保留在 config/OpenCC-LICENSE.txt。
