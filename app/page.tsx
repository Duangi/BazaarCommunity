'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import styles from './page.module.css'

export default function Home() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className={styles.container}>
      <div className={styles.stars}></div>
      
      <main className={`${styles.main} ${mounted ? styles.fadeIn : ''}`}>
        {/* 头像和主标题 */}
        <div className={styles.hero}>
          <div className={styles.avatar}>
            <div className={styles.avatarInner}>Duang</div>
          </div>
          <h1 className={styles.title}>
            欢迎来到 <span className={styles.gradient}>Duang.work</span>
          </h1>
          <p className={styles.subtitle}>游戏工具开发者 · B站UP主 · 开源爱好者</p>
        </div>

        {/* 个人介绍卡片 */}
        <div className={styles.profileCard}>
          <h2 className={styles.cardTitle}>👋 关于我</h2>
          <p className={styles.cardText}>
            大家好！我是 <strong>这是李Duang啊</strong>，一名热爱游戏工具开发的程序员。
            专注于为 <span className={styles.highlight}>The Bazaar</span> 游戏社区创造实用工具。
          </p>
        </div>

        {/* 社交链接 */}
        <div className={styles.socialLinks}>
          <a 
            href="https://space.bilibili.com/251954263" 
            target="_blank" 
            rel="noopener noreferrer"
            className={`${styles.socialCard} ${styles.bilibili}`}
          >
            <div className={styles.socialIcon}>📺</div>
            <div className={styles.socialContent}>
              <h3>哔哩哔哩</h3>
              <p>这是李Duang啊</p>
            </div>
            <div className={styles.arrow}>→</div>
          </a>

          <a 
            href="https://github.com/Duangi/BazaarHelper" 
            target="_blank" 
            rel="noopener noreferrer"
            className={`${styles.socialCard} ${styles.github}`}
          >
            <div className={styles.socialIcon}>🚀</div>
            <div className={styles.socialContent}>
              <h3>GitHub</h3>
              <p>BazaarHelper 项目</p>
            </div>
            <div className={styles.arrow}>→</div>
          </a>
        </div>

        {/* 主要功能入口 */}
        <div className={styles.mainFeature}>
          <Link href="/tools" className={styles.toolsButton}>
            <div className={styles.toolsIcon}>🎮</div>
            <div className={styles.toolsContent}>
              <h2>大巴扎实用小工具</h2>
              <p>卡牌评分器 · 阵容模拟器 · 数据百科</p>
            </div>
            <div className={styles.toolsArrow}>→</div>
          </Link>
        </div>

        {/* 页脚 */}
        <footer className={styles.footer}>
          <p>Made with ❤️ by 这是李Duang啊</p>
          <p className={styles.footerSmall}>Powered by Next.js · Deployed on GitHub Pages</p>
        </footer>
      </main>
    </div>
  )
}
