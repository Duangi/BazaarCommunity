# 社区后端落地说明

## 1. 必须先做
1. 在 Supabase SQL Editor 执行 `docs/supabase_schema.sql`。
2. 在本地/部署环境配置以下变量（参考 `.env.example`）：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - `R2_PUBLIC_BASE_URL`（示例：`https://data.duang.work`）
   - `PLUGIN_INGEST_KEY`（可选，建议设置）

## 2. 前端数据策略
- 社区构筑与评分已经改为“摘要分页”：
  - 首屏只拉摘要字段（不拉整份 payload）。
  - 导入时再按 `uuid` 单独拉详情 payload。
- 页面有“加载更多”按钮，避免一次性扫全表。
- 社区构筑/评分都带 `season` 字段。
  - 历史数据会在 SQL 里自动补成 `season = 11`。
  - 前端赛季范围来自 `/public/config/season_range.json`，修改这个 JSON 即可扩展赛季列表。
- 上传权限：用户必须先通过密钥登录。

## 3. 密钥登录（BazaarHelper）
- 网站不再用邮箱密码，改为输入 BazaarHelper 生成的登录密钥。
- 密钥格式：`bh1.<encrypted_hex>.<sign>`
- 解密后明文格式：`v1|username|account_id|unix_timestamp`
- 当前前端会解密并提取 `account_id` 作为 `user_id`，用于发布/关注/战绩。
- 解密出的 `username/account_id/timestamp` 会写入 `user_profiles`（`game_username/last_login_issued_at`）。
- 用户可在个人主页修改：昵称、是否 B 站 UP 主、B 站 UID、主玩英雄（六英雄头像）。

## 4. 插件上传截图（R2）
### 4.1 申请上传链接
`POST /api/r2/presign`

请求体：
```json
{
  "fileName": "day9-win.webp",
  "contentType": "image/webp",
  "folder": "match-records"
}
```

返回：
```json
{
  "key": "match-records/2026-03-04/xxxx-day9-win.webp",
  "uploadUrl": "https://...R2签名URL...",
  "publicUrl": "https://data.duang.work/match-records/2026-03-04/xxxx-day9-win.webp",
  "expiresIn": 300
}
```

### 4.2 上传文件到 R2
对 `uploadUrl` 发 `PUT`，`Content-Type` 与申请时一致。

## 5. 插件上报战绩
`POST /api/game-records`

Header（可选但建议）：
`x-plugin-key: <PLUGIN_INGEST_KEY>`

请求体：
```json
{
  "authorUserId": "from-game-login-key-account-id",
  "authorName": "Duang",
  "playedOn": "2026-03-04",
  "result": "win",
  "dayIndex": 9,
  "screenshotUrl": "https://data.duang.work/match-records/2026-03-04/xxxx.webp",
  "note": "决赛转位后取胜",
  "meta": {
    "hero": "Jules"
  }
}
```

## 6. 关注系统
- 登录后可关注作者。
- 探索模式支持“仅看关注”筛选。
- 中栏顶部会展示“关注玩家最近战绩”。
- 左侧新增“关注列表”，展示数据库中有资料的玩家，支持按主玩英雄分类和关注。
- 个人主页可查看“我的关注”并点击玩家头像查看其战绩截图列表。
