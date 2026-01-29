# GitHub Pages 部署指南

## 📋 前置准备

1. 确保你有一个 GitHub 账号
2. 安装了 Git
3. 项目已经在本地构建成功

---

## 🚀 部署步骤

### 第一步：初始化 Git 仓库

```bash
cd D:\Projects\bazaar_calculator

# 初始化 Git（如果还没有）
git init

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit: Bazaar Calculator Website"
```

### 第二步：创建 GitHub 仓库

1. 登录 GitHub
2. 点击右上角 "+" → "New repository"
3. 仓库名称填写：`bazaar-calculator` 或 `duang.work`
4. 选择 **Public**（公开仓库）
5. 不要勾选任何初始化选项
6. 点击 "Create repository"

### 第三步：关联远程仓库

```bash
# 添加远程仓库（替换成你的用户名）
git remote add origin https://github.com/Duangi/bazaar-calculator.git

# 推送代码
git branch -M main
git push -u origin main
```

### 第四步：配置 GitHub Pages

1. 进入仓库页面
2. 点击 **Settings**（设置）
3. 左侧菜单找到 **Pages**
4. 在 "Build and deployment" 下：
   - Source 选择：**GitHub Actions**
5. 保存

### 第五步：等待自动部署

1. 回到仓库首页
2. 点击 **Actions** 标签
3. 查看部署进度（第一次需要 3-5 分钟）
4. 部署成功后，会显示绿色 ✓

### 第六步：访问网站

部署完成后，你的网站地址为：
```
https://Duangi.github.io/bazaar-calculator/
```

或者如果仓库名是你的用户名.github.io：
```
https://Duangi.github.io/
```

---

## 🌐 绑定自定义域名（可选）

### 如果你有 duang.work 域名：

#### 1. 在域名提供商添加 DNS 记录

添加以下记录：

```
类型: A
名称: @
值: 185.199.108.153
值: 185.199.109.153
值: 185.199.110.153
值: 185.199.111.153
```

或者使用 CNAME：
```
类型: CNAME
名称: www
值: Duangi.github.io
```

#### 2. 在 GitHub 仓库配置

1. 进入仓库 **Settings** → **Pages**
2. 在 "Custom domain" 输入：`duang.work`
3. 点击 Save
4. 等待 DNS 检查（可能需要几分钟到几小时）
5. 勾选 "Enforce HTTPS"

#### 3. 添加 CNAME 文件

```bash
# 在项目根目录创建
echo "duang.work" > public/CNAME

# 提交并推送
git add public/CNAME
git commit -m "Add custom domain"
git push
```

---

## 🔄 后续更新流程

每次修改代码后：

```bash
# 1. 提交修改
git add .
git commit -m "描述你的修改"

# 2. 推送到 GitHub
git push

# 3. 自动部署会立即触发，等待 3-5 分钟即可看到更新
```

---

## ⚠️ 常见问题

### Q1: 推送时提示 403 或认证失败

**解决方案：**
```bash
# 使用 Personal Access Token
# 1. 访问 https://github.com/settings/tokens
# 2. 生成新 token（选择 repo 权限）
# 3. 使用 token 代替密码推送

# 或者使用 SSH
git remote set-url origin git@github.com:Duangi/bazaar-calculator.git
```

### Q2: Actions 部署失败

**检查步骤：**
1. 确认 `.github/workflows/deploy.yml` 文件存在
2. 查看 Actions 错误日志
3. 确认 `next.config.js` 有 `output: 'export'`
4. 检查 `package.json` 中的构建命令

### Q3: 部署成功但页面空白

**解决方案：**
1. 检查浏览器控制台错误
2. 确认 `basePath` 配置正确
3. 清除浏览器缓存重试

### Q4: 404 错误

**解决方案：**
```javascript
// next.config.js
const nextConfig = {
  output: 'export',
  basePath: '/bazaar-calculator',  // 如果仓库名不是 用户名.github.io
  assetPrefix: '/bazaar-calculator/',
}
```

### Q5: 自定义域名不生效

**解决方案：**
1. 等待 DNS 传播（最多 48 小时）
2. 使用 `nslookup duang.work` 检查 DNS
3. 确认 CNAME 文件在 `public/` 目录
4. 确认 GitHub Pages 设置中显示 "DNS check successful"

---

## 📊 部署状态检查

在仓库 README.md 中添加状态徽章：

```markdown
[![Deploy](https://github.com/Duangi/bazaar-calculator/actions/workflows/deploy.yml/badge.svg)](https://github.com/Duangi/bazaar-calculator/actions/workflows/deploy.yml)
```

---

## 🎯 性能优化建议

部署后可以进一步优化：

1. **启用压缩**
   - GitHub Pages 自动启用 Gzip
   - Next.js 已自动优化代码

2. **监控性能**
   - 使用 [PageSpeed Insights](https://pagespeed.web.dev/)
   - 使用 [GTmetrix](https://gtmetrix.com/)

3. **CDN 加速**
   - GitHub Pages 自带全球 CDN
   - 如需国内加速，可考虑 Cloudflare

---

## 🔐 安全建议

1. 不要在代码中包含敏感信息
2. 使用 `.gitignore` 排除本地配置
3. 定期更新依赖 `npm update`
4. 启用 Dependabot 自动检查安全漏洞

---

## 📝 部署清单

- [ ] Git 仓库已初始化
- [ ] 代码已推送到 GitHub
- [ ] GitHub Actions workflow 已配置
- [ ] GitHub Pages 已启用
- [ ] 部署成功（查看 Actions）
- [ ] 网站可以访问
- [ ] 自定义域名已配置（可选）
- [ ] HTTPS 已启用
- [ ] 性能测试通过

---

**部署完成后，记得在 B 站和 GitHub 分享你的网站链接！** 🎉

有任何问题可以在 GitHub Issues 中提问。
