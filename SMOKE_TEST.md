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

## 0.1.0 垂直切片檢查

1. 開啟遊戲後按「啟動反擊」。
2. 青色攻擊進入命中環前按對應方向；確認完美反擊提高威脅並縮短下一招前搖。
3. 紅色破防進入相位窗口時按 `Shift`；方向鍵不得擋下破防。
4. 威脅達 3 後按 `Space`；確認造成崩解、威脅歸零且後兩招降速。
5. 故意失誤至完整度歸零；確認可重新挑戰。
6. 在 `1280 × 720` 確認頁面與主流程無垂直／水平滾動。

## 0.2.0 音樂音效檢查

1. 尚未按「啟動反擊」前確認沒有自動播放；按下後應聽見三音啟動與 96 BPM 低頻脈衝。
2. 連續完成完美反擊，確認威脅 0–5 對應 96、110、124、138、152、166 BPM，且聲部逐級增加。
3. 確認左／右攻擊具有對應聲像，上／下攻擊以不同音色高度區分；視覺固定鍵位仍是主要判讀依據。
4. 確認紅色破防使用低頻雙音警報，與一般方向攻擊明顯不同。
5. 分別觸發普通、完美、失誤、相位與制動核心，確認不用看畫面也能以輪廓分辨。
6. 開啟右上「音訊」，逐一調整音樂、效果、介面，並確認「全部靜音」不影響畫面判讀與操作。
7. 勝利與失敗時配樂停止，分別播放上行與下行四音結束動機。
