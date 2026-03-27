// GitHub Learning Project 1 - KMB Bus ETA Stage 3 修復版
console.log("🚀 github_learning_project_1 階段 3 修復版已載入");

// 主查詢函數
async function searchETA() {
    const routeInput = document.getElementById('routeInput');
    const route = routeInput.value.trim().toUpperCase();
    const serviceType = document.getElementById('serviceType').value;
    const resultDiv = document.getElementById('result');
    const statusDiv = document.getElementById('status');
    const searchBtn = document.getElementById('searchBtn');

    // 清空之前的狀態
    statusDiv.innerHTML = '';
    resultDiv.innerHTML = '';

    if (!route) {
        statusDiv.innerHTML = `<span style="color:red">⚠️ 請輸入路線號！</span>`;
        return;
    }

    // 顯示載入狀態
    searchBtn.disabled = true;
    searchBtn.textContent = "查詢中...";
    statusDiv.innerHTML = `🔍 正在查詢路線 <strong>${route}</strong> 的到站時間...`;

    try {
        // 使用正確的官方 API 網址
        const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-eta/${route}/${serviceType}`;
        console.log("正在呼叫 API:", url);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP 錯誤！狀態碼：${response.status}`);
        }

        const data = await response.json();
        console.log("API 回傳資料:", data);

        if (!data.data || data.data.length === 0) {
            resultDiv.innerHTML = `
                <h2 style="text-align:center; color:#c8102e;">路線 ${route}</h2>
                <p style="text-align:center; color:#d32f2f; font-size:1.1em;">
                    ⚠️ 目前沒有找到這條路線的到站資料
                </p>
                <p style="text-align:center; color:#666;">
                    可能原因：<br>
                    • 路線號輸入錯誤<br>
                    • 該路線目前沒有巴士行駛<br>
                    • 請稍後再試
                </p>
            `;
            statusDiv.innerHTML = `⚠️ 沒有找到資料`;
            return;
        }

        // 成功取得資料，開始顯示
        let html = `
            <h2 style="text-align:center; color:#c8102e;">路線 ${route} 到站時間</h2>
            <p style="text-align:center; color:#666; font-size:0.95em;">
                資料來源：香港運輸署 • 最後更新：${new Date().toLocaleTimeString('zh-HK')}
            </p>
        `;

        data.data.forEach(stop => {
            let etaHtml = '';

            if (stop.eta && stop.eta.length > 0) {
                etaHtml = stop.eta.map(etaItem => {
                    const etaTime = new Date(etaItem.eta);
                    const now = new Date();
                    let minutesLeft = Math.round((etaTime - now) / 60000);
                    
                    if (minutesLeft < 1) minutesLeft = 1;   // 最少顯示 1 分鐘
                    if (minutesLeft > 120) minutesLeft = 120; // 上限避免異常

                    const dest = etaItem.dest_tc || '未知目的地';
                    
                    return `
                        <div style="margin:10px 0; padding:8px 0; border-bottom:1px dashed #ddd;">
                            <span class="eta">${minutesLeft} 分鐘</span>
                            <span style="margin-left:12px; color:#555;">→ ${dest}</span>
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
        statusDiv.innerHTML = `✅ 成功顯示 ${data.data.length} 個車站 • ${new Date().toLocaleTimeString('zh-HK')}`;

    } catch (error) {
        console.error("API 錯誤詳細資訊:", error);
        
        resultDiv.innerHTML = `
            <div style="text-align:center; padding:40px 20px;">
                <p style="color:#d32f2f; font-size:1.2em;">❌ 無法取得資料</p>
                <p style="color:#666;">可能原因：</p>
                <ul style="text-align:left; max-width:400px; margin:20px auto; color:#555;">
                    <li>路線號輸入錯誤（請確認如 1A、2、104）</li>
                    <li>目前該路線沒有巴士行駛</li>
                    <li>網路連線問題</li>
                    <li>API 暫時無法使用（請稍後再試）</li>
                </ul>
                <button onclick="searchETA()" style="margin-top:20px; padding:12px 24px;">🔄 再試一次</button>
            </div>
        `;
        statusDiv.innerHTML = `❌ 查詢失敗`;
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = "🔍 查詢";
    }
}

// Enter 鍵支援
document.getElementById('routeInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') searchETA();
});

// 頁面載入時的提示
window.onload = function() {
    console.log("✅ 頁面載入完成，階段 3 修復版已就緒");
    // 可選：自動查詢預設路線 1A
    // setTimeout(() => searchETA(), 800);
};