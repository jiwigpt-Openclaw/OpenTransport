# bozisoda.com / OpenTransport

目前這個 repo 已經不只是單一頁巴士查詢，而是 `bozisoda.com` 的前端入口站。
根目錄 `index.html` 是「衣食住行」首頁，`bus.html` 是已可使用的 `OpenTransport` 巴士到站查詢子頁。

## OpenTransport 已支援公司
- **KMB** 九龍巴士
- **CTB** 城巴
- **NLB** 新大嶼山巴士
- **GMB** 綠色小巴

## 目前功能
- `index.html` 提供 bozisoda.com 的衣食住行入口頁
- `bus.html` 支援輸入路線後搜尋公司、方向與站點 ETA
- 支援正常班次與特別班次整理
- 每 30 秒更新 ETA 倒數，每 60 秒重新抓取資料
- 支援 `localStorage` 收藏常用路線，首頁可直接點擊快捷查詢
- 支援 GPS 自動找最近站並展開至視窗中央
- 點擊站點可開啟 modal，查看本站與附近站可搭路線並直接跳查
- 已加入 PWA manifest 與 service worker，首頁與巴士頁的入口一致

## 主要檔案
- `index.html`：bozisoda.com 首頁入口
- `home.css` / `home.js`：首頁泡泡互動與樣式
- `bus.html`：OpenTransport 巴士查詢頁
- `script.js`：巴士主程式
- `stable-overrides.js`：穩定覆蓋層，修正舊主程式的歷史覆寫問題
- `official-bus-stop-index.*`：官方站位索引，提供附近站與同站轉查資料
- `sw.js`：首頁與巴士頁共用的快取邏輯
- `manifest.json` / `bus-manifest.json`：首頁與巴士子頁各自的 PWA 入口設定

## 如何使用
1. 直接訪問網站：https://bozisoda.com 或 GitHub Pages 版本
2. 在首頁點 `行`，再點 `巴士` 進入 OpenTransport
3. 輸入路線號，例如 `1A`、`24`、`104`
4. 選擇方向後查看各站 ETA，或用 GPS 尋找最近站點

## 技術說明
- 純 `Vanilla JavaScript + HTML + CSS`
- 使用香港政府開放資料 API
- 支援 GitHub Pages / 靜態部署
- `file://` 模式下部分 API 會受 CORS 限制，尤其 `GMB`

## 下一步
- 繼續整理 `script.js` 與 `stable-overrides.js`，降低雙檔維護成本
- 重整巴士模組拆分，減少歷史覆寫痕跡
- 擴充首頁其他分類內容
- 強化離線快取策略與版本管理

---
網站是 https://bozisoda.com
**Made with ❤️ by jiwigpt-Openclaw**  
使用香港政府開放資料 API 開發
版本：2026-04-13
