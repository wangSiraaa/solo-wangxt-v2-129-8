import { describe, expect, it } from 'vitest';
import { EditorState } from './state.svelte';
import { standardSample } from './samples';
import { puzzleFingerprint } from './puzzle';
import type { SolveResult } from './solver';

function fakeResult(partial: Partial<SolveResult>): SolveResult {
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

/** 构造一对仅第 0 格不同的"两解" */
function twoSolutions(): { solution: number[]; witness: number[] } {
  const solution = Array.from({ length: 81 }, (_, i) => (i % 9) + 1);
  const witness = [...solution];
  witness[0] = solution[0] === 9 ? 8 : 9;
  return { solution, witness };
}

// 不依赖 Z3：直接验证"题面指纹变化 => 旧结论必须失效"这一状态规则。
describe('改变提示后旧结论失效', () => {
  it('已有结论时修改一个提示，结论立即回到未检查状态', () => {
    const ed = new EditorState();
    ed.init(standardSample(), null, 't');
    const fpBefore = JSON.stringify({
      r: ed.puzzle.regions,
      g: ed.puzzle.givens,
      t: ed.puzzle.thermometers.map((x) => x.path)
    });
    // 模拟一次已完成的检查（含首解），并登记其指纹
    ed.analysis = {
      status: 'done',
      result: {
        verdict: 'unique',
        solution: new Array(81).fill(1),
        witness: null,
        conflict: [],
        reason: null,
        elapsedMs: 1
      },
      fingerprint: fpBefore,
      error: null
    };
    expect(ed.analysis.status).toBe('done');

    // 找到一个现有提示并改动它
    const givenCell = ed.puzzle.givens.findIndex((g) => g !== 0);
    expect(givenCell).toBeGreaterThanOrEqual(0);
    const oldVal = ed.puzzle.givens[givenCell];
    ed.setGiven(givenCell, oldVal === 9 ? 8 : oldVal + 1);

    // 旧结论必须失效：不再宣称唯一
    expect(ed.analysis.status).toBe('idle');
    expect(ed.analysis.result).toBeNull();
    expect(ed.analysis.fingerprint).toBeNull();
  });

  it('未产生过结论时修改题面保持空闲，不报错', () => {
    const ed = new EditorState();
    ed.init(standardSample(), null, 't');
    ed.setGiven(0, ed.puzzle.givens[0] ? 1 : 7);
    expect(ed.analysis.status).toBe('idle');
  });

  it('结构问题出现时 issues 被填充', () => {
    const ed = new EditorState();
    ed.init(standardSample(), null, 't');
    // 把温度计最后一格替换成与前一格不相邻的远格，制造结构错误
    const t = ed.puzzle.thermometers[0];
    if (t) {
      const p = standardSample();
      p.thermometers[0].path[t.path.length - 1] = 80;
      ed.init(p, null, 't2');
      expect(ed.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('分歧视图的状态规则', () => {
  it('多解结论且指纹匹配 => 分歧可见，可选中分歧格', () => {
    const ed = new EditorState();
    ed.init(standardSample(), null, 't');
    const { solution, witness } = twoSolutions();
    ed.analysis = {
      status: 'done',
      result: fakeResult({ verdict: 'multiple', solution, witness }),
      fingerprint: puzzleFingerprint(ed.puzzle),
      error: null
    };
    expect(ed.divergence).not.toBeNull();
    expect(ed.divergence!.cells).toEqual([0]);
    ed.selectDivergenceCell(0);
    expect(ed.activeDivergenceCell).toBe(0);
    // 选中非分歧格不生效
    ed.selectDivergenceCell(5);
    expect(ed.activeDivergenceCell).toBeNull();
  });

  it('改动一格提示后旧分歧立即失效（含选中格）', () => {
    const ed = new EditorState();
    ed.init(standardSample(), null, 't');
    const { solution, witness } = twoSolutions();
    ed.analysis = {
      status: 'done',
      result: fakeResult({ verdict: 'multiple', solution, witness }),
      fingerprint: puzzleFingerprint(ed.puzzle),
      error: null
    };
    ed.selectDivergenceCell(0);
    expect(ed.divergence).not.toBeNull();

    const givenCell = ed.puzzle.givens.findIndex((g) => g !== 0);
    const oldVal = ed.puzzle.givens[givenCell];
    ed.setGiven(givenCell, oldVal === 9 ? 8 : oldVal + 1);

    expect(ed.divergence).toBeNull();
    expect(ed.activeDivergenceCell).toBeNull();
    expect(ed.selectedDivergenceCell).toBeNull();
  });

  it('结果对象还在但指纹不匹配 => 不显示分歧', () => {
    const ed = new EditorState();
    ed.init(standardSample(), null, 't');
    const { solution, witness } = twoSolutions();
    ed.analysis = {
      status: 'done',
      result: fakeResult({ verdict: 'multiple', solution, witness }),
      fingerprint: 'stale-fingerprint',
      error: null
    };
    expect(ed.divergence).toBeNull();
  });

  it('唯一 / 无解 / 未判定结论不显示伪第二解', () => {
    const ed = new EditorState();
    ed.init(standardSample(), null, 't');
    const fp = puzzleFingerprint(ed.puzzle);
    const { solution } = twoSolutions();
    const cases: SolveResult[] = [
      fakeResult({ verdict: 'unique', solution }),
      fakeResult({ verdict: 'unsat' }),
      fakeResult({ verdict: 'unknown', solution, reason: 'timeout' }),
      fakeResult({ verdict: 'unknown' })
    ];
    for (const result of cases) {
      ed.analysis = { status: 'done', result, fingerprint: fp, error: null };
      expect(ed.divergence).toBeNull();
    }
  });
});
