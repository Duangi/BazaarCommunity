'use client'

import { useEffect, useMemo, useState } from 'react'
import RatingTool from '@/components/RatingTool'
import LineupPlanner from '@/components/LineupPlanner'
import styles from './ToolFunctionPanel.module.css'
import { loadToolDraftsFromDb, saveToolDraftsToDb } from '@/lib/draftDb'

interface ToolFunctionPanelProps {
  onSelectItem: (item: any) => void
  activeView: 'rating' | 'lineup'
  onChangeView: (view: 'rating' | 'lineup') => void
  profileName: string
  requireLoginToPublish?: boolean
  onPublish: (mode: 'lineup' | 'rating', snapshot: any, season: number) => Promise<boolean>
  seasonOptions: number[]
  selectedSeason: number
  onChangeSeason: (season: number) => void
}

type DraftItem = {
  id: string
  name: string
  mode: 'rating' | 'lineup'
  createdAt: number
  payload: any
}

export default function ToolFunctionPanel({
  onSelectItem,
  activeView,
  onChangeView,
  profileName,
  requireLoginToPublish = false,
  onPublish,
  seasonOptions,
  selectedSeason,
  onChangeSeason,
}: ToolFunctionPanelProps) {
  const [draftApi, setDraftApi] = useState<{
    getSnapshot: () => any
    applySnapshot: (payload: any) => void
    getContextLabel?: () => string
  } | null>(null)
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string>('')
  const [draftsHydrated, setDraftsHydrated] = useState(false)
  const [toast, setToast] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)
  const [publishing, setPublishing] = useState(false)

  const persistDrafts = (nextDrafts: DraftItem[]) => {
    try {
      localStorage.setItem('tool_drafts_v1', JSON.stringify(nextDrafts))
    } catch {}
    saveToolDraftsToDb(nextDrafts)
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const dbDrafts = await loadToolDraftsFromDb<DraftItem[]>()
      if (mounted && Array.isArray(dbDrafts)) {
        setDrafts(dbDrafts)
        setDraftsHydrated(true)
        return
      }

      // fallback + migration from localStorage
      try {
        const saved = localStorage.getItem('tool_drafts_v1')
        if (!saved) return
        const parsed = JSON.parse(saved)
        if (mounted && Array.isArray(parsed)) {
          setDrafts(parsed)
          saveToolDraftsToDb(parsed)
          setDraftsHydrated(true)
          return
        }
      } catch {}
      if (mounted) setDraftsHydrated(true)
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!draftsHydrated) return
    persistDrafts(drafts)
  }, [drafts, draftsHydrated])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1400)
    return () => window.clearTimeout(t)
  }, [toast])

  const filteredDrafts = useMemo(
    () => drafts.filter((d) => d.mode === activeView).sort((a, b) => b.createdAt - a.createdAt),
    [drafts, activeView]
  )

  const saveDraft = () => {
    if (!draftApi) {
      setToast({ text: '当前模式尚未就绪，稍后再试。', tone: 'error' })
      return
    }
    const now = new Date()
    const timeName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const context = draftApi.getContextLabel?.()
    const item: DraftItem = {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${timeName}${context ? ` · ${context}` : ''}`,
      mode: activeView,
      createdAt: Date.now(),
      payload: draftApi.getSnapshot(),
    }
    setDrafts((prev) => {
      const next = [item, ...prev]
      persistDrafts(next)
      return next
    })
    setSelectedDraftId(item.id)
    setToast({ text: '草稿已保存。', tone: 'success' })
  }

  const applyDraft = () => {
    const target = drafts.find((d) => d.id === selectedDraftId && d.mode === activeView)
    if (!target || !draftApi) {
      setToast({ text: '请先选择可用草稿。', tone: 'error' })
      return
    }
    draftApi.applySnapshot(target.payload)
    setToast({ text: '草稿已应用。', tone: 'success' })
  }

  const renameDraft = () => {
    const target = drafts.find((d) => d.id === selectedDraftId && d.mode === activeView)
    if (!target) return
    const next = window.prompt('重命名草稿', target.name)
    if (!next?.trim()) return
    setDrafts((prev) => {
      const nextDrafts = prev.map((d) => (d.id === target.id ? { ...d, name: next.trim() } : d))
      persistDrafts(nextDrafts)
      return nextDrafts
    })
  }

  const deleteDraft = () => {
    const target = drafts.find((d) => d.id === selectedDraftId && d.mode === activeView)
    if (!target) {
      setToast({ text: '请先选择要删除的草稿。', tone: 'error' })
      return
    }
    const ok = window.confirm(`确认删除草稿“${target.name}”？此操作不可恢复。`)
    if (!ok) return
    setDrafts((prev) => {
      const nextDrafts = prev.filter((d) => d.id !== target.id)
      persistDrafts(nextDrafts)
      return nextDrafts
    })
    setSelectedDraftId('')
    setToast({ text: '草稿已删除。', tone: 'success' })
  }

  const publishCurrent = async () => {
    if (!draftApi) {
      setToast({ text: '当前模式尚未就绪，稍后再试。', tone: 'error' })
      return
    }
    setPublishing(true)
    const ok = await onPublish(activeView, draftApi.getSnapshot(), selectedSeason)
    setPublishing(false)
    setToast({ text: ok ? '发布成功。' : '发布失败，请检查 Supabase 配置。', tone: ok ? 'success' : 'error' })
  }

  return (
    <div className={styles.centerPanel}>
      <div className={styles.navRail}>
        <button
          className={`${styles.railBtn} ${activeView === 'lineup' ? styles.railBtnActive : ''}`}
          onClick={() => onChangeView('lineup')}
          title="阵容推荐"
        >
          <span className={styles.railIcon}>阵</span>
          <span className={styles.railText}>阵容</span>
        </button>
        <button
          className={`${styles.railBtn} ${activeView === 'rating' ? styles.railBtnActive : ''}`}
          onClick={() => onChangeView('rating')}
          title="卡牌评分"
        >
          <span className={styles.railIcon}>评</span>
          <span className={styles.railText}>评分</span>
        </button>
      </div>

      <div className={styles.workbench}>
        <div className={styles.profileBar}>
          <div className={styles.publishAuthor}>
            发布者：{profileName || '未设置昵称'}
            {requireLoginToPublish && <span className={styles.publishHint}>（需先登录）</span>}
          </div>
          <select
            className={styles.draftSelect}
            value={String(selectedSeason)}
            onChange={(e) => onChangeSeason(Number(e.target.value))}
            title="发布赛季"
          >
            {seasonOptions.map((s) => (
              <option key={`season-${s}`} value={s}>赛季 S{s}</option>
            ))}
          </select>
          <button className={styles.draftSaveBtn} onClick={publishCurrent} disabled={publishing}>
            {publishing ? '发布中...' : '发布到社区'}
          </button>
        </div>
        <div className={styles.draftBar}>
          <button className={styles.draftSaveBtn} onClick={saveDraft}>保存到草稿</button>
          <select
            className={styles.draftSelect}
            value={selectedDraftId}
            onChange={(e) => setSelectedDraftId(e.target.value)}
          >
            <option value="">选择草稿</option>
            {filteredDrafts.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button className={styles.draftActionBtn} onClick={applyDraft} disabled={!selectedDraftId}>应用草稿</button>
          <button className={styles.draftActionBtn} onClick={renameDraft} disabled={!selectedDraftId}>重命名</button>
          <button className={styles.draftDeleteBtn} onClick={deleteDraft} disabled={!selectedDraftId}>删除</button>
        </div>
        {activeView === 'rating' ? (
          <RatingTool onSelectItem={onSelectItem} onDraftApiChange={setDraftApi} />
        ) : (
          <LineupPlanner onSelectItem={onSelectItem} onDraftApiChange={setDraftApi} />
        )}
        {toast && (
          <div className={`${styles.draftToast} ${toast.tone === 'success' ? styles.toastSuccess : styles.toastError}`}>
            {toast.text}
          </div>
        )}
      </div>
    </div>
  )
}
