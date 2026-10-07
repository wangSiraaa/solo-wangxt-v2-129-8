import { describe, expect, it } from 'vitest';
import { initZ3Api } from './z3-init';
import { analyzePuzzle } from './solver';
import { puzzleFingerprint, validateStructure } from './puzzle';
import { multipleSample, standardSample, unsatSample } from './samples';
import { buildDivergenceView, findDivergences } from './divergence';

const z3 = await initZ3Api();

async function check(puzzle: ReturnType<typeof standardSample>, timeout = 20000) {
  return analyzePuzzle(z3, puzzle, validateStructure(puzzle), timeout);
}

describe('Z3 样例判定（双重 check：排除首解再求）', () => {
  it('标准题：唯一解', async () => {
    const res = await check(standardSample());
    expect(res.verdict).toBe('unique');
    expect(res.solution).not.toBeNull();
    expect(res.witness).toBeNull();
    // 解确实满足所有提示
    const p = standardSample();
    p.givens.forEach((g, i) => {
      if (g) expect(res.solution![i]).toBe(g);
    });
  }, 60000);

  it('无解题：unsat 且给出导致矛盾的约束核', async () => {
    const res = await check(unsatSample());
    expect(res.verdict).toBe('unsat');
    expect(res.solution).toBeNull();
    expect(res.conflict.length).toBeGreaterThan(0);
    // 矛盾核必须同时点名冲突提示与温度计
    const labels = res.conflict.map((c) => c.label).join(' | ');
    expect(labels).toContain('温度计');
    expect(labels).toContain('R1C1 = 9');
  }, 60000);

  it('多解题：multiple 且首解、二解不同', async () => {
    const res = await check(multipleSample());
    expect(res.verdict).toBe('multiple');
    expect(res.solution).not.toBeNull();
    expect(res.witness).not.toBeNull();
    expect(res.witness).not.toEqual(res.solution);
  }, 60000);

  it('结构非法不调用求解，直接作为矛盾返回', async () => {
    const p = standardSample();
    p.thermometers = [{ path: [0, 2] }]; // 非相邻
    const res = await check(p);
    expect(res.verdict).toBe('unsat');
    expect(res.reason).toBe('structure-invalid');
    expect(res.conflict.length).toBeGreaterThan(0);
  });
});

describe('多解分歧视图（Z3 端到端验收）', () => {
  it('多解样例：至少出现一个分歧格，且两解在分歧格之外完全一致', async () => {
    const p = multipleSample();
    const res = await check(p);
    expect(res.verdict).toBe('multiple');

    const dvs = findDivergences(res.solution, res.witness);
    expect(dvs).not.toBeNull();
    expect(dvs!.length).toBeGreaterThan(0);

    const set = new Set(dvs!.map((d) => d.cell));
    // 提示格绝不能是分歧格
    p.givens.forEach((g, i) => {
      if (g) {
        expect(set.has(i)).toBe(false);
        expect(res.solution![i]).toBe(g);
        expect(res.witness![i]).toBe(g);
      }
    });

    // 视图在指纹匹配时可用
    const view = buildDivergenceView(p, res, puzzleFingerprint(p), puzzleFingerprint(p));
    expect(view).not.toBeNull();
    expect(view!.cells.length).toBe(dvs!.length);
  }, 60000);

  it('改动一格提示后：题面指纹变化使旧分歧立即失效（视图为 null）', async () => {
    const p = multipleSample();
    const res = await check(p);
    expect(res.verdict).toBe('multiple');
    const oldFp = puzzleFingerprint(p);

    // 作者在某个旧分歧格上手工补一个来自首解的提示
    const dvs = findDivergences(res.solution, res.witness)!;
    const target = dvs[0].cell;
    p.givens[target] = res.solution![target];
    const newFp = puzzleFingerprint(p);
    expect(newFp).not.toBe(oldFp);

    // 旧结论还在内存里，但指纹已不匹配 => 不允许再展示旧的第二解
    expect(buildDivergenceView(p, res, oldFp, newFp)).toBeNull();
  }, 60000);

  it('补一个提示后重新检查：新题面的两解在该格一致；旧分歧（旧指纹）仍不可用', async () => {
    const p = multipleSample();
    const before = await check(p);
    expect(before.verdict).toBe('multiple');
    const oldFp = puzzleFingerprint(p);

    const target = findDivergences(before.solution, before.witness)![0].cell;
    p.givens[target] = before.solution![target];
    const after = await check(p);

    // 唯一 / 无解 / 仍多解都合法；超时之外的状态都不允许出现第二解越权展示
    expect(['multiple', 'unique', 'unsat']).toContain(after.verdict);
    if (after.verdict === 'multiple') {
      // 新补的提示格在新两解中相同，不再是分歧格
      expect(after.solution![target]).toBe(p.givens[target]);
      expect(after.witness![target]).toBe(p.givens[target]);
      const cells = new Set(findDivergences(after.solution, after.witness)!.map((d) => d.cell));
      expect(cells.has(target)).toBe(false);
    } else {
      expect(after.witness).toBeNull();
    }

    // 无论新结论如何：旧结论挂旧指纹，对新题面一律不可见
    expect(buildDivergenceView(p, before, oldFp, puzzleFingerprint(p))).toBeNull();
  }, 60000);

  it('唯一解样例不产生 witness，分歧视图为 null', async () => {
    const p = standardSample();
    const res = await check(p);
    expect(res.verdict).toBe('unique');
    expect(res.witness).toBeNull();
    const fp = puzzleFingerprint(p);
    expect(buildDivergenceView(p, res, fp, fp)).toBeNull();
  }, 60000);

  it('无解样例没有两解，分歧视图为 null', async () => {
    const p = unsatSample();
    const res = await check(p);
    expect(res.verdict).toBe('unsat');
    const fp = puzzleFingerprint(p);
    expect(buildDivergenceView(p, res, fp, fp)).toBeNull();
  }, 60000);
});
