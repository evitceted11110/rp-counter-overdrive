# 0.4.0 實作交接：固定譜面與分數擊破

本文件是 `spec.md` 的工程驗收摘錄。目標不是把 Boss 血量換名為分數，而是移除「Boss 死亡會干預演奏中譜面」這個機制。

## 狀態機

```text
倒數 → 演奏（未擊破） → 加分尾奏（已擊破） → 最後音符結算 → 終曲 → 選擇／結果
                         ↘ 死亡（僅未擊破時）
```

- `演奏` 到 `加分尾奏` 的唯一條件是 `baseScore + bonusScore >= defeatScore`。
- 轉換只改 `postDefeat = true`、配器、Boss 表現與 Miss 傷害規則；禁止呼叫任何重新生成、壓縮、替換或清除 target 的程式。
- 只允許在 `nextUnresolvedNoteIndex === chart.length` 後進終曲。最後一音符未到判定截止前，不能清空它。
- 加分尾奏的 Miss 給 0 分、仍做聽覺回饋與準度統計，但 `playerIntegrity` 不得減少，亦不得觸發死亡。

## 最小資料模型

```ts
type FixedChart = {
  id: string
  noteBudget: number
  chartBars: number
  notes: ReadonlyArray<ChartNote>
}

type ScoreState = {
  baseScore: number
  bonusScore: number
  defeatScore: number
  postDefeat: boolean
  resolvedNotes: number
}
```

`ChartNote` 在進入倒數前建立。`id`、`targetTime`、`lane`、`barIndex`、`patternId` 與 `displaySlot` 必須不可變。視覺上的窗口環、導線、分數徽記可寫在獨立的 `NoteOverlayState`，不得回寫或重建 `ChartNote`。

## 給分順序

每個音符按以下順序結算：

1. 以既有窗口判定 Perfect／Normal／Miss。
2. 加入固定基礎分：2／1／0。
3. 以已結算的原生順序判斷構築條件，加入 `bonusScore` 或調整下一個**既有**目標的窗口／保險。
4. 若首次跨過 `defeatScore`，設定加分尾奏；不可修改 `notes`。
5. 若為 Miss，僅在 `postDefeat === false` 且保險未消耗時扣玩家完整度。

先加基礎分、後判斷流派效果，能讓「第二拍交替 +2」等效果在同一顆目標上清楚顯示基礎與額外分數。

## 構築邊界

`items.json` schema 3 的 effect 都只能做以下其中一種事：

- 對符合條件的既有 Perfect／Normal 加 `bonusScore`。
- 對下一個符合條件的既有目標調整 Perfect／Normal 窗口。
- 將一次 Miss 改判 Normal，或暫時防止完整度損失。
- 改變既有目標的非判讀性視覺覆蓋與音樂層。

禁止使用任何會回傳新 note、重排 note、轉換 rest 成 note、替換下一小節模板、依擊破值縮短 chart 的 effect type。

## 必測情境

1. 以 50 顆 Boss 為例：第 15 顆後剛好 36 分，剩下 35 顆的 ids、時間、軌道與顯示槽位逐一等於倒數前的 chart。
2. 擊破後連續 Miss 至曲末：玩家完整度不變、分數不倒扣、結果在第 50 顆的截止後才出現。
3. 最後一顆達門檻：不進額外空尾奏，正常結算最後一顆後進終曲。
4. 交叉共振、重拍電容、飛輪、三相、延遲簧片的額外分數都不能令 `notes.length` 或任一 note 的鍵位／拍點改變。
5. 同 seed、選擇、輸入紀錄，無論在何時跨門檻，編譯出的 chart byte-for-byte 相同。
