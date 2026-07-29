# 《反擊超載》0.3.1 音樂音效指南

狀態：已核准的 hybrid procedural 垂直切片

完整規格：`design/audio-rework-0.3.0.md`

## 聲音支柱

1. **Boss 出題，玩家補完音樂**：每小節前半是 Boss call，後半為玩家 response。完美命中補入完整打擊與和聲尾奏，一般命中只補乾燥打擊，失誤留下可聽見的空拍。
2. **節拍骨架不中斷**：kick、backbeat 與 hat 使用獨立 rhythm stem。Boss cue、玩家命中及 sidechain 只壓 harmony／melody，不抽掉操作所需拍點。
3. **三鍵三音色**：左為低 tom、右為高 rim/tom、中央為 metal slam 加 sub；左右另以 ±0.55 聲像輔助。`Space` 永遠只表示中央重拍／破防反制。
4. **共享時間，不由音訊裁決**：音訊接受 performance timeline 的目標時間並映射到 Web Audio；核心依同一目標時間自行判定，不監聽音訊播放完成事件。
5. **靜音仍能玩**：所有 call、response、模組與判定均需同步軌道、按鍵符號及文字狀態。

## 拍格與編排

| 速度階級 | BPM | 八分格 | 編排 |
| --- | ---: | ---: | --- |
| 0 | 120 | 250ms | kick、四分刻度、低密度 call |
| 1 | 132 | 約 227ms | backbeat、八分 hat、bass |
| 2 | 144 | 約 208ms | 切分 bass、裝飾性十六分 hat |

- 每小節固定 8 個八分格。
- 第 1–3 格為 `call`，第 4 格為統一 `pickup`，第 5–8 格皆為 `response`；slot 8 不再是另一種相位。
- 玩家必要輸入只落在八分格；十六分只作裝飾。
- 速度變更排到下一個 8 小節 section 邊界，不因單次命中瞬間跳速。
- response 區不播放主旋律或 Boss pickup，保留玩家命中的配器空位。

## 終曲與結果切換

Boss 完整度歸零或玩家失敗後，戰鬥流程必須立刻停止建立新目標，並呼叫 `playEncounterFinale('victory' | 'defeat')`。此 API 會取消尚未播放的 Boss call、關閉 transport、鎖住後續的 call／response 音效，然後演出一個完整 4/4 收束小節與短尾韻。

- 勝利：重 kick、backbeat、推進 bass 與上行終止和弦；最後兩格才落下終止和弦。
- 失敗：較低的脈衝、下行終止和弦與短尾韻。
- render 需使用回傳的 `endsAtPerformanceMs`（或 `durationMs`）延後進入獎勵／結算，終曲期間不顯示、也不接受新音符。
- 這一小節是結束演出，不是可按的節拍；視覺必須清除目標並標記「終曲收束」。

## 公開 API

`CounterOverdriveAudio` 提供：

- `unlock()`：只在玩家互動後建立或恢復 AudioContext。
- `startTransport({ tempoTier, startAtPerformanceMs })`：啟動共享八分拍格，回傳 transport snapshot。
- `stopTransport()`：停止後續排程。
- `setTempoTier(tier, atSectionBoundary?)`：預設於下一個 8 小節邊界換速。
- `getTransportSnapshot()`：取得 BPM、八分格、下一格位置與 performance 時間。
- `performanceTimeToContextTime()`／`contextTimeToPerformanceTime()`：在核心時間與 Web Audio 間轉換。
- `setCalibrationOffset()`／`calibratedInputTime()`：保存並套用 -150 至 +150ms、每級 5ms 的輸入校正值。
- `scheduleBossCall({ lane, callAtPerformanceMs, targetAtPerformanceMs, heavy })`：在 call/pickup 相位排程左、右或中央呼叫；pickup 固定由 transport 的 slot 3 統一提供。
- `playCounterHit({ lane, grade, atPerformanceMs })`：讓玩家完美、一般或失誤成為回擊區配器。
- `playModuleResponse(kind, atPerformanceMs)`：播放受控的 Rogue 模組答句。
- `playEncounterFinale(outcome)`：停止目標音訊與 transport，播放一個完整終曲小節；回傳安全切畫面的時間點。
- `setBusVolume()`／`setMuted()`：控制音樂、效果、介面與全域靜音。

舊版 `startMusic`、`stopMusic`、`setThreat`、`playAttack`、`playResolution` 暫時保留為相容層；0.3.0 render 應改用 lane 與目標時間 API。

## Cue 與混音

| 事件 | 聲音 | Sidechain |
| --- | --- | --- |
| 左 call | 低 tom、低頻噪聲、左聲像 | harmony／melody 2.5dB |
| 右 call | 高 rim/tom、高頻瞬態、右聲像 | harmony／melody 2.5dB |
| 中央 call | metal slam、sub、置中噪聲 | harmony／melody 4.5dB |
| 完美 response | lane hit、五度和弦、下一八分答句 | harmony／melody 4.5dB |
| 一般 response | 乾燥 lane hit | harmony／melody 2.5dB |
| miss | muted thud，保留原本空拍 | 不 duck |

- Sidechain attack 3–5ms，release 90–140ms。
- rhythm stem 永不進入一般 sidechain。
- 0.3.1 將主節拍、bass、pad 與 call 旋律加強，並保持 master limiter 防止程序式聲部相加爆音；最終正式素材仍須完成 LUFS 與 true-peak 量測。
- 左右 cue 不只依賴聲像：左偏低且厚，右偏高且短，中央具有獨立 sub/metal 輪廓。

## Rogue 模組答句

垂直切片提供五種可呼叫音訊：

- `echo-blade`：下一 offbeat 的反向回聲。
- `downbeat-capacitor`：低音電荷落點。
- `cross-circuit`：八分轉十六分的 hat 裝飾。
- `syncopation-core`：左右交錯 rim 答句。
- `silent-shield`：短噪聲碎裂與下墜音。

模組音效只表達已由核心確認的結果，不能自行觸發傷害、資源或額外輸入。

## 目前素材限制

目前尚無正式錄音 one-shots 或 stems。垂直切片使用原創程式式混合合成：

- oscillator：kick/sub、tom body、bass、pad、旋律與金屬和聲。
- 固定 seed 的 noise buffer：hat、snare、rim transient、metal/noise layer。
- 分 stem GainNode：rhythm、harmony、melody。

這能驗證節拍、配器空位、聲音辨識與 API，但不能代表最終鼓組重量、空間感與母帶品質。正式製作時應以具完整授權的原創／委託 one-shots 逐項替換，並維持相同事件名稱、lane 語意及混音預算。
