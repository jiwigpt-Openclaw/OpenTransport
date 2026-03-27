const API_BASE = "https://data.etabus.gov.hk/v1/transport/kmb";
const routeStopCache = new Map();

let routeListPromise = null;
let stopMapPromise = null;
let activeSearchId = 0;

console.log("KMB ETA enhanced lookup loaded");

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
                        stopId: item.stop || "",
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

function buildEtaMaps(etaEntries, serviceType) {
    const byExactStop = new Map();
    const byDirectionAndStop = new Map();

    for (const entry of etaEntries) {
        if (!entry?.stop) {
            continue;
        }

        const entryServiceType = entry.service_type != null ? String(entry.service_type) : "";
        if (entryServiceType && entryServiceType !== serviceType) {
            continue;
        }

        const direction = getItemDirection(entry) || "unknown";
        const seq = String(entry.seq ?? "");
        const exactKey = `${direction}|${entry.stop}|${seq}`;
        const stopKey = `${direction}|${entry.stop}`;

        if (!byExactStop.has(exactKey)) {
            byExactStop.set(exactKey, []);
        }

        if (!byDirectionAndStop.has(stopKey)) {
            byDirectionAndStop.set(stopKey, []);
        }

        byExactStop.get(exactKey).push(entry);
        byDirectionAndStop.get(stopKey).push(entry);
    }

    const sorter = (left, right) => {
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

    return { byExactStop, byDirectionAndStop };
}

function getEtaEntriesForStop(etaMaps, direction, stopId, seq) {
    const exactKey = `${direction}|${stopId}|${seq}`;
    const stopKey = `${direction}|${stopId}`;
    const unknownExactKey = `unknown|${stopId}|${seq}`;
    const unknownStopKey = `unknown|${stopId}`;

    return etaMaps.byExactStop.get(exactKey)
        || etaMaps.byDirectionAndStop.get(stopKey)
        || etaMaps.byExactStop.get(unknownExactKey)
        || etaMaps.byDirectionAndStop.get(unknownStopKey)
        || [];
}

function formatEtaMinutes(etaValue) {
    if (!etaValue) {
        return "暫無預報";
    }

    const etaTimestamp = Date.parse(etaValue);
    if (Number.isNaN(etaTimestamp)) {
        return "暫無預報";
    }

    const diffMinutes = Math.ceil((etaTimestamp - Date.now()) / 60000);
    return diffMinutes <= 0 ? "即將到站" : `${diffMinutes} 分鐘`;
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

    return entries.slice(0, 3).map((entry) => {
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

function renderResult(route, serviceType, variants, routeStopsByDirection, stopMap, etaMaps) {
    const sections = variants.map((variant) => {
        const direction = getItemDirection(variant);
        const stops = routeStopsByDirection.get(direction) || [];
        const routeLabel = escapeHtml(getRouteLabel(variant));

        const stopsHtml = stops.map((stop) => {
            const stopInfo = stopMap.get(stop.stopId);
            const stopName = escapeHtml(stopInfo?.name_tc || stopInfo?.name_en || `站點 ${stop.stopId}`);
            const etaEntries = getEtaEntriesForStop(etaMaps, direction, stop.stopId, String(stop.seq));

            return `
                <div class="stop">
                    <h3>第 ${stop.seq} 站 • ${stopName}</h3>
                    <div>${renderEtaBlock(etaEntries)}</div>
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
            <p style="text-align:center; color:#666;">最後更新：${new Date().toLocaleTimeString("zh-HK")}</p>
            ${sections}
        </div>
    `;
}

async function searchETA() {
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
        return;
    }

    statusDiv.innerHTML = `正在分析路線 <strong>${escapeHtml(route)}</strong>...`;
    resultDiv.innerHTML = '<div class="loading">正在載入合法方向、站點名稱與到站時間...</div>';
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

        const etaMaps = buildEtaMaps(etaEntries, chosenServiceType);
        resultDiv.innerHTML = renderResult(route, chosenServiceType, variants, routeStopsByDirection, stopMap, etaMaps);

        const fallbackNote = chosenServiceType !== requestedServiceType
            ? `，已自動改用 service_type ${escapeHtml(chosenServiceType)}`
            : "";

        statusDiv.innerHTML = `成功顯示路線 ${escapeHtml(route)} 的 ${variants.length} 個方向${fallbackNote}`;
    } catch (error) {
        console.error("KMB ETA lookup failed", error);
        resultDiv.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#d32f2f;">
                <p>查詢失敗</p>
                <p>${escapeHtml(error.message || "請稍後再試")}</p>
            </div>
        `;
        statusDiv.innerHTML = "查詢失敗";
    } finally {
        if (searchId === activeSearchId) {
            searchBtn.disabled = false;
            searchBtn.textContent = "🔍 查詢";
        }
    }
}

window.onload = () => {
    console.log("Ready to search KMB routes like 1A, 2, and 104");
};
