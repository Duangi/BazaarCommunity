'use client'

import { useEffect, useState } from 'react'
import styles from './CommunityAuthBar.module.css'

interface CommunityAuthBarProps {
  isAuthed: boolean
  nickname?: string
  onLoginWithKey: (key: string) => Promise<{ ok: boolean; message: string }>
  onSignOut: () => Promise<void>
}

export default function CommunityAuthBar({
  isAuthed,
  nickname,
  onLoginWithKey,
  onSignOut,
}: CommunityAuthBarProps) {
  const [expanded, setExpanded] = useState(false)
  const [rawKey, setRawKey] = useState('')
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!hint) return
    const t = window.setTimeout(() => setHint(''), 2400)
    return () => window.clearTimeout(t)
  }, [hint])

  const submit = async () => {
    if (!rawKey.trim()) {
      setHint('请输入 BazaarHelper 登录密钥')
      return
    }
    setBusy(true)
    const result = await onLoginWithKey(rawKey.trim())
    setBusy(false)
    setHint(result.message)
    if (result.ok) {
      setExpanded(false)
      setRawKey('')
    }
  }

  return (
    <div className={styles.authWrap}>
      {isAuthed ? (
        <>
          <div className={styles.userBadge} title={nickname || '已登录'}>
            {nickname || '已登录'}
          </div>
          <button className={styles.authBtn} onClick={() => onSignOut()} disabled={busy}>
            退出
          </button>
        </>
      ) : (
        <>
          <button className={styles.authBtn} onClick={() => setExpanded((v) => !v)} disabled={busy}>
            {expanded ? '收起登录' : '密钥登录'}
          </button>
          {expanded && (
            <div className={styles.authPopover}>
              <input
                className={styles.authInput}
                type="text"
                placeholder="粘贴 bh1.xxxxx.yyyyy 登录密钥"
                value={rawKey}
                onChange={(e) => setRawKey(e.target.value)}
              />
              <div className={styles.authActions}>
                <button className={styles.authActionBtn} disabled={busy} onClick={submit}>
                  登录
                </button>
              </div>
              {hint && <div className={styles.authHint}>{hint}</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
