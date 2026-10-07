// 分歧视图：两次 check 得到两个不同解（首解 M1 与"排除 M1 再求"得到的二解 M2）后，
// 对比两者找出分歧格，供作者定位"两解究竟在哪里分叉"。
//
// 纯函数，不依赖 Svelte。分歧数据属于作者私有：它只存在于内存与 IndexedDB
// 的 lastCheck（SolveResult）中，exportPuzzle() 的公开题面绝不包含它。
import { N, colOf, rowOf, type CellIndex, type Puzzle } from './puzzle';
import type { SolveResult } from './solver';

/** 一组两解分歧：cells[k] 处首解取 first[k]、二解取 second[k]（按下标升序） */
export interface Divergence {
  cells: CellIndex[];
  /** 首解在对应分歧格的数字 */
  first: number[];
  /** 二解在对应分歧格的数字 */
  second: number[];
}

/**
 * 对比两个完整解，返回分歧格列表。
 * 任一解缺失、长度不符、或两解完全一致（没有可展示的分歧）时返回 null。
 */
export function computeDivergence(
  solution: number[] | null,
  witness: number[] | null
): Divergence | null {
  if (!solution || !witness) return null;
  if (solution.length !== witness.length) return null;
  const cells: CellIndex[] = [];
  const first: number[] = [];
  const second: number[] = [];
  for (let i = 0; i < solution.length; i++) {
    if (solution[i] !== witness[i]) {
      cells.push(i);
      first.push(solution[i]);
      second.push(witness[i]);
    }
  }
  return cells.length ? { cells, first, second } : null;
}

/**
 * 从一次检查结果提取分歧。
 * 只有确实找到两个不同解（verdict === 'multiple' 且首解、二解都在场且不同）
 * 才返回分歧；unique / unsat / unknown 一律返回 null —— 绝不伪造第二解。
 */
export function divergenceForResult(result: SolveResult | null): Divergence | null {
  if (!result || result.verdict !== 'multiple') return null;
  return computeDivergence(result.solution, result.witness);
}

/** 取某格在两解中的数字；该格不是分歧格时返回 null */
export function divergenceValueAt(div: Divergence, cell: CellIndex): [number, number] | null {
  const k = div.cells.indexOf(cell);
  return k >= 0 ? [div.first[k], div.second[k]] : null;
}

/** 选中分歧格后展示的约束上下文：所在行/列/宫与经过该格的温度计 */
export interface CellContext {
  cell: CellIndex;
  /** 1..9 */
  row: number;
  /** 1..9 */
  col: number;
  /** 宫编号 0..8 */
  region: number;
  rowCells: CellIndex[];
  colCells: CellIndex[];
  regionCells: CellIndex[];
  /** 经过该格的温度计：序号、该格在路径中的位置（0 起）、完整路径 */
  thermometers: { index: number; pos: number; path: CellIndex[] }[];
}

export function cellContext(puzzle: Puzzle, cell: CellIndex): CellContext {
  const r = rowOf(cell);
  const c = colOf(cell);
  const region = puzzle.regions[cell];
  const rowCells = Array.from({ length: N }, (_, j) => r * N + j);
  const colCells = Array.from({ length: N }, (_, j) => j * N + c);
  const regionCells: CellIndex[] = [];
  puzzle.regions.forEach((k, i) => {
    if (k === region) regionCells.push(i);
  });
  const thermometers: CellContext['thermometers'] = [];
  puzzle.thermometers.forEach((t, ti) => {
    const pos = t.path.indexOf(cell);
    if (pos >= 0) thermometers.push({ index: ti, pos, path: t.path });
  });
  return { cell, row: r + 1, col: c + 1, region, rowCells, colCells, regionCells, thermometers };
}
