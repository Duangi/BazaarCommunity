# Duang.work - 大巴扎实用工具站

> The Bazaar Helper 配套在线工具 · 卡牌评分器 · 阵容模拟器

[![Deploy](https://github.com/Duangi/bazaar-calculator/actions/workflows/deploy.yml/badge.svg)](https://github.com/Duangi/bazaar-calculator/actions/workflows/deploy.yml)

## 📖 项目简介

这是一个为 **The Bazaar** 游戏打造的在线工具站，提供卡牌评分、数据查询等实用功能。

### ✨ 主要功能

- 🎴 **卡牌评分器** - 拖拽式 SABC 评分系统，支持自定义等级
- 📊 **数据百科** - 完整的物品和技能数据库，实时搜索
- 🔍 **智能筛选** - 按品质、大小、标签等多维度过滤
- 💾 **本地保存** - 评分预设和数据自动保存到浏览器
- 🎨 **精美界面** - 遵循游戏官方颜色系统，视觉统一

---

## 🚀 快速开始

### 在线访问

访问：[https://duang.work](https://duang.work)（部署后更新）

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 浏览器打开 http://localhost:3000
```

详细说明请查看 [PROJECT_SETUP.md](./PROJECT_SETUP.md)

---

## 📂 项目结构

```
bazaar_calculator/
├── app/              # Next.js 页面
│   ├── page.tsx     # 首页
│   └── tools/       # 工具页面
├── components/       # React 组件
├── public/          # 静态资源和数据
├── ref/             # 参考代码（原插件）
└── README.md        # 本文件
```

---

## 🎯 核心功能演示

### 1. 卡牌评分器
- 从右侧数据列表拖拽物品
- 放到左侧 S/A/B/C 评级区域
- 自定义评级名称和颜色
- 保存多个评分预设

### 2. 数据百科
- 搜索所有物品和技能
- 按品质筛选（铜/银/金/钻）
- 按大小筛选（小/中/大型）
- 查看完整技能描述

### 3. 物品详情
- 点击查看详细信息
- 切换品质查看数值变化
- 关键词自动高亮
- 显示标签和英雄限定

---

## 🎨 设计理念

### 品质颜色系统

| 品质 | 颜色 | 代码 |
|------|------|------|
| 铜牌 | <span style="color: #CD7F32">●</span> | #CD7F32 |
| 银牌 | <span style="color: #C0C0C0">●</span> | #C0C0C0 |
| 金牌 | <span style="color: #FFD700">●</span> | #FFD700 |
| 钻石 | <span style="color: #B9F2FF">●</span> | #B9F2FF |

### 关键词高亮

技能描述中的游戏术语会自动使用对应颜色高亮：
- 弹药、灼烧、充能、暴击、治疗、剧毒等

---

## 🚢 部署到 GitHub Pages

详细部署指南请查看 [DEPLOY.md](./DEPLOY.md)

**快速部署：**

```bash
# 1. 推送到 GitHub
git add .
git commit -m "Initial commit"
git push -u origin main

# 2. GitHub Actions 会自动构建和部署
# 3. 访问 https://用户名.github.io/仓库名
```

---

## 🔧 技术栈

- **Next.js 14** - React 全栈框架
- **TypeScript** - 类型安全
- **React DnD** - 拖拽交互
- **CSS Modules** - 组件化样式
- **GitHub Pages** - 静态站点托管

---

## 🌟 相关项目

- **BazaarHelper** - 桌面悬浮窗工具  
  GitHub: [Duangi/BazaarHelper](https://github.com/Duangi/BazaarHelper)

---

## 📞 联系方式

- **B站**: [@这是李Duang啊](https://space.bilibili.com/251954263)
- **GitHub**: [Duangi](https://github.com/Duangi)
- **QQ群**: 836507299

---

## 📄 开源协议

MIT License

---

## 🎉 鸣谢

感谢 The Bazaar 社区的支持！

---

<details>
<summary><b>📐 原架构设计文档</b></summary>

# 双轨制数据同步与零成本分发架构

> 一套兼顾 Wiki 灵活性与 CDN 极致性能的现代化数据管理方案

## 📖 项目概述

这份架构方案既保留了 Wiki 类项目**动态修改**、**多人协作**的灵活性，又利用了 CDN 和对象存储实现海量用户访问下的**流量归零**和**秒开体验**。

---

## 🏗️ 核心架构全景图

### 1. 代码与托管层 (Frontend & Functions)

**平台选型**
- **GitHub** - 代码仓库与版本控制
- **Vercel** - 自动化部署与 Serverless API 后端

**性能优化**
- 域名解析指向 `cname-china.vercel-dns.com`（Vercel 亚太优化节点）
- 确保国内无备案访问速度

**核心职责**
- 运行 React/Next.js 前端
- 处理用户登录、提交修改建议
- 管理员审核等业务逻辑

---

### 2. 源头数据层 (Database - Source of Truth)

**平台选型**
- **Supabase** (PostgreSQL)

**核心职责**

| 功能 | 说明 |
|------|------|
| 结构化存储 | 按行存储卡牌、技能、怪物等所有详细数据 |
| Wiki 协作管理 | 存储 `edit_suggestions` 表（玩家纠错建议） |
| 版本控制 | 维护 `data_config` 表，记录数据版本号（如 `version: 2023102701`） |

**核心优势**
- ✅ 通过 SQL 轻松查询和修改单条数据
- ✅ 无需手动编辑巨大的 JSON 文件
- ✅ 完整的事务支持和数据一致性保障

---

### 3. 静态分发层 (Global Distribution - The "Zero-Cost" Secret)

**平台选型**
- **Cloudflare R2** (对象存储)
- **Cloudflare CDN** (全球内容分发网络)

**核心职责**

1. **全量 JSON 快照**
   - 当 Supabase 审核通过新数据后，触发 API
   - 导出最新数据库内容为 JSON 文件（`cards.json`, `skills.json` 等）
   - 自动上传到 R2 对象存储

2. **素材存储**
   - 存储所有 WebP 格式的卡牌插图
   - 提供高性能图片分发服务

**核心优势**
- 💰 利用 R2 的 **0 流量费**特性
- 🚀 玩家下载 5MB 数据不消耗 Vercel 和 Supabase 的任何额度
- 🌍 全球 CDN 加速，就近访问

---

## 🔄 业务逻辑流转

### 场景一：玩家进入工具（极速加载逻辑）

**详细流程**

1. **版本校验**
   - 前端启动时请求 Vercel API
   - 获取 Supabase 中的最新 `version`（仅几百字节）

2. **本地匹配**
   - 检查浏览器 IndexedDB 中缓存的数据版本
   - **匹配成功** → 直接加载本地数据（0ms，0MB）
   - **版本过旧** → 下载最新数据

3. **分流下载**
   - 从 `img.yourdomain.com/data/cards.json` 请求数据
   - Cloudflare CDN 拦截：
     - 有缓存 → 直接返回
     - 无缓存 → 从 R2 回源
   - **Brotli 压缩**：5MB 原始数据压缩至约 **800KB**

---

### 场景二：玩家提交纠错（Wiki 交互逻辑）

**详细流程**

1. **提交**
   - 玩家点击"纠错"，填写修改后的数值

2. **暂存**
   - Vercel Serverless Function 将建议写入 Supabase
   - `edit_suggestions` 表，状态设为 `pending`

3. **审核**
   - 管理员登录后台，点击"批准"

4. **同步（关键步骤）**
   - ✅ Supabase 自动更新 `cards` 正式表
   - ✅ Vercel API 触发任务：重新生成 JSON 快照
   - ✅ 推送到 Cloudflare R2
   - ✅ Supabase 更新 `version` 版本号

5. **扩散**
   - 所有玩家在下次刷新页面时
   - 自动检测版本更新并静默下载新数据

---

## 📊 流量与成本预估（Hobby 免费版）

| 资源项 | 消耗渠道 | 免费额度表现 | 结论 |
|--------|----------|--------------|------|
| **网页流量** | Vercel | 100GB/月 | ✅ 仅传输 HTML/JS 代码，极难超标 |
| **数据流量** | Cloudflare R2 | 无限/完全免费 | ✅ 即使 10 万人下载 5MB JSON 也没关系 |
| **API 调用** | Supabase | 5GB 存储 / 无限制 | ✅ 仅用于版本检查和纠错提交，非常轻松 |
| **图片流量** | Cloudflare CDN | 无限/完全免费 | ✅ R2 承载回源，CDN 负责分发 |

**总结：在合理使用下，整套架构可完全在免费额度内运行** 💰

---

## 🛠️ 建议使用的技术栈

### 前端框架
```bash
Next.js 或 React + Tailwind CSS
```

### 本地持久化
- **idb** - IndexedDB 的轻量封装库
- 用于在浏览器存储 5MB 数据缓存

### 压缩方案
- 无需手动配置
- Cloudflare 和 Vercel 自动处理 **Brotli 压缩**

### 自动化脚本
```javascript
// 示例：Vercel API 端点
// /api/sync-data.js

import { createClient } from '@supabase/supabase-js'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export default async function handler(req, res) {
  // 1. 从 Supabase 导出数据
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  const { data: cards } = await supabase.from('cards').select('*')
  
  // 2. 生成 JSON
  const jsonData = JSON.stringify(cards)
  
  // 3. 上传到 R2
  const s3 = new S3Client({ /* R2 配置 */ })
  await s3.send(new PutObjectCommand({
    Bucket: 'your-bucket',
    Key: 'data/cards.json',
    Body: jsonData,
    ContentType: 'application/json'
  }))
  
  // 4. 更新版本号
  await supabase.from('data_config').update({ 
    version: Date.now() 
  }).eq('id', 1)
  
  res.status(200).json({ success: true })
}
```

---

## 💡 总结

### 核心设计理念："读写分离"

| 操作类型 | 技术路径 | 核心价值 |
|----------|----------|----------|
| **写（纠错）** | Supabase | 确保数据的严谨性和可追溯性 |
| **读（分发）** | Cloudflare R2 + CDN | 确保海量访问时的成本控制和极致速度 |

### 架构优势

1. **零成本运营** - 在合理规模下完全免费
2. **极致性能** - CDN + 本地缓存实现毫秒级加载
3. **易于维护** - SQL 管理数据，告别手动编辑 JSON
4. **热插拔特性** - 架构组件可灵活替换（如 Cloudflare → 阿里云 OSS）
5. **国内友好** - 无需备案即可快速访问

### 未来扩展性

由于拥有**域名控制权**，这套架构具有优秀的可扩展性：
- 如果项目规模扩大需要备案
- 只需将 Cloudflare 替换为阿里云 OSS
- **架构逻辑完全不用修改** 🎯

---

## 🚀 快速开始

```bash
# 1. 克隆项目
git clone <your-repo>

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local

# 4. 启动开发服务器
npm run dev
```

---

**Built with ❤️ using Next.js, Supabase, and Cloudflare**

</details>
