'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import ToolWikiPanel from '@/components/tools/ToolWikiPanel'
import ToolDetailPanel from '@/components/tools/ToolDetailPanel'
import { itemsDbUrl, skillsDbUrl } from '@/lib/cdn'
import { enrichItemsWithResolvedText, loadResolvedTextMap } from '@/lib/itemDataEnhancer'
import JibaoWorkbench from '@/components/lab/JibaoWorkbench'
import styles from './page.module.css'

export default function JibaoLabPage() {
  const [items, setItems] = useState<any[]>([])
  const [skills, setSkills] = useState<any[]>([])
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [itemsRes, skillsRes, rawRes, resolvedTextMap] = await Promise.all([
          fetch(itemsDbUrl()),
          fetch(skillsDbUrl()),
          fetch('/resources/raw_exports/items_export_20260319_092219.json').catch(() => null),
          loadResolvedTextMap(),
        ])
        const [itemsData, skillsData, rawData] = await Promise.all([
          itemsRes.json(),
          skillsRes.json(),
          rawRes ? rawRes.json().catch(() => []) : Promise.resolve([]),
        ])
        if (!mounted) return
        const normalizedItems = enrichItemsWithResolvedText(Array.isArray(itemsData) ? itemsData : [], resolvedTextMap)
        const normalizedSkills = enrichItemsWithResolvedText(Array.isArray(skillsData) ? skillsData : [], resolvedTextMap)

        const rawList = Array.isArray(rawData) ? rawData : []
        const normalizeName = (v: any) =>
          String(v || '')
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[·•\-_.]/g, '')
            .trim()
        const byNameCn = new Map<string, any>()
        const byNameEn = new Map<string, any>()
        for (const r of rawList) {
          const cn = normalizeName(r?.name_cn)
          const en = normalizeName(r?.name_en)
          if (cn && !byNameCn.has(cn)) byNameCn.set(cn, r)
          if (en && !byNameEn.has(en)) byNameEn.set(en, r)
        }

        const mergedItems = normalizedItems.map((it: any) => {
          const cn = normalizeName(it?.name_cn)
          const en = normalizeName(it?.name_en)
          let raw = byNameCn.get(cn) || byNameEn.get(en) || null
          if (!raw) {
            raw =
              rawList.find((r: any) => {
                const rcn = normalizeName(r?.name_cn)
                const ren = normalizeName(r?.name_en)
                return (cn && (rcn.includes(cn) || cn.includes(rcn))) || (en && (ren.includes(en) || en.includes(ren)))
              }) || null
          }
          return raw ? { ...it, __raw: raw } : it
        })

        setItems(mergedItems)
        setSkills(normalizedSkills)
      } catch {
        if (!mounted) return
        setItems([])
        setSkills([])
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={styles.page}>
        <div className={styles.topBar}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>机煲实验室</h1>
            <div className={styles.sub}>拖拽卡牌摆位，计算左右充能效率并给出优化建议</div>
          </div>
          <Link href="/" className={styles.backBtn}>返回首页</Link>
        </div>

        {loading ? (
          <div className={styles.loading}>加载中...</div>
        ) : (
          <div className={styles.layout}>
            <div className={styles.left}>
              <ToolWikiPanel items={items} skills={skills} onSelectItem={setSelectedItem} />
            </div>
            <div className={styles.middle}>
              <JibaoWorkbench onSelectItem={setSelectedItem} itemsPool={items} />
            </div>
            <div className={styles.right}>
              <ToolDetailPanel item={selectedItem} />
            </div>
          </div>
        )}
      </div>
    </DndProvider>
  )
}
