# 数据更新SOP（唯一真源：GameData.db）

> 目标：后续所有卡牌/技能数据更新，统一以 `GameData.db` 为准。  
> 禁止再以 `cards.json / v2_Cards.json / dump` 作为主数据源。

## 1. 更新前检查

1. 确认游戏已更新到目标版本，并至少启动过一次游戏。  
2. 确认本地数据库存在（mac 默认路径）：  
   `~/Library/Application Support/com.TempoStorm.TheBazaar/prod/cache/GameData.db`
3. 记录该文件修改时间，确保是最新：

```bash
ls -lh "~/Library/Application Support/com.TempoStorm.TheBazaar/prod/cache/GameData.db"
```

## 2. 导出命令（必须使用 raw_exports 脚本）

在项目根目录执行：

```bash
cd /Users/duang/Projects/bazaar_calculator/public/resources/raw_exports
python3 item.py --json items_export_latest.json --csv items_export_latest.csv --no-sample
python3 skill.py --json skills_export_latest.json --csv skills_export_latest.csv --no-sample
```

## 3. 关键校验（防止读错源）

导出完成后，必须校验几张关键卡（示例：发射核心）：

```bash
python3 - <<'PY'
import json
p='/Users/duang/Projects/bazaar_calculator/public/resources/raw_exports/items_export_latest.json'
arr=json.load(open(p,'r',encoding='utf-8'))
x=[i for i in arr if i.get('name_en')=='Launcher Core' or i.get('name_cn')=='发射核心']
print('count=',len(x))
if x:
    print('cooldown=',x[0].get('cooldown'))
    print('all_tiers=',x[0].get('all_tiers'))
PY
```

若校验结果与游戏内不一致，先不要继续部署，先排查脚本日志中 `[卡牌数据] 使用 ...` 是否为 `缓存(db)` 或 `游戏(db)`。

## 4. 前端数据读取说明

当前前端读取路径：
- `/resources/raw_exports/items_export_latest.json`
- `/resources/raw_exports/skills_export_latest.json`

如更新后前端仍显示旧数据：
1. 强刷浏览器缓存（`Cmd+Shift+R`）
2. 检查 `lib/cdn.ts` 的版本 query 是否更新
3. 重启本地 dev 服务

## 5. 注意事项（必须遵守）

1. **不要**直接把 dump 结构当成前端真源覆盖 raw_exports。  
2. 若脚本日志显示读取 `cards.json`，说明 `GameData.db` 路径未命中，需要先修复路径/权限。  
3. 修改解析脚本时，必须保持以下兼容：
   - 解析 `cards` 表中的 `Data` JSON（SQLite）
   - 仍可回退读取 JSON 文件（仅兜底）

## 6. 回归检查清单

每次更新后至少验证：
- 物品数量/技能数量是否正常
- 核心卡（武装/装甲/引燃/发射）冷却与描述是否正确
- 前端百科中的 `CD`、等级、词条显示是否正常
- 鸡煲实验室计算是否能正常执行（不报错）

---

如果下次让我“更新数据”，我会先执行本文件步骤，再进行任何代码改动。
