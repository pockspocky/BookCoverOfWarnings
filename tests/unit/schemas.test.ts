import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from '../../app/components/EmptyState.vue'
import SkeletonBlock from '../../app/components/SkeletonBlock.vue'
import { renderMarkdown } from '../../app/utils/markdown'
import { credentialsAreEmpty } from '../../lib/auth/anonymous'
import {
  createRelationshipSchema,
  httpsUrlSchema,
  privateProfilePatchSchema,
  schoolEmailSchema
} from '../../lib/schemas'

describe('schemas and presentation guards', () => {
  it('rejects a self-relationship and non-HTTPS evidence links', () => {
    const selfLink = createRelationshipSchema.safeParse({
      sourceType: 'student',
      sourceId: '11111111-1111-4111-8111-111111111111',
      targetType: 'student',
      targetId: '11111111-1111-4111-8111-111111111111',
      relationshipTypeId: '22222222-2222-4222-8222-222222222222',
      generalComment: 'Invalid.'
    })
    expect(selfLink.success).toBe(false)
    const missingType = createRelationshipSchema.safeParse({
      sourceType: 'student',
      sourceId: '11111111-1111-4111-8111-111111111111',
      targetType: 'group',
      targetId: '33333333-3333-4333-8333-333333333333',
      generalComment: 'Missing type.'
    })
    expect(missingType.success).toBe(false)
    const namedType = createRelationshipSchema.safeParse({
      sourceType: 'student',
      sourceId: '11111111-1111-4111-8111-111111111111',
      targetType: 'group',
      targetId: '33333333-3333-4333-8333-333333333333',
      relationshipTypeName: 'Studies with',
      generalComment: 'Named type.'
    })
    expect(namedType.success).toBe(true)
    expect(httpsUrlSchema.safeParse('http://records.northbridge.test/file').success).toBe(false)
    expect(httpsUrlSchema.safeParse('https://records.northbridge.test/file').success).toBe(true)
  })

  it('allows custom self-description text only for Other', () => {
    expect(privateProfilePatchSchema.safeParse({ sexualityPreset: 'other', sexualityCustom: '   ' }).success).toBe(false)
    expect(privateProfilePatchSchema.safeParse({ sexualityPreset: 'gay', sexualityCustom: 'extra' }).success).toBe(false)
    expect(privateProfilePatchSchema.safeParse({ sexualityPreset: 'other', sexualityCustom: 'a private note' }).success).toBe(true)
  })

  it('treats a blank login as empty credentials', () => {
    expect(credentialsAreEmpty(null)).toBe(true)
    expect(credentialsAreEmpty({})).toBe(true)
    expect(credentialsAreEmpty({ email: '', password: '' })).toBe(true)
    expect(credentialsAreEmpty({ email: '  ', password: '  ' })).toBe(true)
    expect(credentialsAreEmpty({ email: 'person@northbridge.test', password: '' })).toBe(false)
    expect(credentialsAreEmpty({ email: '', password: 'longenough' })).toBe(false)
  })

  it('validates the configured school email domain', () => {
    const schema = schoolEmailSchema('northbridge.test')
    expect(schema.safeParse({ email: 'person@example.com', password: 'longenough' }).success).toBe(false)
    expect(schema.safeParse({ email: 'person@northbridge.test', password: 'short' }).success).toBe(false)
    expect(schema.safeParse({ email: 'person@northbridge.test', password: 'longenough' }).success).toBe(true)
  })

  it('sanitizes markdown before rendering', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"><script>alert(1)</script>**Published note**')
    expect(html.toLowerCase()).not.toContain('script')
    expect(html.toLowerCase()).not.toContain('onerror')
    expect(html).toContain('<strong>Published note</strong>')
  })

  it('renders loading and empty states', () => {
    const empty = mount(EmptyState, { props: { title: 'None', description: 'Nothing matches.' } })
    expect(empty.text()).toContain('Nothing matches.')
    const skeleton = mount(SkeletonBlock)
    expect(skeleton.find('.animate-pulse').exists()).toBe(true)
  })
})
