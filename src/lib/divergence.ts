// 分歧视图（多解时）：在两次 Z3 check 已得到两个不同解 M1/M2 的前提下，
// 纯函数地计算"两解究竟在哪些格分叉"，以及选中一格后该格所在
// 行/列/宫/温度计在两解中的取值，供作者手工决定在哪里补提示。
//
// 重要边界：
//   - 这里的一切数据都派生自 SolveResult.solution/witness，属于作者私有
//     的答案层，永远不经过 exportPuzzle() 导出。
//   - 本模块只"展示"分歧，不提供任何把解写回 givens 的途径。
//   - 显示门槛极严格：必须 verdict==='multiple'、两份完整合法网格、
//     两解确实不同，且结论指纹与当前题面指纹一致；否则一律返回 null，
//     绝不允许 unique/unsat/unknown 状态出现"伪第二解"。
import {
  CELL_COUNT,
  N,
  colOf,
  rowOf,
  type CellIndex,
  type Puzzle
} from './puzzle';
import type { SolveResult } from './solver';

export interface DivergenceCell {
  cell: CellIndex;
  /** 首解 M1 在该格的数字（1..9） */
  a: number;
  /** 二解 M2 在该格的数字（1..9），保证 a !== b */
  b: number;
}

export interface UnitView {
  kind: 'row' | 'column' | 'region';
  /** 人类可读序号（1 起） */
  index: number;
  /** 该单元所含格子（行/列按空间顺序，宫按行优先） */
  cells: CellIndex[];
  /** 与 cells 对齐：M1 / M2 在各格的数字 */
  valuesA: number[];
  valuesB: number[];
  /** 当前查看的分歧格在 cells 中的位置 */
  focusPos: number;
}

export interface ThermoView {
  /** 温度计序号（0 起） */
  thermometer: number;
  path: CellIndex[];
  /** 选中格在 path 中的位置 */
  focusPos: number;
  /** M1 / M2 沿温度计路径的数字（严格递增） */
  valuesA: number[];
  valuesB: number[];
}

export interface CellInspector {
  cell: CellIndex;
  a: number;
  b: number;
  row: UnitView;
  column: UnitView;
  region: UnitView;
  /** 经过该格的温度计（可能为空） */
  thermos: ThermoView[];
}

export interface DivergenceView {
  /** 两解取值不同的格子（行优先顺序） */
  cells: DivergenceCell[];
  /** 首解完整网格（作者私有，派生自 SolveResult，不参与导出） */
  gridA: number[];
  /** 二解完整网格 */
  gridB: number[];
  /** 该视图所对应的题面指纹（必须与当前题面一致才允许展示） */
  fingerprint: string;
}

/** 合法完整网格：81 格且每格为 1..9 整数。 */
export function isCompleteGrid(g: unknown): g is number[] {
  return (
    Array.isArray(g) &&
    g.length === CELL_COUNT &&
    g.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= N)
  );
}

/**
 * 找出两解取值不同的格子。
 * 任一网格不完整或两解完全相同（没有分叉）时返回 null。
 */
export function findDivergences(a: unknown, b: unknown): DivergenceCell[] | null {
  if (!isCompleteGrid(a) || !isCompleteGrid(b)) return null;
  const cells: DivergenceCell[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (a[i] !== b[i]) cells.push({ cell: i, a: a[i], b: b[i] });
  }
  return cells.length ? cells : null;
}

/**
 * 构建分歧视图的唯一入口。只有满足以下全部条件才返回非 null：
 *   1. 检查结论 verdict === 'multiple'（确实排除首解后又找到一个解）；
 *   2. solution / witness 都是完整 1..9 网格且至少一格不同；
 *   3. 结论登记的指纹与当前题面指纹一致（题面改动后旧分歧立即不可见）。
 * unique / unsat / unknown / 指纹过期 / 数据残缺 → null（不显示伪第二解）。
 */
export function buildDivergenceView(
  puzzle: Puzzle,
  result: SolveResult | null,
  resultFingerprint: string | null,
  currentFingerprint: string
): DivergenceView | null {
  if (!result || result.verdict !== 'multiple') return null;
  if (!resultFingerprint || resultFingerprint !== currentFingerprint) return null;
  const { solution, witness } = result;
  const cells = findDivergences(solution, witness);
  if (!cells) return null;
  // 提示格在两解中必然相同（都必须等于提示值）；若数据异常则拒绝展示。
  if (cells.some((d) => puzzle.givens[d.cell] !== 0)) return null;
  return {
    cells,
    gridA: [...(solution as number[])],
    gridB: [...(witness as number[])],
    fingerprint: currentFingerprint
  };
}

function makeUnit(
  kind: UnitView['kind'],
  index: number,
  cells: CellIndex[],
  gridA: number[],
  gridB: number[],
  focus: CellIndex
): UnitView {
  return {
    kind,
    index,
    cells,
    valuesA: cells.map((i) => gridA[i]),
    valuesB: cells.map((i) => gridB[i]),
    focusPos: cells.indexOf(focus)
  };
}

/**
 * 选中一个分歧格后，给出该格的行/列/宫在两解中的完整取值，
 * 以及所有经过该格的温度计沿路径的取值。
 */
export function buildCellInspector(
  puzzle: Puzzle,
  view: DivergenceView,
  cell: CellIndex
): CellInspector | null {
  const dv = view.cells.find((d) => d.cell === cell);
  if (!dv) return null;
  const { gridA, gridB } = view;
  const r = rowOf(cell);
  const c = colOf(cell);

  const rowCells: CellIndex[] = [];
  const colCells: CellIndex[] = [];
  for (let k = 0; k < N; k++) {
    rowCells.push(r * N + k);
    colCells.push(k * N + c);
  }
  const regionId = puzzle.regions[cell];
  const regionCells: CellIndex[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (puzzle.regions[i] === regionId) regionCells.push(i);
  }

  const thermos: ThermoView[] = [];
  puzzle.thermometers.forEach((t, ti) => {
    const pos = t.path.indexOf(cell);
    if (pos < 0) return;
    thermos.push({
      thermometer: ti,
      path: [...t.path],
      focusPos: pos,
      valuesA: t.path.map((i) => gridA[i]),
      valuesB: t.path.map((i) => gridB[i])
    });
  });

  return {
    cell,
    a: dv.a,
    b: dv.b,
    row: makeUnit('row', r + 1, rowCells, gridA, gridB, cell),
    column: makeUnit('column', c + 1, colCells, gridA, gridB, cell),
    region: makeUnit('region', regionId + 1, regionCells, gridA, gridB, cell),
    thermos
  };
}
