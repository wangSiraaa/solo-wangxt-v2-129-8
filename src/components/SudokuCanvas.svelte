<script lang="ts">
  import { editor } from '../lib/state.svelte';
  import { CELL_COUNT, N, colOf, rowOf, type CellIndex } from '../lib/puzzle';
  import { cellContext } from '../lib/divergence';

  let canvas: HTMLCanvasElement;
  const CELL = 56; // CSS 像素/格
  const SIZE = CELL * N;
  let hover = $state<number | null>(null);
  let dpr = $state(1);

  // 9 个低饱和宫色
  const REGION_COLORS = [
    '#cfe3ff', '#d9f2d1', '#ffe2c2', '#f6d6d6', '#e6d8f5',
    '#c9f0ee', '#f2efcf', '#d6e4f5', '#f5d9ea'
  ];

  // 设备像素比变化时重设画布尺寸
  $effect(() => {
    if (!canvas) return;
    dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width = SIZE + 'px';
    canvas.style.height = SIZE + 'px';
  });

  // 订阅任意会影响绘制的状态（在 draw 中读取即建立依赖）
  const tick = $derived.by(() => {
    void editor.puzzle;
    void editor.tool;
    void editor.activeThermo;
    void editor.highlightCells;
    void editor.showSolution;
    void editor.analysis;
    void editor.selectedCell;
    void editor.divergence;
    void editor.activeDivergenceCell;
    void hover;
    void dpr;
    return 1;
  });

  $effect(() => {
    void tick;
    draw();
  });

  function center(i: CellIndex): [number, number] {
    return [colOf(i) * CELL + CELL / 2, rowOf(i) * CELL + CELL / 2];
  }

  function draw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);

    const p = editor.puzzle;
    if (!p) return;

    // 1) 宫底色
    for (let i = 0; i < CELL_COUNT; i++) {
      const r = rowOf(i), c = colOf(i);
      ctx.fillStyle = REGION_COLORS[p.regions[i] % REGION_COLORS.length];
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }

    // 2) 高亮格（结构错误 / 矛盾核）
    ctx.fillStyle = 'rgba(220, 38, 38, 0.22)';
    editor.highlightCells.forEach((i) => {
      ctx.fillRect(colOf(i) * CELL, rowOf(i) * CELL, CELL, CELL);
    });

    // 2b) 分歧视图：选中分歧格时，先铺其行/列/宫的浅色关联带
    const div = editor.divergence;
    const divSel = editor.activeDivergenceCell;
    if (div && divSel !== null) {
      const info = cellContext(p, divSel);
      ctx.fillStyle = 'rgba(217, 119, 6, 0.10)';
      const band = new Set([...info.rowCells, ...info.colCells, ...info.regionCells]);
      band.forEach((i) => {
        ctx.fillRect(colOf(i) * CELL, rowOf(i) * CELL, CELL, CELL);
      });
    }
    // 分歧格本体：琥珀底色 + 描边，一眼看到两解在哪些格分叉
    if (div) {
      ctx.fillStyle = 'rgba(217, 119, 6, 0.22)';
      div.cells.forEach((i) => {
        ctx.fillRect(colOf(i) * CELL, rowOf(i) * CELL, CELL, CELL);
      });
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      div.cells.forEach((i) => {
        ctx.strokeRect(colOf(i) * CELL + 1, rowOf(i) * CELL + 1, CELL - 2, CELL - 2);
      });
    }

    // 悬停
    if (hover !== null) {
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(colOf(hover) * CELL, rowOf(hover) * CELL, CELL, CELL);
    }
    // 选中格
    if (editor.selectedCell !== null) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      ctx.strokeRect(
        colOf(editor.selectedCell) * CELL + 1.5,
        rowOf(editor.selectedCell) * CELL + 1.5,
        CELL - 3,
        CELL - 3
      );
    }

    // 3) 温度计（先画线和泡，置于格线之下）
    p.thermometers.forEach((t, ti) => {
      const active = ti === editor.activeThermo;
      // 分歧视图：经过选中分歧格的温度计用紫色强调
      const throughDivSel =
        divSel !== null && div !== null && t.path.includes(divSel);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // 外管
      ctx.strokeStyle = throughDivSel ? '#7c3aed' : active ? '#b45309' : '#374151';
      ctx.lineWidth = throughDivSel ? CELL * 0.46 : CELL * 0.4;
      beginPathThrough(ctx, t.path);
      ctx.stroke();
      // 内芯
      ctx.strokeStyle = throughDivSel ? '#c4b5fd' : active ? '#f59e0b' : '#9ca3af';
      ctx.lineWidth = CELL * 0.26;
      beginPathThrough(ctx, t.path);
      ctx.stroke();
      // bulb（水银泡）在路径首端
      const [bx, by] = center(t.path[0]);
      ctx.fillStyle = throughDivSel ? '#7c3aed' : active ? '#f59e0b' : '#374151';
      ctx.beginPath();
      ctx.arc(bx, by, CELL * 0.26, 0, Math.PI * 2);
      ctx.fill();
      // 顶端小帽
      const [tx, ty] = center(t.path[t.path.length - 1]);
      ctx.fillStyle = throughDivSel ? '#7c3aed' : active ? '#f59e0b' : '#374151';
      ctx.beginPath();
      ctx.arc(tx, ty, CELL * 0.13, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4) 格线
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    for (let k = 0; k <= N; k++) {
      ctx.beginPath(); ctx.moveTo(k * CELL + 0.5, 0); ctx.lineTo(k * CELL + 0.5, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, k * CELL + 0.5); ctx.lineTo(SIZE, k * CELL + 0.5); ctx.stroke();
    }
    // 宫界（粗线）：相邻不同宫
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < CELL_COUNT; i++) {
      const r = rowOf(i), c = colOf(i);
      const x = c * CELL, y = r * CELL;
      if (r === 0 || p.regions[i] !== p.regions[i - N]) line(ctx, x, y, x + CELL, y);
      if (c === 0 || p.regions[i] !== p.regions[i - 1]) line(ctx, x, y, x, y + CELL);
      if (r === N - 1 || p.regions[i] !== p.regions[i + N]) line(ctx, x + CELL, y, x + CELL, y + CELL);
      if (c === N - 1 || p.regions[i] !== p.regions[i + 1]) line(ctx, x, y + CELL, x + CELL, y + CELL);
    }

    // 5) 提示数字（作者题面）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${CELL * 0.62}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = '#111827';
    for (let i = 0; i < CELL_COUNT; i++) {
      const g = p.givens[i];
      if (g) {
        const [cx, cy] = center(i);
        ctx.fillText(String(g), cx, cy + 1);
      }
    }

    // 6) 解层（仅作者本地查看，不参与导出）
    if (editor.showSolution && editor.analysis.result?.solution) {
      const sol = editor.analysis.result.solution;
      ctx.font = `500 ${CELL * 0.42}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = '#2563eb';
      for (let i = 0; i < CELL_COUNT; i++) {
        if (p.givens[i]) continue;
        const [cx, cy] = center(i);
        ctx.fillText(String(sol[i]), cx, cy + 1);
      }
    }

    // 7) 分歧层（仅作者本地查看，不参与导出）：
    //    每个分歧格内画两个数字——左上=首解（蓝），右下=二解（橙）。
    //    分歧格一定不是提示格（两解都满足全部提示），不会与题面数字重叠。
    if (div) {
      ctx.font = `700 ${CELL * 0.3}px ui-sans-serif, system-ui, sans-serif`;
      div.cells.forEach((cell, k) => {
        const x = colOf(cell) * CELL;
        const y = rowOf(cell) * CELL;
        ctx.fillStyle = '#2563eb';
        ctx.fillText(String(div.first[k]), x + CELL * 0.27, y + CELL * 0.3);
        ctx.fillStyle = '#b45309';
        ctx.fillText(String(div.second[k]), x + CELL * 0.73, y + CELL * 0.74);
      });
      // 选中的分歧格：加粗琥珀边框
      if (divSel !== null) {
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 3.5;
        ctx.strokeRect(
          colOf(divSel) * CELL + 2,
          rowOf(divSel) * CELL + 2,
          CELL - 4,
          CELL - 4
        );
      }
    }
  }

  function beginPathThrough(ctx2: CanvasRenderingContext2D, path: CellIndex[]) {
    const [sx, sy] = center(path[0]);
    ctx2.beginPath();
    ctx2.moveTo(sx, sy);
    for (let k = 1; k < path.length; k++) {
      const [x, y] = center(path[k]);
      ctx2.lineTo(x, y);
    }
  }
  function line(ctx2: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    ctx2.beginPath();
    ctx2.moveTo(x1, y1);
    ctx2.lineTo(x2, y2);
    ctx2.stroke();
  }

  function eventCell(e: MouseEvent): CellIndex | null {
    const rect = canvas.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * N);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * N);
    if (r < 0 || r >= N || c < 0 || c >= N) return null;
    return r * N + c;
  }

  let painting = false;
  function onDown(e: MouseEvent) {
    const cell = eventCell(e);
    if (cell === null) return;
    painting = true;
    editor.onCellClick(cell);
    // 分歧视图开启时，点击分歧格即选中查看其约束（不影响当前编辑工具）
    if (editor.divergence?.cells.includes(cell)) {
      editor.selectDivergenceCell(cell);
    }
  }
  function onMove(e: MouseEvent) {
    hover = eventCell(e);
    // 宫区刷色支持拖动
    if (painting && editor.tool === 'regions' && hover !== null) editor.onCellClick(hover);
  }
  function onUp() {
    painting = false;
  }
  function onLeave() {
    hover = null;
    painting = false;
  }
  function onDbl(e: MouseEvent) {
    const cell = eventCell(e);
    if (cell !== null && editor.tool === 'thermo-extend') editor.finishThermo();
  }
</script>

<canvas
  bind:this={canvas}
  role="grid"
  aria-label="数独棋盘"
  onpointerdown={onDown}
  onpointermove={onMove}
  onpointerup={onUp}
  onpointerleave={onLeave}
  ondblclick={onDbl}
></canvas>

<style>
  canvas {
    display: block;
    border-radius: 6px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
    background: #fff;
    cursor: crosshair;
    max-width: 100%;
    touch-action: none;
  }
</style>
