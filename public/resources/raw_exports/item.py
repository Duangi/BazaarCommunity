# -*- coding: utf-8 -*-
r"""
The Bazaar 物品数据提取工具
自动从游戏目录和缓存目录提取所有物品信息并关联输出

使用方法:
    python item_extractor.py --game "C:\Game\Steam\steamapps\common\The Bazaar" --cache "C:\Users\Admin\AppData\LocalLow\Tempo Storm\The Bazaar\prod\cache"
    python item_extractor.py -g "D:\游戏\The Bazaar" -c "C:\Users\用户\AppData\LocalLow\Tempo Storm\The Bazaar\prod\cache"
    python item_extractor.py  # 使用默认路径
"""

import json
import sqlite3
import hashlib
import csv
import sys
import os
import argparse
from pathlib import Path
from datetime import datetime

# 配置输出编码（仅在有控制台时）
if sys.stdout is not None:
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

# ===== 等级顺序 =====
TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Legendary']

# ===== 翻译映射 =====
TYPE_CN = {"Item": "Item / 物品", "Skill": "Skill / 技能"}
SIZE_CN = {"Small": "Small / 小型", "Medium": "Medium / 中型", "Large": "Large / 大型"}
TIER_CN = {
    "Bronze": "Bronze / 青铜", "Silver": "Silver / 白银", 
    "Gold": "Gold / 黄金", "Diamond": "Diamond / 钻石", 
    "Legendary": "Legendary / 传奇"
}
HERO_CN = {
    "Common": "Common / 通用", "Pygmalien": "Pygmalien / 皮格马利翁", 
    "Vanessa": "Vanessa / 瓦内莎", "Dooley": "Dooley / 杜利", 
    "Mak": "Mak / 马克", "Jules": "Jules / 朱尔斯", 
    "Stelle": "Stelle / 斯黛尔"
}
TAG_CN = {
    "Weapon": "Weapon / 武器", "Tool": "Tool / 工具", "Property": "Property / 地产",
    "Aquatic": "Aquatic / 水系", "Vehicle": "Vehicle / 载具", "Tech": "Tech / 科技",
    "Food": "Food / 食物", "Friend": "Friend / 伙伴", "Dinosaur": "Dinosaur / 恐龙",
    "Loot": "Loot / 战利品", "Relic": "Relic / 遗物", "Apparel": "Apparel / 服饰",
    "Dragon": "Dragon / 龙", "Toy": "Toy / 玩具", "Potion": "Potion / 药水",
    "Core": "Core / 核心", "Ray": "Ray / 射线", "Reagent": "Reagent / 试剂",
}
ENCHANT_CN = {
    'Heavy': '沉重', 'Golden': '黄金', 'Icy': '寒冰', 'Turbo': '疾速',
    'Shielded': '护盾', 'Restorative': '回复', 'Toxic': '毒素', 'Fiery': '炽焰',
    'Shiny': '闪亮', 'Deadly': '致命', 'Radiant': '辉耀', 'Obsidian': '黑曜石',
}

# 隐藏标签翻译 (效果类型)
HIDDEN_TAG_CN = {
    'Damage': 'Damage / 伤害',
    'Freeze': 'Freeze / 冻结',
    'Slow': 'Slow / 减速',
    'Haste': 'Haste / 加速',
    'Heal': 'Heal / 治疗',
    'Shield': 'Shield / 护盾',
    'Burn': 'Burn / 灼烧',
    'Poison': 'Poison / 剧毒',
    'Regen': 'Regen / 再生',
    'Charge': 'Charge / 充能',
    'Crit': 'Crit / 暴击',
    'Active': 'Active / 主动',
    'Passive': 'Passive / 被动',
    'NonWeapon': 'NonWeapon / 非武器',
    'Value': 'Value / 价值',
    'Economy': 'Economy / 经济',
    'Ammo': 'Ammo / 弹药',
    'AmmoReference': 'AmmoRef / 弹药引用',
    'PotionReference': 'PotionRef / 药水引用',
    'EconomyReference': 'EconomyRef / 经济引用',
    'DamageReference': 'DamageRef / 伤害引用',
    'FreezeReference': 'FreezeRef / 冻结引用',
    'HealReference': 'HealRef / 治疗引用',
    'ShieldReference': 'ShieldRef / 护盾引用',
    'SlowReference': 'SlowRef / 减速引用',
    'HasteReference': 'HasteRef / 加速引用',
    'BurnReference': 'BurnRef / 灼烧引用',
    'PoisonReference': 'PoisonRef / 剧毒引用',
    'RegenReference': 'RegenRef / 再生引用',
    'ChargeReference': 'ChargeRef / 充能引用',
    'Flying': 'Flying / 飞行',
    'Multicast': 'Multicast / 多重施放',
    'Cooldown': 'Cooldown / 冷却',
    'Transform': 'Transform / 转化',
    'Spawn': 'Spawn / 生成',
    'Destroy': 'Destroy / 摧毁',
    'Enchant': 'Enchant / 附魔',
    'Sell': 'Sell / 出售',
    'Buy': 'Buy / 购买',
    'Upgrade': 'Upgrade / 升级',
    'Income': 'Income / 收入',
    'MaxHealth': 'MaxHealth / 最大生命',
    'Lifesteal': 'Lifesteal / 生命偷取',
    'Gold': 'Gold / 金币',
    'Health': 'Health / 生命值',
    'HealthReference': 'HealthRef / 生命值引用',
    'FlyingReference': 'FlyingRef / 飞行引用',
}

# Action 类型到属性的映射
ACTION_TO_ATTR_VALUE = {
    'TActionPlayerDamage': 'DamageAmount',
    'TActionPlayerHeal': 'HealAmount',
    'TActionPlayerShieldApply': 'ShieldApplyAmount',
    'TActionPlayerBurnApply': 'BurnApplyAmount',
    'TActionPlayerPoisonApply': 'PoisonApplyAmount',
    'TActionPlayerRegenApply': 'RegenApplyAmount',
    'TActionCardDamage': 'DamageAmount',
    'TActionCardHeal': 'HealAmount',
    'TActionCardShieldApply': 'ShieldApplyAmount',
    'TActionCardBurnApply': 'BurnApplyAmount',
    'TActionCardPoisonApply': 'PoisonApplyAmount',
    'TActionCardSlow': 'SlowAmount',
    'TActionCardFreeze': 'FreezeAmount',
    'TActionCardHaste': 'HasteAmount',
    'TActionCardCharge': 'ChargeAmount',
    'TActionCardCrit': 'CritChance',
    'TActionCardReload': 'ReloadAmount',
}

ACTION_TO_ATTR_TARGETS = {
    'TActionCardSlow': 'SlowTargets',
    'TActionCardFreeze': 'FreezeTargets',
    'TActionCardHaste': 'HasteTargets',
    'TActionCardFlyingStart': 'FlyingTargets',
    'TActionCardFlyingStop': 'FlyingTargets',
    'TActionCardFlyingToggle': 'FlyingTargets',
    'TActionCardCharge': 'ChargeTargets',
    'TActionCardDamage': 'DamageTargets',
}

# 需要毫秒转秒的属性 (由用户后续指定)
MS_TO_SEC_ATTRS = set()

# 附魔顺序
ENCHANT_ORDER = ['Golden', 'Heavy', 'Icy', 'Turbo', 'Shielded', 'Restorative', 
                 'Toxic', 'Fiery', 'Shiny', 'Deadly', 'Radiant', 'Obsidian']


def get_default_cache_candidates() -> list[Path]:
    home = Path.home()
    candidates = []
    local_appdata = os.environ.get('LOCALAPPDATA')
    if local_appdata:
        candidates.append(Path(local_appdata) / '..' / 'LocalLow' / 'Tempo Storm' / 'The Bazaar' / 'prod' / 'cache')
    candidates.extend([
        home / 'Library' / 'Application Support' / 'com.TempoStorm.TheBazaar' / 'prod' / 'cache',
        home / 'AppData' / 'LocalLow' / 'Tempo Storm' / 'The Bazaar' / 'prod' / 'cache',
    ])
    return candidates


def get_default_game_candidates() -> list[Path]:
    home = Path.home()
    return [
        Path.cwd(),
        home / 'Library' / 'Application Support' / 'Steam' / 'steamapps' / 'common' / 'The Bazaar',
        home / 'Applications' / 'The Bazaar.app',
        Path('/Applications/The Bazaar.app'),
        home / 'AppData' / 'Local' / 'Programs' / 'The Bazaar',
        Path(r'C:/Game/Steam/steamapps/common/The Bazaar'),
    ]


class ItemExtractor:
    """物品数据提取器"""
    
    def __init__(self, game_dir: str = None, cache_dir: str = None, output_dir: str = None):
        """
        初始化提取器
        
        Args:
            game_dir: 游戏安装目录 (包含 TheBazaar.exe)
            cache_dir: 缓存目录 (通常是 AppData/LocalLow/Tempo Storm/The Bazaar/prod/cache)
            output_dir: 输出目录 (默认为当前目录)
        """
        self.game_dir = Path(game_dir) if game_dir else None
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self.output_dir = Path(output_dir) if output_dir else Path.cwd()
        
        self.translations = {}
        self.cards_data = []
        self.items = []
        self.price_data = {}  # ID -> {TierName -> {BuyPrice: val, SellPrice: val}}

    def resolve_streaming_assets_dir(self) -> Path | None:
        """解析游戏目录对应的 StreamingAssets 目录（兼容 Windows/macOS）"""
        if not self.game_dir:
            return None

        candidates = []
        game_dir = self.game_dir
        if game_dir.name == 'TheBazaar.app':
            candidates.append(game_dir / 'Contents' / 'Resources' / 'Data' / 'StreamingAssets')
        candidates.extend([
            game_dir / 'TheBazaar_Data' / 'StreamingAssets',
            game_dir / 'Contents' / 'Resources' / 'Data' / 'StreamingAssets',
            game_dir / 'TheBazaar.app' / 'Contents' / 'Resources' / 'Data' / 'StreamingAssets',
        ])

        for candidate in candidates:
            if candidate.exists():
                return candidate
        return None

    def auto_detect_paths(self):
        """自动检测路径"""
        if not self.cache_dir:
            for candidate in get_default_cache_candidates():
                candidate = candidate.expanduser().resolve()
                if candidate.exists():
                    self.cache_dir = candidate
                    print(f"[自动检测] 缓存目录: {self.cache_dir}")
                    break

        if not self.game_dir:
            for candidate in get_default_game_candidates():
                candidate = candidate.expanduser()
                if not candidate.exists():
                    continue
                self.game_dir = candidate.resolve()
                if self.resolve_streaming_assets_dir():
                    print(f"[自动检测] 游戏目录: {self.game_dir}")
                    break
                self.game_dir = None
    
    def find_cards_file(self) -> Path:
        """查找卡牌数据文件"""
        candidates = []
        
        # 优先从缓存目录查找
        if self.cache_dir:
            cache_cards = self.cache_dir / 'cards.json'
            if cache_cards.exists():
                candidates.append(('缓存', cache_cards))
        
        # 从游戏目录查找
        if self.game_dir:
            streaming_assets = self.resolve_streaming_assets_dir()
            if streaming_assets:
                v2_cards = streaming_assets / 'v2_Cards.json'
                cards = streaming_assets / 'cards.json'
            else:
                v2_cards = None
                cards = None
            
            if v2_cards and v2_cards.exists():
                candidates.append(('游戏(v2)', v2_cards))
            if cards and cards.exists():
                candidates.append(('游戏', cards))
        
        if not candidates:
            raise FileNotFoundError("无法找到卡牌数据文件 (cards.json 或 v2_Cards.json)")

        # 优先级：游戏(v2) > 游戏(cards) > 缓存(cards)
        # 说明：缓存 cards.json 可能落后于游戏目录中的 v2_Cards.json，
        # 为避免出现弱点探测器等数值回退，默认优先读取游戏文件。
        priority = {'游戏(v2)': 3, '游戏': 2, '缓存': 1}
        best = max(candidates, key=lambda x: (priority.get(x[0], 0), x[1].stat().st_mtime))
        print(f"[卡牌数据] 使用 {best[0]} 版本: {best[1]}")
        return best[1]
    
    def find_translation_file(self) -> Path:
        """查找翻译数据文件"""
        if not self.cache_dir:
            return None
        
        # 查找中文翻译
        zh_cn = self.cache_dir / 'translations' / 'zh-CN.bytes'
        if zh_cn.exists():
            print(f"[翻译数据] 找到中文翻译: {zh_cn}")
            return zh_cn
        
        # 查找任意翻译文件
        trans_dir = self.cache_dir / 'translations'
        if trans_dir.exists():
            for f in trans_dir.glob('*.bytes'):
                print(f"[翻译数据] 找到翻译文件: {f}")
                return f
        
        print("[翻译数据] 未找到翻译文件，将只输出英文")
        return None
    
    def load_translations(self, trans_file: Path):
        """加载翻译数据"""
        if not trans_file or not trans_file.exists():
            return
        
        try:
            conn = sqlite3.connect(str(trans_file))
            cursor = conn.cursor()
            cursor.execute("SELECT hash, text FROM translation")
            self.translations = {row[0]: row[1] for row in cursor.fetchall()}
            conn.close()
            print(f"      已加载 {len(self.translations)} 条翻译")
        except Exception as e:
            print(f"[警告] 加载翻译失败: {e}")
    
    def load_price_data(self):
        """专门从 v2_Cards.json 中加载价格数据"""
        if not self.game_dir:
            return
            
        streaming_assets = self.resolve_streaming_assets_dir()
        if not streaming_assets:
            return

        v2_cards_path = streaming_assets / 'v2_Cards.json'
        if not v2_cards_path.exists():
            return
            
        try:
            with open(v2_cards_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            self.price_data = {}
            for card in data:
                card_id = card.get('Id')
                if not card_id:
                    continue
                
                tiers = card.get('Tiers', {})
                card_prices = {}
                for tier_name, tier_info in tiers.items():
                    attrs = tier_info.get('Attributes', {})
                    buy = attrs.get('BuyPrice')
                    sell = attrs.get('SellPrice')
                    if buy is not None or sell is not None:
                        card_prices[tier_name] = {
                            'BuyPrice': buy,
                            'SellPrice': sell
                        }
                
                if card_prices:
                    self.price_data[card_id] = card_prices
            
            print(f"      已从 v2_Cards.json 加载 {len(self.price_data)} 个物品的价格信息")
        except Exception as e:
            print(f"[警告] 加载价格数据失败: {e}")

    def load_cards(self, cards_file: Path):
        """加载卡牌数据"""
        with open(cards_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 处理不同的数据格式
        if isinstance(data, list):
            # v2_Cards.json 格式
            self.cards_data = data
        elif isinstance(data, dict):
            # cards.json 缓存格式
            for v in data.values():
                if isinstance(v, list):
                    self.cards_data.extend(v)
                else:
                    self.cards_data.append(v)
        
        # 过滤出物品
        self.items = [c for c in self.cards_data if c.get('Type') == 'Item']
        print(f"      已加载 {len(self.cards_data)} 张卡牌，其中 {len(self.items)} 个物品")
    
    @staticmethod
    def get_md5(text: str) -> str:
        """计算文本的MD5哈希"""
        if not text:
            return ""
        return hashlib.md5(text.encode('utf-8')).hexdigest()
    
    def get_translation(self, text: str) -> str:
        """获取翻译"""
        if not text:
            return ""
        return self.translations.get(self.get_md5(text), "")
    
    @staticmethod
    def translate_list(values: list, trans_dict: dict) -> str:
        """翻译列表值"""
        if not values:
            return ""
        return " | ".join([trans_dict.get(v, v) for v in values])

    @staticmethod
    def split_bilingual_text(text: str, fallback: str = "") -> tuple[str, str]:
        """将 'EN / 中文' 格式拆成中英文"""
        if not text:
            return fallback, ""
        if " / " in text:
            en, cn = text.split(" / ", 1)
            return en.strip(), cn.strip()
        return text.strip(), ""

    @classmethod
    def build_term_entries(cls, values: list, trans_dict: dict) -> list:
        """构建适合图数据库的双语术语数组"""
        entries = []
        for value in values or []:
            mapped = trans_dict.get(value, value)
            en, cn = cls.split_bilingual_text(mapped, value)
            entries.append({
                'id': value,
                'en': en or value,
                'cn': cn
            })
        return entries

    @staticmethod
    def format_term_entries(entries: list) -> str:
        """将双语术语数组格式化为可读字符串"""
        if not entries:
            return ""
        return " | ".join([
            f"{entry['en']} / {entry['cn']}" if entry.get('cn') else entry.get('en', entry.get('id', ''))
            for entry in entries
        ])
    
    @staticmethod
    def format_value(value) -> str:
        """格式化数值"""
        if isinstance(value, float) and value == int(value):
            return str(int(value))
        return str(value)

    @staticmethod
    def normalize_attr_value(attr_name: str, value):
        """规范化属性值，必要时做 ms -> s 转换"""
        if value is None:
            return None
        if attr_name in MS_TO_SEC_ATTRS and isinstance(value, (int, float)):
            return value / 1000
        return value
    
    @staticmethod
    def get_item_tiers(item_data: dict) -> list:
        """获取物品拥有的等级列表"""
        tiers = item_data.get('Tiers', {})
        return [t for t in TIER_ORDER if t in tiers]
    
    @staticmethod
    def get_merged_attributes(item_data: dict) -> tuple:
        """获取所有等级的合并属性"""
        tiers = item_data.get('Tiers', {})
        available_tiers = ItemExtractor.get_item_tiers(item_data)
        
        if not available_tiers:
            return {}, []
        
        all_attrs = set()
        for tier in available_tiers:
            tier_attrs = tiers.get(tier, {}).get('Attributes', {})
            all_attrs.update(tier_attrs.keys())
        
        merged = {}
        for attr in all_attrs:
            values = []
            last_value = None
            for tier in available_tiers:
                tier_attrs = tiers.get(tier, {}).get('Attributes', {})
                if attr in tier_attrs:
                    last_value = tier_attrs[attr]
                values.append(last_value)
            merged[attr] = values
        
        return merged, available_tiers
    
    @staticmethod
    def format_multi_tier_value(values: list, is_ms_to_sec: bool = False) -> str:
        """格式化多等级数值"""
        if not values:
            return None
        
        valid_values = [v for v in values if v is not None]
        if not valid_values:
            return None
        
        if is_ms_to_sec:
            # 移除自动判断，仅根据 is_ms_to_sec 标志进行转换
            valid_values = [v / 1000 if isinstance(v, (int, float)) else v for v in valid_values]
        
        formatted = [ItemExtractor.format_value(v) for v in valid_values]
        
        unique_values = []
        for v in formatted:
            if v not in unique_values:
                unique_values.append(v)
        
        return '/'.join(unique_values)
    
    @staticmethod
    def extract_value_from_data(value_data: dict, merged_attrs: dict, available_tiers: list) -> list:
        """从复杂的 Value 数据结构中提取数值"""
        if not isinstance(value_data, dict):
            return None
        
        vtype = value_data.get('$type', '')
        
        if vtype == 'TFixedValue':
            v = value_data.get('Value', 0)
            return [v] * len(available_tiers) if available_tiers else [v]
        
        if vtype == 'TReferenceValueCardAttribute':
            attr_type = value_data.get('AttributeType', '')
            if attr_type and attr_type in merged_attrs:
                return merged_attrs[attr_type]
            default = value_data.get('DefaultValue', 0)
            return [default] * len(available_tiers) if available_tiers else [default]
        
        return None
    
    @staticmethod
    def extract_modifier_value(value_data: dict, merged_attrs: dict, available_tiers: list) -> list:
        """从 Value.Modifier 中提取修饰符数值"""
        if not isinstance(value_data, dict):
            return None
        
        modifier = value_data.get('Modifier', {})
        if not isinstance(modifier, dict):
            return None
        
        mod_value_data = modifier.get('Value', {})
        
        if isinstance(mod_value_data, dict):
            return ItemExtractor.extract_value_from_data(mod_value_data, merged_attrs, available_tiers)
        elif isinstance(mod_value_data, (int, float)):
            return [mod_value_data] * len(available_tiers) if available_tiers else [mod_value_data]
        
        return None

    @staticmethod
    def get_action_attr_name(action_type: str, action: dict) -> str:
        """获取 action 对应的属性名，兼容 ModifyAttribute 类动作"""
        attr_name = ACTION_TO_ATTR_VALUE.get(action_type, '')
        if attr_name:
            return attr_name
        if isinstance(action, dict):
            return action.get('AttributeType', '') or ''
        return ''

    def build_attribute_catalog(self, merged_attrs: dict, available_tiers: list) -> list:
        """导出属性目录"""
        result = []
        for attr_name in sorted(merged_attrs.keys()):
            raw_values = merged_attrs.get(attr_name, [])
            values = [self.normalize_attr_value(attr_name, v) for v in raw_values]
            result.append({
                'attribute': attr_name,
                'unit': 'seconds' if attr_name in MS_TO_SEC_ATTRS else 'number',
                'values_by_tier': [
                    {
                        'tier': tier,
                        'tier_cn': self.split_bilingual_text(TIER_CN.get(tier, tier), tier)[1],
                        'value': values[idx] if idx < len(values) else None
                    }
                    for idx, tier in enumerate(available_tiers)
                ],
                'unique_values': [v for i, v in enumerate(values) if v is not None and v not in values[:i]]
            })
        return result

    def build_tier_details(self, item_data: dict, available_tiers: list) -> list:
        """导出每个 tier 的结构化信息"""
        tiers_data = item_data.get('Tiers', {})
        result = []
        for tier in available_tiers:
            tier_data = tiers_data.get(tier, {})
            attrs = tier_data.get('Attributes', {})
            result.append({
                'tier': tier,
                'tier_cn': self.split_bilingual_text(TIER_CN.get(tier, tier), tier)[1],
                'ability_ids': tier_data.get('AbilityIds', []),
                'aura_ids': tier_data.get('AuraIds', []),
                'tooltip_ids': tier_data.get('TooltipIds', []),
                'attributes': [
                    {
                        'attribute': attr_name,
                        'value': self.normalize_attr_value(attr_name, value),
                        'unit': 'seconds' if attr_name in MS_TO_SEC_ATTRS else 'number'
                    }
                    for attr_name, value in sorted(attrs.items())
                ]
            })
        return result

    def summarize_target(self, target: dict) -> dict | None:
        """提取目标选择器关键信息"""
        if not isinstance(target, dict):
            return None
        result = {'type': target.get('$type', '')}
        for key in ['TargetMode', 'TargetSection', 'ExcludeSelf', 'Operator', 'Id', 'CardType', 'Attribute', 'AttributeType', 'ComparisonOperator', 'IsNot']:
            if key in target:
                result[key] = target.get(key)
        if isinstance(target.get('Tags'), list):
            result['tags'] = target.get('Tags')
        if isinstance(target.get('Conditions'), dict):
            result['conditions'] = self.summarize_selector(target.get('Conditions'))
        return result

    def summarize_selector(self, data, depth: int = 0):
        """递归压缩条件/选择器结构"""
        if depth > 4:
            return None
        if isinstance(data, dict):
            result = {}
            for key, value in data.items():
                if key == '$type':
                    result['type'] = value
                elif isinstance(value, (str, int, float, bool)) or value is None:
                    result[key] = value
                elif isinstance(value, dict):
                    nested = self.summarize_selector(value, depth + 1)
                    if nested not in (None, {}, []):
                        result[key] = nested
                elif isinstance(value, list):
                    nested = [self.summarize_selector(v, depth + 1) for v in value]
                    nested = [v for v in nested if v not in (None, {}, [])]
                    if nested:
                        result[key] = nested
            return result
        if isinstance(data, list):
            return [self.summarize_selector(v, depth + 1) for v in data]
        return data

    def summarize_value_data(self, value_data: dict, merged_attrs: dict, available_tiers: list) -> dict | None:
        """提取 Value / ReferenceValue 的结构化信息"""
        if not isinstance(value_data, dict):
            return None
        attr_type = value_data.get('AttributeType', '')
        resolved_values = self.extract_value_from_data(value_data, merged_attrs, available_tiers)
        if resolved_values:
            resolved_values = [self.normalize_attr_value(attr_type or '', v) for v in resolved_values]
        modifier_values = self.extract_modifier_value(value_data, merged_attrs, available_tiers)
        if modifier_values:
            modifier_values = [self.normalize_attr_value(attr_type or '', v) for v in modifier_values]
        result = {
            'type': value_data.get('$type', ''),
            'attribute_type': attr_type or None,
            'default_value': value_data.get('DefaultValue'),
            'resolved_values': resolved_values,
            'modifier': self.summarize_selector(value_data.get('Modifier'))
        }
        if modifier_values:
            result['modifier_values'] = modifier_values
        target = value_data.get('Target')
        if isinstance(target, dict):
            result['target'] = self.summarize_target(target)
        return result

    def extract_effects_detail(self, source_data: dict, field_name: str, kind: str, merged_attrs: dict, available_tiers: list) -> list:
        """提取 Ability / Aura 的结构化详情"""
        effect_map = source_data.get(field_name, {})
        if not isinstance(effect_map, dict):
            return []

        result = []
        for effect_id, effect in effect_map.items():
            if not isinstance(effect, dict):
                continue
            action = effect.get('Action', {})
            action_type = action.get('$type', '') if isinstance(action, dict) else ''
            attr_name = self.get_action_attr_name(action_type, action)
            target_count = None
            if isinstance(action, dict) and isinstance(action.get('TargetCount'), dict):
                target_count = self.extract_value_from_data(action.get('TargetCount'), merged_attrs, available_tiers)
            trigger = effect.get('Trigger', {})
            entry = {
                'id': effect_id,
                'kind': kind,
                'name': effect.get('InternalName', ''),
                'description_en': effect.get('InternalDescription', ''),
                'description_cn': self.get_translation(effect.get('InternalDescription', '')) if effect.get('InternalDescription') else '',
                'active_in': effect.get('ActiveIn', ''),
                'works_in': effect.get('WorksIn', ''),
                'priority': effect.get('Priority', ''),
                'trigger': self.summarize_selector(trigger) if isinstance(trigger, dict) else None,
                'action': {
                    'type': action_type,
                    'attribute_type': attr_name or action.get('AttributeType'),
                    'operation': action.get('Operation'),
                    'target': self.summarize_target(action.get('Target')) if isinstance(action, dict) else None,
                    'target_player': self.summarize_target(action.get('TargetPlayer')) if isinstance(action, dict) else None,
                    'target_count': target_count,
                    'value': self.summarize_value_data(action.get('Value'), merged_attrs, available_tiers) if isinstance(action, dict) else None,
                    'duration': self.summarize_selector(action.get('Duration')) if isinstance(action, dict) else None,
                    'enchantment': action.get('Enchantment') if isinstance(action, dict) else None,
                    'spawn_context': self.summarize_selector(action.get('SpawnContext')) if isinstance(action, dict) else None
                },
                'prerequisites': self.summarize_selector(effect.get('Prerequisites'))
            }
            result.append(entry)
        return result

    def build_enchantments_detail(self, enchantments: dict) -> tuple[dict, list]:
        """导出附魔的展示信息与结构化信息"""
        enchants_resolved = {}
        enchants_detail = []

        if not isinstance(enchantments, dict):
            return enchants_resolved, enchants_detail

        for enc_name, enc_data in enchantments.items():
            enc_loc = enc_data.get('Localization', {})
            enc_tooltips = enc_loc.get('Tooltips', [])
            effect_en = ""
            effect_cn = ""

            if enc_tooltips:
                enc_content = enc_tooltips[0].get('Content', {})
                effect_en = enc_content.get('Text', '')
                effect_cn = self.get_translation(effect_en)
                effect_en = self.resolve_enchant_placeholders(effect_en, enc_data)
                effect_cn = self.resolve_enchant_placeholders(effect_cn, enc_data) if effect_cn else ''
                enchants_resolved[enc_name] = {
                    'name_cn': ENCHANT_CN.get(enc_name, enc_name),
                    'effect_en': effect_en,
                    'effect_cn': effect_cn if effect_cn else effect_en
                }

            merged_attrs = {k: [v] for k, v in (enc_data.get('Attributes') or {}).items()}
            available_tiers = ['Single']
            enchants_detail.append({
                'id': enc_name,
                'en': enc_name,
                'cn': ENCHANT_CN.get(enc_name, ''),
                'effect_en': effect_en,
                'effect_cn': effect_cn if effect_cn else effect_en,
                'tags_raw': enc_data.get('Tags', []) or [],
                'hidden_tags_raw': enc_data.get('HiddenTags', []) or [],
                'tags': self.build_term_entries(enc_data.get('Tags', []), TAG_CN),
                'hidden_tags': self.build_term_entries(enc_data.get('HiddenTags', []), HIDDEN_TAG_CN),
                'attributes': self.build_attribute_catalog(merged_attrs, available_tiers),
                'abilities_detail': self.extract_effects_detail(enc_data, 'Abilities', 'ability', merged_attrs, available_tiers),
                'auras_detail': self.extract_effects_detail(enc_data, 'Auras', 'aura', merged_attrs, available_tiers),
            })

        return enchants_resolved, enchants_detail
    
    def resolve_item_placeholders(self, text: str, item_data: dict) -> str:
        """解析物品技能描述中的占位符"""
        if not text:
            return text
        
        result = text
        merged_attrs, available_tiers = self.get_merged_attributes(item_data)
        
        if not available_tiers:
            return text
        
        abilities = item_data.get('Abilities', {})
        auras = item_data.get('Auras', {})
        
        # 解析 ability 占位符
        for ability_id, ability in abilities.items():
            action = ability.get('Action', {})
            action_type = action.get('$type', '')
            value_data = action.get('Value', {})
            
            # 识别是否是时间属性
            attr_name = ACTION_TO_ATTR_VALUE.get(action_type, '')
            is_ms = attr_name in MS_TO_SEC_ATTRS
            
            values = None
            
            if isinstance(value_data, dict) and value_data:
                values = self.extract_value_from_data(value_data, merged_attrs, available_tiers)
            
            if values is None:
                if attr_name and attr_name in merged_attrs:
                    values = merged_attrs[attr_name]
            
            if values is None and action_type == 'TActionGameSpawnCards':
                spawn_context = action.get('SpawnContext', {})
                limit = spawn_context.get('Limit', {})
                if isinstance(limit, dict):
                    values = self.extract_value_from_data(limit, merged_attrs, available_tiers)
            
            if values is None and 'Reload' in action_type:
                if 'ReloadAmount' in merged_attrs:
                    values = merged_attrs['ReloadAmount']
            
            if values:
                value_str = self.format_multi_tier_value(values, is_ms)
                if value_str:
                    result = result.replace(f'{{ability.{ability_id}}}', value_str)
            
            if isinstance(value_data, dict) and value_data:
                mod_values = self.extract_modifier_value(value_data, merged_attrs, available_tiers)
                if mod_values:
                    # 同样对 modifier 使用识别出的 is_ms
                    mod_str = self.format_multi_tier_value(mod_values, is_ms)
                    if mod_str:
                        result = result.replace(f'{{ability.{ability_id}.mod}}', mod_str)
            
            target_count = action.get('TargetCount', {})
            target_values = None
            
            if isinstance(target_count, dict) and target_count:
                target_values = self.extract_value_from_data(target_count, merged_attrs, available_tiers)
            
            if target_values is None:
                targets_attr = ACTION_TO_ATTR_TARGETS.get(action_type, '')
                if targets_attr and targets_attr in merged_attrs:
                    target_values = merged_attrs[targets_attr]
            
            if target_values:
                target_str = self.format_multi_tier_value(target_values)
                if target_str:
                    result = result.replace(f'{{ability.{ability_id}.targets}}', target_str)
        
        # 解析 aura 占位符
        for aura_id, aura in auras.items():
            action = aura.get('Action', {})
            value_data = action.get('Value', {})
            
            attr_type = action.get('AttributeType', '')
            is_ms = attr_type in MS_TO_SEC_ATTRS
            
            if isinstance(value_data, dict):
                values = self.extract_value_from_data(value_data, merged_attrs, available_tiers)
                if values:
                    value_str = self.format_multi_tier_value(values, is_ms)
                    if value_str:
                        result = result.replace(f'{{aura.{aura_id}}}', value_str)
                
                mod_values = self.extract_modifier_value(value_data, merged_attrs, available_tiers)
                if mod_values:
                    mod_str = self.format_multi_tier_value(mod_values, is_ms)
                    if mod_str:
                        result = result.replace(f'{{aura.{aura_id}.mod}}', mod_str)
        
        # 从 Attributes 解析常见占位符
        attr_to_placeholder = {
            'DamageAmount': ['{ability.0}'],
            'HealAmount': ['{ability.0}'],
            'ShieldApplyAmount': ['{ability.0}'],
            'BurnApplyAmount': ['{ability.0}'],
            'PoisonApplyAmount': ['{ability.0}'],
            'SlowTargets': ['{ability.0.targets}'],
            'FreezeTargets': ['{ability.0.targets}'],
            'HasteTargets': ['{ability.0.targets}'],
            'FlyingTargets': ['{ability.0.targets}'],
        }
        
        for attr_name, placeholders in attr_to_placeholder.items():
            if attr_name in merged_attrs:
                is_ms = attr_name in MS_TO_SEC_ATTRS
                value_str = self.format_multi_tier_value(merged_attrs[attr_name], is_ms)
                if value_str:
                    for ph in placeholders:
                        result = result.replace(ph, value_str)
        
        # 解析 Custom_X 属性
        for i in range(10):
            custom_key = f'Custom_{i}'
            if custom_key in merged_attrs:
                value_str = self.format_multi_tier_value(merged_attrs[custom_key])
                if value_str:
                    result = result.replace(f'{{ability.{i}}}', value_str)
                    result = result.replace(f'{{ability.{i}.mod}}', value_str)
                    result = result.replace(f'{{aura.{i}}}', value_str)
                    result = result.replace(f'{{aura.{i}.mod}}', value_str)
        
        if 'Custom_0' in merged_attrs:
            value_str = self.format_multi_tier_value(merged_attrs['Custom_0'])
            if value_str:
                result = result.replace('{i}', value_str)
                result = result.replace('{i-%}', value_str + '%')
        
        # 移除未解析的内部标识符 [{aura.x}], [{ability.x}] 等
        import re
        result = re.sub(r'\s*\[\{[^}]+\}\]', '', result)
        result = re.sub(r'\{(aura|ability)\.[^}]+\}', '', result)
        
        return result
    
    def resolve_enchant_placeholders(self, text: str, enchant_data: dict) -> str:
        """解析附魔效果中的占位符"""
        if not text:
            return text
        
        attributes = enchant_data.get('Attributes', {})
        abilities = enchant_data.get('Abilities', {})
        auras = enchant_data.get('Auras', {})
        
        result = text
        merged_attrs = {k: [v] for k, v in attributes.items()}
        available_tiers = ['Single']
        
        for ability_id, ability in abilities.items():
            action = ability.get('Action', {})
            action_type = action.get('$type', '')
            value_data = action.get('Value', {})
            
            values = None
            
            if isinstance(value_data, dict) and value_data:
                values = self.extract_value_from_data(value_data, merged_attrs, available_tiers)
            
            if values is None:
                attr_name = ACTION_TO_ATTR_VALUE.get(action_type, '')
                if attr_name and attr_name in merged_attrs:
                    values = merged_attrs[attr_name]
            
            if values:
                attr_name = ACTION_TO_ATTR_VALUE.get(action_type, '')
                is_ms = attr_name in MS_TO_SEC_ATTRS
                value_str = self.format_multi_tier_value(values, is_ms)
                if value_str:
                    result = result.replace(f'{{ability.{ability_id}}}', value_str)
                    if ability_id.startswith('e'):
                        idx = ability_id[1:]
                        result = result.replace(f'{{ability.{idx}}}', value_str)
            
            target_values = None
            targets_attr = ACTION_TO_ATTR_TARGETS.get(action_type, '')
            if targets_attr and targets_attr in merged_attrs:
                target_values = merged_attrs[targets_attr]
            
            if target_values:
                target_str = self.format_multi_tier_value(target_values)
                if target_str:
                    result = result.replace(f'{{ability.{ability_id}.targets}}', target_str)
                    result = result.replace(f'{{ability.{ability_id}.target}}', target_str)
        
        for aura_id, aura in auras.items():
            action = aura.get('Action', {})
            value_data = action.get('Value', {})
            attr_type = action.get('AttributeType', '')
            is_ms = attr_type in MS_TO_SEC_ATTRS
            
            if isinstance(value_data, dict):
                values = self.extract_value_from_data(value_data, merged_attrs, available_tiers)
                if values:
                    value_str = self.format_multi_tier_value(values, is_ms)
                    if value_str:
                        result = result.replace(f'{{aura.{aura_id}}}', value_str)
                        result = result.replace(f'{{aura.{aura_id}.}}', value_str)
                
                mod_values = self.extract_modifier_value(value_data, merged_attrs, available_tiers)
                if mod_values:
                    mod_str = self.format_multi_tier_value(mod_values, is_ms)
                    if mod_str:
                        result = result.replace(f'{{aura.{aura_id}.mod}}', mod_str)
        
        for i in range(10):
            custom_key = f'Custom_{i}'
            if custom_key in merged_attrs:
                value_str = self.format_multi_tier_value(merged_attrs[custom_key])
                if value_str:
                    result = result.replace(f'{{ability.e{i}}}', value_str)
                    result = result.replace(f'{{aura.e{i}}}', value_str)
                    result = result.replace(f'{{aura.e{i}.mod}}', value_str)
                    result = result.replace(f'{{aura.e{i}.}}', value_str)
        
        return result
    
    def process_item(self, item: dict) -> dict:
        """处理单个物品数据"""
        loc = item.get('Localization', {})
        title_en = loc.get('Title', {}).get('Text', item.get('InternalName', ''))
        title_cn = self.get_translation(title_en)
        
        starting_tier = item.get('StartingTier', 'Bronze')
        available_tiers = self.get_item_tiers(item)
        tiers_data = item.get('Tiers', {})
        
        tier_data = tiers_data.get(starting_tier, {})
        attributes = tier_data.get('Attributes', {})
        
        # 获取合并属性（包含所有等级的值）
        merged_attrs, _ = self.get_merged_attributes(item)
        
        # 处理技能描述
        tooltips = loc.get('Tooltips', [])
        skills = []
        skills_passive = []
        
        for i, tooltip in enumerate(tooltips):
            content = tooltip.get('Content', {}) if isinstance(tooltip, dict) else tooltip
            tt_type = tooltip.get('TooltipType', '') if isinstance(tooltip, dict) else ''
            
            if isinstance(content, dict):
                text_en = content.get('Text', '')
            else:
                text_en = str(content) if content else ''
            
            text_cn = self.get_translation(text_en)
            
            text_en_resolved = self.resolve_item_placeholders(text_en, item)
            text_cn_resolved = self.resolve_item_placeholders(text_cn, item) if text_cn else ''
            
            skill_obj = {
                'en': text_en_resolved,
                'cn': text_cn_resolved if text_cn_resolved else '[未翻译]' if text_en else ''
            }
            
            # 分类存入：主动进 skills，被动进 skills_passive
            if tt_type == 'Passive':
                skills_passive.append(skill_obj)
            else:
                # 默认为主动 (包括 'Active' 和没有类型的)
                skills.append(skill_obj)
        
        # 处理任务 (Quests) 信息
        quests_data = item.get('Quests')
        quests_resolved = None
        if isinstance(quests_data, list):
            quests_resolved = []
            for q in quests_data:
                entries = q.get('Entries', [])
                for entry in entries:
                    # 目标描述
                    entry_loc = entry.get('Localization', {})
                    entry_tooltips = entry_loc.get('Tooltips', [])
                    target_en = ""
                    if entry_tooltips:
                        target_en = entry_tooltips[0].get('Content', {}).get('Text', '')
                    target_cn = self.get_translation(target_en)
                    
                    # 奖励描述
                    reward = entry.get('Reward', {})
                    reward_loc = reward.get('Localization', {})
                    reward_tooltips = reward_loc.get('Tooltips', [])
                    reward_en = ""
                    if reward_tooltips:
                        reward_en = reward_tooltips[0].get('Content', {}).get('Text', '')
                    reward_cn = self.get_translation(reward_en)
                    
                    # 生成解析后的任务项
                    # 任务中的占位符解析相对复杂，这里通过将 reward 合并入 item_data 尝试解析
                    temp_item_data = item.copy()
                    if 'Auras' in reward:
                        temp_item_data.setdefault('Auras', {}).update(reward['Auras'])
                    if 'Abilities' in reward:
                        temp_item_data.setdefault('Abilities', {}).update(reward['Abilities'])
                    
                    quests_resolved.append({
                        'en_target': self.resolve_item_placeholders(target_en, temp_item_data),
                        'cn_target': self.resolve_item_placeholders(target_cn, temp_item_data) if target_cn else '',
                        'en_reward': self.resolve_item_placeholders(reward_en, temp_item_data),
                        'cn_reward': self.resolve_item_placeholders(reward_cn, temp_item_data) if reward_cn else ''
                    })
        
        # 如果物品有弹药属性，自动添加弹药描述
        if 'AmmoMax' in merged_attrs:
            ammo_values = merged_attrs['AmmoMax']
            ammo_str = self.format_multi_tier_value(ammo_values)
            if ammo_str:
                skills.append({
                    'en': f'Ammo: {ammo_str}',
                    'cn': f'弹药: {ammo_str}'
                })
        
        abilities_detail = self.extract_effects_detail(item, 'Abilities', 'ability', merged_attrs, available_tiers)
        auras_detail = self.extract_effects_detail(item, 'Auras', 'aura', merged_attrs, available_tiers)
        enchantments = item.get('Enchantments', {})
        enchants_resolved, enchantments_detail = self.build_enchantments_detail(enchantments)
        tags = self.build_term_entries(item.get('Tags', []), TAG_CN)
        hidden_tags = self.build_term_entries(item.get('HiddenTags', []), HIDDEN_TAG_CN)
        heroes = self.build_term_entries(item.get('Heroes', []), HERO_CN)
        
        # 获取各等级的属性值
        def get_tier_values(attr_name: str) -> str:
            """获取属性在各等级的值，格式如 1/2/3"""
            if attr_name in merged_attrs:
                values = merged_attrs[attr_name]
                is_ms = attr_name in MS_TO_SEC_ATTRS
                return self.format_multi_tier_value(values, is_ms) or ''
            return ''
        
        # 获取起始等级的值
        def get_starting_value(attr_name: str, default=0):
            val = attributes.get(attr_name, default)
            # 冷却和充能相关数值转换
            is_ms = attr_name in MS_TO_SEC_ATTRS
            if is_ms and isinstance(val, (int, float)):
                return val / 1000
            return val
        
        return {
            'id': item.get('Id', ''),
            'name_en': title_en,
            'name_cn': title_cn if title_cn else '',
            'type': TYPE_CN.get(item.get('Type', ''), item.get('Type', '')),
            'size': SIZE_CN.get(item.get('Size', ''), item.get('Size', '')),
            'starting_tier': TIER_CN.get(starting_tier, starting_tier),
            'available_tiers': '/'.join(available_tiers),
            'heroes': heroes,
            'heroes_en': [entry['en'] for entry in heroes],
            'heroes_cn': [entry['cn'] for entry in heroes if entry.get('cn')],
            'heroes_raw': item.get('Heroes', []),
            'tags': tags,
            'tags_en': [entry['en'] for entry in tags],
            'tags_cn': [entry['cn'] for entry in tags if entry.get('cn')],
            'tags_raw': item.get('Tags', []),
            'hidden_tags': hidden_tags,
            'hidden_tags_en': [entry['en'] for entry in hidden_tags],
            'hidden_tags_cn': [entry['cn'] for entry in hidden_tags if entry.get('cn')],
            'hidden_tags_raw': item.get('HiddenTags', []),
            'cooldown': get_starting_value('CooldownMax', 0),
            'cooldown_tiers': get_tier_values('CooldownMax'),
            'damage': get_starting_value('DamageAmount', 0),
            'damage_tiers': get_tier_values('DamageAmount'),
            'heal': get_starting_value('HealAmount', 0),
            'heal_tiers': get_tier_values('HealAmount'),
            'shield': get_starting_value('ShieldApplyAmount', 0),
            'shield_tiers': get_tier_values('ShieldApplyAmount'),
            'ammo': get_starting_value('AmmoMax', 0),
            'ammo_tiers': get_tier_values('AmmoMax'),
            'crit': get_starting_value('CritChance', 0),
            'crit_tiers': get_tier_values('CritChance'),
            'multicast': get_starting_value('Multicast', 0),
            'multicast_tiers': get_tier_values('Multicast'),
            'burn': get_starting_value('BurnApplyAmount', 0),
            'burn_tiers': get_tier_values('BurnApplyAmount'),
            'poison': get_starting_value('PoisonApplyAmount', 0),
            'poison_tiers': get_tier_values('PoisonApplyAmount'),
            'regen': get_starting_value('RegenApplyAmount', 0),
            'regen_tiers': get_tier_values('RegenApplyAmount'),
            'lifesteal': get_starting_value('Lifesteal', 0),
            'lifesteal_tiers': get_tier_values('Lifesteal'),
            'buy_price': self.price_data.get(item.get('Id', ''), {}).get(starting_tier, {}).get('BuyPrice', get_starting_value('BuyPrice', 0)),
            'sell_price': self.price_data.get(item.get('Id', ''), {}).get(starting_tier, {}).get('SellPrice', get_starting_value('SellPrice', 0)),
            'buy_price_tiers': self.format_multi_tier_value([self.price_data.get(item.get('Id', ''), {}).get(t, {}).get('BuyPrice', item.get('Tiers', {}).get(t, {}).get('Attributes', {}).get('BuyPrice', 0)) for t in available_tiers]),
            'sell_price_tiers': self.format_multi_tier_value([self.price_data.get(item.get('Id', ''), {}).get(t, {}).get('SellPrice', item.get('Tiers', {}).get(t, {}).get('Attributes', {}).get('SellPrice', 0)) for t in available_tiers]),
            'attributes': self.build_attribute_catalog(merged_attrs, available_tiers),
            'tier_details': self.build_tier_details(item, available_tiers),
            'abilities_detail': abilities_detail,
            'auras_detail': auras_detail,
            'skills': skills,
            'skills_passive': skills_passive,
            'quests': quests_resolved,
            'enchantments': enchants_resolved,
            'enchantments_detail': enchantments_detail
        }
    
    def extract(self) -> list:
        """执行提取"""
        print("=" * 70)
        print("The Bazaar 物品数据提取工具")
        print("=" * 70)
        
        # 自动检测路径
        self.auto_detect_paths()
        
        if not self.game_dir and not self.cache_dir:
            print("\n[错误] 请指定游戏目录或缓存目录")
            print("       使用 --help 查看帮助")
            return []
        
        # 加载翻译
        print("\n[1/3] 加载翻译数据...")
        trans_file = self.find_translation_file()
        self.load_translations(trans_file)
        
        # 加载卡牌
        print("\n[2/3] 加载卡牌数据...")
        cards_file = self.find_cards_file()
        self.load_cards(cards_file)
        self.load_price_data()
        
        # 处理数据
        print("\n[3/3] 处理物品数据...")
        results = []
        for item in self.items:
            # 跳过 DEBUG 物品
            internal_name = item.get('InternalName', '')
            if internal_name.startswith('[DEBUG]') or internal_name.startswith('DEBUG'):
                continue
            
            result = self.process_item(item)
            results.append(result)
        
        print(f"      处理完成: {len(results)} 个物品")
        return results
    
    def export_json(self, results: list, filename: str = None):
        """导出为 JSON"""
        if not filename:
            filename = f"items_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        self.output_dir.mkdir(parents=True, exist_ok=True)
        output_path = self.output_dir / filename
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        
        print(f"[导出] JSON: {output_path}")
        return output_path
    
    def export_csv(self, results: list, filename: str = None):
        """导出为 CSV"""
        if not filename:
            filename = f"items_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        
        self.output_dir.mkdir(parents=True, exist_ok=True)
        output_path = self.output_dir / filename
        
        with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.writer(f)
            
            # 表头
            headers = [
                'ID', '英文名', '中文名', '类型', '尺寸', '初始等级', '可用等级', 
                '英雄', '标签', '效果类型(HiddenTags)', 
                '冷却(s)', '冷却(各级)', 
                '伤害', '伤害(各级)', 
                '治疗', '治疗(各级)', 
                '护盾', '护盾(各级)',
                '弹药', '弹药(各级)',
                '暴击', '暴击(各级)',
                '多重', '多重(各级)',
                '灼烧', '灼烧(各级)',
                '剧毒', '剧毒(各级)',
                '再生', '再生(各级)',
                '吸血', '吸血(各级)',
                '购买价格', '购买价格(各级)', '出售价格', '出售价格(各级)',
                '技能(主动+被动)', '任务(目标|奖励)'
            ]
            for enc in ENCHANT_ORDER:
                headers.append(f'{enc}({ENCHANT_CN.get(enc, enc)})')
            writer.writerow(headers)
            
            # 数据行
            for item in results:
                row = [
                    item['id'], item['name_en'], item['name_cn'],
                    item['type'], item['size'], item['starting_tier'], item['available_tiers'],
                    self.format_term_entries(item['heroes']), self.format_term_entries(item['tags']), self.format_term_entries(item['hidden_tags']),
                    item['cooldown'], item.get('cooldown_tiers', ''),
                    item['damage'], item.get('damage_tiers', ''),
                    item['heal'], item.get('heal_tiers', ''),
                    item['shield'], item.get('shield_tiers', ''),
                    item.get('ammo', 0), item.get('ammo_tiers', ''),
                    item.get('crit', 0), item.get('crit_tiers', ''),
                    item.get('multicast', 0), item.get('multicast_tiers', ''),
                    item.get('burn', 0), item.get('burn_tiers', ''),
                    item.get('poison', 0), item.get('poison_tiers', ''),
                    item.get('regen', 0), item.get('regen_tiers', ''),
                    item.get('lifesteal', 0), item.get('lifesteal_tiers', ''),
                    item['buy_price'], item.get('buy_price_tiers', ''),
                    item['sell_price'], item.get('sell_price_tiers', '')
                ]
                
                # 技能 (合并主动和被动)
                all_skills = []
                for s in item['skills']:
                    txt = s['cn'] if s['cn'] and s['cn'] != '[未翻译]' else s['en']
                    all_skills.append(f"[主动] {txt}")
                for s in item.get('skills_passive', []):
                    txt = s['cn'] if s['cn'] and s['cn'] != '[未翻译]' else s['en']
                    all_skills.append(f"[被动] {txt}")
                row.append("\n".join(all_skills))
                
                # 任务
                q_data = item.get('quests')
                if q_data:
                    row.append("\n".join([f"目标: {q['cn_target'] or q['en_target']} | 奖励: {q['cn_reward'] or q['en_reward']}" for q in q_data]))
                else:
                    row.append('null')
                
                # 附魔
                for enc in ENCHANT_ORDER:
                    enc_data = item['enchantments'].get(enc, {})
                    row.append(enc_data.get('effect_cn', ''))
                
                writer.writerow(row)
        
        print(f"[导出] CSV:  {output_path}")
        return output_path
    
    def show_sample(self, results: list, count: int = 3):
        """显示示例数据"""
        print("\n" + "=" * 70)
        print(f"示例数据 (前{count}个):")
        print("=" * 70)
        
        for item in results[:count]:
            cn_name = item['name_cn'] if item['name_cn'] else '[未翻译]'
            print(f"\n【{item['name_en']}】-> {cn_name}")
            print(f"  ID: {item['id']}")
            print(f"  等级: {item['starting_tier']} (可用: {item['available_tiers']})")
            print(f"  尺寸: {item['size']}")
            print(f"  英雄: {self.format_term_entries(item['heroes'])}")
            print(f"  标签: {self.format_term_entries(item['tags'])}")
            if item.get('hidden_tags'):
                print(f"  效果类型: {self.format_term_entries(item['hidden_tags'])}")
            
            print(f"  价格: 购买 {item['buy_price']} (各级: {item.get('buy_price_tiers', '')}), 出售 {item['sell_price']}")
            
            unit = "s" if item['cooldown'] and item['cooldown'] < 100 else "ms"
            if item['cooldown']:
                cooldown_tiers = item.get('cooldown_tiers', '')
                print(f"  冷却: {item['cooldown']}{unit}" + (f" (各级: {cooldown_tiers})" if cooldown_tiers and '/' in cooldown_tiers else ''))
            
            print("  主动技能:")
            for i, skill in enumerate(item['skills'], 1):
                if skill['en']:
                    print(f"    {i}. {skill['en']}")
                    if skill['cn'] and skill['cn'] != '[未翻译]':
                        print(f"       -> {skill['cn']}")
            
            if item.get('skills_passive'):
                print("  被动技能:")
                for i, skill in enumerate(item['skills_passive'], 1):
                    print(f"    {i}. {skill['en']}")
                    if skill['cn'] and skill['cn'] != '[未翻译]':
                        print(f"       -> {skill['cn']}")

            if item.get('quests'):
                print("  任务 (Quests):")
                for i, q in enumerate(item['quests'], 1):
                    t = q['cn_target'] or q['en_target']
                    r = q['cn_reward'] or q['en_reward']
                    print(f"    {i}. 目标: {t}")
                    print(f"       奖励: {r}")
            
            if item['enchantments']:
                print(f"  附魔: {len(item['enchantments'])} 个可用")


def main():
    parser = argparse.ArgumentParser(
        description='The Bazaar 物品数据提取工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=r"""
示例:
  python item.py --game "/Users/yourname/Library/Application Support/Steam/steamapps/common/The Bazaar"
  python item.py --game "/Users/yourname/Library/Application Support/Steam/steamapps/common/The Bazaar/TheBazaar.app" --cache "/Users/yourname/Library/Application Support/com.TempoStorm.TheBazaar/prod/cache"
  python item.py  # 自动检测 Windows / macOS 路径

输出:
  默认输出到当前目录，生成 JSON 和 CSV 两种格式
        """
    )
    
    parser.add_argument('-g', '--game', type=str, help='游戏安装目录 (包含 TheBazaar.exe)')
    parser.add_argument('-c', '--cache', type=str, help='缓存目录 (通常在 AppData\\LocalLow\\Tempo Storm\\The Bazaar\\prod\\cache)')
    parser.add_argument('-o', '--output', type=str, help='输出目录 (默认: 当前目录)')
    parser.add_argument('--json', type=str, help='JSON 输出文件名')
    parser.add_argument('--csv', type=str, help='CSV 输出文件名')
    parser.add_argument('--no-sample', action='store_true', help='不显示示例数据')
    
    args = parser.parse_args()
    
    # 未传入时交给自动检测逻辑处理
    game_dir = os.path.expandvars(args.game) if args.game else None
    cache_dir = os.path.expandvars(args.cache) if args.cache else None
    output_dir = os.path.expandvars(args.output) if args.output else "."
    
    # 创建提取器
    extractor = ItemExtractor(
        game_dir=game_dir,
        cache_dir=cache_dir,
        output_dir=output_dir
    )
    
    # 执行提取
    results = extractor.extract()
    
    if not results:
        print("\n[错误] 没有提取到任何物品数据")
        return 1
    
    # 导出
    print("\n" + "=" * 70)
    print("导出数据...")
    print("=" * 70)
    
    extractor.export_json(results, args.json)
    extractor.export_csv(results, args.csv)
    
    # 显示示例
    if not args.no_sample:
        extractor.show_sample(results)
    
    print("\n" + "=" * 70)
    print("完成！")
    print("=" * 70)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
