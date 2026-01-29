# 项目启动指南

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

然后在浏览器中打开 [http://localhost:3000](http://localhost:3000) 查看效果。

---

## 📦 项目结构

```
bazaar_calculator/
├── app/                    # Next.js App Router 页面
│   ├── layout.tsx         # 根布局
│   ├── page.tsx           # 首页
│   ├── globals.css        # 全局样式
│   └── tools/             # 工具页面
│       ├── page.tsx
│       └── tools.module.css
├── components/            # React 组件
│   ├── ItemsList.tsx      # 物品列表组件
│   ├── RatingTool.tsx     # 评分工具组件
│   └── ItemDetail.tsx     # 物品详情组件
├── public/                # 静态资源
│   ├── items_db.json      # 物品数据
│   └── skills_db.json     # 技能数据
├── ref/                   # 参考文件（原插件代码）
├── package.json           # 项目配置
├── next.config.js         # Next.js 配置
└── tsconfig.json          # TypeScript 配置
```

---

## 🎨 核心功能

### 1. 首页
- 个人介绍
- 社交链接（B站、GitHub）
- 工具入口

### 2. 工具页面
- **左侧评分器**：
  - 拖拽物品到 S/A/B/C 评级
  - 自定义评级名称和颜色
  - 保存和切换预设
  - 本地持久化存储

- **右侧数据列表**：
  - 物品/技能切换
  - 实时搜索
  - 品质/大小筛选
  - 拖拽到评分器

- **物品详情**：
  - 基础属性展示
  - 品质切换查看
  - 技能描述（关键词高亮）
  - 标签和英雄信息

---

## 🎯 拖拽功能

使用 `react-dnd` 实现：
1. 从右侧列表拖拽物品
2. 拖拽时显示物品图标（半透明）
3. 放到左侧评分器的任意等级区域
4. 自动归类并保存

---

## 🌈 品质颜色系统

| 品质 | 颜色代码 | 用途 |
|------|---------|------|
| 铜牌 | #CD7F32 | Bronze |
| 银牌 | #C0C0C0 | Silver |
| 金牌 | #FFD700 | Gold |
| 钻石 | #B9F2FF | Diamond |

所有卡牌边框、文字颜色均遵循此标准。

---

## 📝 关键词高亮

技能描述中的游戏术语会自动高亮显示：

- **弹药** - 橙色 (#ff8e00)
- **灼烧** - 橙红 (#ff9f45)
- **充能/冷却/加速** - 青色 (#00ecc3)
- **暴击/伤害** - 红色 (#f5503d)
- **冻结** - 蓝色 (#00ccff)
- **治疗/生命值** - 绿色 (#8eea31)
- **剧毒** - 翠绿 (#0ebe4f)
- **护盾** - 天蓝 (#00bcd4)

---

## 🚢 部署到 GitHub Pages

### 方式一：自动部署（推荐）

1. 将代码推送到 GitHub 仓库
2. 在仓库设置中启用 GitHub Pages
3. 选择 "GitHub Actions" 作为部署源
4. 每次推送到 main 分支会自动部署

### 方式二：手动部署

```bash
# 构建项目
npm run build

# 构建完成后，out 目录就是静态站点
# 可以部署到任何静态托管服务
```

---

## ⚙️ 配置说明

### next.config.js

```javascript
output: 'export'  // 导出为静态站点，适合 GitHub Pages
images: {
  unoptimized: true  // 禁用图片优化，避免部署问题
}
```

### package.json

```json
"scripts": {
  "dev": "next dev",           // 开发模式
  "build": "next build",       // 构建生产版本
  "start": "next start",       // 启动生产服务器
  "export": "next build && next export"  // 导出静态站点
}
```

---

## 💾 本地存储

项目使用 `localStorage` 保存用户数据：

- **ratingPresets** - 评分预设配置
- **ratedItems** - 已评分的物品列表

数据格式：
```json
{
  "ratedItems": {
    "S": [物品数组],
    "A": [物品数组],
    "B": [物品数组],
    "C": [物品数组]
  },
  "ratingPresets": [
    {
      "id": "preset-1",
      "name": "自定义预设 1",
      "tiers": [
        {"id": "S", "name": "必带", "color": "#ff0000"},
        {"id": "A", "name": "强力", "color": "#ffa500"}
      ]
    }
  ]
}
```

---

## 🔧 常见问题

### Q: 为什么看不到物品图片？
A: 目前使用占位符 🎴，后续可以添加真实图片到 `public/images/` 目录。

### Q: 如何添加更多数据？
A: 编辑 `public/items_db.json` 和 `public/skills_db.json`。

### Q: 如何修改品质颜色？
A: 修改 `app/globals.css` 中的 `.tier-*` 类。

### Q: 搜索不工作？
A: 确保数据文件中有 `name_cn`、`name_en` 和 `tags` 字段。

---

## 📚 技术栈

- **Next.js 14** - React 框架
- **TypeScript** - 类型安全
- **React DnD** - 拖拽功能
- **CSS Modules** - 样式隔离
- **GitHub Actions** - 自动部署

---

## 🎯 后续优化建议

1. **图片优化**
   - 添加真实卡牌图片
   - 使用 WebP 格式
   - 实现图片懒加载

2. **性能优化**
   - 使用 IndexedDB 缓存大量数据
   - 实现虚拟滚动（react-window）
   - 代码分割优化

3. **功能增强**
   - 添加阵容模拟器
   - 实现数据导出/导入
   - 添加卡牌对比功能
   - 支持多语言切换

4. **用户体验**
   - 添加搜索历史
   - 实现快捷键操作
   - 移动端适配优化
   - 添加主题切换

---

## 📞 联系方式

- B站：[@这是李Duang啊](https://space.bilibili.com/251954263)
- GitHub：[Duangi/BazaarHelper](https://github.com/Duangi/BazaarHelper)

---

**祝开发顺利！🎉**
