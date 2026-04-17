'use client'

import ItemsList from '@/components/ItemsList'

interface WikiFilterPanelProps {
  items: any[]
  skills: any[]
  onSelectItem: (item: any) => void
  enableBuildLookup?: boolean
  onLookupBuilds?: (item: any) => void
  lookupFilterItem?: any | null
  onClearLookupFilter?: () => void
}

export default function WikiFilterPanel({
  items,
  skills,
  onSelectItem,
  enableBuildLookup = false,
  onLookupBuilds,
  lookupFilterItem = null,
  onClearLookupFilter,
}: WikiFilterPanelProps) {
  return (
    <ItemsList
      items={items}
      skills={skills}
      onSelectItem={onSelectItem}
      enableBuildLookup={enableBuildLookup}
      onLookupBuilds={onLookupBuilds}
      lookupFilterItem={lookupFilterItem}
      onClearLookupFilter={onClearLookupFilter}
    />
  )
}
