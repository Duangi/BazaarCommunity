'use client'

import { useState, useEffect } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import ItemsList from '@/components/ItemsList'
import RatingTool from '@/components/RatingTool'
import styles from './tools.module.css'

export default function ToolsPage() {
  const [items, setItems] = useState<any[]>([])
  const [skills, setSkills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<any>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      // 加载物品数据
      const itemsResponse = await fetch('/items_db.json')
      const itemsData = await itemsResponse.json()
      setItems(itemsData)

      // 加载技能数据
      const skillsResponse = await fetch('/skills_db.json')
      const skillsData = await skillsResponse.json()
      setSkills(skillsData)

      setLoading(false)
    } catch (error) {
      console.error('加载数据失败:', error)
      setLoading(false)
    }
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={styles.container}>
        {/* 顶部导航 */}
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <a href="/" className={styles.logo}>
              ← 返回首页
            </a>
            <h1 className={styles.title}>大巴扎实用小工具</h1>
          </div>
        </header>

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>加载数据中...</p>
          </div>
        ) : (
          <div className={styles.mainContent}>
            {/* 左侧：评分工具区 */}
            <div className={styles.leftPanel}>
              <RatingTool 
                selectedItem={selectedItem}
                onSelectItem={setSelectedItem}
              />
            </div>

            {/* 右侧：数据列表区 */}
            <div className={styles.rightPanel}>
              <ItemsList 
                items={items}
                skills={skills}
                onSelectItem={setSelectedItem}
              />
            </div>
          </div>
        )}
      </div>
    </DndProvider>
  )
}
