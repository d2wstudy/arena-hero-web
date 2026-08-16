import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import '../../lib/i18n'
import { teamTone } from '../../lib/teamColors'
import { DEFAULT_TEAM_FOG_DISPLAY_SETTINGS, type TeamFogDisplaySettings } from '../../lib/teamFogDisplay'
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

  it('filters the global fleet list by team', async () => {
    const user = userEvent.setup()
    const objects = [
      { kind: 'CORE' as const, id: 'core-1', controlled: false, owner_username: 'alpha', team: 1, position: [0, 0] as [number, number], hp: 5 },
      { kind: 'UNIT' as const, id: 'ranger-2', controlled: false, owner_username: 'beta', team: 2, position: [8, 0] as [number, number], hp: 2, unit_type: 'RANGER' as const, cargo: 0 },
    ]
    render(<AssetList state={{ ...state, view_mode: 'GOD' }} objects={objects} selectedId={null} onSelect={() => undefined} />)

    expect(screen.getByRole('heading', { name: 'FLEET INDEX All assets' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Core/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ranger/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Team 2' }))

    expect(screen.queryByRole('button', { name: /Core/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ranger/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Team 2' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps both fog layers enabled by default and updates their opacity independently', async () => {
    const user = userEvent.setup()
    render(<FogControlHarness />)

    const visionSwitch = screen.getByRole('switch', { name: 'Live vision' })
    const explorationSwitch = screen.getByRole('switch', { name: 'Explored border' })
    const visionOpacity = screen.getByRole('slider', { name: 'Live vision opacity' })
    const explorationOpacity = screen.getByRole('slider', { name: 'Explored border opacity' })
    expect(visionSwitch).toHaveAttribute('aria-checked', 'true')
    expect(explorationSwitch).toHaveAttribute('aria-checked', 'true')
    expect(visionOpacity).toHaveValue('9')
    expect(explorationOpacity).toHaveValue('82')

    fireEvent.change(visionOpacity, { target: { value: '35' } })
    fireEvent.change(explorationOpacity, { target: { value: '47' } })
    expect(screen.getByText('35%')).toBeInTheDocument()
    expect(screen.getByText('47%')).toBeInTheDocument()

    await user.click(visionSwitch)
    expect(visionSwitch).toHaveAttribute('aria-checked', 'false')
    expect(visionOpacity).toBeDisabled()
    expect(explorationSwitch).toHaveAttribute('aria-checked', 'true')
  })
})

function FogControlHarness() {
  const [settings, setSettings] = useState<TeamFogDisplaySettings>({ ...DEFAULT_TEAM_FOG_DISPLAY_SETTINGS })
  return <AssetList state={{ ...state, view_mode: 'GOD' }} objects={[]} selectedId={null} onSelect={() => undefined} teamFogDisplay={settings} onTeamFogDisplayChange={setSettings} />
}
