'use client'

import { useEffect, useMemo, useState } from 'react'
import RatingTool from '@/components/RatingTool'
import LineupPlanner from '@/components/LineupPlanner'
import styles from './ToolFunctionPanel.module.css'
import { loadToolDraftsFromDb, saveToolDraftsToDb } from '@/lib/draftDb'
import { cdnUrl } from '@/lib/cdn'
import type { CommunityUserProfile } from '@/lib/draftDb'

interface ToolFunctionPanelProps {
  onSelectItem: (item: any) => void
  activeView: 'rating' | 'lineup'
  onChangeView: (view: 'rating' | 'lineup') => void
  userProfile: CommunityUserProfile
  onSaveProfile: (profile: CommunityUserProfile) => void
  onPublish: (mode: 'lineup' | 'rating', snapshot: any) => Promise<boolean>
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
  userProfile,
  onSaveProfile,
  onPublish,
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
  const [profileDraft, setProfileDraft] = useState(userProfile)
  const [publishing, setPublishing] = useState(false)

  const persistDrafts = (nextDrafts: DraftItem[]) => {
    try {
      localStorage.setItem('tool_drafts_v1', JSON.stringify(nextDrafts))
    } catch {}
    saveToolDraftsToDb(nextDrafts)
  }

  useEffect(() => {
    setProfileDraft(userProfile)
  }, [userProfile.nickname, userProfile.useBilibili, userProfile.bilibiliUid])

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

  const saveProfile = () => {
    const nickname = profileDraft.nickname.trim()
    if (!nickname) {
      setToast({ text: '昵称不能为空。', tone: 'error' })
      return
    }
    onSaveProfile({
      nickname,
      useBilibili: profileDraft.useBilibili,
      bilibiliUid: profileDraft.useBilibili ? profileDraft.bilibiliUid.trim() : '',
    })
    setToast({ text: '用户信息已保存。', tone: 'success' })
  }

  const publishCurrent = async () => {
    if (!draftApi) {
      setToast({ text: '当前模式尚未就绪，稍后再试。', tone: 'error' })
      return
    }
    setPublishing(true)
    const ok = await onPublish(activeView, draftApi.getSnapshot())
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
          <input
            className={styles.profileInput}
            value={profileDraft.nickname}
            maxLength={24}
            onChange={(e) => setProfileDraft((prev) => ({ ...prev, nickname: e.target.value }))}
            placeholder="昵称（点赞/收藏必填）"
          />
          <label className={styles.biliToggle}>
            <input
              type="checkbox"
              checked={profileDraft.useBilibili}
              onChange={(e) => setProfileDraft((prev) => ({ ...prev, useBilibili: e.target.checked }))}
            />
            <img src={cdnUrl('images/ui/Bilibili.svg')} alt="Bilibili" className={styles.biliIcon} />
            B站UP主
          </label>
          <input
            className={styles.profileInput}
            value={profileDraft.bilibiliUid}
            maxLength={20}
            disabled={!profileDraft.useBilibili}
            onChange={(e) => setProfileDraft((prev) => ({ ...prev, bilibiliUid: e.target.value }))}
            placeholder="B站用户ID（可选）"
          />
          <button className={styles.draftActionBtn} onClick={saveProfile}>保存用户信息</button>
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
