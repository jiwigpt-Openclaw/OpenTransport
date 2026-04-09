# 巴士項目壓縮總結

更新日期：2026-04-09

## 1. 專案一句話
`OpenTransport` 是一個純前端香港巴士 / 小巴 ETA 查詢網站，已支援 `KMB`、`CTB`、`NLB`、`GMB`，並已做出路線搜尋、方向卡片、站點 ETA、GPS 最近站、常用路線、附近站轉查、PWA 等核心功能。

## 2. 目前已完成的能力
- 輸入路線號後，會先搜尋可用公司與方向，再顯示方向卡片。
- 點選方向卡片後，才真正載入該方向站點與 ETA。
- 支援正常班次與特別班次整理。
- ETA 倒數每 30 秒更新一次，資料每 60 秒重新抓取一次。
- 支援 `localStorage` 收藏常用路線，首頁可直接點擊快捷查詢。
- 支援 GPS 自動找最近站、展開站點、並自動捲到視窗中央。
- 點擊站點可開啟 modal，查看本站 / 附近站有哪些路線可搭，並可直接跳去查該路線。
- 已有 PWA、分享按鈕、手機版 / 桌面版響應式布局。

## 3. 真正的核心架構
- `index.html`
  頁面骨架，會載入 `official-bus-stop-index.js`、`script.js`、`stable-overrides.js`。
- `script.js`
  主程式，約 5538 行，包含公司設定、路線搜尋、站點載入、ETA 合併、GPS、modal、render、auto refresh。
- `stable-overrides.js`
  後補的穩定覆蓋層，會重新掛上 `searchETA` 和 `showStopInfoModal`，用來修正主檔內歷史重寫造成的不穩定行為。
- `style.css`
  主要 UI 樣式。
- `scripts/generate-official-bus-stop-index.mjs`
  用政府靜態資料生成官方站位索引。
- `official-bus-stop-index.json` / `official-bus-stop-index.js`
  預先生成的官方站位索引，約 5.6 MB，提供附近站 / 同站轉查的基礎資料。

## 4. 目前使用的資料來源
- `KMB`：`data.etabus.gov.hk`
- `CTB`：`rt.data.gov.hk/v2/transport/citybus`
- `NLB`：`rt.data.gov.hk/v2/transport/nlb`
- `GMB`：`data.etagmb.gov.hk`
- 批次 stop-eta / stop-route：`rt.data.gov.hk`
- 官方靜態站位主資料：`JSON_BUS.json`

## 5. 目前專案狀態判斷
- 這個項目已經不是 MVP，而是可用的上線版雛形。
- 實際功能比 `README.md` 和 `product.md` 更新；例如 README 還把「收藏常用路線」寫成待辦，但程式其實已實作。
- 目前最大問題不是功能太少，而是主程式已累積不少歷史版本與覆寫痕跡，之後維護成本會愈來愈高。

## 6. 已知技術債 / 風險
- `script.js` 很大，而且內部有多次同名函式重寫痕跡，閱讀與修改風險高。
- `stable-overrides.js` 是有效的補丁層，但也代表主邏輯分散在兩個地方。
- `sw.js` 目前只快取少量核心檔，尚未完整納入 `stable-overrides.js` 與官方索引檔，PWA 離線一致性仍可加強。
- 官方站位索引檔案很大，後續可優化載入、切分或快取策略。
- 若直接用 `file://` 開啟頁面，部分 API 會受 CORS 影響，尤其 `GMB`；本機測試應改用 Live Server 或部署環境。

## 7. 下次回來建議先做的事
1. 先整理 `script.js`，把重複覆寫的舊函式清掉。
2. 把 `stable-overrides.js` 的穩定版本內容回收進主程式，減少雙檔維護。
3. 拆模組，至少分成：
   `company-config`、`route-search`、`variant-loader`、`stop-modal`、`geolocation`、`render`
4. 重整 PWA 快取，把 `stable-overrides.js`、官方索引、版本策略一起納入。
5. 再考慮功能擴充，例如地圖、深色模式、更多快捷路線、搜尋建議。

## 8. 之後重新接手時先看哪裡
- 先看 `index.html`：確認實際載入順序。
- 再看 `script.js` 最後一段：因為後面的同名函式通常會覆蓋前面版本。
- 再看 `stable-overrides.js`：這裡包含目前比較穩的搜尋與站點 modal 邏輯。
- 若附近站 / 同站轉查有問題，再看 `scripts/generate-official-bus-stop-index.mjs` 與 `official-bus-stop-index.*`。

## 9. 一句話結論
這個巴士項目已經做出可用產品，下一階段重點應該是「整理結構、降低技術債、再做優化」，而不是重寫功能。
