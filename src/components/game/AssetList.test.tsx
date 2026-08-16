import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '../../lib/i18n'
import { teamTone } from '../../lib/teamColors'
import { AssetList } from './AssetList'

const state = { status: 'ACTIVE' as const, resources: 28, population: 6, champion_beacon: { position: [0, 0] as [number, number] }, objects: [], events: [] }

describe('AssetList', () => {
  it('places game stats below the Arena Hero title', () => {
    render(<AssetList state={state} objects={[]} selectedId={null} onSelect={() => undefined} />)

    const title = screen.getByLabelText('Arena Hero')
    const stats = screen.getByRole('group', { name: 'Status' })
    const fleetTitle = screen.getByText('FLEET INDEX')
    expect(screen.getByRole('heading', { name: 'FLEET INDEX Your assets' })).toBeInTheDocument()
    expect(title.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(stats.compareDocumentPosition(fleetTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('28/30')).toBeInTheDocument()
    expect(screen.getByText('Resources / capacity')).toBeInTheDocument()
    expect(screen.getByText('Population')).toBeInTheDocument()
  })

  it('shows a compact asset row without the object id', () => {
    const worker = { kind: 'UNIT' as const, id: 'worker-12345678', controlled: true, position: [3, -2] as [number, number], hp: 2, unit_type: 'WORKER' as const, cargo: 0 }
    render(<AssetList state={state} objects={[worker]} selectedId={null} onSelect={() => undefined} />)

    const name = screen.getByText('Worker')
    const coordinates = screen.getByText('[3, -2]')
    expect(name.parentElement).toBe(coordinates.parentElement)
    expect(screen.queryByText(/worker-12/)).not.toBeInTheDocument()
  })

  it('uses the global team tone for the fleet row', () => {
    const tone = teamTone(3)!
    const worker = { kind: 'UNIT' as const, id: 'worker-3', controlled: false, owner_username: 'player_3', team: 3, position: [2, 6] as [number, number], hp: 2, unit_type: 'WORKER' as const, cargo: 0 }
    render(<AssetList state={{ ...state, view_mode: 'GOD' }} objects={[worker]} selectedId={null} onSelect={() => undefined} />)

    const owner = screen.getByText('@player_3')
    const iconTone = screen.getByRole('button', { name: /Worker/ }).querySelector('img')?.parentElement
    expect(iconTone).toHaveStyle({ filter: tone.filter })
    expect(owner).toHaveStyle({ color: tone.labelColor })
  })
})
