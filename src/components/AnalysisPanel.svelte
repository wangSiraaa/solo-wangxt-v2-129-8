<script lang="ts">
  import { editor } from '../lib/state.svelte';
  import { rowOf, colOf, coordLabel } from '../lib/puzzle';
  import { cellContext, divergenceValueAt } from '../lib/divergence';

  const a = $derived(editor.analysis);

  const verdictText: Record<string, string> = {
    unique: '唯一解 ✓',
    multiple: '多解 ✗（至少两个解）',
    unsat: '无解 ✗（约束矛盾）',
    unknown: '未判定（超时）'
  };
</script>

<div class="panel">
  <div class="row">
    <button
      class="check"
      disabled={editor.z3Loading || a.status === 'checking'}
      onclick={() => editor.runCheck()}
    >
      {#if editor.z3Loading}
        正在加载 Z3 WASM…
      {:else if a.status === 'checking'}
        检查中…
      {:else}
        检查可解性与唯一解
      {/if}
    </button>
    <label class="timeout">
      每次判定超时
      <select bind:value={editor.timeoutMs}>
        <option value={2000}>2 秒</option>
        <option value={5000}>5 秒</option>
        <option value={15000}>15 秒</option>
        <option value={30000}>30 秒</option>
      </select>
    </label>
  </div>

  {#if editor.z3Error}
    <p class="error">Z3 加载失败：{editor.z3Error}（需通过带 COOP/COEP 头的服务访问）</p>
  {/if}

  {#if editor.issues.length > 0}
    <div class="issues">
      <h4>结构校验（求解前必须先修复）</h4>
      <ul>
        {#each editor.issues as issue (issue.code + issue.cells.join(','))}
          <li>{issue.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if a.status === 'idle' && !a.result && editor.issues.length === 0}
    <p class="hint">结构合法。点击上方按钮：Z3 先求首解；若可解，会<b>排除首解再求一次</b>，才能判定唯一。</p>
  {/if}

  {#if a.status === 'done' && a.result}
    {@const r = a.result}
    <div class="verdict {r.verdict}">
      <span class="badge {r.verdict}">{verdictText[r.verdict]}</span>
      <span class="ms">{Math.round(r.elapsedMs)} ms</span>
      {#if r.verdict === 'unique'}
        <label class="sol-toggle">
          <input type="checkbox" bind:checked={editor.showSolution} />
          显示答案层（仅本地作者可见）
        </label>
      {/if}
    </div>

    {#if r.verdict === 'unknown'}
      <p class="warn-text">
        求解器在时限内未能判定（{r.reason ?? 'timeout'}）。
        {#if r.solution}已找到一个解，但<b>无法确认它是否唯一</b>。请加长超时或增删提示后重试。{:else}本次未能找到解，也未能证明无解，结论为<b>未判定</b>。{/if}
      </p>
    {/if}

    {#if r.verdict === 'unsat'}
      <div class="conflict">
        <h4>导致矛盾的一组约束（unsat core）</h4>
        <ul>
          {#each r.conflict as c, i (i)}
            <li>
              {c.label}
              {#if c.cells.length}
                <button
                  class="locate"
                  onclick={() => (editor.selectedCell = c.cells[0])}
                >定位 {c.cells.map((x) => `R${rowOf(x) + 1}C${colOf(x) + 1}`).join(' ')}</button>
              {/if}
            </li>
          {/each}
        </ul>
        {#if r.reason === 'structure-invalid'}
          <p class="hint">以上为编辑期结构校验结果，未调用求解器。</p>
        {/if}
      </div>
    {/if}

    {#if r.verdict === 'multiple'}
      <p class="warn-text">
        已找到至少两个不同的合法填法（排除首解后仍能再求出一个解），
        因此题目不唯一。增加提示或温度计约束后再检查。
      </p>

      {#if editor.divergence}
        {@const div = editor.divergence}
        <div class="divergence">
          <h4>分歧视图：两解在 {div.cells.length} 格取值不同</h4>
          <p class="legend">
            <span class="sw first">蓝</span>=首解（解①）
            <span class="sw second">橙</span>=二解（解②）；分歧格已在画布标出，点击下列任一格查看其约束。
          </p>
          <ul class="divlist">
            {#each div.cells as cell, k (cell)}
              <li>
                <button
                  class="locate"
                  class:on={editor.activeDivergenceCell === cell}
                  onclick={() =>
                    editor.selectDivergenceCell(
                      editor.activeDivergenceCell === cell ? null : cell
                    )}
                >
                  {coordLabel(cell)}：①{div.first[k]} → ②{div.second[k]}
                </button>
              </li>
            {/each}
          </ul>

          {#if editor.activeDivergenceCell !== null}
            {@const sel = editor.activeDivergenceCell}
            {@const info = cellContext(editor.puzzle, sel)}
            {@const dv = divergenceValueAt(div, sel)}
            {@const peers = div.cells.filter(
              (i) =>
                i !== sel &&
                (rowOf(i) === rowOf(sel) ||
                  colOf(i) === colOf(sel) ||
                  editor.puzzle.regions[i] === editor.puzzle.regions[sel])
            )}
            <div class="cellctx">
              <h4>
                {coordLabel(sel)} 的相关约束（①{dv?.[0]} → ②{dv?.[1]}）
                <button class="close" onclick={() => editor.selectDivergenceCell(null)}>收起</button>
              </h4>
              <p class="ctxline">
                第 {info.row} 行 · 第 {info.col} 列 · 宫 {info.region + 1}
                （画布已高亮对应行/列/宫）
              </p>
              {#if info.thermometers.length}
                <ul class="ctxthermos">
                  {#each info.thermometers as t (t.index)}
                    <li>
                      温度计 #{t.index + 1}：本格为第 {t.pos + 1}/{t.path.length} 格
                      （自泡端严格递增）
                      {#if t.pos > 0}
                        {@const prev = t.path[t.pos - 1]}
                        <br />前一格 {coordLabel(prev)}（①{r.solution?.[prev]} ②{r.witness?.[prev]}）&lt;
                      {/if}
                      {#if t.pos < t.path.length - 1}
                        {@const next = t.path[t.pos + 1]}
                        &lt; 后一格 {coordLabel(next)}（①{r.solution?.[next]} ②{r.witness?.[next]}）
                      {/if}
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="ctxline">无温度计经过此格。</p>
              {/if}
              {#if peers.length}
                <p class="ctxline">
                  同一行/列/宫内的其它分歧格：{peers.map(coordLabel).join('、')}
                </p>
              {:else}
                <p class="ctxline">同一行/列/宫内没有其它分歧格。</p>
              {/if}
            </div>
          {/if}

          <p class="hint">
            分歧数据仅供作者本地参考，不会写入导出题面；工具不会自动把答案填入题面——
            请据此手工调整提示或温度计后重新检查。
          </p>
        </div>
      {/if}
    {/if}
  {/if}

  {#if a.error}
    <p class="error">检查出错：{a.error}</p>
  {/if}
</div>

<style>
  .panel { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #fafafa; }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .check {
    background: #111827; color: #fff; border: none; border-radius: 6px;
    padding: 9px 14px; font-size: 14px; cursor: pointer;
  }
  .check:disabled { opacity: 0.6; cursor: default; }
  .timeout { font-size: 12px; color: #4b5563; display: flex; gap: 6px; align-items: center; }
  select { padding: 4px; }
  h4 { margin: 10px 0 6px; font-size: 13px; }
  ul { margin: 0; padding-left: 18px; font-size: 13px; }
  li { margin: 3px 0; }
  .issues { margin-top: 10px; }
  .hint { font-size: 12px; color: #6b7280; }
  .error { color: #dc2626; font-size: 13px; }
  .verdict { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
  .badge { padding: 3px 10px; border-radius: 999px; font-size: 13px; font-weight: 600; }
  .badge.unique { background: #dcfce7; color: #166534; }
  .badge.multiple, .badge.unsat { background: #fee2e2; color: #991b1b; }
  .badge.unknown { background: #fef9c3; color: #854d0e; }
  .ms { font-size: 12px; color: #6b7280; }
  .sol-toggle { font-size: 12px; display: flex; gap: 4px; align-items: center; }
  .warn-text { font-size: 13px; color: #92400e; }
  .locate {
    margin-left: 6px; font-size: 11px; border: 1px solid #d1d5db;
    background: #fff; border-radius: 4px; padding: 1px 6px; cursor: pointer;
  }
  .divergence { margin-top: 8px; border-top: 1px dashed #e5e7eb; padding-top: 4px; }
  .legend { font-size: 12px; color: #6b7280; margin: 4px 0; }
  .sw { display: inline-block; padding: 0 5px; border-radius: 4px; font-weight: 700; }
  .sw.first { background: #dbeafe; color: #1d4ed8; }
  .sw.second { background: #ffedd5; color: #b45309; }
  .divlist { list-style: none; padding-left: 0; display: flex; flex-wrap: wrap; gap: 4px; }
  .divlist .locate { margin-left: 0; font-size: 12px; padding: 3px 8px; }
  .divlist .locate.on { background: #b45309; border-color: #b45309; color: #fff; }
  .cellctx {
    margin-top: 8px; border: 1px solid #fcd34d; background: #fffbeb;
    border-radius: 6px; padding: 8px 10px;
  }
  .cellctx h4 { display: flex; justify-content: space-between; align-items: center; margin-top: 0; }
  .close {
    font-size: 11px; border: 1px solid #d1d5db; background: #fff;
    border-radius: 4px; padding: 1px 6px; cursor: pointer;
  }
  .ctxline { font-size: 12px; color: #4b5563; margin: 4px 0; }
  .ctxthermos { font-size: 12px; color: #4b5563; padding-left: 18px; margin: 4px 0; }
</style>
