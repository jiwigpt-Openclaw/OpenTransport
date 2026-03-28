const APP_VERSION = "2026-03-28 04:35";
const API_BASE = "https://data.etabus.gov.hk/v1/transport/kmb";
const COUNTDOWN_REFRESH_MS = 30000;
const DATA_REFRESH_MS = 60000;
const GEOLOCATION_OPTIONS = {
    enableHighAccuracy: false,
    timeout: 8000,
    maximumAge: 60000
};
const routeStopCache = new Map();
const stopEtaCache = new Map();
const stopAllEtaCache = new Map();
const stopInfoCache = new Map();

let routeListPromise = null;
let stopMapPromise = null;
let activeSearchId = 0;
let activeVariantLoadId = 0;
let activeLocationRequestId = 0;
let liveCountdownTimerId = null;
let dataRefreshTimerId = null;
let pendingScrollTimerId = null;

// 這個物件會保存目前畫面所需的所有狀態，方便重繪與自動更新。
let currentRenderState = null;

// 定位功能的開關與狀態獨立保存，讓使用者換路線後也能保留偏好。
const locationState = {
    enabled: true,
    statusMessage: "定位已開啟，選擇方向後會自動尋找最近的站",
    userPosition: null
};

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

// service_type 1 視為正常班次，其餘都視為特別班次，讓顯示與排序規則更一致。
function getServiceTypeGroup(serviceType) {
    return String(serviceType ?? "").trim() === "1" ? "1" : "2";
}

function getServiceTypeLabel(serviceType) {
    const normalized = String(serviceType ?? "").trim();

    if (normalized === "1") {
        return "正常班次";
    }

    return normalized ? "特別班次" : "未分類班次";
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

function compareVariantsBase(left, right, requestedServiceType = "") {
    const requestedGroup = getServiceTypeGroup(requestedServiceType);
    const leftPreferred = getServiceTypeGroup(getServiceType(left)) === requestedGroup ? 0 : 1;
    const rightPreferred = getServiceTypeGroup(getServiceType(right)) === requestedGroup ? 0 : 1;
    if (leftPreferred !== rightPreferred) {
        return leftPreferred - rightPreferred;
    }

    const leftServiceTypeGroup = getServiceTypeGroup(getServiceType(left));
    const rightServiceTypeGroup = getServiceTypeGroup(getServiceType(right));
    if (leftServiceTypeGroup !== rightServiceTypeGroup) {
        return leftServiceTypeGroup.localeCompare(rightServiceTypeGroup, "en");
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

// 失敗或切換路線時，統一用這個函式把舊的查詢狀態清乾淨，避免下一次查詢沿用到壞掉的狀態。
function resetCurrentRouteState() {
    stopLiveUpdates();
    activeVariantLoadId += 1;
    activeLocationRequestId += 1;
    currentRenderState = null;
}

function clearSelectedVariantState() {
    if (!currentRenderState) {
        return;
    }

    currentRenderState.selectedVariantKey = null;
    currentRenderState.expandedStopKeys = [];
    currentRenderState.nearestStopKey = "";
}

function getFriendlyRouteErrorMessage(error) {
    const rawMessage = String(error?.message || "");

    if (rawMessage.includes("403") || rawMessage.includes("Failed to fetch") || rawMessage.includes("NetworkError")) {
        return "該路線目前無法查詢站點資料，請試其他路線，例如 1A、2、104。";
    }

    if (rawMessage) {
        return `${rawMessage}。你可以試其他路線，例如 1A、2、104。`;
    }

    return "該路線目前無法查詢，請稍後再試，或試其他路線例如 1A、2、104。";
}

function renderStandaloneError(resultDiv, title, message) {
    if (!resultDiv) {
        return;
    }

    resultDiv.innerHTML = `
        <div class="selection-panel">
            <div class="selection-error">
                <p>${escapeHtml(title)}</p>
                <p>${escapeHtml(message)}</p>
            </div>
        </div>
    `;
}

function isLocalFileOrigin() {
    return window.location.protocol === "file:" || window.location.origin === "null";
}

function joinWarningMessages(...messages) {
    return messages
        .map((message) => String(message || "").trim())
        .filter(Boolean)
        .join(" ");
}

function buildFallbackStopsFromEtaEntries(variant, etaEntries) {
    const direction = getItemDirection(variant);
    const serviceType = getServiceType(variant);
    const uniqueStops = new Map();

    const collectStops = (matcher) => {
        for (const entry of etaEntries) {
            if (!matcher(entry)) {
                continue;
            }

            const stopId = normalizeStopId(entry?.stop);
            const seq = Number(entry?.seq) || 0;

            if (!stopId || seq <= 0) {
                continue;
            }

            const stopKey = `${stopId}|${seq}`;
            if (!uniqueStops.has(stopKey)) {
                uniqueStops.set(stopKey, {
                    seq,
                    stopId,
                    direction: getItemDirection(entry) || direction,
                    serviceType: getServiceType(entry) || serviceType
                });
            }
        }
    };

    // 先盡量用和目前方向卡片完全相符的 ETA，避免環線混到別的方向資料。
    collectStops((entry) => isEtaEntryForVariant(entry, variant));

    // 如果環線的目的地標記不完整，再退一步用同方向、同班次的 ETA 推回站點列表。
    if (uniqueStops.size === 0) {
        collectStops((entry) => {
            return isSameRoute(entry, variant.route)
                && getItemDirection(entry) === direction
                && getServiceType(entry) === serviceType;
        });
    }

    return [...uniqueStops.values()].sort((left, right) => left.seq - right.seq);
}

async function getRouteStopsWithFallback(route, variant, etaEntries) {
    const direction = getItemDirection(variant);
    const serviceType = getServiceType(variant);

    try {
        const routeStops = await getRouteStops(route, direction, serviceType);
        if (routeStops.length > 0) {
            return {
                routeStops,
                warningMessage: ""
            };
        }
    } catch (error) {
        const fallbackStops = buildFallbackStopsFromEtaEntries(variant, etaEntries);
        if (fallbackStops.length > 0) {
            console.warn("route-stop 載入失敗，改用 route-eta 推算站點資料", error);
            return {
                routeStops: fallbackStops,
                warningMessage: "這條路線的站點清單暫時無法取得，已改用 ETA 資料推算站點順序。"
            };
        }

        throw error;
    }

    const fallbackStops = buildFallbackStopsFromEtaEntries(variant, etaEntries);
    if (fallbackStops.length > 0) {
        return {
            routeStops: fallbackStops,
            warningMessage: "這條路線的站點清單暫時無法取得，已改用 ETA 資料推算站點順序。"
        };
    }

    throw new Error(`路線站點 ${route} ${direction} service_type=${serviceType} 暫時沒有可用資料`);
}

async function getOptionalStopMap() {
    if (currentRenderState?.stopMap instanceof Map && currentRenderState.stopMap.size > 0) {
        return {
            stopMap: currentRenderState.stopMap,
            warningMessage: ""
        };
    }

    // 直接用 file:// 開啟頁面時，/stop API 會被瀏覽器 CORS 擋下來，這裡直接走降級模式避免整頁報錯。
    if (isLocalFileOrigin()) {
        return {
            stopMap: new Map(),
            warningMessage: "目前以本機檔案模式開啟，完整站名或定位資料可能受限制，仍可先查看這個方向的 ETA。"
        };
    }

    try {
        return {
            stopMap: await getStopMap(),
            warningMessage: ""
        };
    } catch (error) {
        console.warn("巴士站清單載入失敗，改用降級模式顯示", error);
        return {
            stopMap: currentRenderState?.stopMap instanceof Map ? currentRenderState.stopMap : new Map(),
            warningMessage: "暫時無法載入完整站名或定位資料，仍可先查看這個方向的 ETA。"
        };
    }
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

async function getStopInfo(stopId) {
    const normalizedStopId = normalizeStopId(stopId);

    if (!normalizedStopId) {
        return null;
    }

    if (!stopInfoCache.has(normalizedStopId)) {
        const url = `${API_BASE}/stop/${normalizedStopId}`;
        const promise = fetchJson(url, `巴士站資料 ${normalizedStopId}`)
            .then((payload) => payload?.data || null)
            .catch((error) => {
                stopInfoCache.delete(normalizedStopId);
                throw error;
            });

        stopInfoCache.set(normalizedStopId, promise);
    }

    return stopInfoCache.get(normalizedStopId);
}

async function hydrateStopMapForStops(stops, baseStopMap) {
    const mergedStopMap = baseStopMap instanceof Map ? new Map(baseStopMap) : new Map();
    const missingStopIds = [...new Set(
        stops
            .map((stop) => normalizeStopId(stop?.stopId))
            .filter((stopId) => stopId && !mergedStopMap.has(stopId))
    )];

    if (missingStopIds.length === 0) {
        return {
            stopMap: mergedStopMap,
            warningMessage: ""
        };
    }

    let successCount = 0;
    const [firstStopId, ...remainingStopIds] = missingStopIds;

    // 先試第一個站點；如果連第一個都被 CORS/403 擋下來，就不要把整排站點都打一遍失敗 request。
    try {
        const firstStopInfo = await getStopInfo(firstStopId);
        if (firstStopInfo?.stop) {
            mergedStopMap.set(normalizeStopId(firstStopInfo.stop), firstStopInfo);
            successCount += 1;
        }
    } catch (error) {
        const rawMessage = String(error?.message || "");
        if (rawMessage.includes("403") || rawMessage.includes("Failed to fetch") || rawMessage.includes("NetworkError")) {
            return {
                stopMap: mergedStopMap,
                warningMessage: "暫時未能載入站名資料，先以站點編號顯示 ETA。"
            };
        }
    }

    if (remainingStopIds.length === 0) {
        return {
            stopMap: mergedStopMap,
            warningMessage: successCount > 0 ? "" : "暫時未能載入站名資料，先以站點編號顯示 ETA。"
        };
    }

    // 整包 /stop 清單在本機模式下可能被 CORS 擋住，所以這裡改成針對目前方向逐站補站名。
    const results = await Promise.allSettled(remainingStopIds.map(async (stopId) => ({
        stopId,
        stopInfo: await getStopInfo(stopId)
    })));

    for (const result of results) {
        if (result.status !== "fulfilled" || !result.value.stopInfo?.stop) {
            continue;
        }

        mergedStopMap.set(normalizeStopId(result.value.stopInfo.stop), result.value.stopInfo);
        successCount += 1;
    }

    if (successCount === 0) {
        return {
            stopMap: mergedStopMap,
            warningMessage: "暫時未能載入站名資料，先以站點編號顯示 ETA。"
        };
    }

    if (successCount < missingStopIds.length) {
        return {
            stopMap: mergedStopMap,
            warningMessage: "部分站名暫時未能載入，其餘站點仍可正常查看 ETA。"
        };
    }

    return {
        stopMap: mergedStopMap,
        warningMessage: ""
    };
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

    const variants = [...uniqueVariants.values()].sort((left, right) => compareVariantsBase(left, right, requestedServiceType));

    if (variants.length === 0) {
        return { preferredServiceType: requestedServiceType, variants: [] };
    }

    const preferredServiceType = variants.some((variant) => getServiceTypeGroup(getServiceType(variant)) === getServiceTypeGroup(requestedServiceType))
        ? requestedServiceType
        : getServiceTypeGroup(getServiceType(variants[0]));

    return { preferredServiceType, variants };
}

function getEtaTimestamp(etaValue) {
    const etaTimestamp = Date.parse(etaValue);
    return Number.isNaN(etaTimestamp) ? Number.POSITIVE_INFINITY : etaTimestamp;
}

function isEtaEntryForVariant(entry, variant) {
    if (!entry || !variant) {
        return false;
    }

    if (!isSameRoute(entry, variant.route)) {
        return false;
    }

    if (getItemDirection(entry) !== getItemDirection(variant)) {
        return false;
    }

    if (getServiceType(entry) !== getServiceType(variant)) {
        return false;
    }

    const variantDestTc = String(variant.dest_tc || "").trim();
    const entryDestTc = String(entry.dest_tc || "").trim();
    if (variantDestTc && entryDestTc && variantDestTc !== entryDestTc) {
        return false;
    }

    const variantDestEn = String(variant.dest_en || "").trim();
    const entryDestEn = String(entry.dest_en || "").trim();
    if (!variantDestTc && variantDestEn && entryDestEn && variantDestEn !== entryDestEn) {
        return false;
    }

    return true;
}

function getClosestEtaEntry(entries) {
    const now = Date.now();

    return entries
        .filter(hasUsableEta)
        .map((entry) => ({
            entry,
            etaTimestamp: getEtaTimestamp(entry.eta)
        }))
        .filter((item) => item.etaTimestamp >= now - 60000)
        .sort((left, right) => left.etaTimestamp - right.etaTimestamp)[0]?.entry || null;
}

// 方向卡片會先用 route-eta 做摘要，方便比較正常班次與特別班次誰更快到站。
function buildVariantEtaPreview(variant, etaEntries) {
    const matchingEntries = etaEntries.filter((entry) => isEtaEntryForVariant(entry, variant));
    const nextEntry = getClosestEtaEntry(matchingEntries);

    if (!nextEntry) {
        return {
            hasUsableEta: false,
            nextEtaValue: "",
            nextEtaTimestamp: Number.POSITIVE_INFINITY,
            destination: "",
            remark: ""
        };
    }

    return {
        hasUsableEta: true,
        nextEtaValue: nextEntry.eta,
        nextEtaTimestamp: getEtaTimestamp(nextEntry.eta),
        destination: nextEntry.dest_tc || nextEntry.dest_en || variant.dest_tc || variant.dest_en || "",
        remark: nextEntry.rmk_tc || nextEntry.rmk_en || ""
    };
}

function getLocationButtonLabel() {
    return locationState.enabled ? "停止定位" : "使用我的位置";
}

function getLocationStatusText() {
    return locationState.statusMessage || "你可以手動選擇站點";
}

function getStopCoordinates(stopInfo) {
    const latitude = Number(stopInfo?.lat ?? stopInfo?.latitude);
    const longitude = Number(stopInfo?.long ?? stopInfo?.lng ?? stopInfo?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return { latitude, longitude };
}

// 這裡用簡化版 Haversine，香港範圍內計算最近站已經足夠準確。
function getDistanceInKm(latitude1, longitude1, latitude2, longitude2) {
    const toRadians = (degrees) => degrees * (Math.PI / 180);
    const earthRadiusKm = 6371;
    const deltaLatitude = toRadians(latitude2 - latitude1);
    const deltaLongitude = toRadians(longitude2 - longitude1);
    const a = Math.sin(deltaLatitude / 2) ** 2
        + Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) * Math.sin(deltaLongitude / 2) ** 2;

    return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function getNearestStopMatch(stops, stopMap, userPosition, variantKey) {
    if (!userPosition || !stopMap) {
        return null;
    }

    let nearestMatch = null;

    for (const stop of stops) {
        const stopInfo = stopMap.get(stop.stopId);
        const coordinates = getStopCoordinates(stopInfo);

        if (!coordinates) {
            continue;
        }

        const distanceKm = getDistanceInKm(
            userPosition.latitude,
            userPosition.longitude,
            coordinates.latitude,
            coordinates.longitude
        );

        if (!nearestMatch || distanceKm < nearestMatch.distanceKm) {
            nearestMatch = {
                stopKey: getStopPanelKey(variantKey, stop),
                stopName: stopInfo?.name_tc || stopInfo?.name_en || `站點 ${stop.stopId}`,
                distanceKm
            };
        }
    }

    return nearestMatch;
}

// 不直接呼叫 toggleStopDetails，避免重複定位時把已展開面板反而關掉。
function expandStopPanel(stopKey) {
    if (!currentRenderState || !stopKey) {
        return;
    }

    currentRenderState.expandedStopKeys = [stopKey, ...currentRenderState.expandedStopKeys.filter((item) => item !== stopKey)];
}

function clearPendingScrollTimer() {
    if (pendingScrollTimerId) {
        window.clearTimeout(pendingScrollTimerId);
        pendingScrollTimerId = null;
    }
}

// 最近站展開後，稍等一下再平滑捲動到畫面中間，避免展開時畫面跳動。
function scrollStopIntoView(stopKey) {
    if (!stopKey) {
        return;
    }

    const encodedStopKey = encodeURIComponent(stopKey);
    clearPendingScrollTimer();

    pendingScrollTimerId = window.setTimeout(() => {
        const stopElement = document.querySelector(`[data-stop-key="${encodedStopKey}"]`);
        if (!stopElement) {
            return;
        }

        stopElement.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
        pendingScrollTimerId = null;
    }, 300);
}

function updateNearestStopFromUserPosition() {
    if (!currentRenderState?.selectedVariantKey || !locationState.userPosition) {
        return false;
    }

    const variantData = ensureVariantDataBucket(currentRenderState.selectedVariantKey);
    if (!variantData?.routeStopsWithEta.length) {
        return false;
    }

    // stop 清單偶爾會被 API 擋下來；這時先保留 ETA 功能，但不要硬做最近站計算。
    if (!(currentRenderState.stopMap instanceof Map) || currentRenderState.stopMap.size === 0) {
        currentRenderState.nearestStopKey = "";
        locationState.statusMessage = "暫時無法載入站點座標，請手動選擇站點";
        renderCurrentState();
        return false;
    }

    const nearestMatch = getNearestStopMatch(
        variantData.routeStopsWithEta,
        currentRenderState.stopMap,
        locationState.userPosition,
        currentRenderState.selectedVariantKey
    );

    if (!nearestMatch) {
        currentRenderState.nearestStopKey = "";
        locationState.statusMessage = "找不到可定位的站點座標，請手動選擇站點";
        renderCurrentState();
        return false;
    }

    const previousNearestStopKey = currentRenderState.nearestStopKey;
    const wasExpanded = currentRenderState.expandedStopKeys.includes(nearestMatch.stopKey);
    currentRenderState.nearestStopKey = nearestMatch.stopKey;
    expandStopPanel(nearestMatch.stopKey);
    locationState.statusMessage = `已找到最近的站：${nearestMatch.stopName}`;
    renderCurrentState();

    if (previousNearestStopKey !== nearestMatch.stopKey || !wasExpanded) {
        scrollStopIntoView(nearestMatch.stopKey);
    }

    return true;
}

function getGeolocationErrorMessage(error) {
    if (!error) {
        return "無法取得位置，請手動選擇站點";
    }

    if (error.code === 1) {
        return "你已拒絕位置權限，請手動選擇站點";
    }

    if (error.code === 2) {
        return "目前無法取得位置，請手動選擇站點";
    }

    if (error.code === 3) {
        return "定位逾時，請手動選擇站點";
    }

    return "無法取得位置，請手動選擇站點";
}

function logGeolocationFailure(label, error) {
    if (error?.code === 3) {
        console.info(label, error);
        return;
    }

    console.warn(label, error);
}

function requestCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("你的瀏覽器不支援定位功能"));
            return;
        }

        navigator.geolocation.getCurrentPosition(resolve, reject, GEOLOCATION_OPTIONS);
    });
}

// 頁面載入後先嘗試詢問定位權限，之後選方向時就能直接用這個位置幫使用者找最近站點。
async function initializeLocationOnLoad() {
    const requestId = ++activeLocationRequestId;
    locationState.statusMessage = "正在確認定位權限...";

    try {
        const position = await requestCurrentPosition();
        if (requestId !== activeLocationRequestId) {
            return;
        }

        locationState.enabled = true;
        locationState.userPosition = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: position.timestamp || Date.now()
        };
        locationState.statusMessage = "定位已開啟，選擇方向後會自動尋找最近的站";
        renderCurrentState();
    } catch (error) {
        if (requestId !== activeLocationRequestId) {
            return;
        }

        locationState.enabled = false;
        locationState.userPosition = null;
        locationState.statusMessage = error instanceof Error
            ? error.message
            : getGeolocationErrorMessage(error);

        renderCurrentState();
        logGeolocationFailure("KMB initial geolocation failed", error);
    }
}

async function locateNearestStop({ requestFreshPosition = false, triggeredByUser = false } = {}) {
    if (!locationState.enabled && !triggeredByUser) {
        return;
    }

    if (!currentRenderState?.selectedVariantKey) {
        locationState.statusMessage = locationState.enabled
            ? "請先選擇一個方向，再幫你尋找最近的站"
            : "定位已關閉，你可以手動選擇站點";
        renderCurrentState();
        return;
    }

    const variantData = ensureVariantDataBucket(currentRenderState.selectedVariantKey);
    if (!variantData?.routeStopsWithEta.length) {
        locationState.statusMessage = "正在載入站點資料，完成後會自動尋找最近的站";
        renderCurrentState();
        return;
    }

    if (!requestFreshPosition && locationState.userPosition) {
        updateNearestStopFromUserPosition();
        return;
    }

    if (!requestFreshPosition && !locationState.userPosition && !triggeredByUser) {
        return;
    }

    const requestId = ++activeLocationRequestId;
    locationState.statusMessage = "正在取得你的位置...";
    renderCurrentState();

    try {
        const position = await requestCurrentPosition();
        if (requestId !== activeLocationRequestId || !currentRenderState) {
            return;
        }

        locationState.userPosition = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: position.timestamp || Date.now()
        };
        locationState.enabled = true;
        updateNearestStopFromUserPosition();
    } catch (error) {
        if (requestId !== activeLocationRequestId || !currentRenderState) {
            return;
        }

        currentRenderState.nearestStopKey = "";
        locationState.userPosition = null;
        locationState.statusMessage = error instanceof Error
            ? error.message
            : getGeolocationErrorMessage(error);

        if (error?.code === 1) {
            locationState.enabled = false;
        }

        renderCurrentState();
        logGeolocationFailure("KMB geolocation failed", error);
    }
}

function toggleLocationTracking() {
    locationState.enabled = !locationState.enabled;
    activeLocationRequestId += 1;

    if (!locationState.enabled) {
        if (currentRenderState) {
            currentRenderState.nearestStopKey = "";
        }

        locationState.userPosition = null;
        locationState.statusMessage = "定位已停止，你可以手動選擇站點";
        renderCurrentState();
        return;
    }

    locationState.statusMessage = "定位已開啟，會自動尋找最近的站";
    renderCurrentState();
    void locateNearestStop({ requestFreshPosition: true, triggeredByUser: true });
}

// 搜尋路線後，先同時抓每個班次的 route-eta，讓方向卡片可以先顯示「下一班」摘要。
async function refreshVariantSummaries() {
    if (!currentRenderState) {
        return;
    }

    const { route, variants } = currentRenderState;
    const uniqueServiceTypes = [...new Set(variants.map((variant) => getServiceType(variant)))];

    for (const variant of variants) {
        const bucket = ensureVariantDataBucket(getVariantKey(variant));
        bucket.isSummaryLoading = true;
    }

    renderCurrentState();

    const results = await Promise.allSettled(uniqueServiceTypes.map(async (serviceType) => ({
        serviceType,
        etaEntries: await getRouteEta(route, serviceType)
    })));

    if (!currentRenderState || currentRenderState.route !== route) {
        return;
    }

    const etaEntriesByServiceType = new Map();

    for (const result of results) {
        if (result.status === "fulfilled") {
            etaEntriesByServiceType.set(result.value.serviceType, result.value.etaEntries);
            continue;
        }

        console.warn("方向卡片 ETA 摘要載入失敗", result.reason);
    }

    for (const variant of variants) {
        const variantKey = getVariantKey(variant);
        const bucket = ensureVariantDataBucket(variantKey);
        const etaEntries = etaEntriesByServiceType.get(getServiceType(variant)) || [];

        bucket.summary = buildVariantEtaPreview(variant, etaEntries);
        bucket.isSummaryLoading = false;
    }

    renderCurrentState();

    console.log(`[KMB ${APP_VERSION}] route overview`, {
        route,
        comparedServiceTypes: uniqueServiceTypes
    });
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
            isSummaryLoading: false,
            isLoading: false,
            error: "",
            summary: null,
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

    clearPendingScrollTimer();
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
        const serviceTypeLabel = getServiceTypeLabel(getServiceType(variant));
        const preview = variantData?.summary;
        const hasUsablePreview = Boolean(preview?.hasUsableEta);
        const nextEtaText = variantData?.isSummaryLoading
            ? "正在比較..."
            : hasUsablePreview
                ? formatEtaMinutes(preview.nextEtaValue)
                : "暫無預報";
        const nextMetaText = variantData?.isSummaryLoading
            ? "系統正在同時比較正常班次與特別班次"
            : hasUsablePreview
                ? `前往 ${preview.destination}${preview.remark ? ` • ${preview.remark}` : ""}`
                : "點擊卡片後仍可查看這個方向的站點資料";

        return `
            <button type="button" class="variant-card ${isSelected ? "is-selected" : ""}" onclick="selectVariant('${encodedKey}')">
                <div class="variant-top">
                    <span class="inline-chip">${escapeHtml(getDirectionLabel(direction))}</span>
                    <span class="inline-chip subtle">${escapeHtml(serviceTypeLabel)}</span>
                </div>
                <div class="variant-route">${escapeHtml(getRouteLabel(variant))}</div>
                <div class="variant-next">
                    <span class="variant-next-time ${hasUsablePreview ? "" : "is-muted"}">${escapeHtml(nextEtaText)}</span>
                </div>
                <div class="variant-meta">${escapeHtml(nextMetaText)}</div>
            </button>
        `;
    }).join("");
}

function renderSelectedVariantPanel() {
    if (!currentRenderState) {
        return "";
    }

    if (!currentRenderState.selectedVariantKey) {
        if (currentRenderState.routeErrorMessage) {
            return `
                <section class="selection-panel">
                    <div class="selection-error">
                        <p>載入方向資料失敗</p>
                        <p>${escapeHtml(currentRenderState.routeErrorMessage)}</p>
                        <p>你可以改查其他路線，例如 1A、2、104。</p>
                    </div>
                </section>
            `;
        }

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
    const stopMapWarningHtml = currentRenderState.stopMapWarningMessage
        ? `<p class="selection-subtitle">${escapeHtml(currentRenderState.stopMapWarningMessage)}</p>`
        : "";

    const stopsHtml = stops.map((stop) => {
        const stopKey = getStopPanelKey(currentRenderState.selectedVariantKey, stop);
        const encodedStopKey = encodeURIComponent(stopKey);
        const isExpanded = currentRenderState.expandedStopKeys.includes(stopKey);
        const isNearest = currentRenderState.nearestStopKey === stopKey;
        const stopInfo = currentRenderState.stopMap?.get(stop.stopId);
        const stopName = escapeHtml(stopInfo?.name_tc || stopInfo?.name_en || `站點 ${stop.stopId}`);

        return `
            <div class="stop ${isExpanded ? "is-expanded" : ""}" data-stop-key="${encodedStopKey}">
                <button type="button" class="stop-toggle" onclick="toggleStopDetails('${encodedStopKey}')">
                    <div class="stop-toggle-main">
                        <div class="stop-index">第 ${stop.seq} 站</div>
                        <div class="stop-name-row">
                            <div class="stop-name">${stopName}</div>
                            ${isNearest ? '<span class="inline-chip location-chip">📍 最近的站</span>' : ""}
                        </div>
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
                    <p class="selection-subtitle">${escapeHtml(getServiceTypeLabel(getServiceType(variant)))} • 站點共 ${stops.length} 個 • 點一下站名展開 ETA • 資料更新 ${escapeHtml(updatedTimeText)}</p>
                    ${stopMapWarningHtml}
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

    const locationButtonText = getLocationButtonLabel();
    const locationStatusText = getLocationStatusText();
    const summaryText = currentRenderState.selectedVariantKey
        ? "已同步比較正常班次與特別班次，可直接切換方向查看站點"
        : "系統會同時比較正常班次與特別班次，並保留原本的方向順序";

    return `
        <div class="route-shell">
            <section class="selection-panel">
                <div class="selection-panel-header">
                    <div>
                        <p class="selection-eyebrow">第 1 步：選擇方向</p>
                        <h2 class="selection-title">路線 ${escapeHtml(currentRenderState.route)}</h2>
                        <p class="selection-subtitle">${escapeHtml(summaryText)}</p>
                    </div>
                    <div class="panel-actions">
                        <button type="button" class="location-btn ${locationState.enabled ? "is-active" : ""}" onclick="toggleLocationTracking()">${escapeHtml(locationButtonText)}</button>
                        <p class="location-note">${escapeHtml(locationStatusText)}</p>
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
    const serviceTypeLabel = getServiceTypeLabel(serviceType);
    const requestId = ++activeVariantLoadId;

    currentRenderState.selectedVariantKey = variantKey;
    currentRenderState.routeErrorMessage = "";
    currentRenderState.stopMapWarningMessage = "";

    if (!isAutoRefresh) {
        currentRenderState.expandedStopKeys = [];
        currentRenderState.nearestStopKey = "";
        stopLiveUpdates();
    }

    variantData.isLoading = true;
    variantData.error = "";
    renderCurrentState();

    if (statusDiv) {
        statusDiv.innerHTML = isAutoRefresh
            ? `正在自動更新 <strong>${escapeHtml(getRouteLabel(variant))}</strong>...`
            : `正在載入 <strong>${escapeHtml(getRouteLabel(variant))}</strong> 的站點與 ETA（${escapeHtml(serviceTypeLabel)}）...`;
    }

    try {
        const etaEntries = await getRouteEta(route, serviceType);
        const [routeStopsResult, stopMapResult] = await Promise.all([
            getRouteStopsWithFallback(route, variant, etaEntries),
            getOptionalStopMap()
        ]);

        if (!currentRenderState || currentRenderState.route !== route || requestId !== activeVariantLoadId) {
            return;
        }

        const routeStops = routeStopsResult.routeStops;
        // 先用可取得的 stopMap，再逐站補目前方向需要的站名，避免畫面只剩下 stop ID。
        const hydratedStopMapResult = await hydrateStopMapForStops(routeStops, stopMapResult.stopMap);

        if (!currentRenderState || currentRenderState.route !== route || requestId !== activeVariantLoadId) {
            return;
        }

        currentRenderState.stopMap = hydratedStopMapResult.stopMap;
        currentRenderState.stopMapWarningMessage = joinWarningMessages(
            routeStopsResult.warningMessage,
            stopMapResult.warningMessage,
            hydratedStopMapResult.warningMessage
        );

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
        variantData.isSummaryLoading = false;
        variantData.error = "";
        variantData.summary = buildVariantEtaPreview(variant, etaEntries);
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
        void locateNearestStop({ requestFreshPosition: !isAutoRefresh });
        startLiveUpdates();

        if (statusDiv && currentRenderState.selectedVariantKey === variantKey) {
            statusDiv.innerHTML = `已載入 <strong>${escapeHtml(getRouteLabel(variant))}</strong>（${escapeHtml(serviceTypeLabel)}），可展開站點查看 ETA`;
        }
    } catch (error) {
        if (!currentRenderState || currentRenderState.route !== route || requestId !== activeVariantLoadId) {
            return;
        }

        const friendlyErrorMessage = getFriendlyRouteErrorMessage(error);
        variantData.isLoading = false;
        variantData.isSummaryLoading = false;
        variantData.error = friendlyErrorMessage;

        if (isAutoRefresh && variantData.routeStopsWithEta.length > 0) {
            renderCurrentState();
            startLiveUpdates();
            if (statusDiv) {
                statusDiv.innerHTML = `自動更新失敗，暫時顯示 ${formatDisplayTime(variantData.fetchedAt)} 的資料`;
            }
        } else {
            // 手動載入失敗時，把方向選取狀態清回安全狀態，避免下一次查詢沿用到失敗中的資料。
            variantData.summary = null;
            variantData.routeStopsWithEta = [];
            variantData.fetchedAt = null;
            clearSelectedVariantState();
            currentRenderState.routeErrorMessage = friendlyErrorMessage;
            stopLiveUpdates();
            renderCurrentState();

            if (statusDiv) {
                statusDiv.innerHTML = "該方向目前無法查詢，請試其他方向或其他路線";
            }
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
            currentRenderState.routeErrorMessage = "";
            currentRenderState.expandedStopKeys = [];
            currentRenderState.nearestStopKey = "";
            renderCurrentState();
            void locateNearestStop({ requestFreshPosition: true });
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
        if (currentRenderState) {
            await refreshVariantSummaries();
        }

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
    // 這個下拉選單現在主要用來決定「同樣接近時誰排前面」的排序偏好，
    // 真正查詢時仍會同時比較正常班次與特別班次。
    const requestedServiceType = serviceTypeInput.value;
    const searchId = ++activeSearchId;

    if (!route) {
        statusDiv.innerHTML = '<span style="color:red">請輸入路線號，例如 1A、2、104。</span>';
        resultDiv.innerHTML = "";
        resetCurrentRouteState();
        return;
    }

    resetCurrentRouteState();
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
            resetCurrentRouteState();
            renderStandaloneError(resultDiv, `找不到路線 ${route}`, "請確認路線號是否正確，或試其他路線例如 1A、2、104。");
            statusDiv.innerHTML = "找不到這條路線";
            return;
        }

        const { preferredServiceType, variants } = chooseRouteVariants(matchingRoutes, requestedServiceType);
        if (!variants.length) {
            resetCurrentRouteState();
            renderStandaloneError(resultDiv, `路線 ${route} 暫時無法查詢`, "目前找不到可用方向資料，請稍後再試，或試其他路線例如 1A、2、104。");
            statusDiv.innerHTML = "找不到方向資料";
            return;
        }

        currentRenderState = {
            route,
            requestedServiceType,
            preferredServiceType,
            variants,
            routeErrorMessage: "",
            stopMapWarningMessage: "",
            selectedVariantKey: null,
            expandedStopKeys: [],
            nearestStopKey: "",
            stopMap: null,
            variantDataByKey: {}
        };

        for (const variant of variants) {
            const bucket = ensureVariantDataBucket(getVariantKey(variant));
            bucket.isSummaryLoading = true;
        }

        renderCurrentState();

        statusDiv.innerHTML = `已找到 ${variants.length} 個可用方向，正在同時比較正常班次與特別班次...`;
        await refreshVariantSummaries();

        if (!currentRenderState || currentRenderState.route !== route || searchId !== activeSearchId) {
            return;
        }

        console.log(`[KMB ${APP_VERSION}] route search`, {
            route,
            requestedServiceType,
            preferredServiceType,
            variantCount: variants.length
        });

        statusDiv.innerHTML = `已找到 ${variants.length} 個可用方向，並已同步載入班次摘要`;
    } catch (error) {
        console.error("KMB route search failed", error);
        const friendlyErrorMessage = getFriendlyRouteErrorMessage(error);
        resetCurrentRouteState();
        renderStandaloneError(resultDiv, "查詢失敗", friendlyErrorMessage);
        statusDiv.innerHTML = "查詢失敗";
    } finally {
        if (searchId === activeSearchId) {
            searchBtn.disabled = false;
            searchBtn.textContent = "🔍 查詢";
        }
    }
}

window.onload = () => {
    console.log(`Ready to search KMB routes like 1A, 2, and 104 (${APP_VERSION})`);
    void initializeLocationOnLoad();
};

window.addEventListener("beforeunload", () => {
    stopLiveUpdates();
});
