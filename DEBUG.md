# DEBUG - KMB Bus ETA 專案問題

專案名稱：github_learning_project_1
目前問題：呼叫 route-stop API 一直返回 422 Unprocessable Content，顯示「找不到路線 1A 的站點資料」

目前使用的 script.js 版本（請直接看下面完整程式碼）：

```javascript
// 把你目前 script.js 的全部內容貼在這裡
// GitHub Learning Project 1 - KMB Bus ETA Stage 3 穩定加強版
console.log("🚀 github_learning_project_1 階段 3 穩定加強版已載入");

async function searchETA() {
    const route = document.getElementById('routeInput').value.trim().toUpperCase();
    const serviceType = document.getElementById('serviceType').value;
    const resultDiv = document.getElementById('result');
    const statusDiv = document.getElementById('status');
    const searchBtn = document.getElementById('searchBtn');

    if (!route) {
        statusDiv.innerHTML = `<span style="color:red">⚠️ 請輸入路線號！</span>`;
        return;
    }

    statusDiv.innerHTML = `🔍 正在查詢路線 <strong>${route}</strong> ...`;
    resultDiv.innerHTML = `<div class="loading">正在獲取路線站點與到站時間...</div>`;
    searchBtn.disabled = true;
    searchBtn.textContent = "查詢中...";

    try {
        let stopsInfo = [];

        // 策略1：嘗試 direction 1 和 2
        for (let dir = 1; dir <= 2; dir++) {
            const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${dir}/${serviceType}`;
            console.log(`嘗試 direction ${dir}: ${url}`);

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.data && data.data.length > 0) {
                    stopsInfo = data.data;
                    console.log(`✅ 成功取得 direction ${dir} 的 ${stopsInfo.length} 個站點`);
                    break;
                }
            }
        }

        // 策略2：如果 direction 失敗，使用全站點列表 + route-eta 匹配（備用方案）
        if (stopsInfo.length === 0) {
            console.log("direction 失敗，嘗試備用方案...");
            const etaUrl = `https://data.etabus.gov.hk/v1/transport/kmb/route-eta/${route}/${serviceType}`;
            const etaRes = await fetch(etaUrl);
            const etaData = await etaRes.json();
            const etaStops = etaData.data || [];

            if (etaStops.length > 0) {
                stopsInfo = etaStops.map((item, idx) => ({
                    seq: item.seq || (idx + 1),
                    stop_tc: item.stop_tc || `第 ${idx + 1} 站`,
                    eta: item.eta
                }));
                console.log(`使用 ETA 資料作為備用，共 ${stopsInfo.length} 個站`);
            }
        }

        if (stopsInfo.length === 0) {
            resultDiv.innerHTML = `
                <p style="text-align:center; color:#d32f2f;">
                    ⚠️ 目前找不到路線 <strong>${route}</strong> 的站點資料<br><br>
                    建議試試以下路線：<br>
                    <strong>2、104、271、3M、1</strong>
                </p>`;
            statusDiv.innerHTML = `⚠️ 找不到站點資料`;
            return;
        }

        // 取得 ETA 時間
        const etaUrl = `https://data.etabus.gov.hk/v1/transport/kmb/route-eta/${route}/${serviceType}`;
        const etaRes = await fetch(etaUrl);
        const etaData = await etaRes.json();
        const etaList = etaData.data || [];

        let html = `
            <h2 style="text-align:center; color:#c8102e;">路線 ${route} 到站時間</h2>
            <p style="text-align:center; color:#666;">最後更新：${new Date().toLocaleTimeString('zh-HK')}</p>
        `;

        stopsInfo.forEach((stop, index) => {
            const seq = stop.seq || (index + 1);
            const stopName = stop.stop_tc || stop.name_tc || `第 ${seq} 站`;

            let etaHtml = '<span style="color:#888;">暫無預報</span>';

            if (stop.eta || (etaList.length > 0)) {
                const targetEta = stop.eta || etaList.find(e => e.seq === stop.seq);
                if (targetEta && targetEta.eta) {
                    const etaItems = Array.isArray(targetEta.eta) ? targetEta.eta : [targetEta.eta];
                    etaHtml = etaItems.map(item => {
                        if (!item || !item.eta) return '';
                        const minutesLeft = Math.max(1, Math.round((new Date(item.eta) - new Date()) / 60000));
                        const dest = item.dest_tc || '未知目的地';
                        return `<div style="margin:8px 0;"><span class="eta">${minutesLeft} 分鐘</span> <span style="color:#555;">→ ${dest}</span></div>`;
                    }).join('');
                }
            }

            html += `
                <div class="stop">
                    <h3>第 ${seq} 站 • ${stopName}</h3>
                    <div>${etaHtml}</div>
                </div>`;
        });

        resultDiv.innerHTML = html;
        statusDiv.innerHTML = `✅ 成功顯示 ${stopsInfo.length} 個車站 • ${new Date().toLocaleTimeString('zh-HK')}`;

    } catch (error) {
        console.error("錯誤:", error);
        resultDiv.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#d32f2f;">
                <p>❌ 查詢失敗</p>
                <p>請稍後再試，或試其他路線</p>
            </div>`;
        statusDiv.innerHTML = `❌ 查詢失敗`;
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = "🔍 查詢";
    }
}

// Enter 鍵支援
document.getElementById('routeInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchETA();
});

window.onload = () => {
    console.log("✅ 階段 3 穩定加強版已就緒，建議試路線 2 或 104");
};