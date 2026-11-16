import { flushPromises, mount } from '@vue/test-utils'
import { onMounted, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CategoriesPage from '../../app/pages/admin/categories.vue'

const categories = [
  { id: 'cat-1', name: 'General Symptom', description: 'A', isActive: true, createdAt: '', updatedAt: '' },
  { id: 'cat-2', name: 'The Sins', description: 'B', isActive: false, createdAt: '', updatedAt: '' }
]

const patchCategory = vi.fn(async (id: string, payload: { name?: string; isActive?: boolean }) => {
  const row = categories.find((category) => category.id === id)
  if (!row) throw new Error('missing category')
  if (payload.name !== undefined) row.name = payload.name
  if (payload.isActive !== undefined) row.isActive = payload.isActive
  return { data: { ...row }, message: 'Category updated.' }
})
const push = vi.fn()

Object.assign(globalThis, {
  ref,
  onMounted,
  useNuxtApp: () => ({
    $api: {
      traits: { categories: async () => categories.map((category) => ({ ...category })) },
      relationships: { types: async () => [] },
      groups: { roles: async () => [] },
      admin: {
        createCategory: vi.fn(),
        patchCategory,
        createRelationshipType: vi.fn(),
        createGroupRole: vi.fn()
      }
    }
  }),
  useToastStore: () => ({ push })
})

async function mountPage() {
  const wrapper = mount(CategoriesPage, {
    global: { stubs: { PageHeader: true } }
  })
  await flushPromises()
  return wrapper
}

describe('trait category editing', () => {
  beforeEach(() => {
    categories[0].name = 'General Symptom'
    categories[0].isActive = true
    categories[1].name = 'The Sins'
    categories[1].isActive = false
    patchCategory.mockClear()
    push.mockClear()
  })

  it('places Edit to the left of Deactivate and renames the category', async () => {
    const wrapper = await mountPage()
    const row = wrapper.findAll('li')[0]
    expect(row.findAll('button').map((button) => button.text())).toEqual(['Edit', 'Deactivate'])

    await row.get('button').trigger('click')
    const input = row.get('input')
    expect((input.element as HTMLInputElement).value).toBe('General Symptom')
    expect(row.findAll('button').map((button) => button.text())).toEqual(['Save', 'Cancel', 'Deactivate'])

    await input.setValue('  Updated Symptom  ')
    await row.findAll('button')[0].trigger('click')
    await flushPromises()

    expect(patchCategory).toHaveBeenCalledWith('cat-1', { name: 'Updated Symptom' })
    expect(push).toHaveBeenCalledWith('Category updated.', 'success')
    expect(wrapper.text()).toContain('Updated Symptom')
    expect(row.find('input').exists()).toBe(false)
  })

  it('cancels without saving and rejects a blank name', async () => {
    const wrapper = await mountPage()
    const row = wrapper.findAll('li')[1]
    expect(row.findAll('button').map((button) => button.text())).toEqual(['Edit', 'Activate'])

    await row.get('button').trigger('click')
    await row.get('input').setValue('Temporary')
    await row.findAll('button')[1].trigger('click')
    expect(row.text()).toContain('The Sins')
    expect(patchCategory).not.toHaveBeenCalled()

    await row.get('button').trigger('click')
    await row.get('input').setValue('   ')
    await row.findAll('button')[0].trigger('click')
    expect(push).toHaveBeenCalledWith('Category name is required.', 'error')
    expect(patchCategory).not.toHaveBeenCalled()
    expect(row.find('input').exists()).toBe(true)
  })
})
