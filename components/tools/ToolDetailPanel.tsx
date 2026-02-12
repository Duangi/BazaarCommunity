'use client'

import ItemDetail from '@/components/ItemDetail'
import styles from '@/app/tools/tools.module.css'

interface ToolDetailPanelProps {
  item: any | null
}

export default function ToolDetailPanel({ item }: ToolDetailPanelProps) {
  return (
    <div className={styles.rightPanel}>
      <ItemDetail item={item} />
    </div>
  )
}
