# 範本自足性驗證

2026-07-28 使用 `pnpm new-game` 在乾淨臨時目錄產生 `rp-template-smoke`。

首次驗證時 `@rogue-paradise/*` 0.1.0 尚未公開發布，測試副本以三個本機 tarball override 取代 registry 版本；正式範本的 `package.json` 仍只有公開 semver，不含 `file:`、`link:` 或 `workspace:` 依賴。

臨時副本執行 `pnpm verify` 的結果：

```text
lint 通過
typecheck 通過（core 與 app 分離）
Test Files  1 passed (1)
Tests  1 passed (1)
vite v8.1.5 build 通過
```

## 公開 Registry 自足性驗證

2026-07-28 三個共用套件公開發布並完成 registry 同步後，在全新暫存目錄以相同 `createGame` 產生器建立獨立 Git repo，未使用 workspace、override 或本機 tarball。

- `pnpm install` 從公開 registry 安裝 `@rogue-paradise/{rng,sim,platform-sdk}@0.1.0`
- `pnpm lint` 通過
- core 與 app TypeScript typecheck 通過
- Vitest：1/1 通過
- Vite production build 通過

因此「只 clone 遊戲 repo 後直接 `pnpm install && pnpm verify`」紅線已正式驗證。
