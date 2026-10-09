# 队列格式

draft 是 JSON 数组，每项为 platform、text，可带 scheduled_at、source。platform 只用 x 或 threads。

    [
      {"platform":"x","text":"先练好一个步骤，再开始下一个。","source":"library/2026-01-01-练习方法.md"},
      {"platform":"threads","text":"先練好一個步驟，再開始下一個。","source":"library/2026-01-01-练习方法.md"}
    ]

scheduled_at 若提供，必须是带秒和时区的 ISO 时间，如 2026-12-01T09:00:00+08:00，且在未来、时间窗内、满足同平台间隔。
省略则按 config/settings.json 自动寻找最近空位。建议每日条数是参考，不是硬上限。
脚本生成 ISO 周 ID、status: pending、posted_at/url/error/image: null。source 建议是拆解记录相对路径，便于归因，也可为原链接。它不进入正文。
调用：node src/queue-add.mjs --file <draft.json>。同批有任何格式或内容错误则整批拒绝，先检查后写入。
queue/ISO周.json 是发布真源，posted/YYYY-MM.json 是归档。posted 条目在队列中保留为终态，避免丢失 ID 和排期历史。
