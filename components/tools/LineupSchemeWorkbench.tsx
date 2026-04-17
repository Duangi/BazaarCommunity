'use client'

import LineupPlanner from '@/components/LineupPlanner'

interface LineupSchemeWorkbenchProps {
  onSelectItem: (item: any) => void
  onDraftApiChange?: (api: {
    getSnapshot: () => any
    applySnapshot: (payload: any) => void
    getContextLabel?: () => string
  } | null) => void
}

export default function LineupSchemeWorkbench({ onSelectItem, onDraftApiChange }: LineupSchemeWorkbenchProps) {
  return <LineupPlanner onSelectItem={onSelectItem} onDraftApiChange={onDraftApiChange} />
}
