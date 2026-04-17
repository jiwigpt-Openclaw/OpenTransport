# rail-v1 交接筆記

更新日期：2026-04-17  
目前 branch：`rail-v1`

## 這個 branch 目前在做什麼

這個 branch 的方向是把 `rail.html` 做成「港鐵 + 輕鐵」雙 tab。

- 港鐵 tab：功能已經比輕鐵成熟很多，包含最近站、手動即時查詢、route planner、建議路線卡片、chip popover、轉線站班次 popover 等。
- 輕鐵 tab：目前刻意走獨立模型，不硬套港鐵 `line + station + up/down` 那套；已完成第一階段 MVP，現在已經有：
  - 路線篩選
  - 站點選擇
  - 官方輕鐵即時班次讀取
  - 按月台顯示班次
  - 最近輕鐵站定位
  - 一鍵帶入最近站到選站流程

## 重要限制

接手時請延續這些限制，不要把架構做歪：

- 不要碰港鐵 route engine 核心
- 不要把輕鐵硬塞進港鐵資料模型
- 不要把輕鐵 UI 做成港鐵 route planner 的翻版
- 不要改首頁
- 不要改 `bus.html`
- 不要改 `script.js`
- 不要改 `stable-overrides.js`

## 這一輪已落地的輕鐵能力

### 1. 輕鐵 tab 已是獨立 state / render / fetch 流程

核心入口在：

- [rail.js](./rail.js) `buildLightRailMarkup()`：`5000`
- [rail.js](./rail.js) `buildLightRailResultMarkup()`：`4973`
- [rail.js](./rail.js) `requestLightRailSchedule()`：`1057`

目前輕鐵的資料流是：

`stop -> platforms -> services`

不是港鐵那種：

`line + station + directionKey + up/down`

### 2. 輕鐵即時班次已接官方 API

核心在：

- [rail.js](./rail.js) `fetchLightRailSchedule()`：`1046`

官方 endpoint 是輕鐵按站查詢：

- `station_id=<stopId>`

目前畫面已會顯示：

- 路線號
- 目的地
- 月台
- 到站 / 開出文字
- 班次狀態
- 備註

### 3. 最近輕鐵站 / 定位已完成

核心在：

- [rail.js](./rail.js) `requestNearestLightRailSummary()`：`1128`
- [rail.js](./rail.js) `applyNearestLightRailStop()`：`1207`
- [rail.js](./rail.js) `buildLightRailNearestCard()`：`4806`

行為如下：

- 進入輕鐵 tab 時，會嘗試定位
- 用目前輕鐵站座標找最近站
- 顯示一張輕量摘要卡
- 可重新定位
- 可帶入此站
- 帶入後沿用既有選站 / 查班次流程

### 4. 最近站是用輕鐵站座標，不是共用港鐵最近站邏輯

座標資料掛載在：

- [rail.js](./rail.js) `const lightRailStopLocationData = window.__LIGHT_RAIL_STOP_LOCATIONS__ || null;`：`83`
- [rail.js](./rail.js) `enrichLightRailStopIndexWithLocations()`：`920`
- [light-rail-stop-locations.js](./light-rail-stop-locations.js)

最近站計算方式：

- 先取 browser geolocation
- 把 `stopIndex` 裡有 `location.latitude / longitude` 的輕鐵站拿來算距離
- 距離公式用現有 `haversineDistanceMeters()`
- 取最近一個 stop

## 這幾個檔案是目前輕鐵接手的重點

### [rail.js](./rail.js)

輕鐵相關目前主要看這些位置：

- `83`：載入輕鐵站座標 index
- `920`：把座標補進輕鐵 `stopIndex`
- `1046`：官方輕鐵 schedule fetch
- `1057`：手動選站後的 schedule request
- `1128`：最近站 request
- `1207`：帶入最近站
- `4806`：最近站摘要卡 render
- `4956`：月台卡 render
- `4973`：輕鐵結果區 render
- `5000`：輕鐵 tab 主體 render

### [rail.css](./rail.css)

輕鐵最近站卡相關樣式：

- 約 `570` 起：`rail-lrt-panel` 排序與 layout
- 約 `619` 起：`rail-lrt-nearest-*`
- 約 `3096`、`3212` 起：桌機 / 手機 responsive 調整

### [rail.html](./rail.html)

目前已載入：

- `rail.css?v=20260417-2`
- `light-rail-stop-locations.js?v=20260417-1`
- `rail.js?v=20260417-2`

### [light-rail-stop-locations.js](./light-rail-stop-locations.js)

這是新增檔案，內含輕鐵站座標索引。  
目前已有 `68` 個輕鐵站座標。

用途：

- 提供輕鐵最近站定位
- 不影響港鐵

## 座標資料來源與生成說明

這個檔案不是手打假資料，來源是官方資料整合後生成：

- 運輸署 GTFS stops：<https://static.data.gov.hk/td/pt-headway-en/stops.txt>
- MTR bus / feeder bus stops CSV：<https://opendata.mtr.com.hk/data/mtr_bus_stops.csv>

補充：

- 目前 repo 內還沒有正式的「重新生成輕鐵站座標」腳本
- 這次是先把可用版本落地，直接產出 `light-rail-stop-locations.js`
- 如果之後要長期維護，建議補一支小 script 自動重建這份索引

## 官方即時資料來源

- data.gov.hk dataset：<https://data.gov.hk/tc-data/dataset/mtr-lrnt_data-light-rail-nexttrain-data>
- MTR API spec：<https://opendata.mtr.com.hk/doc/LR_Next_Train_API_Spec_v1.1.pdf>

## 已驗證項目

已做過的技術驗證：

- `node --check rail.js`
- `node --check light-rail-stop-locations.js`
- 輕鐵 schedule endpoint smoke test 成功
- `light-rail-stop-locations.js` 已確認有 `68` 站座標

尚未完整做完的，是瀏覽器端人工 QA；接手時建議先手測一次。

## 建議手測清單

1. 開 `rail.html`
2. 切到輕鐵 tab
3. 允許定位
4. 確認最近站摘要卡會出現：
   - 最近站名稱
   - 大概距離
   - 幾筆即將到站班次
5. 點 `帶入此站`
6. 確認選站被帶入，下面的輕鐵班次卡同步更新
7. 點 `重新定位`
8. 確認最近站卡可刷新
9. 再測一次拒絕定位權限
10. 確認只顯示友善提示，不會把頁面搞壞
11. 切回港鐵 tab 做 smoke test，確認沒有回歸

## 已知注意點

### 1. 輕鐵 tab 的目標是站點中心，不是港鐵方向中心

如果下一步要做新功能，請優先用這種思考方式：

- 站點
- 月台
- 路線號
- 目的地
- 即將到站班次

不要先從：

- 上行 / 下行
- 線路方向 key
- 港鐵 route engine

去倒推輕鐵。

### 2. `rail.html` 頁首文案可能仍有舊字句

之前的頁首 subtitle 曾寫過「輕鐵會在下一階段加入」。  
如果畫面上仍看到這類舊描述，屬於文案未同步，不是功能沒做。

### 3. 輕鐵 route planner 這一輪還沒開始

目前還沒有：

- 輕鐵 route planner
- 輕鐵 custom SVG 地圖
- 輕鐵複雜 popover

所以不要誤會成有半套 route engine 但沒接 UI；現在是刻意先做穩定 MVP。

## 下一輪最適合做什麼

如果要繼續做輕鐵，我會建議優先順序是：

1. 先做瀏覽器手測與小文案清理
2. 補一支生成 `light-rail-stop-locations.js` 的 script
3. 再開始規劃輕鐵 route planner

原因：

- 最近站 / 定位現在已可用，但座標生成還是一次性產物
- 先把資料基礎穩住，後面 route planner 會比較不容易返工

## 給接手 AI 的一句話

這個 branch 的關鍵不是「把輕鐵做得像港鐵」，而是「讓輕鐵用自己的閱讀方式，逐步長成接近港鐵等級的體驗」。
