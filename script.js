// GitHub Learning Project 1 - KMB Bus ETA Stage 3
console.log("🚀 github_learning_project_1 階段 3 已載入 - 連接 KMB API");

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

    // 顯示載入狀態
    searchBtn.disabled = true;
    searchBtn.textContent = "查詢中...";
    statusDiv.innerHTML = `🔍 正在查詢路線 <strong>${route}</strong> 的到站時間...`;
    resultDiv.innerHTML = `<div class="loading">正在從官方 API 獲取資料，請稍候...</div>`;

    try {
        const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-eta/${route}/${serviceType}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP 錯誤！狀態碼：${response.status}`);
        }

        const data = await response.json();

        if (!data.data || data.data.length === 0) {
            resultDiv.innerHTML = `
                <h2 style="text-align:center; color:#c8102e;">路線 ${route}</h2>
                <p style="text-align:center; color:#d32f2f;">⚠️ 目前沒有找到這條路線的到站資料</p>
                <p style="text-align:center; color:#666;">請確認路線號是否正確，或稍後再試。</p>
            `;
            statusDiv.innerHTML = `❌ 沒有找到資料`;
            return;
        }

        // 開始生成結果 HTML
        let html = `
            <h2 style="text-align:center; color:#c8102e;">路線 ${route} 到站時間</h2>
            <p style="text-align:center; color:#666; font-size:0.95em;">資料來源：香港運輸署 • 每分鐘更新</p>
        `;

        data.data.forEach(stop => {
            let etaHtml = '';

            if (stop.eta && stop.eta.length > 0) {
                etaHtml = stop.eta.map(etaItem => {
                    const etaTime = new Date(etaItem.eta);
                    const now = new Date();
                    let minutesLeft = Math.round((etaTime - now) / 60000);
                    
                    if (minutesLeft < 0) minutesLeft = 0;
                    if (minutesLeft > 999) minutesLeft = 999; // 避免顯示異常大的數字

                    const dest = etaItem.dest_tc || '未知目的地';
                    
                    return `
                        <div style="margin: 8px 0;">
                            <span class="eta">${minutesLeft} 分鐘</span>
                            <span style="color:#555;">→ ${dest}</span>
                        </div>`;
                }).join('');
            } else {
                etaHtml = `<span style="color:#888;">暫無預報資料</span>`;
            }

            html += `
                <div class="stop">
                    <h3>第 ${stop.seq} 站 • ${stop.stop_tc}</h3>
                    <div>${etaHtml}</div>
                </div>`;
        });

        resultDiv.innerHTML = html;
        statusDiv.innerHTML = `✅ 已顯示 ${data.data.length} 個車站的到站時間 • ${new Date().toLocaleTimeString('zh-HK')}`;

    } catch (error) {
        console.error("API 錯誤:", error);
        resultDiv.innerHTML = `
            <p style="color:red; text-align:center;">
                ❌ 無法取得資料<br>
                可能原因：路線不存在、網路問題或 API 暫時無法使用
            </p>
        `;
        statusDiv.innerHTML = `❌ 查詢失敗，請稍後再試`;
    } finally {
        // 無論成功或失敗，都恢復按鈕狀態
        searchBtn.disabled = false;
        searchBtn.textContent = "🔍 查詢";
    }
}

// Enter 鍵支援
document.getElementById('routeInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchETA();
    }
});

// 頁面載入完成後的提示
window.onload = function() {
    console.log("頁面載入完成，階段 3 API 功能已就緒");
    // 可選：自動查詢預設路線
    // searchETA();
};