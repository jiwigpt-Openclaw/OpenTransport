// GitHub Learning Project 1 - KMB Bus ETA
console.log("github_learning_project_1 已載入");

// 目前只是顯示訊息，之後會加入真正的 API 功能
function searchETA() {
    const route = document.getElementById('routeInput').value.trim().toUpperCase();
    const resultDiv = document.getElementById('result');
    
    if (!route) {
        resultDiv.innerHTML = `<p style="color:red">請輸入路線號！</p>`;
        return;
    }

    resultDiv.innerHTML = `<p class="loading">正在查詢路線 ${route} 的到站時間...</p>`;
    
    // 暫時顯示提示，之後會替換成真實 API 呼叫
    setTimeout(() => {
        resultDiv.innerHTML = `
            <h2>路線 ${route} 查詢結果</h2>
            <p>✅ 專案骨架已成功建立！</p>
            <p>現在我們進入階段 2，將會加入真正的巴士到站資料。</p>
            <p style="color:#666">目前 script.js 還在準備階段，API 功能將在下一階段加入。</p>
        `;
    }, 1500);
}