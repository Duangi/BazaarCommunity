import { Fragment } from 'react'

// 关键词颜色映射
export const KEYWORD_COLORS: Record<string, string> = {
  "弹药": "#ff8e00",
  "灼烧": "#ff9f45",
  "充能": "#00ecc3",
  "冷却": "#00ecc3",
  "暴击": "#f5503d",
  "伤害": "#f5503d",
  "金币": "#ffd700",
  "治疗": "#8eea31",
  "生命值": "#8eea31",
  "最大生命值": "#8eea31",
  "收入": "#ffcd19",
  "吸血": "#9d4a6f",
  "剧毒": "#0ebe4f",
  "生命再生": "#8eea31",
  "护盾": "#f4cf20",
  "减速": "#cb9f6e",
  "价值": "#ffcd19",
  "冻结": "#00ccff",
  "加速": "#00ecc3"
}

// 附魔颜色映射
export const ENCHANT_COLORS: Record<string, string> = {
  "黄金": "var(--c-gold)",
  "沉重": "var(--c-slow)",
  "寒冰": "var(--c-freeze)",
  "疾速": "var(--c-haste)",
  "护盾": "var(--c-shield)",
  "回复": "var(--c-heal)",
  "毒素": "var(--c-poison)",
  "炽焰": "var(--c-burn)",
  "闪亮": "#98a8fe",
  "致命": "var(--c-damage)",
  "辉耀": "#98a8fe",
  "黑曜石": "#9d4a6f"
}

// 渲染文本，高亮关键词和数值序列
export const renderText = (text: any) => {
  if (!text) return null
  
  let content = ""
  if (typeof text === 'string') {
    content = text
  } else if (text.cn) {
    content = text.cn
  } else if (text.en) {
    content = text.en
  } else {
    return null
  }
  
  // 1. 处理数值序列如 3/6/9/12
  const parts = content.split(/(\d+(?:\/\d+)+)/g)
  
  return parts.flatMap((part, i) => { // 使用 flatMap 替代 map
    if (part.includes('/')) {
      const nums = part.split('/')
      return (
        <span key={i} style={{ fontWeight: 'bold' }}>
          {nums.map((n, idx) => {
            let colorIdx = idx
            if (nums.length === 2) colorIdx = idx + 2
            else if (nums.length === 3) colorIdx = idx + 1
            
            const tierColors = ['#cd7f32', '#c0c0c0', '#ffd700', '#b9f2ff']
            const color = tierColors[colorIdx] || '#ffd700'
            
            return (
              <Fragment key={idx}>
                <span style={{ color }}>{n}</span>
                {idx < nums.length - 1 && '/'}
              </Fragment>
            )
          })}
        </span>
      )
    }
    
    // 2. 高亮关键词
    const keywords = Object.keys(KEYWORD_COLORS)
    const regex = new RegExp(`(${keywords.join('|')})`, 'g')
    const subParts = part.split(regex)
    
    return subParts.map((sub, j) => {
      if (KEYWORD_COLORS[sub]) {
        return <span key={j} style={{ color: KEYWORD_COLORS[sub], fontWeight: 'bold' }}>{sub}</span>
      }
      return sub
    })
  })
}
