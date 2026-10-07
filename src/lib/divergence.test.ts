import { describe, expect, it } from 'vitest';
import { blankPuzzle, rc, type Puzzle } from './puzzle';
import {
  buildCellInspector,
  buildDivergenceView,
  findDivergences,
  isCompleteGrid
} from './divergence';
import type { SolveResult } from './solver';

// 行拉丁方：grid[r][c] = ((r + c) % 9) + 1。行、列都是 1..9 排列；
// 仅用于网格形状/逐格差异的测试（分歧逻辑本身不校验数独合法性）。
function cyclicGrid(shift: number): number[] {
  const g: number[] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) g.push(((r + c + shift) % 9) + 1);
  }
  return g;
}

// 一个合法的完整数独解（标准 3x3 宫）
const SUDOKU_A: number[] = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9
];

// 数字重标号（1↔2 3↔4 5↔6 7↔8，9 不动）：保持行/列/宫仍各为 1..9，
// 值 9 的格子两解相同，其余格全部不同。
const RELABEL = new Map<number, number>([
  [1, 2], [2, 1], [3, 4], [4, 3], [5, 6], [6, 5], [7, 8], [8, 7], [9, 9]
]);
const SUDOKU_B: number[] = SUDOKU_A.map((d) => RELABEL.get(d)!);

function multipleResult(a: number[], b: number[]): SolveResult {
  return {
    verdict: 'multiple',
    solution: [...a],
    witness: [...b],
    conflict: [],
    reason: null,
    elapsedMs: 1
  };
}

const FP_A = 'fp-a';
const FP_B = 'fp-b';

describe('isCompleteGrid', () => {
  it('完整 1..9 网格通过；残缺/越界/长度不对不通过', () => {
    expect(isCompleteGrid(cyclicGrid(0))).toBe(true);
    expect(isCompleteGrid(null)).toBe(false);
    expect(isCompleteGrid(cyclicGrid(0).slice(0, 80))).toBe(false);
    const bad = cyclicGrid(0);
    bad[0] = 0;
    expect(isCompleteGrid(bad)).toBe(false);
    bad[0] = 10;
    expect(isCompleteGrid(bad)).toBe(false);
  });
});

describe('findDivergences', () => {
  it('相同网格返回 null（没有分叉）', () => {
    const g = cyclicGrid(0);
    expect(findDivergences(g, [...g])).toBeNull();
  });

  it('逐格标出取值不同的格子且保持 a/b 对齐', () => {
    const a = cyclicGrid(0);
    const b = cyclicGrid(1);
    const dvs = findDivergences(a, b)!;
    expect(dvs.length).toBeGreaterThan(0);
    for (const d of dvs) {
      expect(a[d.cell]).toBe(d.a);
      expect(b[d.cell]).toBe(d.b);
      expect(d.a).not.toBe(d.b);
    }
  });

  it('数字重标号网格：值 9 的格相同、其余格不同', () => {
    const dvs = findDivergences(SUDOKU_A, SUDOKU_B)!;
    const set = new Set(dvs.map((d) => d.cell));
    expect(dvs.length).toBe(81 - SUDOKU_A.filter((d) => d === 9).length);
    for (let i = 0; i < 81; i++) {
      expect(set.has(i)).toBe(SUDOKU_A[i] !== 9);
    }
  });

  it('残缺网格返回 null', () => {
    const a = cyclicGrid(0);
    const bad = cyclicGrid(1);
    bad[5] = 0;
    expect(findDivergences(a, bad)).toBeNull();
  });
});

describe('buildDivergenceView — 严格显示门槛', () => {
  const p = blankPuzzle();

  it('multiple + 两解不同 + 指纹匹配 => 视图非空，且至少一个分歧格', () => {
    const res = multipleResult(cyclicGrid(0), cyclicGrid(1));
    const v = buildDivergenceView(p, res, FP_A, FP_A);
    expect(v).not.toBeNull();
    expect(v!.cells.length).toBeGreaterThan(0);
    expect(v!.fingerprint).toBe(FP_A);
  });

  it('指纹不匹配（题面已改动）=> null，旧分歧立即失效', () => {
    const res = multipleResult(cyclicGrid(0), cyclicGrid(1));
    expect(buildDivergenceView(p, res, FP_A, FP_B)).toBeNull();
  });

  it('结论没有指纹 / null 结果 => null', () => {
    const res = multipleResult(cyclicGrid(0), cyclicGrid(1));
    expect(buildDivergenceView(p, res, null, FP_A)).toBeNull();
    expect(buildDivergenceView(p, null, FP_A, FP_A)).toBeNull();
  });

  it('unique / unsat / unknown 一律 null —— 不显示伪第二解', () => {
    const g = cyclicGrid(0);
    expect(
      buildDivergenceView(
        p,
        { verdict: 'unique', solution: g, witness: null, conflict: [], reason: null, elapsedMs: 1 },
        FP_A,
        FP_A
      )
    ).toBeNull();
    expect(
      buildDivergenceView(
        p,
        { verdict: 'unsat', solution: null, witness: null, conflict: [], reason: null, elapsedMs: 1 },
        FP_A,
        FP_A
      )
    ).toBeNull();
    expect(
      buildDivergenceView(
        p,
        { verdict: 'unknown', solution: g, witness: null, conflict: [], reason: 'timeout', elapsedMs: 1 },
        FP_A,
        FP_A
      )
    ).toBeNull();
  });

  it('multiple 但两解实际相同 / witness 缺失 / 网格残缺 => null', () => {
    const g = cyclicGrid(0);
    expect(
      buildDivergenceView(
        p,
        { verdict: 'multiple', solution: g, witness: [...g], conflict: [], reason: null, elapsedMs: 1 },
        FP_A,
        FP_A
      )
    ).toBeNull();
    expect(
      buildDivergenceView(
        p,
        { verdict: 'multiple', solution: g, witness: null, conflict: [], reason: null, elapsedMs: 1 },
        FP_A,
        FP_A
      )
    ).toBeNull();
    const broken = cyclicGrid(1);
    broken[0] = 0;
    expect(buildDivergenceView(p, multipleResult(g, broken), FP_A, FP_A)).toBeNull();
  });

  it('分歧格落在提示格上（数据异常）=> 拒绝展示', () => {
    const p2 = blankPuzzle();
    const a = cyclicGrid(0);
    const b = cyclicGrid(1);
    // 两解在格 0 不同却又给了提示——数据自相矛盾，视图必须拒绝
    expect(a[0]).not.toBe(b[0]);
    p2.givens[0] = a[0];
    expect(buildDivergenceView(p2, multipleResult(a, b), FP_A, FP_A)).toBeNull();
  });

  it('视图持有网格副本：修改返回网格不影响下一次构建', () => {
    const res = multipleResult(cyclicGrid(0), cyclicGrid(1));
    const v1 = buildDivergenceView(p, res, FP_A, FP_A)!;
    v1.gridA[0] = 999;
    const v2 = buildDivergenceView(p, res, FP_A, FP_A)!;
    expect(v2.gridA[0]).not.toBe(999);
  });
});

describe('buildCellInspector — 选中分歧格的行/列/宫/温度计', () => {
  it('行、列、宫覆盖正确格子并对齐两解取值；两解各自都是 1..9', () => {
    const p: Puzzle = blankPuzzle();
    p.thermometers = [{ path: [rc(0, 0), rc(1, 0), rc(2, 0)] }];
    const view = buildDivergenceView(p, multipleResult(SUDOKU_A, SUDOKU_B), FP_A, FP_A)!;

    const cell = rc(1, 0); // A=6, B=5，是分歧格
    expect(SUDOKU_A[cell]).not.toBe(SUDOKU_B[cell]);
    const ins = buildCellInspector(p, view, cell)!;
    expect(ins.cell).toBe(cell);
    expect(ins.a).toBe(6);
    expect(ins.b).toBe(5);

    const r = 1;
    const c = 0;
    expect(ins.row.cells).toEqual(Array.from({ length: 9 }, (_, k) => r * 9 + k));
    expect(ins.column.cells).toEqual(Array.from({ length: 9 }, (_, k) => k * 9 + c));
    expect(ins.region.cells.length).toBe(9);
    expect(ins.row.cells[ins.row.focusPos]).toBe(cell);
    expect(ins.column.cells[ins.column.focusPos]).toBe(cell);
    expect(ins.region.cells[ins.region.focusPos]).toBe(cell);

    for (const u of [ins.row, ins.column, ins.region]) {
      expect(u.valuesA).toEqual(u.cells.map((i) => SUDOKU_A[i]));
      expect(u.valuesB).toEqual(u.cells.map((i) => SUDOKU_B[i]));
      // 两解在每个单元都仍是 1..9 排列
      expect([...u.valuesA].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect([...u.valuesB].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });

  it('列出经过选中格的温度计及其沿路径取值与焦点；不经过的不列', () => {
    const p: Puzzle = blankPuzzle();
    p.thermometers = [
      { path: [rc(0, 0), rc(1, 0), rc(2, 0)] },
      { path: [rc(5, 5), rc(5, 6), rc(5, 7)] }
    ];
    const view = buildDivergenceView(p, multipleResult(SUDOKU_A, SUDOKU_B), FP_A, FP_A)!;
    const cell = rc(1, 0);
    const ins = buildCellInspector(p, view, cell)!;
    expect(ins.thermos.length).toBe(1);
    const t = ins.thermos[0];
    expect(t.thermometer).toBe(0);
    expect(t.path).toEqual([rc(0, 0), rc(1, 0), rc(2, 0)]);
    expect(t.focusPos).toBe(1);
    expect(t.valuesA).toEqual(t.path.map((i) => SUDOKU_A[i]));
    expect(t.valuesB).toEqual(t.path.map((i) => SUDOKU_B[i]));
  });

  it('选中非分歧格（两解相同的值 9 格）返回 null', () => {
    const p = blankPuzzle();
    const view = buildDivergenceView(p, multipleResult(SUDOKU_A, SUDOKU_B), FP_A, FP_A)!;
    const sameCell = SUDOKU_A.findIndex((v, i) => v === SUDOKU_B[i]);
    expect(sameCell).toBeGreaterThanOrEqual(0);
    expect(SUDOKU_A[sameCell]).toBe(9);
    expect(buildCellInspector(p, view, sameCell)).toBeNull();
  });
});
