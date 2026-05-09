# -*- coding: utf-8 -*-
r"""
The Bazaar 技能数据提取工具 (增强版)
自动从游戏目录和缓存目录提取所有技能信息，解析占位符并关联输出

使用方法:
    python skill_extractor.py --game "D:\游戏\The Bazaar" --cache "C:\Users\用户\AppData\LocalLow\Tempo Storm\The Bazaar\prod\cache"
    python skill_extractor.py -g "D:\游戏\The Bazaar" -c "C:\Users\用户\AppData\LocalLow\Tempo Storm\The Bazaar\prod\cache"
    python skill_extractor.py  # 使用默认路径
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
SIZE_CN = {"Small": "Small / 小型", "Medium": "Medium / 中型", "Large": "Large / 大型"}
TIER_CN = {
    "Bronze": "Bronze / 青铜", "Silver": "Silver / 白银", 
    "Gold": "Gold / 黄金", "Diamond": "Diamond / 钻石", 
    "Legendary": "Legendary / 传奇"
}
HERO_CN = {
    "Common": "Common / 通用", "Pygmalien": "Pygmalien / 皮格马利翁", 
    "Vanessa": "Vanessa / 凡妮莎", "Dooley": "Dooley / 杜利", 
    "Mak": "Mak / 马克", "Jules": "Jules / 朱尔斯", 
    "Stelle": "Stelle / 斯黛拉"
}
TAG_CN = {
    "Weapon": "Weapon / 武器", "Tool": "Tool / 工具", "Property": "Property / 地产",
    "Aquatic": "Aquatic / 水生", "Vehicle": "Vehicle / 载具", "Tech": "Tech / 科技",
    "Food": "Food / 食物", "Friend": "Friend / 伙伴", "Dinosaur": "Dinosaur / 恐龙",
    "Loot": "Loot / 战利品", "Relic": "Relic / 神器", "Apparel": "Apparel / 服饰",
    "Dragon": "Dragon / 龙", "Toy": "Toy / 玩具", "Potion": "Potion / 药水",
    "Core": "Core / 核心", "Ray": "Ray / 射线", "Reagent": "Reagent / 试剂",
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
    'CritReference': 'CritRef / 暴击引用',
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
    'Joy': 'Joy / 快乐',
    'JoyReference': 'JoyRef / 快乐引用',
    'Gold': 'Gold / 金币',
    'Health': 'Health / 生命值',
    'HealthReference': 'HealthRef / 生命值引用',
    'FlyingReference': 'FlyingRef / 飞行引用',
}

# 生成资格翻译
SPAWNING_CN = {
    'Always': 'Always / 总是',
    'Never': 'Never / 从不',
    'OnlyInPvE': 'OnlyInPvE / 仅PvE',
    'OnlyInPvP': 'OnlyInPvP / 仅PvP',
}

PRIORITY_CN = {
    'Immediate': 'Immediate / 立即',
    'Highest': 'Highest / 最高',
    'High': 'High / 高',
    'Medium': 'Medium / 中',
    'Low': 'Low / 低',
    'Lowest': 'Lowest / 最低',
}

TRIGGER_CN = {
    'TTriggerOnCardFired': '物品触发时',
    'TTriggerOnItemUsed': '物品使用时',
    'TTriggerOnBeforeItemUsed': '物品使用前',
    'TTriggerOnCardSelected': '卡牌被选中时',
    'TTriggerOnCardPurchased': '卡牌购买时',
    'TTriggerOnCardSold': '卡牌出售时',
    'TTriggerOnCardUpgraded': '卡牌升级时',
    'TTriggerOnCardTransformed': '卡牌转化时',
    'TTriggerOnCardCritted': '暴击时',
    'TTriggerOnCardPerformedDamage': '造成伤害时',
    'TTriggerOnCardPerformedHeal': '治疗时',
    'TTriggerOnCardPerformedOverHeal': '过量治疗时',
    'TTriggerOnCardPerformedShield': '施加护盾时',
    'TTriggerOnCardPerformedBurn': '施加灼烧时',
    'TTriggerOnCardPerformedPoison': '施加剧毒时',
    'TTriggerOnCardPerformedRegen': '施加再生时',
    'TTriggerOnCardPerformedSlow': '施加减速时',
    'TTriggerOnCardPerformedFreeze': '施加冻结时',
    'TTriggerOnCardPerformedHaste': '施加加速时',
    'TTriggerOnCardPerformedReload': '装弹时',
    'TTriggerOnCardPerformedDestruction': '摧毁卡牌时',
    'TTriggerOnCardStartedFlying': '开始飞行时',
    'TTriggerOnCardStoppedFlying': '停止飞行时',
    'TTriggerOnCardDisabled': '卡牌被禁用时',
    'TTriggerOnCardAttributeChanged': '属性变化时',
    'TTriggerOnBeforeCardDestroyed': '卡牌被摧毁前',
    'TTriggerOnFightStarted': '战斗开始时',
    'TTriggerOnFightEnded': '战斗结束时',
    'TTriggerOnDayStarted': '回合开始时',
    'TTriggerOnHourStarted': '小时开始时',
    'TTriggerOnPlayerAttributeChanged': '玩家属性变化时',
    'TTriggerOnPlayerDied': '玩家死亡时',
    'TTriggerOnPlayerEnraged': '玩家狂暴时',
    'TTriggerOnPlayerEnrageEnded': '玩家狂暴结束时',
    'TTriggerOnSandstorm': '沙暴时',
    'TTriggerOnEncounterEntered': '进入遭遇时',
    'TTriggerOnEncounterExited': '离开遭遇时',
    'TTriggerOnEncounterSelected': '选择遭遇时',
    'TTriggerOnEncounterCardsDealt': '遭遇发牌时',
    'TTriggerOr': '多条件触发(或)',
}

ACTION_CN = {
    'TActionPlayerDamage': '对玩家造成伤害',
    'TActionPlayerHeal': '治疗玩家',
    'TActionPlayerShieldApply': '为玩家施加护盾',
    'TActionPlayerBurnApply': '对玩家施加灼烧',
    'TActionPlayerBurnRemove': '移除玩家灼烧',
    'TActionPlayerPoisonApply': '对玩家施加剧毒',
    'TActionPlayerPoisonRemove': '移除玩家剧毒',
    'TActionPlayerRegenApply': '为玩家施加再生',
    'TActionPlayerRageApply': '使玩家狂暴',
    'TActionPlayerReviveHeal': '复活治疗',
    'TActionPlayerModifyAttribute': '修改玩家属性',
    'TActionPlayerPortraitNext': '切换玩家头像',
    'TActionPlayerPortraitReset': '重置玩家头像',
    'TActionCardDamage': '对卡牌造成伤害',
    'TActionCardHeal': '治疗卡牌',
    'TActionCardShieldApply': '为卡牌施加护盾',
    'TActionCardSlow': '减速卡牌',
    'TActionCardFreeze': '冻结卡牌',
    'TActionCardHaste': '加速卡牌',
    'TActionCardCharge': '充能卡牌',
    'TActionCardReload': '装弹',
    'TActionCardRepair': '修复卡牌',
    'TActionCardDestroy': '摧毁卡牌',
    'TActionCardDisable': '禁用卡牌',
    'TActionCardFlyingStart': '使卡牌飞行',
    'TActionCardFlyingStop': '停止飞行',
    'TActionCardFlyingToggle': '切换飞行',
    'TActionCardForceUse': '强制使用卡牌',
    'TActionCardModifyAttribute': '修改卡牌属性',
    'TActionCardUpgrade': '升级卡牌',
    'TActionCardTransform': '转化卡牌',
    'TActionCardTransformDestroyed': '转化被摧毁的卡牌',
    'TActionCardEnchant': '附魔卡牌',
    'TActionCardEnchantRandom': '随机附魔',
    'TActionCardEnchantRemove': '移除附魔',
    'TActionCardAddTagsBySource': '添加标签(来源)',
    'TActionCardAddTagsList': '添加标签(列表)',
    'TActionCardAddTagsRandom': '随机添加标签',
    'TActionCardBeginSandstorm': '触发沙暴',
    'TActionCardBurnApply': '对卡牌施加灼烧',
    'TActionCardPoisonApply': '对卡牌施加剧毒',
    'TActionGameSpawnCards': '生成卡牌',
    'TActionGameDealCards': '发牌',
    'TActionAnd': '多重行动',
    'TActionExitReplacementSet': '退出替换集',
}

ACTIVE_IN_CN = {
    'HandOnly': 'HandOnly / 仅手牌',
    'HandAndStash': 'HandAndStash / 手牌和仓库',
}

WORKS_IN_CN = {
    'Anywhere': 'Anywhere / 任何场景',
    'CombatOnly': 'CombatOnly / 仅战斗',
    'OutOfCombatOnly': 'OutOfCombatOnly / 仅非战斗',
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
    'TAuraActionCardModifyAttribute': None,  # 需要特殊处理
}

# 需要毫秒转秒的属性（GameData.db 原始值为 ms）
MS_TO_SEC_ATTRS = {
    'CooldownMax',
    'ChargeAmount',
    'ChargeMax',
    'SlowAmount',
    'FreezeAmount',
    'HasteAmount',
    'FlyingDuration',
    'DisableDuration',
}


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


class SkillExtractor:
    """技能数据提取器"""
    
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
        self.skills = []

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
            cache_db = self.cache_dir / 'GameData.db'
            cache_cards = self.cache_dir / 'cards.json'
            if cache_db.exists():
                candidates.append(('缓存(db)', cache_db))
            if cache_cards.exists():
                candidates.append(('缓存', cache_cards))
        
        # 从游戏目录查找
        if self.game_dir:
            streaming_assets = self.resolve_streaming_assets_dir()
            if streaming_assets:
                game_db = streaming_assets / 'GameData.db'
                v2_cards = streaming_assets / 'v2_Cards.json'
                cards = streaming_assets / 'cards.json'
            else:
                game_db = None
                v2_cards = None
                cards = None
            
            if game_db and game_db.exists():
                candidates.append(('游戏(db)', game_db))
            if v2_cards and v2_cards.exists():
                candidates.append(('游戏(v2)', v2_cards))
            if cards and cards.exists():
                candidates.append(('游戏', cards))
        
        if not candidates:
            raise FileNotFoundError("无法找到卡牌数据文件 (GameData.db / cards.json / v2_Cards.json)")
        
        # 优先级：缓存/游戏 db > 游戏(v2) > 游戏(cards) > 缓存(cards)
        # 说明：当前项目以 GameData.db 为唯一真源；json 仅作为兜底回退。
        priority = {'缓存(db)': 5, '游戏(db)': 4, '游戏(v2)': 3, '游戏': 2, '缓存': 1}
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
    
    def load_cards(self, cards_file: Path):
        """加载卡牌数据"""
        if cards_file.suffix.lower() == '.db':
            conn = sqlite3.connect(str(cards_file))
            cursor = conn.cursor()
            cursor.execute("SELECT Data FROM cards")
            rows = cursor.fetchall()
            conn.close()
            self.cards_data = []
            for (data_raw,) in rows:
                if not data_raw:
                    continue
                if isinstance(data_raw, (bytes, bytearray)):
                    data_text = data_raw.decode('utf-8', errors='ignore')
                else:
                    data_text = str(data_raw)
                try:
                    card = json.loads(data_text)
                except Exception:
                    continue
                if isinstance(card, dict):
                    self.cards_data.append(card)
        else:
            with open(cards_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            # 处理不同的数据格式
            if isinstance(data, list):
                # v2_Cards.json 格式
                self.cards_data = data
            elif isinstance(data, dict):
                # cards.json 缓存格式
                self.cards_data = []
                for v in data.values():
                    if isinstance(v, list):
                        self.cards_data.extend(v)
                    else:
                        self.cards_data.append(v)
        
        # 过滤出技能
        self.skills = [c for c in self.cards_data if c.get('Type') == 'Skill']
        print(f"      已加载 {len(self.cards_data)} 张卡牌，其中 {len(self.skills)} 个技能")
    
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
    def get_skill_tiers(skill_data: dict) -> list:
        """获取技能拥有的等级列表"""
        tiers = skill_data.get('Tiers', {})
        return [t for t in TIER_ORDER if t in tiers]
    
    @staticmethod
    def get_merged_attributes(skill_data: dict) -> tuple:
        """获取所有等级的合并属性"""
        tiers = skill_data.get('Tiers', {})
        available_tiers = SkillExtractor.get_skill_tiers(skill_data)
        
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
            valid_values = [v / 1000 if isinstance(v, (int, float)) else v for v in valid_values]
        
        formatted = [SkillExtractor.format_value(v) for v in valid_values]
        
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
            return SkillExtractor.extract_value_from_data(mod_value_data, merged_attrs, available_tiers)
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

    def build_tier_details(self, skill_data: dict, available_tiers: list) -> list:
        """导出每个 tier 的结构化信息"""
        tiers_data = skill_data.get('Tiers', {})
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
    
    def resolve_skill_placeholders(self, text: str, skill_data: dict) -> str:
        """解析技能描述中的占位符"""
        if not text:
            return text
        
        result = text
        merged_attrs, available_tiers = self.get_merged_attributes(skill_data)
        
        # 如果没有 Tiers 数据，使用单一等级模式
        if not available_tiers:
            available_tiers = ['Single']
        
        abilities = skill_data.get('Abilities', {})
        auras = skill_data.get('Auras', {})
        
        # 解析 ability 占位符
        for ability_id, ability in abilities.items():
            action = ability.get('Action', {})
            action_type = action.get('$type', '')
            value_data = action.get('Value', {})
            
            values = None
            
            if isinstance(value_data, dict) and value_data:
                values = self.extract_value_from_data(value_data, merged_attrs, available_tiers)
            
            if values is None:
                attr_name = self.get_action_attr_name(action_type, action)
                if attr_name and attr_name in merged_attrs:
                    values = merged_attrs[attr_name]
            
            if values:
                attr_name = self.get_action_attr_name(action_type, action)
                is_ms = attr_name in MS_TO_SEC_ATTRS if attr_name else False
                value_str = self.format_multi_tier_value(values, is_ms)
                if value_str:
                    result = result.replace(f'{{ability.{ability_id}}}', value_str)
            
            # 处理修饰符
            if isinstance(value_data, dict) and value_data:
                mod_values = self.extract_modifier_value(value_data, merged_attrs, available_tiers)
                if mod_values:
                    mod_str = self.format_multi_tier_value(mod_values)
                    if mod_str:
                        result = result.replace(f'{{ability.{ability_id}.mod}}', mod_str)
                        result = result.replace(f'{{ability.{ability_id}.mod|%}}', mod_str + '%')
            
            # 处理 targets
            target_count = action.get('TargetCount', {})
            if isinstance(target_count, dict) and target_count:
                target_values = self.extract_value_from_data(target_count, merged_attrs, available_tiers)
                if target_values:
                    target_str = self.format_multi_tier_value(target_values)
                    if target_str:
                        result = result.replace(f'{{ability.{ability_id}.targets}}', target_str)
        
        # 解析 aura 占位符
        for aura_id, aura in auras.items():
            action = aura.get('Action', {})
            action_type = action.get('$type', '')
            value_data = action.get('Value', {})
            
            if isinstance(value_data, dict):
                values = self.extract_value_from_data(value_data, merged_attrs, available_tiers)
                if values:
                    value_str = self.format_multi_tier_value(values)
                    if value_str:
                        result = result.replace(f'{{aura.{aura_id}}}', value_str)
                
                mod_values = self.extract_modifier_value(value_data, merged_attrs, available_tiers)
                if mod_values:
                    mod_str = self.format_multi_tier_value(mod_values)
                    if mod_str:
                        result = result.replace(f'{{aura.{aura_id}.mod}}', mod_str)
                        result = result.replace(f'{{aura.{aura_id}.mod|%}}', mod_str + '%')
        
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
        
        # 通用占位符 {i}
        if 'Custom_0' in merged_attrs:
            value_str = self.format_multi_tier_value(merged_attrs['Custom_0'])
            if value_str:
                result = result.replace('{i}', value_str)
                result = result.replace('{i-%}', value_str + '%')
        
        # 移除未解析的内部标识符 [{aura.x}], [{ability.x}] 等
        import re
        # 移除 [{ ... }] 格式的内部标识符（包括方括号）
        result = re.sub(r'\s*\[\{[^}]+\}\]', '', result)
        # 移除单独的 { ... } 格式的未解析占位符
        result = re.sub(r'\{(aura|ability)\.[^}]+\}', '', result)
        
        return result
    
    def _extract_effects_detail(self, card_data: dict, field_name: str, kind: str, merged_attrs: dict, available_tiers: list) -> list:
        """提取 Ability / Aura 的结构化详情"""
        effect_map = card_data.get(field_name, {})
        if not isinstance(effect_map, dict):
            return []

        result = []
        for effect_id, effect in effect_map.items():
            if not isinstance(effect, dict):
                continue

            trigger = effect.get('Trigger', {})
            trigger_type = trigger.get('$type', '') if isinstance(trigger, dict) else ''
            action = effect.get('Action', {})
            action_type = action.get('$type', '') if isinstance(action, dict) else ''
            priority = effect.get('Priority', '')
            active_in = effect.get('ActiveIn', '')
            works_in = effect.get('WorksIn', '')

            target_count = None
            if isinstance(action, dict) and isinstance(action.get('TargetCount'), dict):
                target_count = self.extract_value_from_data(action.get('TargetCount'), merged_attrs, available_tiers)

            entry = {
                'id': effect_id,
                'kind': kind,
                'name': effect.get('InternalName', ''),
                'description_en': effect.get('InternalDescription', ''),
                'description_cn': self.get_translation(effect.get('InternalDescription', '')) if effect.get('InternalDescription') else '',
                'priority': priority,
                'priority_cn': PRIORITY_CN.get(priority, priority),
                'trigger': self.summarize_selector(trigger) if isinstance(trigger, dict) else None,
                'trigger_type': trigger_type,
                'trigger_cn': TRIGGER_CN.get(trigger_type, trigger_type),
                'action': {
                    'type': action_type,
                    'type_cn': ACTION_CN.get(action_type, action_type),
                    'attribute_type': self.get_action_attr_name(action_type, action),
                    'operation': action.get('Operation') if isinstance(action, dict) else None,
                    'target': self.summarize_target(action.get('Target')) if isinstance(action, dict) else None,
                    'target_player': self.summarize_target(action.get('TargetPlayer')) if isinstance(action, dict) else None,
                    'target_count': target_count,
                    'value': self.summarize_value_data(action.get('Value'), merged_attrs, available_tiers) if isinstance(action, dict) else None,
                    'duration': self.summarize_selector(action.get('Duration')) if isinstance(action, dict) else None,
                    'enchantment': action.get('Enchantment') if isinstance(action, dict) else None,
                    'spawn_context': self.summarize_selector(action.get('SpawnContext')) if isinstance(action, dict) else None,
                },
                'active_in': active_in,
                'active_in_cn': ACTIVE_IN_CN.get(active_in, active_in),
                'works_in': works_in,
                'works_in_cn': WORKS_IN_CN.get(works_in, works_in),
                'prerequisites': self.summarize_selector(effect.get('Prerequisites'))
            }

            if trigger_type == 'TTriggerOr' and isinstance(trigger, dict):
                sub_triggers = trigger.get('Triggers', [])
                if isinstance(sub_triggers, list):
                    entry['sub_triggers'] = [
                        {
                            'type': st.get('$type', ''),
                            'cn': TRIGGER_CN.get(st.get('$type', ''), st.get('$type', ''))
                        }
                        for st in sub_triggers if isinstance(st, dict)
                    ]

            if action_type == 'TActionAnd' and isinstance(action, dict):
                sub_actions = action.get('Actions', [])
                if isinstance(sub_actions, list):
                    entry['sub_actions'] = [
                        {
                            'type': sa.get('$type', ''),
                            'cn': ACTION_CN.get(sa.get('$type', ''), sa.get('$type', ''))
                        }
                        for sa in sub_actions if isinstance(sa, dict)
                    ]

            result.append(entry)

        return result
    
    def process_skill(self, skill: dict) -> dict:
        """处理单个技能数据"""
        loc = skill.get('Localization', {})
        title_en = loc.get('Title', {}).get('Text', skill.get('InternalName', ''))
        title_cn = self.get_translation(title_en)
        
        starting_tier = skill.get('StartingTier', 'Bronze')
        available_tiers = self.get_skill_tiers(skill)
        tiers_data = skill.get('Tiers', {})
        merged_attrs, merged_tiers = self.get_merged_attributes(skill)
        if not available_tiers:
            available_tiers = merged_tiers or ['Single']
        
        # 获取初始等级的属性
        tier_data = tiers_data.get(starting_tier, {})
        attributes = tier_data.get('Attributes', {})
        
        # 处理技能描述 - 从 Tooltips 字段获取
        tooltips = loc.get('Tooltips', [])
        descriptions = []
        
        for tooltip in tooltips:
            # 支持两种格式：
            # 缓存格式: {'Content': {'Text': '...'}, 'TooltipType': '...'}
            # v2格式: {'Text': '...', 'Key': '...'}
            if isinstance(tooltip, dict):
                content = tooltip.get('Content', {})
                if isinstance(content, dict):
                    text_en = content.get('Text', '')
                else:
                    text_en = tooltip.get('Text', '')
            else:
                text_en = str(tooltip) if tooltip else ''
            
            text_cn = self.get_translation(text_en)
            
            # 解析占位符
            text_en_resolved = self.resolve_skill_placeholders(text_en, skill)
            text_cn_resolved = self.resolve_skill_placeholders(text_cn, skill) if text_cn else ''
            
            descriptions.append({
                'en': text_en_resolved,
                'cn': text_cn_resolved if text_cn_resolved else '[未翻译]' if text_en else ''
            })
        
        # 如果 Tooltips 为空，尝试从 Auras/Abilities 获取描述
        if not descriptions:
            auras = skill.get('Auras', {})
            for aura_id, aura in auras.items():
                aura_desc = aura.get('InternalDescription', '')
                if aura_desc:
                    aura_cn = self.get_translation(aura_desc)
                    desc_en_resolved = self.resolve_skill_placeholders(aura_desc, skill)
                    desc_cn_resolved = self.resolve_skill_placeholders(aura_cn, skill) if aura_cn else ''
                    descriptions.append({
                        'en': desc_en_resolved,
                        'cn': desc_cn_resolved if desc_cn_resolved else '[未翻译]'
                    })
                    break
            
            abilities = skill.get('Abilities', {})
            for ability_id, ability in abilities.items():
                ability_desc = ability.get('InternalDescription', '')
                if ability_desc and not descriptions:
                    ability_cn = self.get_translation(ability_desc)
                    desc_en_resolved = self.resolve_skill_placeholders(ability_desc, skill)
                    desc_cn_resolved = self.resolve_skill_placeholders(ability_cn, skill) if ability_cn else ''
                    descriptions.append({
                        'en': desc_en_resolved,
                        'cn': desc_cn_resolved if desc_cn_resolved else '[未翻译]'
                    })
                    break
        
        # 合并描述为字符串
        desc_en_combined = ' | '.join([d['en'] for d in descriptions if d['en']])
        desc_cn_combined = ' | '.join([d['cn'] for d in descriptions if d['cn']])
        
        return {
            'id': skill.get('Id', ''),
            'name_en': title_en,
            'name_cn': title_cn if title_cn else '',
            'description_en': desc_en_combined,
            'description_cn': desc_cn_combined,
            'size': SIZE_CN.get(skill.get('Size', ''), skill.get('Size', '')),
            'starting_tier': TIER_CN.get(starting_tier, starting_tier),
            'available_tiers': '/'.join(available_tiers) if available_tiers else starting_tier,
            'heroes': self.build_term_entries(skill.get('Heroes', []), HERO_CN),
            'heroes_en': [entry['en'] for entry in self.build_term_entries(skill.get('Heroes', []), HERO_CN)],
            'heroes_cn': [entry['cn'] for entry in self.build_term_entries(skill.get('Heroes', []), HERO_CN) if entry.get('cn')],
            'heroes_raw': skill.get('Heroes', []),
            'tags': self.build_term_entries(skill.get('Tags', []), TAG_CN),
            'tags_en': [entry['en'] for entry in self.build_term_entries(skill.get('Tags', []), TAG_CN)],
            'tags_cn': [entry['cn'] for entry in self.build_term_entries(skill.get('Tags', []), TAG_CN) if entry.get('cn')],
            'tags_raw': skill.get('Tags', []),
            'hidden_tags': self.build_term_entries(skill.get('HiddenTags', []), HIDDEN_TAG_CN),
            'hidden_tags_en': [entry['en'] for entry in self.build_term_entries(skill.get('HiddenTags', []), HIDDEN_TAG_CN)],
            'hidden_tags_cn': [entry['cn'] for entry in self.build_term_entries(skill.get('HiddenTags', []), HIDDEN_TAG_CN) if entry.get('cn')],
            'hidden_tags_raw': skill.get('HiddenTags', []),
            'art_key': skill.get('ArtKey', ''),
            'card_pack_id': skill.get('CardPackId', ''),
            'spawning': SPAWNING_CN.get(skill.get('SpawningEligibility', ''), skill.get('SpawningEligibility', '')),
            'multicast': attributes.get('Multicast', 0),
            'attributes': self.build_attribute_catalog(merged_attrs, available_tiers),
            'tier_details': self.build_tier_details(skill, available_tiers if available_tiers != ['Single'] else []),
            'abilities_detail': self._extract_effects_detail(skill, 'Abilities', 'ability', merged_attrs, available_tiers),
            'auras_detail': self._extract_effects_detail(skill, 'Auras', 'aura', merged_attrs, available_tiers),
            'descriptions': descriptions
        }
    
    def extract(self) -> list:
        """执行提取"""
        print("=" * 70)
        print("The Bazaar 技能数据提取工具 (增强版)")
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
        
        # 处理数据
        print("\n[3/3] 处理技能数据...")
        results = []
        for skill in self.skills:
            # 跳过模板和DEBUG技能
            internal_name = skill.get('InternalName', '')
            if internal_name.startswith('[DEBUG]') or internal_name.startswith('DEBUG'):
                continue
            if '[SKILL TEMPLATE]' in internal_name or 'TEMPLATE' in internal_name:
                continue
            if internal_name.startswith('SkillCard -'):  # 跳过模板类
                continue
            
            result = self.process_skill(skill)
            results.append(result)
        
        print(f"      处理完成: {len(results)} 个技能")
        return results
    
    def export_json(self, results: list, filename: str = None):
        """导出为 JSON"""
        if not filename:
            filename = f"skills_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        self.output_dir.mkdir(parents=True, exist_ok=True)
        output_path = self.output_dir / filename
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        
        print(f"[导出] JSON: {output_path}")
        return output_path
    
    def export_csv(self, results: list, filename: str = None):
        """导出为 CSV"""
        if not filename:
            filename = f"skills_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        
        self.output_dir.mkdir(parents=True, exist_ok=True)
        output_path = self.output_dir / filename
        
        with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.writer(f)
            
            # 表头
            headers = [
                'ID', '英文名', '中文名', '描述(英)', '描述(中)', 
                '尺寸', '初始等级', '可用等级', '英雄', '标签', 
                '效果类型(HiddenTags)', '图标', '卡包ID', '生成资格', '多重施放'
            ]
            writer.writerow(headers)
            
            # 数据行
            for skill in results:
                row = [
                    skill['id'], skill['name_en'], skill['name_cn'],
                    skill['description_en'], skill['description_cn'],
                    skill['size'], skill['starting_tier'], skill['available_tiers'],
                    self.format_term_entries(skill['heroes']), self.format_term_entries(skill['tags']), self.format_term_entries(skill['hidden_tags']),
                    skill['art_key'], skill['card_pack_id'], skill['spawning'],
                    skill['multicast']
                ]
                writer.writerow(row)
        
        print(f"[导出] CSV:  {output_path}")
        return output_path
    
    def show_sample(self, results: list, count: int = 5):
        """显示示例数据"""
        print("\n" + "=" * 70)
        print(f"示例数据 (前{count}个):")
        print("=" * 70)
        
        for skill in results[:count]:
            cn_name = skill['name_cn'] if skill['name_cn'] else '[未翻译]'
            print(f"\n【{skill['name_en']}】-> {cn_name}")
            print(f"  ID: {skill['id']}")
            print(f"  等级: {skill['starting_tier']} (可用: {skill['available_tiers']})")
            print(f"  尺寸: {skill['size']}")
            print(f"  英雄: {self.format_term_entries(skill['heroes'])}")
            if skill.get('tags'):
                print(f"  标签: {self.format_term_entries(skill['tags'])}")
            if skill.get('hidden_tags'):
                print(f"  效果类型: {self.format_term_entries(skill['hidden_tags'])}")
            if skill.get('multicast'):
                print(f"  多重施放: {skill['multicast']}")
            
            print("  描述:")
            print(f"    EN: {skill['description_en']}")
            print(f"    CN: {skill['description_cn']}")


def main():
    parser = argparse.ArgumentParser(
        description='The Bazaar 技能数据提取工具 (增强版)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=r"""
示例:
  python skill.py --game "/Users/yourname/Library/Application Support/Steam/steamapps/common/The Bazaar"
  python skill.py --game "/Users/yourname/Library/Application Support/Steam/steamapps/common/The Bazaar/TheBazaar.app" --cache "/Users/yourname/Library/Application Support/com.TempoStorm.TheBazaar/prod/cache"
  python skill.py  # 自动检测 Windows / macOS 路径

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
    extractor = SkillExtractor(
        game_dir=game_dir,
        cache_dir=cache_dir,
        output_dir=output_dir
    )
    
    # 执行提取
    results = extractor.extract()
    
    if not results:
        print("\n[错误] 没有提取到任何技能数据")
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
