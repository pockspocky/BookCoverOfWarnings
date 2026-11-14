import { describe, expect, it } from 'vitest'
import { describeRevision } from '../src/services/revision-summary'

describe('describeRevision', () => {
  it('names the fields that were added and skips empty bookkeeping', () => {
    expect(describeRevision({}, {
      displayName: 'Ada Lovelace',
      graduationYear: 2026,
      generalComment: '',
      status: 'active'
    })).toBe('Added display name and graduation year')
  })

  it('names only the fields that changed and does not repeat their values', () => {
    const summary = describeRevision(
      { displayName: 'Ada', graduationYear: 2026, generalComment: 'secret phrase' },
      { displayName: 'Ada', graduationYear: 2026, generalComment: 'other secret' }
    )
    expect(summary).toBe('Updated general comment')
    expect(summary).not.toContain('secret')
  })

  it('describes an archive without treating the record name as an edit', () => {
    expect(describeRevision(
      { archivedAt: null },
      { archivedAt: '2026-01-01T00:00:00.000Z', displayName: 'Ada' }
    )).toBe('Archived record')
    expect(describeRevision(
      { status: 'active', name: 'Club' },
      { status: 'archived', name: 'Team' }
    )).toBe('Archived record. Updated name')
  })

  it('drops private keys before describing the change', () => {
    expect(describeRevision(
      { generalComment: 'Public' },
      { generalComment: 'Still public', sexualityPreset: 'gay', sexualityCustom: 'hidden' }
    )).toBe('Updated general comment')
  })

  it('says the record was updated when the stored fields did not change', () => {
    expect(describeRevision({ title: 'Leadership' }, { title: 'Leadership' })).toBe('Updated record')
  })
})
