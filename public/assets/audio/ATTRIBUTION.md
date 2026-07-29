# 音訊素材來源與授權

## 0.3.0 hybrid procedural 垂直切片

目前版本沒有載入第三方音樂、錄音、取樣包或拆包素材。

下列內容皆由 Rogue Paradise 原創程式透過瀏覽器 Web Audio API 即時產生：

| 類別 | 實作 | 外部素材 |
| --- | --- | --- |
| 節拍骨架 | oscillator kick、固定 seed noise snare／hat | 無 |
| 音樂底座 | oscillator bass、pad、call melody | 無 |
| 左右中央 cue | oscillator body 加固定 seed noise transient | 無 |
| 玩家命中 | lane hit、程序式和弦與答句 | 無 |
| Rogue 模組 | 程序式回聲、hat、rim、sub 與 shield noise | 無 |
| 介面音效 | oscillator sequence | 無 |

固定 seed noise buffer 是執行時由專案程式碼計算產生，不包含錄音或第三方波形。

## 已知限制

本垂直切片用於驗證共享拍格、call-and-response、配器空位、lane 辨識、sidechain 與整合 API，不代表最終：

- 鼓組重量與真實瞬態。
- 金屬撞擊材質與 round-robin 變化。
- 房間殘響、空間深度與最終母帶響度。
- 48kHz／24-bit stems 及正式 Web 壓縮格式。

正式 one-shots 或 stems 導入後，必須在本文件逐檔補上檔名、用途、作者、原始網址、取得日期、授權名稱、授權網址與修改內容。禁止在授權資料完成前合併素材。
