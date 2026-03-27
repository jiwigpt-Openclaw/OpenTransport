// GitHub Learning Project 1 - KMB Bus ETA Stage 3 最終修復版
console.log("🚀 github_learning_project_1 階段 3 最終修復版已載入");

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

    // 清空並顯示載入狀態
    statusDiv.innerHTML = `🔍 正在查詢路線 <strong>${route}</strong> ...`;
    resultDiv.innerHTML = `<div class="loading">正在從官方 API 獲取最新到站資料...</div>`;
    searchBtn.disabled = true;
    searchBtn.textContent = "查詢中...";

    try {
        const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-eta/${route}/${serviceType}`;
        console.log("呼叫 API:", url);

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);

        const apiResponse = await response.json();
        console.log("API 完整回傳:", apiResponse);

        const stops = apiResponse.data || [];

        if (!stops || stops.length === 0) {
            resultDiv.innerHTML = `
                <h2 style="text-align:center; color:#c8102e;">路線 ${route}</h2>
                <p style="text-align:center; color:#d32f2f;">⚠️ 目前沒有這條路線的到站資料</p>
                <p style="text-align:center; color:#666;">請確認路線號正確，或稍後再試</p>
            `;
            statusDiv.innerHTML = `⚠️ 沒有資料`;
            return;
        }

        // 正確處理 API 資料結構
        let html = `
            <h2 style="text-align:center; color:#c8102e;">路線 ${route} 到站時間</h2>
            <p style="text-align:center; color:#666;">最後更新：${new Date().toLocaleTimeString('zh-HK')}</p>
        `;

        stops.forEach(stop => {
            let etaHtml = '<span style="color:#888;">暫無預報</span>';

            // 處理 eta 資料（可能是陣列或單一物件）
            if (stop.eta) {
                const etaList = Array.isArray(stop.eta) ? stop.eta : [stop.eta];
                
                etaHtml = etaList.map(etaItem => {
                    if (!etaItem || !etaItem.eta) return '';

                    const etaTime = new Date(etaItem.eta);
                    const minutesLeft = Math.max(1, Math.round((etaTime - new Date()) / 60000));
                    const dest = etaItem.dest_tc || etaItem.destination_tc || '未知目的地';

                    return `
                        <div style="margin:8px 0;">
                            <span class="eta">${minutesLeft} 分鐘</span>
                            <span style="margin-left:12px; color:#555;">→ ${dest}</span>
                        </div>`;
                }).filter(item => item !== '').join('');
            }

            html += `
                <div class="stop">
                    <h3>第 ${stop.seq || '?'} 站 • ${stop.stop_tc || stop.stop_name_tc || '未知站名'}</h3>
                    <div>${etaHtml}</div>
                </div>`;
        });

        resultDiv.innerHTML = html;
        statusDiv.innerHTML = `✅ 成功顯示 ${stops.length} 個車站 • ${new Date().toLocaleTimeString('zh-HK')}`;

    } catch (error) {
        console.error("錯誤詳細資訊:", error);
        
        resultDiv.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#d32f2f;">
                <p style="font-size:1.2em;">❌ 無法取得資料</p>
                <p>請稍後再試，或檢查網路連線</p>
                <button onclick="searchETA()" style="margin-top:20px; padding:12px 28px; background:#c8102e; color:white; border:none; border-radius:8px; cursor:pointer;">🔄 再試一次</button>
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
    console.log("✅ 頁面載入完成，階段 3 最終修復版已就緒");
};