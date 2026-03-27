const APP_VERSION = "2026-03-28 00:10";
const API_BASE = "https://data.etabus.gov.hk/v1/transport/kmb";
const COUNTDOWN_REFRESH_MS = 1000;
const DATA_REFRESH_MS = 60000;
const routeStopCache = new Map();
const stopEtaCache = new Map();
const stopAllEtaCache = new Map();

let routeListPromise = null;
let stopMapPromise = null;
let activeSearchId = 0;
let liveCountdownTimerId = null;
let dataRefreshTimerId = null;
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
    const suffix = direction === "outbound" ? "去程" : direction === "inbound" ? "回程" : "路線";

    return `${origin} → ${destination} (${suffix})`;
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
    const groupedByServiceType = new Map();

    for (const entry of routeEntries) {
        const direction = getItemDirection(entry);
        if (!direction) {
            continue;
        }

        const serviceType = getServiceType(entry);
        if (!groupedByServiceType.has(serviceType)) {
            groupedByServiceType.set(serviceType, []);
        }

        groupedByServiceType.get(serviceType).push(entry);
    }

    if (groupedByServiceType.size === 0) {
        return { chosenServiceType: requestedServiceType, variants: [] };
    }

    const chosenServiceType = groupedByServiceType.has(requestedServiceType)
        ? requestedServiceType
        : groupedByServiceType.has("1")
            ? "1"
            : [...groupedByServiceType.keys()].sort()[0];

    const uniqueByDirection = new Map();
    for (const entry of groupedByServiceType.get(chosenServiceType)) {
        const direction = getItemDirection(entry);
        if (!uniqueByDirection.has(direction)) {
            uniqueByDirection.set(direction, entry);
        }
    }

    const variants = [...uniqueByDirection.values()].sort((left, right) => {
        const leftDirection = getItemDirection(left);
        const rightDirection = getItemDirection(right);
        return leftDirection.localeCompare(rightDirection);
    });

    return { chosenServiceType, variants };
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

function countStopsWithUsableEta(routeStopsByDirection) {
    let totalStops = 0;
    let stopsWithEta = 0;

    for (const stops of routeStopsByDirection.values()) {
        totalStops += stops.length;

        for (const stop of stops) {
            if ((stop.etaEntries || []).some(hasUsableEta)) {
                stopsWithEta += 1;
            }
        }
    }

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

function renderCurrentState() {
    if (!currentRenderState) {
        return;
    }

    const resultDiv = document.getElementById("result");
    if (!resultDiv) {
        return;
    }

    resultDiv.innerHTML = renderResult(
        currentRenderState.route,
        currentRenderState.chosenServiceType,
        currentRenderState.variants,
        currentRenderState.routeStopsWithEta,
        currentRenderState.stopMap,
        currentRenderState.fetchedAt
    );
}

function startLiveUpdates() {
    stopLiveUpdates();

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
    if (diffMilliseconds <= 0) {
        return "即將到站";
    }

    const totalSeconds = Math.ceil(diffMilliseconds / 1000);
    if (totalSeconds < 60) {
        return `${totalSeconds} 秒`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${minutes} 分鐘` : `${minutes} 分 ${seconds} 秒`;
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
        return '<span style="color:#888;">暫無預報</span>';
    }

    const displayEntries = preferUsableEtaEntries(entries).slice(0, 3);

    if (!displayEntries.length) {
        return '<span style="color:#888;">暫無預報</span>';
    }

    return displayEntries.map((entry) => {
        const minutesText = formatEtaMinutes(entry.eta);
        const clockText = formatEtaClock(entry.eta);
        const destination = escapeHtml(entry.dest_tc || entry.dest_en || "未知目的地");
        const remark = escapeHtml(entry.rmk_tc || entry.rmk_en || "");
        const extra = [clockText, remark].filter(Boolean).join(" • ");

        return `
            <div style="margin:10px 0;">
                <span class="eta">${escapeHtml(minutesText)}</span>
                <span style="color:#555;">→ ${destination}</span>
                ${extra ? `<div style="color:#777; margin-top:4px;">${extra}</div>` : ""}
            </div>
        `;
    }).join("");
}

function renderResult(route, serviceType, variants, routeStopsByDirection, stopMap, fetchedAt) {
    const updatedTimeText = formatDisplayTime(fetchedAt) || formatDisplayTime(new Date());

    const sections = variants.map((variant) => {
        const direction = getItemDirection(variant);
        const stops = routeStopsByDirection.get(direction) || [];
        const routeLabel = escapeHtml(getRouteLabel(variant));

        const stopsHtml = stops.map((stop) => {
            const stopInfo = stopMap.get(stop.stopId);
            const stopName = escapeHtml(stopInfo?.name_tc || stopInfo?.name_en || `站點 ${stop.stopId}`);

            return `
                <div class="stop">
                    <h3>第 ${stop.seq} 站 • ${stopName}</h3>
                    <div>${renderEtaBlock(stop.etaEntries || [])}</div>
                </div>
            `;
        }).join("");

        return `
            <section style="margin-top:24px;">
                <h2 style="text-align:center; color:#c8102e; margin-bottom:8px;">路線 ${escapeHtml(route)} • ${routeLabel}</h2>
                <p style="text-align:center; color:#666; margin-top:0;">服務類型 ${escapeHtml(serviceType)}</p>
                ${stopsHtml || '<p style="text-align:center; color:#888;">這個方向暫時沒有站點資料。</p>'}
            </section>
        `;
    }).join("");

    return `
        <div>
            <p style="text-align:center; color:#666;">資料更新：${updatedTimeText} • 倒數每秒更新，資料每 60 秒重抓</p>
            ${sections}
        </div>
    `;
}

async function searchETA(options = {}) {
    const { isAutoRefresh = false } = options;
    const routeInput = document.getElementById("routeInput");
    const serviceTypeInput = document.getElementById("serviceType");
    const resultDiv = document.getElementById("result");
    const statusDiv = document.getElementById("status");
    const searchBtn = document.getElementById("searchBtn");

    const route = isAutoRefresh && currentRenderState
        ? currentRenderState.route
        : routeInput.value.trim().toUpperCase();
    const requestedServiceType = isAutoRefresh && currentRenderState
        ? currentRenderState.requestedServiceType
        : serviceTypeInput.value;
    const searchId = ++activeSearchId;

    if (!route) {
        statusDiv.innerHTML = '<span style="color:red">請輸入路線號，例如 1A、2、104。</span>';
        resultDiv.innerHTML = "";
        stopLiveUpdates();
        currentRenderState = null;
        return;
    }

    if (!isAutoRefresh) {
        stopLiveUpdates();
        statusDiv.innerHTML = `正在分析路線 <strong>${escapeHtml(route)}</strong>...`;
        resultDiv.innerHTML = '<div class="loading">正在載入合法方向、站點名稱與到站時間...</div>';
        searchBtn.disabled = true;
        searchBtn.textContent = "查詢中...";
    } else {
        statusDiv.innerHTML = `正在自動更新路線 <strong>${escapeHtml(route)}</strong>...`;
    }

    try {
        const routeList = await getRouteList();

        if (searchId !== activeSearchId) {
            return;
        }

        const matchingRoutes = routeList.filter((entry) => String(entry.route || "").toUpperCase() === route);
        if (!matchingRoutes.length) {
            resultDiv.innerHTML = `
                <div style="text-align:center; padding:32px 20px; color:#d32f2f;">
                    <p>找不到路線 <strong>${escapeHtml(route)}</strong>。</p>
                    <p>請確認路線號是否正確，例如 1A、2、104。</p>
                </div>
            `;
            statusDiv.innerHTML = "找不到這條路線";
            return;
        }

        const { chosenServiceType, variants } = chooseRouteVariants(matchingRoutes, requestedServiceType);
        if (!variants.length) {
            resultDiv.innerHTML = `
                <div style="text-align:center; padding:32px 20px; color:#d32f2f;">
                    <p>找不到路線 <strong>${escapeHtml(route)}</strong> 的可用方向資料。</p>
                </div>
            `;
            statusDiv.innerHTML = "找不到方向資料";
            return;
        }

        statusDiv.innerHTML = `已找到 ${variants.length} 個方向，正在下載站點名稱與 ETA...`;

        const [stopMap, etaEntries, ...routeStopsResults] = await Promise.all([
            getStopMap(),
            getRouteEta(route, chosenServiceType),
            ...variants.map((variant) => getRouteStops(route, getItemDirection(variant), chosenServiceType))
        ]);

        if (searchId !== activeSearchId) {
            return;
        }

        const routeStopsByDirection = new Map();
        variants.forEach((variant, index) => {
            routeStopsByDirection.set(getItemDirection(variant), routeStopsResults[index] || []);
        });

        console.log(`[KMB ${APP_VERSION}] search`, {
            route,
            requestedServiceType,
            chosenServiceType,
            directionCount: variants.length,
            routeEtaCount: etaEntries.length,
            routeEtaWithUsableTime: etaEntries.filter(hasUsableEta).length,
            routeEtaSample: etaEntries.slice(0, 3)
        });

        const etaMaps = buildEtaMaps(etaEntries, chosenServiceType);
        const routeStopsWithEta = await attachEtaEntriesToStops(
            route,
            chosenServiceType,
            variants,
            routeStopsByDirection,
            etaMaps
        );

        if (searchId !== activeSearchId) {
            return;
        }

        const etaSummary = countStopsWithUsableEta(routeStopsWithEta);
        console.log(`[KMB ${APP_VERSION}] matched ETA`, {
            route,
            serviceType: chosenServiceType,
            totalStops: etaSummary.totalStops,
            stopsWithEta: etaSummary.stopsWithEta
        });

        currentRenderState = {
            route,
            requestedServiceType,
            chosenServiceType,
            variants,
            routeStopsWithEta,
            stopMap,
            fetchedAt: new Date()
        };

        renderCurrentState();
        startLiveUpdates();

        const fallbackNote = chosenServiceType !== requestedServiceType
            ? `，已自動改用 service_type ${escapeHtml(chosenServiceType)}`
            : "";

        const autoRefreshNote = isAutoRefresh ? "，已自動更新資料" : "，倒數會自動更新";
        statusDiv.innerHTML = `成功顯示路線 ${escapeHtml(route)} 的 ${variants.length} 個方向${fallbackNote}${autoRefreshNote}`;
    } catch (error) {
        console.error("KMB ETA lookup failed", error);
        if (isAutoRefresh && currentRenderState) {
            startLiveUpdates();
            statusDiv.innerHTML = `自動更新失敗，暫時顯示 ${formatDisplayTime(currentRenderState.fetchedAt)} 的資料`;
        } else {
            resultDiv.innerHTML = `
                <div style="text-align:center; padding:40px 20px; color:#d32f2f;">
                    <p>查詢失敗</p>
                    <p>${escapeHtml(error.message || "請稍後再試")}</p>
                </div>
            `;
            statusDiv.innerHTML = "查詢失敗";
            currentRenderState = null;
            stopLiveUpdates();
        }
    } finally {
        if (!isAutoRefresh && searchId === activeSearchId) {
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
