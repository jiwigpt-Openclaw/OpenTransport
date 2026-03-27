// GitHub Learning Project 1 - KMB Bus ETA Stage 3 最終完美版（正確顯示站名）
console.log("🚀 github_learning_project_1 階段 3 最終完美版已載入");

// 主查詢函數
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
    resultDiv.innerHTML = `<div class="loading">正在從官方 API 獲取最新資料...</div>`;
    searchBtn.disabled = true;
    searchBtn.textContent = "查詢中...";

    try {
        const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-eta/${route}/${serviceType}`;
        console.log("呼叫 API:", url);

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);

        const apiResponse = await response.json();
        console.log("API 完整回傳:", apiResponse);

        const rawStops = apiResponse.data || [];

        if (rawStops.length === 0) {
            resultDiv.innerHTML = `<p style="text-align:center; color:#d32f2f;">⚠️ 目前沒有這條路線的資料</p>`;
            statusDiv.innerHTML = `⚠️ 沒有資料`;
            return;
        }

        let html = `
            <h2 style="text-align:center; color:#c8102e;">路線 ${route} 到站時間</h2>
            <p style="text-align:center; color:#666;">最後更新：${new Date().toLocaleTimeString('zh-HK')}</p>
        `;

        rawStops.forEach((stop, index) => {
            // 正確取得站序與站名
            const seq = stop.seq || (index + 1);
            let stopName = "未知站名";

            // 嘗試多種可能的站名欄位
            if (stop.stop_tc) stopName = stop.stop_tc;
            else if (stop.stop_name_tc) stopName = stop.stop_name_tc;
            else if (stop.name_tc) stopName = stop.name_tc;

            let etaHtml = '<span style="color:#888;">暫無預報</span>';

            // 處理 eta 資料
            if (stop.eta) {
                const etaItems = Array.isArray(stop.eta) ? stop.eta : [stop.eta];
                
                etaHtml = etaItems.map(etaItem => {
                    if (!etaItem || !etaItem.eta) return '';

                    const etaTime = new Date(etaItem.eta);
                    const minutesLeft = Math.max(1, Math.round((etaTime - new Date()) / 60000));
                    const dest = etaItem.dest_tc || etaItem.destination_tc || '未知目的地';

                    return `
                        <div style="margin:8px 0; padding:6px 0;">
                            <span class="eta">${minutesLeft} 分鐘</span>
                            <span style="margin-left:12px; color:#555;">→ ${dest}</span>
                        </div>`;
                }).filter(item => item).join('');
            }

            html += `
                <div class="stop">
                    <h3>第 ${seq} 站 • ${stopName}</h3>
                    <div>${etaHtml}</div>
                </div>`;
        });

        resultDiv.innerHTML = html;
        statusDiv.innerHTML = `✅ 成功顯示 ${rawStops.length} 個車站 • ${new Date().toLocaleTimeString('zh-HK')}`;

    } catch (error) {
        console.error("錯誤詳細資訊:", error);
        resultDiv.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#d32f2f;">
                <p style="font-size:1.2em;">❌ 無法取得資料</p>
                <p>請稍後再試</p>
                <button onclick="searchETA()" style="margin-top:20px; padding:12px 28px; background:#c8102e; color:white; border:none; border-radius:8px;">🔄 再試一次</button>
            </div>
        `;
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
    console.log("✅ 頁面載入完成，階段 3 最終完美版已就緒");
};