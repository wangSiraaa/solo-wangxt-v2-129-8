import { describe, expect, it } from 'vitest';
import { EditorState } from './state.svelte';
import { multipleSample, standardSample } from './samples';
import { puzzleFingerprint } from './puzzle';

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

// 分歧视图状态规则：只有"当前题面指纹上的多解结论"才允许挂着分歧选择。
describe('多解分歧随题面改动失效', () => {
  function edWithMultiple(): { ed: EditorState; fp: string } {
    const ed = new EditorState();
    ed.init(multipleSample(), null, 'm');
    const fp = puzzleFingerprint(ed.puzzle);
    // 模拟 Z3 两次 check 后的多解结论：两解在若干空格上不同
    const solution = new Array(81).fill(0).map(() => 1);
    const witness = new Array(81).fill(0).map(() => 1);
    solution[1] = 2;
    witness[1] = 3;
    solution[2] = 4;
    witness[2] = 5;
    ed.analysis = {
      status: 'done',
      result: { verdict: 'multiple', solution, witness, conflict: [], reason: null, elapsedMs: 1 },
      fingerprint: fp,
      error: null
    };
    ed.selectedDivergence = 1;
    return { ed, fp };
  }

  it('改动一个提示后旧多解结论与分歧选择立即清空', () => {
    const { ed } = edWithMultiple();
    expect(ed.analysis.result?.verdict).toBe('multiple');
    expect(ed.selectedDivergence).toBe(1);

    // 在任意空格补一个提示（模拟作者据分歧手工修改题面）
    ed.setGiven(1, 2);

    expect(ed.analysis.status).toBe('idle');
    expect(ed.analysis.result).toBeNull();
    expect(ed.analysis.fingerprint).toBeNull();
    expect(ed.selectedDivergence).toBeNull();
  });

  it('清除一个提示同样使旧分歧失效', () => {
    const { ed } = edWithMultiple();
    const givenCell = ed.puzzle.givens.findIndex((g) => g !== 0);
    expect(givenCell).toBeGreaterThanOrEqual(0);
    ed.clearCell(givenCell);
    expect(ed.analysis.result).toBeNull();
    expect(ed.selectedDivergence).toBeNull();
  });

  it('selectDivergenceCell 只更新查看选择，绝不写题面 givens', () => {
    const { ed } = edWithMultiple();
    const givensBefore = [...ed.puzzle.givens];
    ed.selectDivergenceCell(2);
    expect(ed.selectedDivergence).toBe(2);
    expect(ed.selectedCell).toBe(2);
    expect(ed.puzzle.givens).toEqual(givensBefore);
    ed.selectDivergenceCell(null);
    expect(ed.selectedDivergence).toBeNull();
    expect(ed.puzzle.givens).toEqual(givensBefore);
  });

  it('init 切题时分歧选择复位', () => {
    const { ed } = edWithMultiple();
    ed.init(standardSample(), null, 'std');
    expect(ed.selectedDivergence).toBeNull();
  });
});
