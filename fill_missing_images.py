#!/usr/bin/env python3
"""
交互式补图脚本：
1) 扫描 public/items_db.json 与 public/skills_db.json
2) 找出缺失图片项
3) 控制台逐条提示输入图片 URL
4) 下载并按项目规则保存为 webp

依赖：
  pip install requests pillow
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path
from typing import Dict, List

import requests
from PIL import Image


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
ITEMS_DB = PUBLIC / "items_db.json"
SKILLS_DB = PUBLIC / "skills_db.json"
CARD_DIR = PUBLIC / "images" / "card"
SKILL_DIR = PUBLIC / "images" / "skill"


def load_json(path: Path):
  with path.open("r", encoding="utf-8") as file:
    return json.load(file)


def normalize_skill_key(skill: Dict) -> str:
  art_key = skill.get("art_key") or ""
  if art_key:
    return Path(art_key).name.replace(".png", "").replace(".PNG", "")
  return skill["id"]


def collect_missing() -> List[Dict]:
  CARD_DIR.mkdir(parents=True, exist_ok=True)
  SKILL_DIR.mkdir(parents=True, exist_ok=True)

  missing: List[Dict] = []
  items = load_json(ITEMS_DB)
  skills = load_json(SKILLS_DB)

  for item in items:
    item_id = item["id"]
    target = CARD_DIR / f"{item_id}.webp"
    if not target.exists():
      missing.append(
        {
          "kind": "物品",
          "id": item_id,
          "name_cn": item.get("name_cn") or item.get("name_en") or "",
          "target": target,
        }
      )

  for skill in skills:
    key = normalize_skill_key(skill)
    target = SKILL_DIR / f"{key}.webp"
    if not target.exists():
      missing.append(
        {
          "kind": "技能",
          "id": skill["id"],
          "name_cn": skill.get("name_cn") or skill.get("name_en") or "",
          "target": target,
        }
      )

  return missing


def download_to_webp(url: str, output_path: Path) -> None:
  response = requests.get(url, timeout=30)
  response.raise_for_status()

  image = Image.open(io.BytesIO(response.content))
  if image.mode not in ("RGB", "RGBA"):
    image = image.convert("RGBA")

  output_path.parent.mkdir(parents=True, exist_ok=True)
  image.save(output_path, format="WEBP", quality=80, method=6)


def ask_and_fill(missing: List[Dict]) -> None:
  if not missing:
    print("没有缺失图片，已全部存在。")
    return

  print(f"共找到 {len(missing)} 条缺失图片。")
  print("输入规则：")
  print("- 输入图片链接并回车：下载并保存")
  print("- 直接回车：跳过当前")
  print("- 输入 q：立即退出")
  print("")

  saved = 0
  skipped = 0

  for index, record in enumerate(missing, start=1):
    title = f"[{index}/{len(missing)}] {record['kind']} | {record['id']} | {record['name_cn']}"
    print(title)
    print(f"目标文件: {record['target'].relative_to(ROOT)}")

    while True:
      user_input = input("请输入图片链接: ").strip()
      if user_input.lower() == "q":
        print("用户终止。")
        print(f"已保存 {saved} 条，跳过 {skipped} 条。")
        return
      if user_input == "":
        skipped += 1
        print("已跳过。\n")
        break

      try:
        download_to_webp(user_input, record["target"])
        saved += 1
        print(f"已保存: {record['target'].name}\n")
        break
      except Exception as error:
        print(f"下载失败: {error}")
        print("请重试、换链接，或直接回车跳过。")

  print(f"处理完成。已保存 {saved} 条，跳过 {skipped} 条。")


def main() -> int:
  for required in [ITEMS_DB, SKILLS_DB]:
    if not required.exists():
      print(f"缺少文件: {required}")
      return 1

  missing = collect_missing()
  ask_and_fill(missing)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
