import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import type { PartNode } from '@core/model/avatar-model'
import { assignmentOf, type RoleAssignment } from '@core/roles/rig'
import { t } from '@shared/i18n'
import { avatarModel } from '../state/app-state'
import { debugHidden, selectCube, selection, selectPart, toggleHidden } from '../state/debug-state'
import { rig } from '../state/rig-state'

export function roleLabel(assignment: RoleAssignment | undefined): string | null {
  if (!assignment) return null
  return assignment.role.startsWith('custom:') ? assignment.role.slice(7) : t(`role.${assignment.role}` as Parameters<typeof t>[0])
}

function additive(event: MouseEvent): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey
}

function PartRow({ part, depth, collapsed, onToggle }: { readonly part: PartNode; readonly depth: number; readonly collapsed: ReadonlySet<string>; readonly onToggle: (id: string) => void }): JSX.Element {
  const selected = selection.value.parts.has(part.id)
  const hidden = debugHidden.value.has(part.id)
  const assignment = assignmentOf(rig.value, part.id)
  const label = roleLabel(assignment)
  const isCollapsed = collapsed.has(part.id)
  const hasChildren = part.children.length > 0 || part.cubes.length > 0

  return (
    <>
      <div class={selected ? 'tree-row selected' : 'tree-row'} style={{ paddingLeft: `${depth * 14 + 4}px` }}>
        <button type="button" class="tree-toggle" disabled={!hasChildren} onClick={() => onToggle(part.id)} aria-label={isCollapsed ? '+' : '−'}>
          {hasChildren ? (isCollapsed ? '▸' : '▾') : ''}
        </button>
        <button
          type="button"
          class={hidden ? 'tree-eye off' : 'tree-eye'}
          title={hidden ? t('debug.tree.show') : t('debug.tree.hide')}
          onClick={() => toggleHidden(part.id)}
        >
          {hidden ? '◌' : '●'}
        </button>
        <button type="button" class="tree-name" onClick={(e) => selectPart(part.id, additive(e))}>
          {part.name}
        </button>
        {label && <span class={assignment?.confirmed ? 'role-badge' : 'role-badge suggested'}>{label}</span>}
      </div>
      {!isCollapsed && (
        <>
          {part.cubes.map((cube) => (
            <div
              key={cube.id}
              class={selection.value.cubes.has(cube.id) ? 'tree-row cube selected' : 'tree-row cube'}
              style={{ paddingLeft: `${(depth + 1) * 14 + 28}px` }}
            >
              <button type="button" class="tree-name" onClick={(e) => selectCube(cube.id, additive(e))}>
                ▫ {cube.name}
              </button>
            </div>
          ))}
          {part.children.map((child) => (
            <PartRow key={child.id} part={child} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} />
          ))}
        </>
      )}
    </>
  )
}

/** Baumansicht aller Teile und Würfel des Modells. */
export function PartTree(): JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string): void => {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsed(next)
  }
  return (
    <div class="part-tree">
      {avatarModel.value.root.children.map((part) => (
        <PartRow key={part.id} part={part} depth={0} collapsed={collapsed} onToggle={toggle} />
      ))}
    </div>
  )
}
