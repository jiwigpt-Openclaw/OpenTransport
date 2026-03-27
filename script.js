// GitHub Learning Project 1 - KMB Bus ETA Stage 2
console.log("🚀 github_learning_project_1 階段 2 已載入");

// 主查詢函數
function searchETA() {
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
    statusDiv.innerHTML = `🔍 正在查詢路線 <strong>${route}</strong> ...`;
    resultDiv.innerHTML = `<div class="loading">正在獲取巴士到站資料，請稍候...</div>`;

    // 目前階段先顯示美化後的提示（真實 API 將在階段 3 加入）
    setTimeout(() => {
        resultDiv.innerHTML = `
            <h2 style="text-align:center; color:#c8102e;">路線 ${route} 查詢結果</h2>
            <p style="text-align:center; color:#666;">✅ 階段 2 介面已成功美化完成！</p>
            <p style="text-align:center;">現在網站已經有專業的外觀了。</p>
            <p style="text-align:center; color:#888;">下一步（階段 3）將會連接真正的九龍巴士官方 API，讓它顯示實際到站時間。</p>
        `;
        statusDiv.innerHTML = `✅ 介面載入完成（階段 2）`;
        searchBtn.disabled = false;
        searchBtn.textContent = "🔍 查詢";
    }, 1800);
}

// 讓輸入框按 Enter 也可以查詢
document.getElementById('routeInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchETA();
    }
});