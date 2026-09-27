import test from 'node:test';
import assert from 'node:assert/strict';
import { axisOf, clamp, lerp, rubberBand, shouldCommit, claimGesture, releaseGesture, ownsGesture, nearestEdge } from '../src/lib/fluid.js';

test('rubber band is softer than the raw offset and never hard-stops at zero', () => {
  const pulled = rubberBand(120, 300);
  assert.ok(pulled > 0 && pulled < 120);
  assert.equal(Math.sign(rubberBand(-80, 300)), -1);
});

test('axis lock waits for slop and prefers the dominant direction', () => {
  assert.equal(axisOf(4, 3), '');
  assert.equal(axisOf(40, 8), 'x');
  assert.equal(axisOf(8, 40), 'y');
});

test('commit uses distance or a flick in the same direction', () => {
  assert.equal(shouldCommit(-120, 0, 360, 0.28, 720), -1);
  assert.equal(shouldCommit(-20, 0, 360, 0.28, 720), 0);
  assert.equal(shouldCommit(-20, -900, 360, 0.28, 720), -1);
  assert.equal(shouldCommit(-20, 900, 360, 0.28, 720), 0);
});

test('gesture ownership is exclusive for a pointer sequence', () => {
  assert.equal(claimGesture(1, 'card'), true);
  assert.equal(claimGesture(1, 'page'), false);
  assert.equal(ownsGesture(1, 'card'), true);
  releaseGesture(1, 'card');
  assert.equal(claimGesture(1, 'page'), true);
  releaseGesture(1, 'page');
});

test('edge snap picks the nearer side', () => {
  assert.equal(nearestEdge(20, 390, 56, 12), 12);
  assert.equal(nearestEdge(300, 390, 56, 12), 390 - 56 - 12);
});

test('lerp and clamp stay boring on purpose', () => {
  assert.equal(lerp(0, 10, 0.5), 5);
  assert.equal(clamp(12, 0, 3), 3);
});
