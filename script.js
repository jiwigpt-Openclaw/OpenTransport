// GitHub Learning Project 1 - KMB Bus ETA Stage 3 穩定最終版
console.log("🚀 github_learning_project_1 階段 3 穩定最終版已載入");

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

        // 先試 direction = 1（去程），失敗再試 direction = 2（回程）
        for (let direction = 1; direction <= 2; direction++) {
            const routeStopUrl = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${direction}/${serviceType}`;
            console.log(`嘗試 direction ${direction}:`, routeStopUrl);

            const res = await fetch(routeStopUrl);
            if (res.ok) {
                const data = await res.json();
                if (data.data && data.data.length > 0) {
                    stopsInfo = data.data;
                    console.log(`成功取得 direction ${direction} 的站點資料，共 ${stopsInfo.length} 個站`);
                    break;
                }
            }
        }

        if (stopsInfo.length === 0) {
            resultDiv.innerHTML = `
                <p style="text-align:center; color:#d32f2f;">
                    ⚠️ 找不到路線 ${route} 的站點資料<br>
                    請確認路線號是否正確，或試其他路線（如 2、104、271）
                </p>`;
            statusDiv.innerHTML = `⚠️ 找不到站點資料`;
            return;
        }

        // 第二步：取得 ETA 時間
        const etaUrl = `https://data.etabus.gov.hk/v1/transport/kmb/route-eta/${route}/${serviceType}`;
        const etaRes = await fetch(etaUrl);
        const etaData = await etaRes.json();
        const etaList = etaData.data || [];

        let html = `
            <h2 style="text-align:center; color:#c8102e;">路線 ${route} 到站時間</h2>
            <p style="text-align:center; color:#666;">最後更新：${new Date().toLocaleTimeString('zh-HK')}</p>
        `;

        stopsInfo.forEach((stopInfo, index) => {
            const seq = stopInfo.seq || (index + 1);
            const stopName = stopInfo.stop_tc || stopInfo.name_tc || `第 ${seq} 站`;

            // 找對應的 ETA
            const matchingEta = etaList.find(e => e.seq === stopInfo.seq);
            let etaHtml = '<span style="color:#888;">暫無預報</span>';

            if (matchingEta && matchingEta.eta) {
                const etaItems = Array.isArray(matchingEta.eta) ? matchingEta.eta : [matchingEta.eta];
                etaHtml = etaItems.map(item => {
                    if (!item || !item.eta) return '';
                    const minutesLeft = Math.max(1, Math.round((new Date(item.eta) - new Date()) / 60000));
                    const dest = item.dest_tc || '未知目的地';
                    return `<div style="margin:8px 0;"><span class="eta">${minutesLeft} 分鐘</span> <span style="color:#555;">→ ${dest}</span></div>`;
                }).join('');
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
        resultDiv.innerHTML = `<div style="text-align:center; color:#d32f2f; padding:30px;">❌ 查詢失敗，請稍後再試</div>`;
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
    console.log("✅ 階段 3 穩定最終版已就緒");
};