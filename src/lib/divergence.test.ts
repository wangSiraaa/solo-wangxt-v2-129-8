import { describe, expect, it } from 'vitest';
import { initZ3Api } from './z3-init';
import { analyzePuzzle, type SolveResult } from './solver';
import { blankPuzzle, rc, validateStructure } from './puzzle';
import {
  cellContext,
  computeDivergence,
  divergenceForResult,
  divergenceValueAt
} from './divergence';
import { multipleSample, standardSample, unsatSample } from './samples';

const z3 = await initZ3Api();

function resultOf(partial: Partial<SolveResult>): SolveResult {
  return {
    verdict: 'unique',
    solution: null,
    witness: null,
    conflict: [],
    reason: null,
    elapsedMs: 1,
    ...partial
  };
}

describe('computeDivergence（纯函数）', () => {
  it('两解不同的格子被全部列出，数值与两解一致', () => {
    const d = computeDivergence([1, 2, 3, 4], [1, 3, 3, 2]);
    expect(d).not.toBeNull();
    expect(d!.cells).toEqual([1, 3]);
    expect(d!.first).toEqual([2, 4]);
    expect(d!.second).toEqual([3, 2]);
    expect(divergenceValueAt(d!, 1)).toEqual([2, 3]);
    expect(divergenceValueAt(d!, 0)).toBeNull();
  });

  it('两解完全一致 => 无可展示分歧（null）', () => {
    expect(computeDivergence([1, 2], [1, 2])).toBeNull();
  });

  it('缺任一解或长度不符 => null', () => {
    expect(computeDivergence(null, [1])).toBeNull();
    expect(computeDivergence([1], null)).toBeNull();
    expect(computeDivergence([1, 2], [1])).toBeNull();
  });
});

describe('divergenceForResult — 只有真·多解才有分歧，绝不伪造第二解', () => {
  it('unique：无分歧', () => {
    expect(
      divergenceForResult(resultOf({ verdict: 'unique', solution: [1, 2] }))
    ).toBeNull();
  });

  it('unsat：无分歧', () => {
    expect(divergenceForResult(resultOf({ verdict: 'unsat' }))).toBeNull();
  });

  it('unknown（有首解但二解未判定）：无分歧', () => {
    expect(
      divergenceForResult(resultOf({ verdict: 'unknown', solution: [1, 2], reason: 'timeout' }))
    ).toBeNull();
  });

  it('multiple 且两解不同 => 有分歧', () => {
    const d = divergenceForResult(
      resultOf({ verdict: 'multiple', solution: [1, 2], witness: [2, 1] })
    );
    expect(d?.cells).toEqual([0, 1]);
  });

  it('verdict 为 multiple 但两解相同（异常数据）=> 仍无分歧', () => {
    expect(
      divergenceForResult(resultOf({ verdict: 'multiple', solution: [1, 2], witness: [1, 2] }))
    ).toBeNull();
  });

  it('无结果 => null', () => {
    expect(divergenceForResult(null)).toBeNull();
  });
});

describe('Z3 样例的分歧（基于真实两次 check 的结果）', () => {
  it('多解样例：至少出现一个分歧格，且与两解逐格一致', async () => {
    const p = multipleSample();
    const res = await analyzePuzzle(z3, p, validateStructure(p), 20000);
    expect(res.verdict).toBe('multiple');
    const div = divergenceForResult(res);
    expect(div).not.toBeNull();
    // 验收：多解样例至少一个分歧格
    expect(div!.cells.length).toBeGreaterThanOrEqual(1);
    div!.cells.forEach((cell, k) => {
      expect(res.solution![cell]).toBe(div!.first[k]);
      expect(res.witness![cell]).toBe(div!.second[k]);
      // 分歧格一定不是提示格（两解都必须满足全部提示）
      expect(p.givens[cell]).toBe(0);
    });
    // 非分歧格上两解一致
    for (let i = 0; i < 81; i++) {
      if (!div!.cells.includes(i)) expect(res.solution![i]).toBe(res.witness![i]);
    }
  }, 60000);

  it('唯一解样例：无分歧（无二解）', async () => {
    const p = standardSample();
    const res = await analyzePuzzle(z3, p, validateStructure(p), 20000);
    expect(res.verdict).toBe('unique');
    expect(divergenceForResult(res)).toBeNull();
  }, 60000);

  it('无解样例：无分歧', async () => {
    const p = unsatSample();
    const res = await analyzePuzzle(z3, p, validateStructure(p), 20000);
    expect(res.verdict).toBe('unsat');
    expect(divergenceForResult(res)).toBeNull();
  }, 60000);
});

describe('cellContext — 选中格的行/列/宫与温度计', () => {
  it('返回行列宫成员与经过该格的温度计及位置', () => {
    const p = blankPuzzle();
    p.thermometers = [{ path: [rc(0, 0), rc(0, 1), rc(1, 1)] }];
    const ctx = cellContext(p, rc(0, 1));
    expect(ctx.row).toBe(1);
    expect(ctx.col).toBe(2);
    expect(ctx.rowCells).toHaveLength(9);
    expect(ctx.colCells).toHaveLength(9);
    expect(ctx.regionCells).toHaveLength(9);
    expect(ctx.regionCells).toContain(rc(0, 1));
    expect(ctx.region).toBe(p.regions[rc(0, 1)]);
    expect(ctx.thermometers).toEqual([
      { index: 0, pos: 1, path: [rc(0, 0), rc(0, 1), rc(1, 1)] }
    ]);
  });

  it('不在任何温度计上的格子 thermometers 为空', () => {
    const p = blankPuzzle();
    p.thermometers = [{ path: [rc(0, 0), rc(0, 1)] }];
    expect(cellContext(p, rc(5, 5)).thermometers).toEqual([]);
  });
});
