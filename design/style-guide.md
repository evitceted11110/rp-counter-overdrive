# 《反擊超載》垂直切片視覺準則

日期：2026-07-29

## 混合表現比例

- 約 70% 程式生成：攻擊預兆、命中環、方向箭頭、反擊軌跡、電弧、傷害數字、畫面閃光與威脅變色。
- 約 30% 關鍵美術：Boss 輪廓、中央核心、場景結構、重要核心釋放與流派圖示。

高速時，危險資訊的層級永遠高於裝飾美術。Boss 圖像不得遮住方向箭頭、命中環或玩家核心。

## 色彩語意

| 顏色 | 用途 |
|---|---|
| 冷青 | 可反擊攻擊、完美窗口、一般能量 |
| 琥珀 | 超載核心可釋放、Boss 崩解 |
| 紅 | 不可反擊的破防招、玩家受傷 |
| 紫 | 相位資源與穿越結果 |

同一顏色不能在同一畫面同時代表危險與獎勵。

## 威脅表現

- 0–3 級以節拍格、場地線條與核心亮度逐步增加。
- 4 級轉為琥珀警戒。
- 5 級轉為紅橙邊緣電弧，但攻擊箭頭仍維持最高對比。
- 螢幕閃光時間不得超過 360ms，且不移動攻擊預兆。

## Boss 關鍵美術

資產：`public/assets/boss-prism-supervisor.png`

用途：棱鏡監工正面主體與場景融合圖。四個方向的幾何翼與中央破裂核心支援四方向攻擊語意；外圍暗部保留給 HUD 與程式預兆。

使用內建 imagegen 產生，最終 prompt：

> Use case: stylized-concept. Asset type: game boss key art for a single-screen browser action roguelite. Create the first boss, 「棱鏡監工」, a menacing geometric industrial machine built around a bright fractured reactor core. Its body has four clear armored directional fins pointing up, right, down, and left. Near-black industrial void, centered symmetrical front view, sharp graphic shapes, painterly gunmetal texture, cold cyan core and restrained amber warning accents. No text, logo, watermark, UI, characters, or visual noise around the outer margin.

## 動態因果

每個重要結果需同時出現：

1. 來源：攻擊箭頭或核心卡發亮。
2. 動作：軌跡抵達玩家／Boss 核心。
3. 結果：完美、普通、失誤或相位文字，以及精確傷害數字。
4. 狀態：Boss 崩解條、玩家完整度或威脅階級同步更新。
