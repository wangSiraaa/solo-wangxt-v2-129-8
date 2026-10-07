<script lang="ts">
  // 多解分歧面板。只在严格条件满足时出现（见 buildDivergenceView）：
  // verdict='multiple'、两份完整且不同的解、题面指纹仍匹配。
  // 面板是只读的作者辅助视图：列出分歧格、展示选中格的行/列/宫/温度计
  // 在两解中的取值；不提供"把答案填进题面"的按钮。
  import { editor } from '../lib/state.svelte';
  import { coordLabel, puzzleFingerprint } from '../lib/puzzle';
  import { buildCellInspector, buildDivergenceView, type UnitView } from '../lib/divergence';

  const view = $derived(
    editor.puzzle
      ? buildDivergenceView(
          editor.puzzle,
          editor.analysis.result,
          editor.analysis.fingerprint,
          puzzleFingerprint(editor.puzzle)
        )
      : null
  );

  // 选中格若已不在分歧集合（理论上状态已同步复位，这里再兜底），
  // 回退到第一个分歧格，避免展示悬空选择。
  const selected = $derived(
    view
      ? view.cells.some((d) => d.cell === editor.selectedDivergence)
        ? editor.selectedDivergence
        : view.cells[0].cell
      : null
  );

  const inspector = $derived(
    view && selected !== null ? buildCellInspector(editor.puzzle, view, selected) : null
  );

  const unitName: Record<UnitView['kind'], string> = {
    row: '行',
    column: '列',
    region: '宫'
  };

  function unitCellLabel(u: UnitView, pos: number): string {
    const cell = u.cells[pos];
    if (u.kind === 'row') return `C${(cell % 9) + 1}`;
    if (u.kind === 'column') return `R${Math.floor(cell / 9) + 1}`;
    return coordLabel(cell);
  }
</script>

{#if view}
  <div class="divergence">
    <h4>两解分歧（{view.cells.length} 格）</h4>
    <p class="legend">
      <span class="sw a">蓝</span> 首解 M1，
      <span class="sw b">紫</span> 二解 M2；两解只在这些格取不同值，
      其余格完全一致。
    </p>

    <ul class="cells">
      {#each view.cells as d (d.cell)}
        <li>
          <button
            class="cell-chip"
            class:on={selected === d.cell}
            onclick={() => editor.selectDivergenceCell(d.cell)}
            title={`${coordLabel(d.cell)}：M1=${d.a}，M2=${d.b}`}
          >
            <span class="coord">{coordLabel(d.cell)}</span>
            <span class="pair"><b class="a">{d.a}</b><i>→</i><b class="b">{d.b}</b></span>
          </button>
        </li>
      {/each}
    </ul>

    {#if inspector}
      <div class="inspector">
        <p class="ins-head">
          选中 <strong>{coordLabel(inspector.cell)}</strong>：
          M1 = <b class="a">{inspector.a}</b>，M2 = <b class="b">{inspector.b}</b>
        </p>

        {#each [inspector.row, inspector.column, inspector.region] as u (u.kind + u.index)}
          <div class="unit">
            <div class="unit-name">
              {unitName[u.kind]} {u.index}
              <span class="dim">（两解各自都是 1–9 排列）</span>
            </div>
            <div class="strip" class:row={u.kind === 'row'} class:col={u.kind === 'column'}>
              {#each u.cells as cell, pos (cell)}
                <div class="mini" class:focus={pos === u.focusPos} title={coordLabel(cell)}>
                  <span class="mini-coord">{unitCellLabel(u, pos)}</span>
                  <span class="mini-pair">
                    <b class="a">{u.valuesA[pos]}</b>
                    <b class="b">{u.valuesB[pos]}</b>
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/each}

        <div class="thermos">
          {#if inspector.thermos.length === 0}
            <p class="dim">该格不属于任何温度计。</p>
          {:else}
            {#each inspector.thermos as t (t.thermometer)}
              <div class="thermo">
                <div class="unit-name">
                  温度计 #{t.thermometer + 1}
                  <span class="dim">（水银柱自泡端严格递增；第 {t.focusPos + 1} 格为选中格）</span>
                </div>
                <div class="strip">
                  {#each t.path as cell, pos (cell)}
                    <div class="mini" class:focus={pos === t.focusPos} title={coordLabel(cell)}>
                      <span class="mini-coord">{coordLabel(cell)}</span>
                      <span class="mini-pair">
                        <b class="a">{t.valuesA[pos]}</b>
                        <b class="b">{t.valuesB[pos]}</b>
                      </span>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          {/if}
        </div>

        <p class="note">
          以上为作者私有的对照数据，仅存于本地、不进入题面导出。
          工具<strong>不会</strong>自动把任一解填成提示；请自行判断后切到「提示」工具
          补一个数字（改动任意一格都会使本分歧立即失效，需重新检查）。
        </p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .divergence {
    margin-top: 10px;
    border: 1px solid #e9d5ff;
    background: #faf5ff;
    border-radius: 8px;
    padding: 10px 12px;
  }
  h4 { margin: 0 0 6px; font-size: 13px; color: #6b21a8; }
  .legend { font-size: 12px; color: #6b21a8; margin: 0 0 8px; }
  .sw { display: inline-block; border-radius: 3px; padding: 0 5px; font-weight: 700; }
  .sw.a { background: #dbeafe; color: #1d4ed8; }
  .sw.b { background: #f3e8ff; color: #7e22ce; }
  .cells { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-wrap: wrap; gap: 5px; }
  .cell-chip {
    display: flex; flex-direction: column; align-items: center; gap: 1px;
    border: 1px solid #d8b4fe; background: #fff; border-radius: 6px;
    padding: 3px 8px; cursor: pointer; line-height: 1.1;
  }
  .cell-chip:hover { border-color: #7e22ce; }
  .cell-chip.on { background: #7e22ce; border-color: #7e22ce; }
  .cell-chip.on .coord,
  .cell-chip.on .a,
  .cell-chip.on .b { color: #fff; }
  .cell-chip.on i { color: #e9d5ff; }
  .coord { font-size: 10px; color: #6b7280; }
  .pair { font-size: 13px; display: flex; gap: 3px; align-items: center; font-style: normal; }
  .pair i { font-style: normal; font-size: 10px; color: #9ca3af; }
  .a { color: #1d4ed8; }
  .b { color: #7e22ce; }
  .inspector { border-top: 1px dashed #d8b4fe; padding-top: 8px; }
  .ins-head { margin: 0 0 8px; font-size: 13px; }
  .unit, .thermo { margin: 7px 0; }
  .unit-name { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 3px; }
  .dim { font-weight: 400; color: #9ca3af; font-size: 11px; }
  .strip { display: flex; flex-wrap: wrap; gap: 3px; }
  .mini {
    display: flex; flex-direction: column; align-items: center;
    border: 1px solid #e5e7eb; border-radius: 4px; background: #fff;
    padding: 1px 5px 2px; min-width: 30px;
  }
  .mini.focus {
    border-color: #7e22ce; border-width: 2px; background: #f3e8ff;
  }
  .mini-coord { font-size: 9px; color: #9ca3af; }
  .mini-pair { font-size: 13px; display: flex; gap: 4px; font-weight: 700; }
  .note { font-size: 11px; color: #6b7280; line-height: 1.5; margin: 8px 0 0; }
</style>
