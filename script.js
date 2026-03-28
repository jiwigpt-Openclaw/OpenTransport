const APP_VERSION = "2026-03-28 01:25";
const API_BASE = "https://data.etabus.gov.hk/v1/transport/kmb";
const COUNTDOWN_REFRESH_MS = 30000;
const DATA_REFRESH_MS = 60000;
const routeStopCache = new Map();
const stopEtaCache = new Map();
const stopAllEtaCache = new Map();

let routeListPromise = null;
let stopMapPromise = null;
let activeSearchId = 0;
let activeVariantLoadId = 0;
let liveCountdownTimerId = null;
let dataRefreshTimerId = null;

// 這個物件會保存目前畫面所需的所有狀態，方便重繪與自動更新。
let currentRenderState = null;

console.log(`KMB ETA enhanced lookup loaded (${APP_VERSION})`);

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function normalizeDirection(value) {
    const normalized = String(value ?? "").trim().toLowerCase();

    if (normalized === "outbound" || normalized === "o") {
        return "outbound";
    }

    if (normalized === "inbound" || normalized === "i") {
        return "inbound";
    }

    return "";
}

function getItemDirection(item) {
    return normalizeDirection(item?.direction ?? item?.bound ?? item?.dir);
}

function getDirectionLabel(direction) {
    if (direction === "outbound") {
        return "去程";
    }

    if (direction === "inbound") {
        return "回程";
    }

    return "未分類";
}

function getServiceType(item) {
    return String(item?.service_type ?? item?.serviceType ?? "1");
}

function isSameRoute(entry, route) {
    return String(entry?.route ?? "").trim().toUpperCase() === String(route ?? "").trim().toUpperCase();
}

function normalizeStopId(stopId) {
    return String(stopId ?? "").trim().toUpperCase();
}

function getRouteLabel(routeInfo) {
    const origin = routeInfo.orig_tc || routeInfo.orig_en || "未知起點";
    const destination = routeInfo.dest_tc || routeInfo.dest_en || "未知終點";
    const direction = getItemDirection(routeInfo);
    const suffix = getDirectionLabel(direction);

    return `${origin} → ${destination} (${suffix})`;
}

function getVariantKey(routeInfo) {
    const route = String(routeInfo?.route ?? "").trim().toUpperCase();
    const direction = getItemDirection(routeInfo) || "unknown";
    const serviceType = getServiceType(routeInfo);
    const origin = routeInfo?.orig_tc || routeInfo?.orig_en || "";
    const destination = routeInfo?.dest_tc || routeInfo?.dest_en || "";

    return [route, serviceType, direction, origin, destination].join("|");
}

function getStopPanelKey(variantKey, stop) {
    return `${variantKey}|${stop.stopId}|${stop.seq}`;
}

function decodeActionValue(encodedValue) {
    return decodeURIComponent(encodedValue);
}

function findVariantByKey(variantKey) {
    if (!currentRenderState) {
        return null;
    }

    return currentRenderState.variants.find((variant) => getVariantKey(variant) === variantKey) || null;
}

async function fetchJson(url, label) {
    const response = await fetch(url);

    if (!response.ok) {
        let details = "";

        try {
            details = await response.text();
        } catch (error) {
            console.warn(`讀取 ${label} 錯誤內容失敗`, error);
        }

        throw new Error(`${label} 請求失敗 (${response.status})${details ? `: ${details}` : ""}`);
    }

    return response.json();
}

async function getRouteList() {
    if (!routeListPromise) {
        routeListPromise = fetchJson(`${API_BASE}/route/`, "路線清單")
            .then((payload) => Array.isArray(payload.data) ? payload.data : [])
            .catch((error) => {
                routeListPromise = null;
                throw error;
            });
    }

    return routeListPromise;
}

async function getStopMap() {
    if (!stopMapPromise) {
        stopMapPromise = fetchJson(`${API_BASE}/stop`, "巴士站清單")
            .then((payload) => {
                const map = new Map();
                const stops = Array.isArray(payload.data) ? payload.data : [];

                for (const stop of stops) {
                    if (stop?.stop) {
                        map.set(stop.stop, stop);
                    }
                }

                return map;
            })
            .catch((error) => {
                stopMapPromise = null;
                throw error;
            });
    }

    return stopMapPromise;
}

async function getRouteStops(route, direction, serviceType) {
    const cacheKey = `${route}|${direction}|${serviceType}`;

    if (!routeStopCache.has(cacheKey)) {
        const url = `${API_BASE}/route-stop/${encodeURIComponent(route)}/${direction}/${serviceType}`;
        const promise = fetchJson(url, `路線站點 ${route} ${direction} service_type=${serviceType}`)
            .then((payload) => {
                const stops = Array.isArray(payload.data) ? payload.data : [];
                return stops
                    .map((item) => ({
                        seq: Number(item.seq) || 0,
                        stopId: normalizeStopId(item.stop),
                        direction: getItemDirection(item) || direction,
                        serviceType: getServiceType(item)
                    }))
                    .filter((item) => item.stopId)
                    .sort((a, b) => a.seq - b.seq);
            })
            .catch((error) => {
                routeStopCache.delete(cacheKey);
                throw error;
            });

        routeStopCache.set(cacheKey, promise);
    }

    return routeStopCache.get(cacheKey);
}

async function getRouteEta(route, serviceType) {
    const url = `${API_BASE}/route-eta/${encodeURIComponent(route)}/${serviceType}`;
    const payload = await fetchJson(url, `到站時間 ${route} service_type=${serviceType}`);
    return Array.isArray(payload.data) ? payload.data : [];
}

async function getStopEta(route, serviceType, stopId) {
    const normalizedStopId = normalizeStopId(stopId);
    const cacheKey = `${normalizedStopId}|${route}|${serviceType}`;

    if (!stopEtaCache.has(cacheKey)) {
        const url = `${API_BASE}/eta/${normalizedStopId}/${encodeURIComponent(route)}/${serviceType}`;
        const promise = fetchJson(url, `站點到站時間 ${normalizedStopId} ${route} service_type=${serviceType}`)
            .then((payload) => Array.isArray(payload.data) ? payload.data : [])
            .catch((error) => {
                stopEtaCache.delete(cacheKey);
                throw error;
            });

        stopEtaCache.set(cacheKey, promise);
    }

    return stopEtaCache.get(cacheKey);
}

async function getStopAllEta(stopId) {
    const normalizedStopId = normalizeStopId(stopId);

    if (!stopAllEtaCache.has(normalizedStopId)) {
        const url = `${API_BASE}/stop-eta/${normalizedStopId}`;
        const promise = fetchJson(url, `巴士站所有路線 ETA ${normalizedStopId}`)
            .then((payload) => Array.isArray(payload.data) ? payload.data : [])
            .catch((error) => {
                stopAllEtaCache.delete(normalizedStopId);
                throw error;
            });

        stopAllEtaCache.set(normalizedStopId, promise);
    }

    return stopAllEtaCache.get(normalizedStopId);
}

function chooseRouteVariants(routeEntries, requestedServiceType) {
    const uniqueVariants = new Map();

    for (const entry of routeEntries) {
        const direction = getItemDirection(entry);
        if (!direction) {
            continue;
        }

        const variantKey = getVariantKey(entry);
        if (!uniqueVariants.has(variantKey)) {
            uniqueVariants.set(variantKey, entry);
        }
    }

    const variants = [...uniqueVariants.values()].sort((left, right) => {
        const leftPreferred = getServiceType(left) === requestedServiceType ? 0 : 1;
        const rightPreferred = getServiceType(right) === requestedServiceType ? 0 : 1;
        if (leftPreferred !== rightPreferred) {
            return leftPreferred - rightPreferred;
        }

        const leftServiceType = getServiceType(left);
        const rightServiceType = getServiceType(right);
        if (leftServiceType !== rightServiceType) {
            return leftServiceType.localeCompare(rightServiceType, "en");
        }

        const directionOrder = { outbound: 0, inbound: 1, unknown: 2 };
        const leftDirection = directionOrder[getItemDirection(left) || "unknown"] ?? 2;
        const rightDirection = directionOrder[getItemDirection(right) || "unknown"] ?? 2;
        if (leftDirection !== rightDirection) {
            return leftDirection - rightDirection;
        }

        return getRouteLabel(left).localeCompare(getRouteLabel(right), "zh-HK");
    });

    if (variants.length === 0) {
        return { preferredServiceType: requestedServiceType, variants: [] };
    }

    const preferredServiceType = variants.some((variant) => getServiceType(variant) === requestedServiceType)
        ? requestedServiceType
        : getServiceType(variants[0]);

    return { preferredServiceType, variants };
}

function buildEtaMaps(etaEntries, preferredServiceType = "") {
    const byExactStop = new Map();
    const byDirectionAndStop = new Map();
    const byDirectionAndSeq = new Map();
    const byStopOnly = new Map();

    for (const entry of etaEntries) {
        const stopId = normalizeStopId(entry?.stop);
        const direction = getItemDirection(entry) || "unknown";
        const seq = String(Number(entry.seq) || "");
        const seqKey = `${direction}|${seq}`;

        if (!byDirectionAndSeq.has(seqKey)) {
            byDirectionAndSeq.set(seqKey, []);
        }

        byDirectionAndSeq.get(seqKey).push(entry);

        if (stopId) {
            const exactKey = `${direction}|${stopId}|${seq}`;
            const stopKey = `${direction}|${stopId}`;

            if (!byExactStop.has(exactKey)) {
                byExactStop.set(exactKey, []);
            }

            if (!byDirectionAndStop.has(stopKey)) {
                byDirectionAndStop.set(stopKey, []);
            }

            if (!byStopOnly.has(stopId)) {
                byStopOnly.set(stopId, []);
            }

            byExactStop.get(exactKey).push(entry);
            byDirectionAndStop.get(stopKey).push(entry);
            byStopOnly.get(stopId).push(entry);
        }
    }

    const sorter = (left, right) => {
        const leftHasEta = hasUsableEta(left) ? 0 : 1;
        const rightHasEta = hasUsableEta(right) ? 0 : 1;

        if (leftHasEta !== rightHasEta) {
            return leftHasEta - rightHasEta;
        }

        const leftPreferred = preferredServiceType && getServiceType(left) === preferredServiceType ? 0 : 1;
        const rightPreferred = preferredServiceType && getServiceType(right) === preferredServiceType ? 0 : 1;

        if (leftPreferred !== rightPreferred) {
            return leftPreferred - rightPreferred;
        }

        const leftSeq = Number(left.eta_seq ?? 99);
        const rightSeq = Number(right.eta_seq ?? 99);

        if (leftSeq !== rightSeq) {
            return leftSeq - rightSeq;
        }

        const leftTime = left.eta ? Date.parse(left.eta) : Number.POSITIVE_INFINITY;
        const rightTime = right.eta ? Date.parse(right.eta) : Number.POSITIVE_INFINITY;
        return leftTime - rightTime;
    };

    for (const values of byExactStop.values()) {
        values.sort(sorter);
    }

    for (const values of byDirectionAndStop.values()) {
        values.sort(sorter);
    }

    for (const values of byDirectionAndSeq.values()) {
        values.sort(sorter);
    }

    for (const values of byStopOnly.values()) {
        values.sort(sorter);
    }

    return { byExactStop, byDirectionAndStop, byDirectionAndSeq, byStopOnly };
}

function getEtaEntriesForStop(etaMaps, direction, stopId, seq, preferredServiceType = "") {
    const normalizedStopId = normalizeStopId(stopId);
    const normalizedSeq = String(Number(seq) || "");
    const exactKey = `${direction}|${normalizedStopId}|${normalizedSeq}`;
    const stopKey = `${direction}|${normalizedStopId}`;
    const seqKey = `${direction}|${normalizedSeq}`;
    const unknownExactKey = `unknown|${normalizedStopId}|${normalizedSeq}`;
    const unknownStopKey = `unknown|${normalizedStopId}`;
    const unknownSeqKey = `unknown|${normalizedSeq}`;

    return preferUsableEtaEntries(
        etaMaps.byExactStop.get(exactKey)
        || etaMaps.byDirectionAndStop.get(stopKey)
        || etaMaps.byDirectionAndSeq.get(seqKey)
        || etaMaps.byStopOnly.get(normalizedStopId)
        || etaMaps.byExactStop.get(unknownExactKey)
        || etaMaps.byDirectionAndStop.get(unknownStopKey)
        || etaMaps.byDirectionAndSeq.get(unknownSeqKey)
        || [],
        preferredServiceType
    );
}

function hasUsableEta(entry) {
    return Boolean(entry?.eta) && !Number.isNaN(Date.parse(entry.eta));
}

function preferUsableEtaEntries(entries, preferredServiceType = "") {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }

    const usableEntries = entries.filter(hasUsableEta);
    const sourceEntries = usableEntries.length > 0 ? usableEntries : entries;
    const matchingServiceTypeEntries = preferredServiceType
        ? sourceEntries.filter((entry) => getServiceType(entry) === preferredServiceType)
        : [];

    return matchingServiceTypeEntries.length > 0 ? matchingServiceTypeEntries : sourceEntries;
}

async function attachEtaEntriesToStops(route, serviceType, variants, routeStopsByDirection, etaMaps) {
    const entries = await Promise.all(variants.map(async (variant) => {
        const direction = getItemDirection(variant);
        const stops = routeStopsByDirection.get(direction) || [];

        const stopsWithEta = await Promise.all(stops.map(async (stop) => {
            const routeEtaEntries = getEtaEntriesForStop(etaMaps, direction, stop.stopId, stop.seq, serviceType);
            if (routeEtaEntries.some(hasUsableEta)) {
                return { ...stop, etaEntries: routeEtaEntries };
            }

            try {
                const stopAllEtaEntries = await getStopAllEta(stop.stopId);
                const filteredStopAllEtaEntries = stopAllEtaEntries.filter((entry) => {
                    return isSameRoute(entry, route) && getItemDirection(entry) === direction;
                });

                if (filteredStopAllEtaEntries.length > 0) {
                    const stopAllEtaMaps = buildEtaMaps(filteredStopAllEtaEntries, serviceType);
                    const stopAllFallbackEntries = getEtaEntriesForStop(
                        stopAllEtaMaps,
                        direction,
                        stop.stopId,
                        stop.seq,
                        serviceType
                    );

                    if (stopAllFallbackEntries.length > 0) {
                        return { ...stop, etaEntries: stopAllFallbackEntries };
                    }
                }
            } catch (error) {
                console.warn(`stop-eta 後備查詢失敗: ${stop.stopId}`, error);
            }

            try {
                const stopEtaEntries = await getStopEta(route, serviceType, stop.stopId);
                const stopEtaMaps = buildEtaMaps(stopEtaEntries, serviceType);
                const fallbackEtaEntries = getEtaEntriesForStop(stopEtaMaps, direction, stop.stopId, stop.seq, serviceType);

                if (fallbackEtaEntries.length > 0) {
                    return { ...stop, etaEntries: fallbackEtaEntries };
                }
            } catch (error) {
                console.warn(`站點 ETA 後備查詢失敗: ${stop.stopId}`, error);
            }

            return { ...stop, etaEntries: routeEtaEntries };
        }));

        return [direction, stopsWithEta];
    }));

    return new Map(entries);
}

function countStopsWithUsableEta(stops) {
    const totalStops = stops.length;
    const stopsWithEta = stops.filter((stop) => (stop.etaEntries || []).some(hasUsableEta)).length;
    return { totalStops, stopsWithEta };
}

function formatDisplayTime(value) {
    if (!value) {
        return "";
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleTimeString("zh-HK", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
}

function ensureVariantDataBucket(variantKey) {
    if (!currentRenderState) {
        return null;
    }

    if (!currentRenderState.variantDataByKey[variantKey]) {
        currentRenderState.variantDataByKey[variantKey] = {
            isLoading: false,
            error: "",
            fetchedAt: null,
            routeStopsWithEta: []
        };
    }

    return currentRenderState.variantDataByKey[variantKey];
}

function stopLiveUpdates() {
    if (liveCountdownTimerId) {
        window.clearInterval(liveCountdownTimerId);
        liveCountdownTimerId = null;
    }

    if (dataRefreshTimerId) {
        window.clearTimeout(dataRefreshTimerId);
        dataRefreshTimerId = null;
    }
}

function startLiveUpdates() {
    stopLiveUpdates();

    if (!currentRenderState?.selectedVariantKey) {
        return;
    }

    liveCountdownTimerId = window.setInterval(() => {
        renderCurrentState();
    }, COUNTDOWN_REFRESH_MS);

    dataRefreshTimerId = window.setTimeout(() => {
        void searchETA({ isAutoRefresh: true });
    }, DATA_REFRESH_MS);
}

function formatEtaMinutes(etaValue) {
    if (!etaValue) {
        return "暫無預報";
    }

    const etaTimestamp = Date.parse(etaValue);
    if (Number.isNaN(etaTimestamp)) {
        return "暫無預報";
    }

    const diffMilliseconds = etaTimestamp - Date.now();
    if (diffMilliseconds <= 60000) {
        return "即將到站";
    }

    const diffMinutes = Math.ceil(diffMilliseconds / 60000);
    return `${diffMinutes} 分鐘`;
}

function formatEtaClock(etaValue) {
    if (!etaValue) {
        return "";
    }

    const etaDate = new Date(etaValue);
    if (Number.isNaN(etaDate.getTime())) {
        return "";
    }

    return etaDate.toLocaleTimeString("zh-HK", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });
}

function renderEtaBlock(entries) {
    if (!entries.length) {
        return '<div class="eta-empty">暫無預報</div>';
    }

    const displayEntries = preferUsableEtaEntries(entries).slice(0, 3);
    if (!displayEntries.length) {
        return '<div class="eta-empty">暫無預報</div>';
    }

    return `
        <div class="eta-stack">
            ${displayEntries.map((entry) => {
                const minutesText = formatEtaMinutes(entry.eta);
                const clockText = formatEtaClock(entry.eta);
                const destination = escapeHtml(entry.dest_tc || entry.dest_en || "未知目的地");
                const remark = escapeHtml(entry.rmk_tc || entry.rmk_en || "");
                const extra = [clockText, remark].filter(Boolean).join(" • ");

                return `
                    <div class="eta-row">
                        <div class="eta-main">
                            <span class="eta">${escapeHtml(minutesText)}</span>
                            <span class="eta-destination">→ ${destination}</span>
                        </div>
                        ${extra ? `<div class="eta-meta-line">${extra}</div>` : ""}
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function renderDirectionCards() {
    if (!currentRenderState) {
        return "";
    }

    return currentRenderState.variants.map((variant) => {
        const variantKey = getVariantKey(variant);
        const variantData = currentRenderState.variantDataByKey[variantKey];
        const isSelected = currentRenderState.selectedVariantKey === variantKey;
        const encodedKey = encodeURIComponent(variantKey);
        const direction = getItemDirection(variant);
        const statusText = variantData?.isLoading
            ? "正在載入站點..."
            : variantData?.fetchedAt
                ? `已更新 ${formatDisplayTime(variantData.fetchedAt)}`
                : "點擊後顯示站點";

        return `
            <button type="button" class="variant-card ${isSelected ? "is-selected" : ""}" onclick="selectVariant('${encodedKey}')">
                <div class="variant-top">
                    <span class="inline-chip">${escapeHtml(getDirectionLabel(direction))}</span>
                    <span class="inline-chip subtle">服務類型 ${escapeHtml(getServiceType(variant))}</span>
                </div>
                <div class="variant-route">${escapeHtml(getRouteLabel(variant))}</div>
                <div class="variant-meta">${escapeHtml(statusText)}</div>
            </button>
        `;
    }).join("");
}

function renderSelectedVariantPanel() {
    if (!currentRenderState) {
        return "";
    }

    if (!currentRenderState.selectedVariantKey) {
        return `
            <section class="selection-panel">
                <div class="selection-hint">
                    <p>請先從上方選擇一個方向。</p>
                    <p>選擇後才會載入該方向的站點列表與 ETA。</p>
                </div>
            </section>
        `;
    }

    const variant = findVariantByKey(currentRenderState.selectedVariantKey);
    const variantData = ensureVariantDataBucket(currentRenderState.selectedVariantKey);

    if (!variant) {
        return "";
    }

    if (variantData.isLoading && variantData.routeStopsWithEta.length === 0) {
        return `
            <section class="selection-panel">
                <div class="loading">正在載入 ${escapeHtml(getRouteLabel(variant))} 的站點與 ETA...</div>
            </section>
        `;
    }

    if (variantData.error && variantData.routeStopsWithEta.length === 0) {
        return `
            <section class="selection-panel">
                <div class="selection-error">
                    <p>載入這個方向失敗。</p>
                    <p>${escapeHtml(variantData.error)}</p>
                    <button type="button" class="retry-btn" onclick="selectVariant('${encodeURIComponent(currentRenderState.selectedVariantKey)}')">重新載入</button>
                </div>
            </section>
        `;
    }

    const stops = variantData.routeStopsWithEta;
    const updatedTimeText = formatDisplayTime(variantData.fetchedAt);

    const stopsHtml = stops.map((stop) => {
        const stopKey = getStopPanelKey(currentRenderState.selectedVariantKey, stop);
        const encodedStopKey = encodeURIComponent(stopKey);
        const isExpanded = currentRenderState.expandedStopKeys.includes(stopKey);
        const stopInfo = currentRenderState.stopMap?.get(stop.stopId);
        const stopName = escapeHtml(stopInfo?.name_tc || stopInfo?.name_en || `站點 ${stop.stopId}`);

        return `
            <div class="stop ${isExpanded ? "is-expanded" : ""}">
                <button type="button" class="stop-toggle" onclick="toggleStopDetails('${encodedStopKey}')">
                    <div class="stop-toggle-main">
                        <div class="stop-index">第 ${stop.seq} 站</div>
                        <div class="stop-name">${stopName}</div>
                    </div>
                    <span class="stop-chevron ${isExpanded ? "is-open" : ""}">▾</span>
                </button>
                ${isExpanded ? `<div class="stop-eta-panel">${renderEtaBlock(stop.etaEntries || [])}</div>` : ""}
            </div>
        `;
    }).join("");

    return `
        <section class="selection-panel">
            <div class="selection-panel-header">
                <div>
                    <p class="selection-eyebrow">第 2 步：查看站點</p>
                    <h2 class="selection-title">路線 ${escapeHtml(currentRenderState.route)} • ${escapeHtml(getRouteLabel(variant))}</h2>
                    <p class="selection-subtitle">服務類型 ${escapeHtml(getServiceType(variant))} • 站點共 ${stops.length} 個 • 點一下站名展開 ETA • 資料更新 ${escapeHtml(updatedTimeText)}</p>
                </div>
                <button type="button" class="retry-btn" onclick="refreshSelectedDirection()">更新這個方向</button>
            </div>
            <div class="stop-list">
                ${stopsHtml || '<p class="direction-empty">這個方向暫時沒有站點資料。</p>'}
            </div>
        </section>
    `;
}

function renderResult() {
    if (!currentRenderState) {
        return "";
    }

    const summaryText = currentRenderState.selectedVariantKey
        ? "倒數每 30 秒自動更新，資料每 60 秒重新抓取"
        : "請先選擇一個方向，再展開站點查看 ETA";

    return `
        <div class="route-shell">
            <section class="selection-panel">
                <div class="selection-panel-header">
                    <div>
                        <p class="selection-eyebrow">第 1 步：選擇方向</p>
                        <h2 class="selection-title">路線 ${escapeHtml(currentRenderState.route)}</h2>
                        <p class="selection-subtitle">${escapeHtml(summaryText)}</p>
                    </div>
                </div>
                <div class="variant-grid">
                    ${renderDirectionCards()}
                </div>
            </section>
            ${renderSelectedVariantPanel()}
        </div>
    `;
}

function renderCurrentState() {
    const resultDiv = document.getElementById("result");

    if (!resultDiv) {
        return;
    }

    if (!currentRenderState) {
        resultDiv.innerHTML = "";
        return;
    }

    resultDiv.innerHTML = renderResult();
}

// 點擊方向卡片後，才真正去載入該方向的站點與 ETA。
async function loadSelectedVariantData(variantKey, { isAutoRefresh = false } = {}) {
    const statusDiv = document.getElementById("status");
    const variant = findVariantByKey(variantKey);

    if (!currentRenderState || !variant) {
        return;
    }

    const variantData = ensureVariantDataBucket(variantKey);
    const route = currentRenderState.route;
    const direction = getItemDirection(variant);
    const serviceType = getServiceType(variant);
    const requestId = ++activeVariantLoadId;

    currentRenderState.selectedVariantKey = variantKey;

    if (!isAutoRefresh) {
        currentRenderState.expandedStopKeys = [];
        stopLiveUpdates();
    }

    variantData.isLoading = true;
    variantData.error = "";
    renderCurrentState();

    if (statusDiv) {
        statusDiv.innerHTML = isAutoRefresh
            ? `正在自動更新 <strong>${escapeHtml(getRouteLabel(variant))}</strong>...`
            : `正在載入 <strong>${escapeHtml(getRouteLabel(variant))}</strong> 的站點與 ETA...`;
    }

    try {
        const [stopMap, etaEntries, routeStops] = await Promise.all([
            currentRenderState.stopMap ? Promise.resolve(currentRenderState.stopMap) : getStopMap(),
            getRouteEta(route, serviceType),
            getRouteStops(route, direction, serviceType)
        ]);

        if (!currentRenderState || currentRenderState.route !== route || requestId !== activeVariantLoadId) {
            return;
        }

        currentRenderState.stopMap = stopMap;

        const routeStopsByDirection = new Map([[direction, routeStops]]);
        const etaMaps = buildEtaMaps(etaEntries, serviceType);
        const routeStopsWithEtaMap = await attachEtaEntriesToStops(
            route,
            serviceType,
            [variant],
            routeStopsByDirection,
            etaMaps
        );

        if (!currentRenderState || currentRenderState.route !== route || requestId !== activeVariantLoadId) {
            return;
        }

        const stopsWithEta = routeStopsWithEtaMap.get(direction) || [];
        const etaSummary = countStopsWithUsableEta(stopsWithEta);

        variantData.isLoading = false;
        variantData.error = "";
        variantData.routeStopsWithEta = stopsWithEta;
        variantData.fetchedAt = new Date();

        console.log(`[KMB ${APP_VERSION}] variant loaded`, {
            route,
            direction,
            serviceType,
            totalStops: etaSummary.totalStops,
            stopsWithEta: etaSummary.stopsWithEta
        });

        renderCurrentState();
        startLiveUpdates();

        if (statusDiv && currentRenderState.selectedVariantKey === variantKey) {
            statusDiv.innerHTML = `已載入 <strong>${escapeHtml(getRouteLabel(variant))}</strong>，可展開站點查看 ETA`;
        }
    } catch (error) {
        if (!currentRenderState || currentRenderState.route !== route || requestId !== activeVariantLoadId) {
            return;
        }

        variantData.isLoading = false;
        variantData.error = error.message || "載入失敗";
        renderCurrentState();

        if (isAutoRefresh && variantData.routeStopsWithEta.length > 0) {
            startLiveUpdates();
            if (statusDiv) {
                statusDiv.innerHTML = `自動更新失敗，暫時顯示 ${formatDisplayTime(variantData.fetchedAt)} 的資料`;
            }
        } else if (statusDiv) {
            statusDiv.innerHTML = "載入方向資料失敗";
        }

        console.error("KMB variant load failed", error);
    }
}

function selectVariant(encodedVariantKey) {
    const variantKey = decodeActionValue(encodedVariantKey);

    if (currentRenderState) {
        const existingData = ensureVariantDataBucket(variantKey);
        if (existingData && existingData.fetchedAt && existingData.routeStopsWithEta.length > 0) {
            currentRenderState.selectedVariantKey = variantKey;
            currentRenderState.expandedStopKeys = [];
            renderCurrentState();
            startLiveUpdates();
            return;
        }
    }

    void loadSelectedVariantData(variantKey, { isAutoRefresh: false });
}

function toggleStopDetails(encodedStopKey) {
    if (!currentRenderState) {
        return;
    }

    const stopKey = decodeActionValue(encodedStopKey);
    const exists = currentRenderState.expandedStopKeys.includes(stopKey);

    currentRenderState.expandedStopKeys = exists
        ? currentRenderState.expandedStopKeys.filter((item) => item !== stopKey)
        : [...currentRenderState.expandedStopKeys, stopKey];

    renderCurrentState();
}

function refreshSelectedDirection() {
    if (!currentRenderState?.selectedVariantKey) {
        return;
    }

    void loadSelectedVariantData(currentRenderState.selectedVariantKey, { isAutoRefresh: false });
}

async function searchETA(options = {}) {
    const { isAutoRefresh = false } = options;

    if (isAutoRefresh) {
        if (currentRenderState?.selectedVariantKey) {
            await loadSelectedVariantData(currentRenderState.selectedVariantKey, { isAutoRefresh: true });
        }
        return;
    }

    const routeInput = document.getElementById("routeInput");
    const serviceTypeInput = document.getElementById("serviceType");
    const resultDiv = document.getElementById("result");
    const statusDiv = document.getElementById("status");
    const searchBtn = document.getElementById("searchBtn");
    const route = routeInput.value.trim().toUpperCase();
    const requestedServiceType = serviceTypeInput.value;
    const searchId = ++activeSearchId;

    if (!route) {
        statusDiv.innerHTML = '<span style="color:red">請輸入路線號，例如 1A、2、104。</span>';
        resultDiv.innerHTML = "";
        currentRenderState = null;
        stopLiveUpdates();
        return;
    }

    stopLiveUpdates();
    currentRenderState = null;
    statusDiv.innerHTML = `正在分析路線 <strong>${escapeHtml(route)}</strong>...`;
    resultDiv.innerHTML = '<div class="loading">正在整理方向選擇資料...</div>';
    searchBtn.disabled = true;
    searchBtn.textContent = "查詢中...";

    try {
        const routeList = await getRouteList();

        if (searchId !== activeSearchId) {
            return;
        }

        const matchingRoutes = routeList.filter((entry) => String(entry.route || "").toUpperCase() === route);
        if (!matchingRoutes.length) {
            resultDiv.innerHTML = `
                <div class="selection-panel">
                    <div class="selection-error">
                        <p>找不到路線 <strong>${escapeHtml(route)}</strong>。</p>
                        <p>請確認路線號是否正確，例如 1A、2、104。</p>
                    </div>
                </div>
            `;
            statusDiv.innerHTML = "找不到這條路線";
            return;
        }

        const { preferredServiceType, variants } = chooseRouteVariants(matchingRoutes, requestedServiceType);
        if (!variants.length) {
            resultDiv.innerHTML = `
                <div class="selection-panel">
                    <div class="selection-error">
                        <p>找不到路線 <strong>${escapeHtml(route)}</strong> 的可用方向資料。</p>
                    </div>
                </div>
            `;
            statusDiv.innerHTML = "找不到方向資料";
            return;
        }

        currentRenderState = {
            route,
            requestedServiceType,
            preferredServiceType,
            variants,
            selectedVariantKey: null,
            expandedStopKeys: [],
            stopMap: null,
            variantDataByKey: {}
        };

        renderCurrentState();

        console.log(`[KMB ${APP_VERSION}] route search`, {
            route,
            requestedServiceType,
            preferredServiceType,
            variantCount: variants.length
        });

        statusDiv.innerHTML = `已找到 ${variants.length} 個可用方向，請先選擇一個方向`;
    } catch (error) {
        console.error("KMB route search failed", error);
        resultDiv.innerHTML = `
            <div class="selection-panel">
                <div class="selection-error">
                    <p>查詢失敗</p>
                    <p>${escapeHtml(error.message || "請稍後再試")}</p>
                </div>
            </div>
        `;
        statusDiv.innerHTML = "查詢失敗";
        currentRenderState = null;
    } finally {
        if (searchId === activeSearchId) {
            searchBtn.disabled = false;
            searchBtn.textContent = "🔍 查詢";
        }
    }
}

window.onload = () => {
    console.log(`Ready to search KMB routes like 1A, 2, and 104 (${APP_VERSION})`);
};

window.addEventListener("beforeunload", () => {
    stopLiveUpdates();
});
