import { test } from 'node:test'
import assert from 'node:assert/strict'
import { move, applySubset, between, isoDay, dueInfo } from './logic.js'

test('between', () => {
  assert.equal(between(1, 3), 2)
  assert.equal(between(undefined, 5), 4)
  assert.equal(between(5, undefined), 6)
  assert.ok(between(undefined, undefined) > 0)
})

test('move', () => {
  assert.deepEqual(move(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a'])
  assert.deepEqual(move(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b'])
  assert.deepEqual(move(['a', 'b', 'c'], 'b', 'c'), ['a', 'c', 'b'])
})

test('applySubset keeps hidden items in place', () => {
  assert.deepEqual(applySubset(['a', 'x', 'b', 'y', 'c'], ['c', 'a', 'b']), ['c', 'x', 'a', 'y', 'b'])
})

test('isoDay crosses month boundaries', () => {
  assert.equal(isoDay(1, new Date(2026, 0, 31)), '2026-02-01')
})

test('dueInfo', () => {
  const now = new Date(2026, 9, 10)
  assert.equal(dueInfo('', false, now).cls, 'unset')
  assert.equal(dueInfo('2026-10-09', false, now).cls, 'overdue')
  assert.equal(dueInfo('2026-10-09', true, now).cls, '')
  assert.equal(dueInfo('2026-10-10', false, now).label, 'Today')
  assert.equal(dueInfo('2026-10-11', false, now).label, 'Tomorrow')
})
