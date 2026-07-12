import { describe, expect, it } from 'vitest'
import { encodeDirectAssignment, MOUSE_ASSIGNMENTS, MULTIMEDIA_ASSIGNMENTS } from './direct-assignments'

describe('typed direct B68 assignments', () => {
  it('encodes only the statically named mouse command cases', () => {
    expect(MOUSE_ASSIGNMENTS).toHaveLength(9)
    expect(encodeDirectAssignment('mouse:left').bytes).toEqual([0x01, 0, 0, 0x11])
    expect(encodeDirectAssignment('mouse:scroll-down').bytes).toEqual([0x01, 0, 0, 0x1a])
    expect(() => encodeDirectAssignment('mouse:unnamed')).toThrow('excluded')
  })

  it('encodes only the named multimedia cases', () => {
    expect(MULTIMEDIA_ASSIGNMENTS).toHaveLength(16)
    expect(encodeDirectAssignment('media:play-pause').bytes).toEqual([0x04, 0, 0, 0x22])
    expect(encodeDirectAssignment('media:task-view').bytes).toEqual([0x04, 0, 0, 0x5a])
    expect(() => encodeDirectAssignment('advanced:reset')).toThrow('excluded')
  })
})
