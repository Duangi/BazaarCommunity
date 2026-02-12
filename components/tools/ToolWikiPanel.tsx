'use client'

import WikiFilterPanel from '@/components/tools/WikiFilterPanel'
import styles from '@/app/tools/tools.module.css'

interface ToolWikiPanelProps {
  items: any[]
  skills: any[]
  onSelectItem: (item: any) => void
  enableBuildLookup?: boolean
  onLookupBuilds?: (item: any) => void
}

export default function ToolWikiPanel({
  items,
  skills,
  onSelectItem,
  enableBuildLookup = false,
  onLookupBuilds,
}: ToolWikiPanelProps) {
  return (
    <div className={styles.leftPanel}>
      <WikiFilterPanel
        items={items}
        skills={skills}
        onSelectItem={onSelectItem}
        enableBuildLookup={enableBuildLookup}
        onLookupBuilds={onLookupBuilds}
      />
    </div>
  )
}
