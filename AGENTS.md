# 反擊超載 專案規範

本 repo 必須能在只 clone 自己的情況下執行 `pnpm install && pnpm dev`。

## 硬紅線

- 禁止 `Math.random()`；一律使用 `@rogue-paradise/rng`
- 禁止直接使用 `localStorage`、`sessionStorage`、`indexedDB`；一律使用 `@rogue-paradise/platform-sdk`
- `src/core/` 禁止 DOM、Vite、渲染函式庫與 `src/render/` 依賴
- 禁止 `file:`、`link:`、`workspace:` 等本機耦合依賴

## 驗證

```bash
pnpm verify
```

所有工作完成前必須通過此唯一入口。
