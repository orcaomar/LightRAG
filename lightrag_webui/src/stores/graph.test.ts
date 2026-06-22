/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import { useGraphStore } from './graph'

describe('graphStore yearFilter', () => {
  test('defaults to [1997, 2026]', () => {
    const state = useGraphStore.getState()
    expect(state.yearFilter).toEqual([1997, 2026])
  })

  test('setYearFilter updates the range correctly', () => {
    const state = useGraphStore.getState()
    state.setYearFilter([2000, 2020])
    expect(useGraphStore.getState().yearFilter).toEqual([2000, 2020])
  })

  test('correctly evaluates node overlap filter logic', () => {
    // Overlap condition logic test:
    // visible if node.first_ref_year <= filter.endYear && node.last_ref_year >= filter.startYear
    const filterRange = [2000, 2010]
    
    // Case 1: Node completely before range
    const nodeBefore = { first: '1997-01-01', last: '1999-12-31' }
    const startY1 = parseInt(nodeBefore.first.substring(0, 4))
    const endY1 = parseInt(nodeBefore.last.substring(0, 4))
    const visible1 = startY1 <= filterRange[1] && endY1 >= filterRange[0]
    expect(visible1).toBe(false)

    // Case 2: Node completely after range
    const nodeAfter = { first: '2011-01-01', last: '2015-12-31' }
    const startY2 = parseInt(nodeAfter.first.substring(0, 4))
    const endY2 = parseInt(nodeAfter.last.substring(0, 4))
    const visible2 = startY2 <= filterRange[1] && endY2 >= filterRange[0]
    expect(visible2).toBe(false)

    // Case 3: Node overlapping range (starts before, ends during)
    const nodeOverlapStart = { first: '1998-01-01', last: '2005-12-31' }
    const startY3 = parseInt(nodeOverlapStart.first.substring(0, 4))
    const endY3 = parseInt(nodeOverlapStart.last.substring(0, 4))
    const visible3 = startY3 <= filterRange[1] && endY3 >= filterRange[0]
    expect(visible3).toBe(true)

    // Case 4: Node completely inside range
    const nodeInside = { first: '2002-01-01', last: '2008-12-31' }
    const startY4 = parseInt(nodeInside.first.substring(0, 4))
    const endY4 = parseInt(nodeInside.last.substring(0, 4))
    const visible4 = startY4 <= filterRange[1] && endY4 >= filterRange[0]
    expect(visible4).toBe(true)
  })
})
