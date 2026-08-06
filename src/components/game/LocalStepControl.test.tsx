import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '../../lib/i18n'
import { LocalStepControl } from './LocalStepControl'

describe('LocalStepControl', () => {
  it('advances only after every bot is ready', async () => {
    const advance = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<LocalStepControl
      tick={7}
      phase="open"
      status={{ mode: 'step', tick: 7, phase: 'OPEN', human: 'commander', bots: [{ username: 'bot', ready: false }] }}
      onAdvance={advance}
    />)

    const button = screen.getByRole('button', { name: 'Resolve Tick 7' })
    expect(button).toBeDisabled()
    rerender(<LocalStepControl
      tick={7}
      phase="open"
      status={{ mode: 'step', tick: 7, phase: 'OPEN', human: 'commander', bots: [{ username: 'bot', ready: true }] }}
      onAdvance={advance}
    />)
    await userEvent.click(button)
    expect(advance).toHaveBeenCalledOnce()
  })

  it('shows a bot failure and keeps resolution disabled', () => {
    render(<LocalStepControl
      tick={7}
      phase="open"
      status={{ mode: 'step', tick: 7, phase: 'OPEN', human: 'commander', bots: [{ username: 'bot', ready: false, error: 'RuntimeError: failed' }] }}
      onAdvance={vi.fn()}
    />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve Tick 7' })).toBeDisabled()
  })
})
