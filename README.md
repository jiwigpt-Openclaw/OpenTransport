# 香港巴士及小巴到站查詢

這是一個前端練習專案，目標是用香港政府開放資料 API，提供多家公司路線搜尋、方向切換、站點展開與 ETA 查詢。

目前已支援：
- `KMB` 九龍巴士
- `CTB` 城巴
- `NLB` 新大嶼山巴士
- `GMB` 綠色小巴

## 目前功能
- 同一路線號會同時搜尋多家公司資料
- 方向卡片會依公司分組顯示，方便分辨來源
- 支援正常班次 / 特別班次排序偏好
- 點選方向後會載入站點列表與 ETA
- 站點面板可展開查看最多 3 班 ETA
- 已啟用自動更新
  - 畫面重繪：每 `30` 秒
  - 資料重新抓取：每 `60` 秒
- 支援定位
  - 可自動尋找最近站點
  - 會自動展開最近站
  - 會平滑捲動到畫面中間
- API 失敗時有降級顯示與友善錯誤提示

## 使用方式
1. 開啟 [index.html](/f:/AI/github_learning_project_1/index.html)
2. 在搜尋框輸入路線號，例如 `1A`、`20`、`24`、`11`、`1`
3. 按「查詢」
4. 在第 1 步選擇公司與方向
5. 在第 2 步展開站點查看 ETA

## 建議測試路線
- `KMB`: `1A`, `24`
- `CTB`: `20`
- `NLB`: `11`, `3M`
- `GMB`: `1`, `20`

## 專案結構
- [index.html](/f:/AI/github_learning_project_1/index.html)
  - 主頁面結構
- [style.css](/f:/AI/github_learning_project_1/style.css)
  - 版面、卡片、公司色票樣式
- [script.js](/f:/AI/github_learning_project_1/script.js)
  - 路線搜尋、公司切換、ETA 載入、定位與錯誤處理
- [DEBUG.md](/f:/AI/github_learning_project_1/DEBUG.md)
  - 開發過程中的問題與記錄

## 技術
- HTML
- CSS
- Vanilla JavaScript
- 香港政府開放資料 API

## 使用的資料來源
- KMB: `https://data.etabus.gov.hk/v1/transport/kmb`
- CTB: `https://rt.data.gov.hk/v2/transport/citybus`
- NLB: `https://rt.data.gov.hk/v2/transport/nlb`
- GMB: `https://data.etagmb.gov.hk`

官方參考：
- `https://data.gov.hk/tc/`
- `https://data.gov.hk/en-data/dataset/hk-td-sm_7-real-time-arrival-data-of-gmb`

## 已知限制
- 如果直接用 `file://` 開啟頁面，部分 API 可能被瀏覽器 CORS 限制
  - 這種情況下仍可查到部分資料
  - 但完整站名、座標或個別公司資料可能受影響
- 定位需要瀏覽器授權
  - 如果拒絕或逾時，系統會改成手動選站模式
- 不同公司的 API 格式不完全一致
  - 某家公司暫時失敗時，系統會盡量保留其他公司的查詢結果

## 下一步可做
- 加入公司篩選器
- 改善方向卡片排序規則
- 補更多實測路線與截圖
- 增加 README 的畫面說明

---
最後更新：2026 年 3 月 28 日
