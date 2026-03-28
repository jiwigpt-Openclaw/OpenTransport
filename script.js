const APP_VERSION = "2026-03-29 00:30";
const KMB_API_BASE = "https://data.etabus.gov.hk/v1/transport/kmb";
const CTB_API_BASE = "https://rt.data.gov.hk/v2/transport/citybus";
const NLB_API_BASE = "https://rt.data.gov.hk/v2/transport/nlb";
const GMB_API_BASE = "https://data.etagmb.gov.hk";
const COUNTDOWN_REFRESH_MS = 30000;
const DATA_REFRESH_MS = 60000;
const GEOLOCATION_OPTIONS = {
    enableHighAccuracy: false,
    timeout: 8000,
    maximumAge: 60000
};
const LOCAL_FILE_GMB_RESTRICTION_MESSAGE = "綠色小巴資料在本機檔案模式下會被限制，請改用 VS Code Live Server 或部署到 GitHub Pages 才能完整使用。";
const GMB_REGIONS = ["HKI", "KLN", "NT"];
const COMPANY_ORDER = {
    KMB: 0,
    CTB: 1,
    NLB: 2,
    GMB: 3,
    unknown: 99
};
const COMPANY_CONFIGS = {
    KMB: {
        code: "KMB",
        shortLabel: "KMB",
        displayName: "九龍巴士",
        themeClass: "is-kmb",
        color: "#c8102e",
        baseUrl: KMB_API_BASE,
        routeListEndpoint: "/route/",
        routeStopEndpoint: "/route-stop/{route}/{direction}/{serviceType}",
        etaEndpoint: "/eta/{stopId}/{route}/{serviceType}",
        directionFormat: "inbound/outbound",
        supportsServiceType: true,
        supportsRouteEta: true,
        supportsStopAllEta: true,
        hasGlobalStopMap: true,
        getRouteListUrl: () => `${KMB_API_BASE}/route/`,
        getStopMapUrl: () => `${KMB_API_BASE}/stop`,
        getRouteStopsUrl: (route, direction, serviceType) => `${KMB_API_BASE}/route-stop/${encodeURIComponent(route)}/${direction}/${serviceType}`,
        getRouteEtaUrl: (route, serviceType) => `${KMB_API_BASE}/route-eta/${encodeURIComponent(route)}/${serviceType}`,
        getStopEtaUrl: (stopId, route, serviceType) => `${KMB_API_BASE}/eta/${normalizeStopId(stopId)}/${encodeURIComponent(route)}/${serviceType}`,
        getStopAllEtaUrl: (stopId) => `${KMB_API_BASE}/stop-eta/${normalizeStopId(stopId)}`,
        getStopInfoUrl: (stopId) => `${KMB_API_BASE}/stop/${normalizeStopId(stopId)}`
    },
    CTB: {
        code: "CTB",
        shortLabel: "CTB",
        displayName: "城巴",
        themeClass: "is-ctb",
        color: "#0b63c9",
        baseUrl: CTB_API_BASE,
        routeListEndpoint: "/route/ctb",
        routeStopEndpoint: "/route-stop/ctb/{route}/{direction}",
        etaEndpoint: "/eta/ctb/{stopId}/{route}",
        directionFormat: "inbound/outbound",
        supportsServiceType: false,
        supportsRouteEta: false,
        supportsStopAllEta: false,
        hasGlobalStopMap: true,
        getRouteListUrl: () => `${CTB_API_BASE}/route/ctb`,
        getStopMapUrl: () => `${CTB_API_BASE}/stop`,
        getRouteStopsUrl: (route, direction) => `${CTB_API_BASE}/route-stop/ctb/${encodeURIComponent(route)}/${direction}`,
        getStopEtaUrl: (stopId, route) => `${CTB_API_BASE}/eta/ctb/${normalizeStopId(stopId)}/${encodeURIComponent(route)}`,
        getStopInfoUrl: (stopId) => `${CTB_API_BASE}/stop/${normalizeStopId(stopId)}`
    },
    NLB: {
        code: "NLB",
        shortLabel: "NLB",
        displayName: "新大嶼山巴士",
        themeClass: "is-nlb",
        color: "#2e8b57",
        baseUrl: NLB_API_BASE,
        routeListEndpoint: "/route.php?action=list",
        routeStopEndpoint: "/stop.php?action=list&routeId={routeId}",
        etaEndpoint: "/stop.php?action=estimatedArrivals&routeId={routeId}&stopId={stopId}&language=zh",
        directionFormat: "routeId",
        supportsServiceType: false,
        supportsRouteEta: false,
        supportsStopAllEta: false,
        hasGlobalStopMap: false,
        getRouteListUrl: () => `${NLB_API_BASE}/route.php?action=list`,
        getRouteStopsUrl: (route, direction, serviceType, meta = {}) => `${NLB_API_BASE}/stop.php?action=list&routeId=${encodeURIComponent(String(meta.routeId || "").trim())}`,
        getStopEtaUrl: (stopId, route, serviceType, meta = {}) => `${NLB_API_BASE}/stop.php?action=estimatedArrivals&routeId=${encodeURIComponent(String(meta.routeId || "").trim())}&stopId=${encodeURIComponent(String(stopId || "").trim())}&language=zh`
    },
    GMB: {
        code: "GMB",
        shortLabel: "GMB",
        displayName: "綠色小巴",
        themeClass: "is-gmb",
        color: "#1b6f3a",
        baseUrl: GMB_API_BASE,
        routeListEndpoint: "/route/{region}",
        routeStopEndpoint: "/route-stop/{routeId}/{routeSeq}",
        etaEndpoint: "/eta/route-stop/{routeId}/{routeSeq}/{stopSeq}",
        directionFormat: "route_seq",
        supportsServiceType: false,
        supportsRouteEta: false,
        supportsStopAllEta: false,
        hasGlobalStopMap: false,
        regions: GMB_REGIONS,
        getRouteListUrl: (region) => `${GMB_API_BASE}/route/${encodeURIComponent(region)}`,
        getRouteDetailUrl: (region, route) => `${GMB_API_BASE}/route/${encodeURIComponent(region)}/${encodeURIComponent(route)}`,
        getRouteStopsUrl: (route, direction, serviceType, meta = {}) => `${GMB_API_BASE}/route-stop/${encodeURIComponent(String(meta.routeId || "").trim())}/${encodeURIComponent(String(meta.routeSeq || "").trim())}`,
        getStopEtaUrl: (stopId, route, serviceType, meta = {}) => `${GMB_API_BASE}/eta/route-stop/${encodeURIComponent(String(meta.routeId || "").trim())}/${encodeURIComponent(String(meta.routeSeq || "").trim())}/${encodeURIComponent(String(meta.stopSeq || "").trim())}`,
        getStopInfoUrl: (stopId) => `${GMB_API_BASE}/stop/${encodeURIComponent(String(stopId || "").trim())}`
    }
};
const routeStopCache = new Map();
const stopEtaCache = new Map();
const stopAllEtaCache = new Map();
const stopInfoCache = new Map();

const routeListPromiseByCompany = new Map();
const stopMapPromiseByCompany = new Map();
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

console.log(`Bus ETA enhanced lookup loaded (${APP_VERSION})`);

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function getCompanyConfig(company) {
    return COMPANY_CONFIGS[String(company ?? "").trim().toUpperCase()] || COMPANY_CONFIGS.KMB;
}

function getItemCompany(item) {
    const normalized = String(item?.company ?? item?.co ?? "").trim().toUpperCase();
    return normalized || "KMB";
}

function getCompanyLabel(company) {
    return getCompanyConfig(company).shortLabel;
}

function getCompanyDisplayName(company) {
    return getCompanyConfig(company).displayName;
}

function getCompanyThemeClass(company) {
    return getCompanyConfig(company).themeClass;
}

function renderCompanyChip(company) {
    return `<span class="inline-chip company-chip ${escapeHtml(getCompanyThemeClass(company))}">${escapeHtml(getCompanyLabel(company))}</span>`;
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
    const company = getItemCompany(item);

    if ((company === "CTB" || company === "NLB") && !item?.service_type && !item?.serviceType) {
        return "1";
    }

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

// 方向卡片改成「起點 / 前往 / 長箭頭 / 終點」的簡化版版面，讓使用者一眼就看懂目的地。
function getVariantCardRouteParts(routeInfo) {
    return {
        origin: routeInfo.orig_tc || routeInfo.orig_en || "未知起點",
        destination: routeInfo.dest_tc || routeInfo.dest_en || "未知終點"
    };
}

function compareVariantsBase(left, right) {
    const leftCompanyOrder = COMPANY_ORDER[getItemCompany(left)] ?? COMPANY_ORDER.unknown;
    const rightCompanyOrder = COMPANY_ORDER[getItemCompany(right)] ?? COMPANY_ORDER.unknown;
    if (leftCompanyOrder !== rightCompanyOrder) {
        return leftCompanyOrder - rightCompanyOrder;
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
    const company = getItemCompany(routeInfo);
    const route = String(routeInfo?.route ?? "").trim().toUpperCase();
    const variantId = getVariantUniqueId(routeInfo);
    const direction = getItemDirection(routeInfo) || "unknown";
    const serviceType = getServiceType(routeInfo);
    const origin = routeInfo?.orig_tc || routeInfo?.orig_en || "";
    const destination = routeInfo?.dest_tc || routeInfo?.dest_en || "";

    return [company, route, variantId, serviceType, direction, origin, destination].join("|");
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

function isCompanyRestrictedInLocalFileMode(company) {
    return isLocalFileOrigin() && getCompanyConfig(company).code === "GMB";
}

function getLocalModeCompanyRestrictionMessage(company) {
    if (getCompanyConfig(company).code === "GMB") {
        return LOCAL_FILE_GMB_RESTRICTION_MESSAGE;
    }

    return "";
}

function getLocalModeRestrictionNotice(companies = []) {
    const messages = [...new Set(companies.map((company) => getLocalModeCompanyRestrictionMessage(company)).filter(Boolean))];
    return messages.join(" ");
}

function joinWarningMessages(...messages) {
    return messages
        .map((message) => String(message || "").trim())
        .filter(Boolean)
        .join(" ");
}

function decorateDataEntries(company, entries) {
    return entries.map((entry) => ({ ...entry, company }));
}

function getVariantUniqueId(item) {
    return String(item?.variantId ?? item?.routeId ?? item?.route_id ?? "").trim();
}

function getVariantMeta(variant, stop = null) {
    return {
        routeId: String(variant?.routeId ?? variant?.route_id ?? "").trim(),
        routeSeq: String(stop?.routeSeq ?? variant?.routeSeq ?? variant?.route_seq ?? "").trim(),
        stopSeq: String(stop?.stopSeq ?? stop?.seq ?? "").trim(),
        stopId: normalizeStopId(stop?.stopId ?? stop?.stop ?? ""),
        direction: getItemDirection(variant),
        serviceType: getServiceType(variant),
        destinationTc: String(variant?.dest_tc || "").trim(),
        destinationEn: String(variant?.dest_en || "").trim()
    };
}

function hasMeaningfulStopInfoValue(value) {
    if (value === null || value === undefined) {
        return false;
    }

    if (typeof value === "string") {
        return value.trim() !== "";
    }

    return true;
}

// stop map 合併時只補缺少欄位，並優先保留指定公司的資料，避免多家公司共用 stopId 時互相覆蓋。
function mergeStopInfo(existingStopInfo = {}, incomingStopInfo = {}, preferredCompany = "") {
    const normalizedPreferredCompany = String(preferredCompany || "").trim().toUpperCase();
    const existingCompany = String(existingStopInfo?.company || "").trim().toUpperCase();
    const incomingCompany = String(incomingStopInfo?.company || "").trim().toUpperCase();

    if (normalizedPreferredCompany && incomingCompany && incomingCompany !== normalizedPreferredCompany) {
        return {
            ...existingStopInfo,
            company: existingCompany || normalizedPreferredCompany,
            stop: normalizeStopId(existingStopInfo?.stop ?? incomingStopInfo?.stop ?? "")
        };
    }

    const shouldResetToPreferredCompany = normalizedPreferredCompany
        && existingCompany
        && existingCompany !== normalizedPreferredCompany
        && (!incomingCompany || incomingCompany === normalizedPreferredCompany);

    const mergedStopInfo = {
        ...(shouldResetToPreferredCompany ? {} : existingStopInfo),
        company: incomingCompany || existingCompany || normalizedPreferredCompany || "",
        stop: normalizeStopId(
            shouldResetToPreferredCompany
                ? incomingStopInfo?.stop
                : existingStopInfo?.stop ?? incomingStopInfo?.stop ?? ""
        )
    };

    for (const [key, value] of Object.entries(incomingStopInfo || {})) {
        if (key === "company" || key === "stop") {
            continue;
        }

        if (!hasMeaningfulStopInfoValue(mergedStopInfo[key]) && hasMeaningfulStopInfoValue(value)) {
            mergedStopInfo[key] = value;
        }
    }

    return mergedStopInfo;
}

function mergeStopMaps(preferredCompany, ...stopMaps) {
    const normalizedPreferredCompany = String(preferredCompany || "").trim().toUpperCase();
    const merged = new Map();

    for (const stopMap of stopMaps) {
        if (!(stopMap instanceof Map)) {
            continue;
        }

        for (const [stopId, stopInfo] of stopMap.entries()) {
            const normalizedStopId = normalizeStopId(stopId);
            const normalizedStopInfo = {
                ...stopInfo,
                company: String(stopInfo?.company || normalizedPreferredCompany || "").trim().toUpperCase(),
                stop: normalizeStopId(stopInfo?.stop ?? normalizedStopId)
            };
            const existingStopInfo = merged.get(normalizedStopId) || {};
            merged.set(normalizedStopId, mergeStopInfo(existingStopInfo, normalizedStopInfo, normalizedPreferredCompany));
        }
    }

    return merged;
}

function buildStopMapFromRouteStops(company, routeStops) {
    const stopMap = new Map();

    for (const stop of routeStops) {
        const stopId = normalizeStopId(stop?.stopId);
        if (!stopId) {
            continue;
        }

        const stopInfo = {
            company,
            stop: stopId,
            name_tc: stop?.name_tc || stop?.nameTc || "",
            name_en: stop?.name_en || stop?.nameEn || "",
            latitude: stop?.latitude ?? stop?.lat ?? null,
            longitude: stop?.longitude ?? stop?.long ?? stop?.lng ?? null
        };

        if (stopInfo.name_tc || stopInfo.name_en || stopInfo.latitude || stopInfo.longitude) {
            stopMap.set(stopId, stopInfo);
        }
    }

    return stopMap;
}

function splitRouteLabelPair(value) {
    const cleanedValue = String(value || "").replace(/\s+/g, " ").trim();
    if (!cleanedValue) {
        return { origin: "", destination: "" };
    }

    const parts = cleanedValue.split(">").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
        return {
            origin: parts[0],
            destination: parts.slice(1).join(" > ")
        };
    }

    return {
        origin: cleanedValue,
        destination: ""
    };
}

function normalizeTerminusLabel(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function labelsMatch(leftTc, leftEn, rightTc, rightEn) {
    const leftValues = [leftTc, leftEn].map(normalizeTerminusLabel).filter(Boolean);
    const rightValues = [rightTc, rightEn].map(normalizeTerminusLabel).filter(Boolean);

    return leftValues.some((leftValue) => rightValues.includes(leftValue));
}

function areEntriesSameOrientation(left, right) {
    return labelsMatch(left.orig_tc, left.orig_en, right.orig_tc, right.orig_en)
        && labelsMatch(left.dest_tc, left.dest_en, right.dest_tc, right.dest_en);
}

function areEntriesReversed(left, right) {
    return labelsMatch(left.orig_tc, left.orig_en, right.dest_tc, right.dest_en)
        && labelsMatch(left.dest_tc, left.dest_en, right.orig_tc, right.orig_en);
}

function applyDirectionToEntry(entry, direction) {
    return {
        ...entry,
        direction,
        bound: direction,
        dir: direction
    };
}

function getNlbTerminusPairKey(entry) {
    const origin = normalizeTerminusLabel(entry?.orig_tc || entry?.orig_en);
    const destination = normalizeTerminusLabel(entry?.dest_tc || entry?.dest_en);

    if (!origin || !destination) {
        return "";
    }

    return [origin, destination].sort().join("|");
}

function getNlbDirectionGroupKey(entry) {
    const terminusPairKey = getNlbTerminusPairKey(entry);

    if (!terminusPairKey) {
        return "";
    }

    return [
        String(entry?.route || "").trim().toUpperCase(),
        getServiceType(entry),
        terminusPairKey
    ].join("|");
}

function assignDirectionsToBidirectionalEntries(entries) {
    const assignedEntries = [];
    const pairedGroups = new Map();
    const fallbackEntries = [];
    const seenVariantIds = new Set();

    for (const entry of entries) {
        const variantId = getVariantUniqueId(entry) || `${String(entry?.route || "").trim().toUpperCase()}|${String(entry?.routeId || "").trim()}`;
        if (seenVariantIds.has(variantId)) {
            continue;
        }

        seenVariantIds.add(variantId);
        const groupKey = getNlbDirectionGroupKey(entry);

        // NLB 先按「路線 + 班次 + 起終點集合」分組，再在組內配 outbound / inbound，
        // 比直接整包 route 互相比對更穩，能減少方向卡片重複或漏掉。
        if (!groupKey) {
            fallbackEntries.push(entry);
            continue;
        }

        if (!pairedGroups.has(groupKey)) {
            pairedGroups.set(groupKey, []);
        }

        pairedGroups.get(groupKey).push(entry);
    }

    for (const groupEntries of pairedGroups.values()) {
        const baseEntry = groupEntries[0];
        let hasAssignedInbound = false;

        for (const entry of groupEntries) {
            if (entry === baseEntry || areEntriesSameOrientation(baseEntry, entry)) {
                assignedEntries.push(applyDirectionToEntry(entry, "outbound"));
                continue;
            }

            if (areEntriesReversed(baseEntry, entry)) {
                assignedEntries.push(applyDirectionToEntry(entry, "inbound"));
                hasAssignedInbound = true;
                continue;
            }

            // 少數 NLB 資料欄位不完整時，至少保留卡片並補上一個穩定方向，不讓它整張消失。
            const fallbackDirection = hasAssignedInbound ? "outbound" : "inbound";
            assignedEntries.push(applyDirectionToEntry(entry, fallbackDirection));
            hasAssignedInbound = hasAssignedInbound || fallbackDirection === "inbound";
        }
    }

    for (const entry of fallbackEntries) {
        assignedEntries.push(applyDirectionToEntry(entry, "outbound"));
    }

    return assignedEntries;
}

function buildNlbRouteEntries(routes) {
    const rawEntries = routes.map((routeEntry) => {
        const routeNameTc = splitRouteLabelPair(routeEntry?.routeName_c);
        const routeNameEn = splitRouteLabelPair(routeEntry?.routeName_e);

        return {
            ...routeEntry,
            company: "NLB",
            route: String(routeEntry?.routeNo || "").trim().toUpperCase(),
            routeId: String(routeEntry?.routeId || "").trim(),
            variantId: `NLB|${String(routeEntry?.routeId || "").trim()}`,
            service_type: routeEntry?.specialRoute ? "2" : "1",
            orig_tc: routeNameTc.origin,
            dest_tc: routeNameTc.destination,
            orig_en: routeNameEn.origin,
            dest_en: routeNameEn.destination
        };
    });

    const entriesByRoute = new Map();

    for (const entry of rawEntries) {
        if (!entriesByRoute.has(entry.route)) {
            entriesByRoute.set(entry.route, []);
        }

        entriesByRoute.get(entry.route).push(entry);
    }

    // 每條 NLB 路線各自做方向分配，避免不同路線或不同班次互相干擾。
    return [...entriesByRoute.values()].flatMap((entries) => assignDirectionsToBidirectionalEntries(entries));
}

function createRenderState(route, variants) {
    return {
        route,
        variants,
        routeErrorMessage: "",
        stopMapWarningMessage: "",
        selectedVariantKey: null,
        expandedStopKeys: [],
        nearestStopKey: "",
        // 每次建立新的 render state 都明確補齊這兩個物件，避免後續讀到 undefined。
        stopMapsByCompany: {},
        variantDataByKey: {}
    };
}

function buildGmbRouteListIndex(region, routeCodes) {
    return routeCodes.map((routeCode) => ({
        company: "GMB",
        region,
        route: String(routeCode || "").trim().toUpperCase(),
        variantId: `GMB-INDEX|${region}|${String(routeCode || "").trim().toUpperCase()}`
    }));
}

function buildGmbVariantsFromDetailPayload(region, payload) {
    const routeEntries = Array.isArray(payload?.data) ? payload.data : [];

    return routeEntries.flatMap((routeEntry) => {
        const routeCode = String(routeEntry?.route_code || "").trim().toUpperCase();
        const routeDescription = `${String(routeEntry?.description_tc || "").trim()} ${String(routeEntry?.description_en || "").trim()}`.toLowerCase();
        const serviceType = routeDescription.includes("正常") || routeDescription.includes("normal") ? "1" : "2";
        const directions = Array.isArray(routeEntry?.directions) ? routeEntry.directions : [];

        return directions.map((directionEntry, index) => {
            const normalizedDirection = Number(directionEntry?.route_seq) === 2
                ? "inbound"
                : index === 0
                    ? "outbound"
                    : "inbound";

            return {
                company: "GMB",
                region,
                route: routeCode,
                routeId: String(routeEntry?.route_id || "").trim(),
                routeSeq: String(directionEntry?.route_seq || "").trim(),
                variantId: `GMB|${String(routeEntry?.route_id || "").trim()}|${String(directionEntry?.route_seq || "").trim()}`,
                service_type: serviceType,
                direction: normalizedDirection,
                bound: normalizedDirection,
                dir: normalizedDirection,
                description_tc: routeEntry?.description_tc || "",
                description_en: routeEntry?.description_en || "",
                orig_tc: directionEntry?.orig_tc || "",
                dest_tc: directionEntry?.dest_tc || "",
                orig_en: directionEntry?.orig_en || "",
                dest_en: directionEntry?.dest_en || "",
                remarks_tc: directionEntry?.remarks_tc || "",
                remarks_en: directionEntry?.remarks_en || ""
            };
        });
    });
}

function normalizeNlbEtaEntries(payload, meta, route) {
    const arrivals = Array.isArray(payload?.estimatedArrivals) ? payload.estimatedArrivals : [];

    return arrivals.map((arrivalEntry, index) => ({
        company: "NLB",
        route,
        routeId: meta.routeId,
        variantId: `NLB|${meta.routeId}`,
        stop: meta.stopId,
        seq: Number(meta.stopSeq) || 0,
        direction: meta.direction,
        service_type: meta.serviceType || "1",
        eta_seq: Number(arrivalEntry?.eta_seq) || index + 1,
        eta: arrivalEntry?.estimatedArrivalTime || "",
        dest_tc: meta.destinationTc,
        dest_en: meta.destinationEn,
        rmk_tc: String(arrivalEntry?.routeVariantName || "").trim(),
        rmk_en: String(arrivalEntry?.routeVariantName || "").trim(),
        generated_timestamp: arrivalEntry?.generateTime || ""
    }));
}

function normalizeGmbEtaEntries(payload, meta, route) {
    const etaEntries = Array.isArray(payload?.data?.eta) ? payload.data.eta : [];

    return etaEntries.map((etaEntry, index) => ({
        company: "GMB",
        route,
        routeId: meta.routeId,
        routeSeq: meta.routeSeq,
        variantId: `GMB|${meta.routeId}|${meta.routeSeq}`,
        stop: meta.stopId,
        seq: Number(meta.stopSeq) || 0,
        direction: meta.direction,
        service_type: meta.serviceType || "1",
        eta_seq: Number(etaEntry?.eta_seq) || index + 1,
        eta: etaEntry?.timestamp || "",
        dest_tc: meta.destinationTc,
        dest_en: meta.destinationEn,
        rmk_tc: etaEntry?.remarks_tc || "",
        rmk_en: etaEntry?.remarks_en || ""
    }));
}

function getStopMapForCompany(company) {
    if (!currentRenderState) {
        return new Map();
    }

    currentRenderState.stopMapsByCompany ||= {};

    return currentRenderState.stopMapsByCompany[company] instanceof Map
        ? currentRenderState.stopMapsByCompany[company]
        : new Map();
}

function buildFallbackStopsFromEtaEntries(variant, etaEntries) {
    const company = getItemCompany(variant);
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
                    company,
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

async function getRouteStopsWithFallback(company, route, variant, etaEntries) {
    const direction = getItemDirection(variant);
    const serviceType = getServiceType(variant);
    const config = getCompanyConfig(company);
    const variantMeta = getVariantMeta(variant);

    try {
        const routeStops = await getRouteStops(company, route, direction, serviceType, variantMeta);
        if (routeStops.length > 0) {
            return {
                routeStops,
                warningMessage: ""
            };
        }
    } catch (error) {
        if (!config.supportsRouteEta) {
            throw error;
        }

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

    if (!config.supportsRouteEta) {
        throw new Error(`路線站點 ${company} ${route} ${direction} 暫時沒有可用資料`);
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

async function getOptionalStopMap(company) {
    const config = getCompanyConfig(company);
    const existingStopMap = getStopMapForCompany(company);
    if (existingStopMap.size > 0) {
        return {
            stopMap: existingStopMap,
            warningMessage: ""
        };
    }

    // NLB / GMB 沒有像 KMB / CTB 那樣的完整全站清單，所以先回傳空 Map，
    // 之後在載入該方向站點時，再用 route-stop / 單站 API 補齊名稱與座標。
    if (!config.hasGlobalStopMap) {
        return {
            stopMap: existingStopMap,
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
            stopMap: await getStopMap(company),
            warningMessage: ""
        };
    } catch (error) {
        console.warn("巴士站清單載入失敗，改用降級模式顯示", error);
        return {
            stopMap: existingStopMap,
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

async function getRouteList(company) {
    const normalizedCompany = getCompanyConfig(company).code;

    // file:// 模式下直接在最外層跳過 GMB，避免建立 Promise 後又在裡面發出 request。
    if (isCompanyRestrictedInLocalFileMode(normalizedCompany)) {
        routeListPromiseByCompany.delete(normalizedCompany);
        return [];
    }

    if (!routeListPromiseByCompany.has(normalizedCompany)) {
        const config = getCompanyConfig(normalizedCompany);
        const promise = (async () => {
            if (normalizedCompany === "GMB") {
                const regionResults = await Promise.allSettled(config.regions.map(async (region) => {
                    const payload = await fetchJson(config.getRouteListUrl(region), `${getCompanyDisplayName(normalizedCompany)} ${region} 路線清單`);
                    const routeCodes = Array.isArray(payload?.data?.routes) ? payload.data.routes : [];
                    return buildGmbRouteListIndex(region, routeCodes);
                }));

                if (regionResults.every((result) => result.status === "rejected")) {
                    throw regionResults.find((result) => result.status === "rejected")?.reason || new Error("綠色小巴路線清單暫時無法載入");
                }

                return regionResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
            }

            const payload = await fetchJson(config.getRouteListUrl(), `${getCompanyDisplayName(normalizedCompany)}路線清單`);

            if (normalizedCompany === "NLB") {
                return buildNlbRouteEntries(Array.isArray(payload?.routes) ? payload.routes : []);
            }

            return decorateDataEntries(normalizedCompany, Array.isArray(payload.data) ? payload.data : []);
        })()
            .catch((error) => {
                routeListPromiseByCompany.delete(normalizedCompany);
                throw error;
            });

        routeListPromiseByCompany.set(normalizedCompany, promise);
    }

    return routeListPromiseByCompany.get(normalizedCompany);
}

async function getStopMap(company) {
    const normalizedCompany = getCompanyConfig(company).code;

    if (!stopMapPromiseByCompany.has(normalizedCompany)) {
        const config = getCompanyConfig(normalizedCompany);
        const promise = (!config.hasGlobalStopMap
            ? Promise.resolve(new Map())
            : fetchJson(config.getStopMapUrl(), `${getCompanyDisplayName(normalizedCompany)}巴士站清單`)
            .then((payload) => {
                const map = new Map();
                const stops = Array.isArray(payload.data) ? payload.data : [];

                for (const stop of stops) {
                    if (stop?.stop) {
                        map.set(normalizeStopId(stop.stop), { ...stop, company: normalizedCompany });
                    }
                }

                return map;
            }))
            .catch((error) => {
                stopMapPromiseByCompany.delete(normalizedCompany);
                throw error;
            });

        stopMapPromiseByCompany.set(normalizedCompany, promise);
    }

    return stopMapPromiseByCompany.get(normalizedCompany);
}

async function getRouteStops(company, route, direction, serviceType, meta = {}) {
    const normalizedCompany = getCompanyConfig(company).code;
    const cacheKey = `${normalizedCompany}|${route}|${direction}|${serviceType}|${meta.routeId || ""}|${meta.routeSeq || ""}`;

    if (!routeStopCache.has(cacheKey)) {
        const config = getCompanyConfig(normalizedCompany);
        const url = config.getRouteStopsUrl(route, direction, serviceType, meta);
        const promise = fetchJson(url, `${getCompanyLabel(normalizedCompany)}路線站點 ${route} ${direction}`)
            .then((payload) => {
                if (normalizedCompany === "NLB") {
                    const stops = Array.isArray(payload?.stops) ? payload.stops : [];
                    return stops.map((stop, index) => ({
                        company: normalizedCompany,
                        routeId: meta.routeId || "",
                        seq: index + 1,
                        stopSeq: index + 1,
                        stopId: normalizeStopId(stop?.stopId),
                        direction,
                        serviceType: meta.serviceType || serviceType || "1",
                        name_tc: stop?.stopName_c || "",
                        name_en: stop?.stopName_e || "",
                        latitude: stop?.latitude ?? null,
                        longitude: stop?.longitude ?? null
                    })).filter((stop) => stop.stopId);
                }

                if (normalizedCompany === "GMB") {
                    const stops = Array.isArray(payload?.data?.route_stops) ? payload.data.route_stops : [];
                    return stops.map((stop) => ({
                        company: normalizedCompany,
                        routeId: meta.routeId || "",
                        routeSeq: meta.routeSeq || "",
                        seq: Number(stop?.stop_seq) || 0,
                        stopSeq: Number(stop?.stop_seq) || 0,
                        stopId: normalizeStopId(stop?.stop_id),
                        direction,
                        serviceType: meta.serviceType || serviceType || "1",
                        name_tc: stop?.name_tc || "",
                        name_en: stop?.name_en || ""
                    })).filter((stop) => stop.stopId);
                }

                const stops = Array.isArray(payload.data) ? payload.data : [];
                return stops
                    .map((item) => ({
                        company: normalizedCompany,
                        seq: Number(item.seq) || 0,
                        stopSeq: Number(item.seq) || 0,
                        stopId: normalizeStopId(item.stop),
                        direction: getItemDirection(item) || direction,
                        serviceType: config.supportsServiceType ? getServiceType(item) : "1"
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

async function getRouteEta(company, route, serviceType) {
    const normalizedCompany = getCompanyConfig(company).code;
    const config = getCompanyConfig(normalizedCompany);

    if (!config.supportsRouteEta) {
        return [];
    }

    const url = config.getRouteEtaUrl(route, serviceType);
    const payload = await fetchJson(url, `${getCompanyLabel(normalizedCompany)}到站時間 ${route}`);
    return decorateDataEntries(normalizedCompany, Array.isArray(payload.data) ? payload.data : []);
}

async function getStopEta(company, route, serviceType, stopId, meta = {}) {
    const normalizedCompany = getCompanyConfig(company).code;
    const normalizedStopId = normalizeStopId(stopId);
    const normalizedMeta = {
        ...meta,
        stopId: normalizedStopId,
        serviceType: meta.serviceType || serviceType || "1"
    };
    const cacheKey = `${normalizedCompany}|${normalizedStopId}|${route}|${serviceType}|${normalizedMeta.routeId || ""}|${normalizedMeta.routeSeq || ""}|${normalizedMeta.stopSeq || ""}`;

    if (!stopEtaCache.has(cacheKey)) {
        const config = getCompanyConfig(normalizedCompany);
        const url = config.getStopEtaUrl(normalizedStopId, route, serviceType, normalizedMeta);
        const promise = fetchJson(url, `${getCompanyLabel(normalizedCompany)}站點到站時間 ${normalizedStopId} ${route}`)
            .then((payload) => {
                if (normalizedCompany === "NLB") {
                    return normalizeNlbEtaEntries(payload, normalizedMeta, route);
                }

                if (normalizedCompany === "GMB") {
                    return normalizeGmbEtaEntries(payload, normalizedMeta, route);
                }

                return decorateDataEntries(normalizedCompany, Array.isArray(payload.data) ? payload.data : []);
            })
            .catch((error) => {
                stopEtaCache.delete(cacheKey);
                throw error;
            });

        stopEtaCache.set(cacheKey, promise);
    }

    return stopEtaCache.get(cacheKey);
}

async function getStopAllEta(company, stopId) {
    const normalizedCompany = getCompanyConfig(company).code;
    const config = getCompanyConfig(normalizedCompany);
    const normalizedStopId = normalizeStopId(stopId);
    const cacheKey = `${normalizedCompany}|${normalizedStopId}`;

    if (!config.supportsStopAllEta) {
        return [];
    }

    if (!stopAllEtaCache.has(cacheKey)) {
        const url = config.getStopAllEtaUrl(normalizedStopId);
        const promise = fetchJson(url, `${getCompanyLabel(normalizedCompany)}巴士站所有路線 ETA ${normalizedStopId}`)
            .then((payload) => decorateDataEntries(normalizedCompany, Array.isArray(payload.data) ? payload.data : []))
            .catch((error) => {
                stopAllEtaCache.delete(cacheKey);
                throw error;
            });

        stopAllEtaCache.set(cacheKey, promise);
    }

    return stopAllEtaCache.get(cacheKey);
}

async function getStopInfo(company, stopId) {
    const normalizedCompany = getCompanyConfig(company).code;
    const config = getCompanyConfig(normalizedCompany);
    const normalizedStopId = normalizeStopId(stopId);

    if (!normalizedStopId) {
        return null;
    }

    const cacheKey = `${normalizedCompany}|${normalizedStopId}`;

    if (!stopInfoCache.has(cacheKey)) {
        if (typeof config.getStopInfoUrl !== "function") {
            return null;
        }

        const url = config.getStopInfoUrl(normalizedStopId);
        const promise = fetchJson(url, `${getCompanyLabel(normalizedCompany)}巴士站資料 ${normalizedStopId}`)
            .then((payload) => {
                if (!payload?.data) {
                    return null;
                }

                if (normalizedCompany === "GMB") {
                    return {
                        company: normalizedCompany,
                        stop: normalizedStopId,
                        latitude: payload.data?.coordinates?.wgs84?.latitude ?? null,
                        longitude: payload.data?.coordinates?.wgs84?.longitude ?? null
                    };
                }

                return {
                    ...payload.data,
                    company: normalizedCompany,
                    stop: normalizeStopId(payload.data?.stop ?? normalizedStopId)
                };
            })
            .catch((error) => {
                stopInfoCache.delete(cacheKey);
                throw error;
            });

        stopInfoCache.set(cacheKey, promise);
    }

    return stopInfoCache.get(cacheKey);
}

async function hydrateStopMapForStops(company, stops, baseStopMap) {
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
        const firstStopInfo = await getStopInfo(company, firstStopId);
        if (firstStopInfo?.stop) {
            const normalizedStopId = normalizeStopId(firstStopInfo.stop);
            mergedStopMap.set(
                normalizedStopId,
                mergeStopInfo(mergedStopMap.get(normalizedStopId) || {}, firstStopInfo, company)
            );
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
        stopInfo: await getStopInfo(company, stopId)
    })));

    for (const result of results) {
        if (result.status !== "fulfilled" || !result.value.stopInfo?.stop) {
            continue;
        }

        const normalizedStopId = normalizeStopId(result.value.stopInfo.stop);
        mergedStopMap.set(
            normalizedStopId,
            mergeStopInfo(mergedStopMap.get(normalizedStopId) || {}, result.value.stopInfo, company)
        );
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

function chooseRouteVariants(routeEntries) {
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

    return [...uniqueVariants.values()].sort((left, right) => compareVariantsBase(left, right));
}

function createCtbVariantFromRouteEntry(routeEntry, direction) {
    const isInbound = direction === "inbound";
    const originTc = String(routeEntry.orig_tc || "").trim();
    const destinationTc = String(routeEntry.dest_tc || "").trim();
    const originEn = String(routeEntry.orig_en || "").trim();
    const destinationEn = String(routeEntry.dest_en || "").trim();

    return {
        ...routeEntry,
        company: "CTB",
        bound: direction,
        direction,
        dir: direction,
        service_type: "1",
        orig_tc: isInbound ? (destinationTc || originTc) : originTc,
        dest_tc: isInbound ? (originTc || destinationTc) : destinationTc,
        orig_en: isInbound ? (destinationEn || originEn) : originEn,
        dest_en: isInbound ? (originEn || destinationEn) : destinationEn
    };
}

async function expandRouteEntriesForSearch(routeEntries) {
    const expandedEntries = [];

    for (const routeEntry of routeEntries) {
        const company = getItemCompany(routeEntry);
        const existingDirection = getItemDirection(routeEntry);

        if (company === "GMB") {
            try {
                const region = String(routeEntry?.region || "").trim().toUpperCase();
                const route = String(routeEntry?.route || "").trim().toUpperCase();
                const config = getCompanyConfig("GMB");
                const payload = await fetchJson(
                    config.getRouteDetailUrl(region, route),
                    `${getCompanyDisplayName("GMB")} ${region} 路線詳情 ${route}`
                );

                expandedEntries.push(...buildGmbVariantsFromDetailPayload(region, payload));
            } catch (error) {
                console.warn("GMB 路線詳情載入失敗，略過這個地區的路線資料", error);
            }

            continue;
        }

        if (company !== "CTB" || existingDirection) {
            expandedEntries.push(routeEntry);
            continue;
        }

        const route = String(routeEntry.route || "").trim().toUpperCase();

        // CTB 路線清單不一定直接附帶方向，所以這裡先試 outbound / inbound 的 route-stop，
        // 成功哪一個就把哪個方向做成卡片。
        const directionResults = await Promise.allSettled(["outbound", "inbound"].map(async (direction) => ({
            direction,
            stops: await getRouteStops("CTB", route, direction, "1")
        })));

        let hasResolvedDirection = false;

        for (const result of directionResults) {
            if (result.status !== "fulfilled" || result.value.stops.length === 0) {
                continue;
            }

            expandedEntries.push(createCtbVariantFromRouteEntry(routeEntry, result.value.direction));
            hasResolvedDirection = true;
        }

        if (!hasResolvedDirection) {
            expandedEntries.push(routeEntry);
        }
    }

    return expandedEntries;
}

function getEtaTimestamp(etaValue) {
    const etaTimestamp = Date.parse(etaValue);
    return Number.isNaN(etaTimestamp) ? Number.POSITIVE_INFINITY : etaTimestamp;
}

function isEtaEntryForVariant(entry, variant) {
    if (!entry || !variant) {
        return false;
    }

    if (getItemCompany(entry) !== getItemCompany(variant)) {
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

    const variantRouteId = String(variant?.routeId ?? "").trim();
    const entryRouteId = String(entry?.routeId ?? "").trim();
    if (variantRouteId && entryRouteId && variantRouteId !== entryRouteId) {
        return false;
    }

    const variantRouteSeq = String(variant?.routeSeq ?? "").trim();
    const entryRouteSeq = String(entry?.routeSeq ?? "").trim();
    if (variantRouteSeq && entryRouteSeq && variantRouteSeq !== entryRouteSeq) {
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

function buildEmptyVariantEtaPreview() {
    return {
        hasUsableEta: false,
        nextEtaValue: "",
        nextEtaTimestamp: Number.POSITIVE_INFINITY,
        destination: "",
        remark: ""
    };
}

async function loadVariantSummaryPreview(variant, routeEtaPromiseCache) {
    const company = getItemCompany(variant);
    const route = String(variant.route || "").trim().toUpperCase();
    const serviceType = getServiceType(variant);

    if (getCompanyConfig(company).supportsRouteEta) {
        const cacheKey = `${company}|${route}|${serviceType}`;
        if (!routeEtaPromiseCache.has(cacheKey)) {
            routeEtaPromiseCache.set(cacheKey, getRouteEta(company, route, serviceType));
        }

        const etaEntries = await routeEtaPromiseCache.get(cacheKey);
        return buildVariantEtaPreview(variant, etaEntries);
    }

    // Citybus 沒有 route-eta，所以方向卡片先用該方向第一個站的 ETA 當摘要。
    const routeStopsResult = await getRouteStopsWithFallback(company, route, variant, []);
    const previewStops = routeStopsResult.routeStops.slice(0, 5);
    if (previewStops.length === 0) {
        return buildEmptyVariantEtaPreview();
    }

    for (const stop of previewStops) {
        const stopEtaEntries = await getStopEta(
            company,
            route,
            serviceType,
            stop.stopId,
            getVariantMeta(variant, stop)
        );
        const preview = buildVariantEtaPreview(variant, stopEtaEntries);
        if (preview.hasUsableEta) {
            return preview;
        }
    }

    return buildEmptyVariantEtaPreview();
}

function getLocationButtonLabel() {
    // 依需求把定位按鈕文字固定成 GPS，開關狀態改用顏色區分。
    return "GPS";
}

function getLocationStatusText() {
    return locationState.statusMessage || "你可以手動選擇站點";
}

function getStopCoordinates(stopInfo) {
    const latitude = Number(
        stopInfo?.lat
        ?? stopInfo?.latitude
        ?? stopInfo?.coordinates?.wgs84?.latitude
    );
    const longitude = Number(
        stopInfo?.long
        ?? stopInfo?.lng
        ?? stopInfo?.longitude
        ?? stopInfo?.coordinates?.wgs84?.longitude
    );

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

    const variant = findVariantByKey(currentRenderState.selectedVariantKey);
    const variantData = ensureVariantDataBucket(currentRenderState.selectedVariantKey);
    if (!variant || !variantData?.routeStopsWithEta.length) {
        return false;
    }

    const company = getItemCompany(variant);
    const stopMap = getStopMapForCompany(company);

    // stop 清單偶爾會被 API 擋下來；這時先保留 ETA 功能，但不要硬做最近站計算。
    if (stopMap.size === 0) {
        currentRenderState.nearestStopKey = "";
        locationState.statusMessage = "暫時無法載入站點座標，請手動選擇站點";
        renderCurrentState();
        return false;
    }

    const nearestMatch = getNearestStopMatch(
        variantData.routeStopsWithEta,
        stopMap,
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
        logGeolocationFailure("Bus initial geolocation failed", error);
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
        logGeolocationFailure("Bus geolocation failed", error);
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
    const routeEtaPromiseCache = new Map();

    for (const variant of variants) {
        const bucket = ensureVariantDataBucket(getVariantKey(variant));
        bucket.isSummaryLoading = true;
    }

    renderCurrentState();

    // 自動更新時每個方向摘要都各自 try/catch，單一公司失敗不會中斷整批更新。
    const results = await Promise.all(variants.map(async (variant) => {
        const variantKey = getVariantKey(variant);

        try {
            return {
                ok: true,
                variantKey,
                summary: await loadVariantSummaryPreview(variant, routeEtaPromiseCache)
            };
        } catch (error) {
            return {
                ok: false,
                variantKey,
                error
            };
        }
    }));

    if (!currentRenderState || currentRenderState.route !== route) {
        return;
    }

    for (const result of results) {
        const bucket = ensureVariantDataBucket(result.variantKey);
        if (!bucket) {
            continue;
        }

        if (result.ok) {
            bucket.summary = result.summary;
        } else {
            bucket.summary = bucket.summary || buildEmptyVariantEtaPreview();
            console.warn("方向卡片 ETA 摘要載入失敗", result.error);
        }

        bucket.isSummaryLoading = false;
    }

    renderCurrentState();

    console.log(`[BUS ${APP_VERSION}] route overview`, {
        route,
        comparedVariants: variants.map((variant) => ({
            company: getItemCompany(variant),
            direction: getItemDirection(variant),
            serviceType: getServiceType(variant)
        }))
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

async function attachEtaEntriesToStops(company, route, serviceType, variants, routeStopsByDirection, etaMaps) {
    const entries = await Promise.all(variants.map(async (variant) => {
        const direction = getItemDirection(variant);
        const stops = routeStopsByDirection.get(direction) || [];

        const stopsWithEta = await Promise.all(stops.map(async (stop) => {
            const stopMeta = getVariantMeta(variant, stop);
            const routeEtaEntries = getEtaEntriesForStop(etaMaps, direction, stop.stopId, stop.seq, serviceType);
            if (routeEtaEntries.some(hasUsableEta)) {
                return { ...stop, etaEntries: routeEtaEntries };
            }

            try {
                const stopAllEtaEntries = await getStopAllEta(company, stop.stopId);
                const filteredStopAllEtaEntries = stopAllEtaEntries.filter((entry) => {
                    return getItemCompany(entry) === company
                        && isSameRoute(entry, route)
                        && getItemDirection(entry) === direction;
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
                const stopEtaEntries = await getStopEta(company, route, serviceType, stop.stopId, stopMeta);
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

    currentRenderState.variantDataByKey ||= {};

    if (!currentRenderState.variantDataByKey[variantKey]) {
        currentRenderState.variantDataByKey[variantKey] = {
            isSummaryLoading: false,
            isLoading: false,
            error: "",
            warningMessage: "",
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

function getSortedCompanyCodesFromVariants(variants) {
    return [...new Set(variants.map((variant) => getItemCompany(variant)))].sort((left, right) => {
        return (COMPANY_ORDER[left] ?? COMPANY_ORDER.unknown) - (COMPANY_ORDER[right] ?? COMPANY_ORDER.unknown);
    });
}

function renderVariantCard(variant) {
    const variantKey = getVariantKey(variant);
    const isSelected = currentRenderState?.selectedVariantKey === variantKey;
    const encodedKey = encodeURIComponent(variantKey);
    const company = getItemCompany(variant);
    const companyThemeClass = getCompanyThemeClass(company);
    const routeParts = getVariantCardRouteParts(variant);

    // 卡片再進一步簡化，只保留起點與終點，不再顯示倒數時間文字。
    return `
        <button type="button" class="variant-card ${escapeHtml(companyThemeClass)} ${isSelected ? "is-selected" : ""}" onclick="selectVariant('${encodedKey}')">
            <div class="variant-route">
                <span class="variant-route-origin">${escapeHtml(routeParts.origin)}</span>
                <span class="variant-route-connector" aria-hidden="true">
                    <span class="variant-route-label">前往</span>
                    <span class="variant-route-arrow">⟶</span>
                </span>
                <span class="variant-route-destination">${escapeHtml(routeParts.destination)}</span>
            </div>
        </button>
    `;
}

function renderDirectionCards() {
    if (!currentRenderState) {
        return "";
    }

    const companies = getSortedCompanyCodesFromVariants(currentRenderState.variants);

    return companies.map((company) => {
        const companyVariants = currentRenderState.variants.filter((variant) => getItemCompany(variant) === company);

        return `
            <section class="variant-group">
                <div class="variant-group-header">
                    <div class="variant-group-title-row">
                        ${renderCompanyChip(company)}
                        <h3 class="variant-group-title">${escapeHtml(getCompanyDisplayName(company))}</h3>
                    </div>
                    <p class="variant-group-subtitle">找到 ${companyVariants.length} 個可用方向</p>
                </div>
                <div class="variant-grid">
                    ${companyVariants.map((variant) => renderVariantCard(variant)).join("")}
                </div>
            </section>
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
    const company = getItemCompany(variant);
    const companyLabel = getCompanyDisplayName(company);
    const stopMap = getStopMapForCompany(company);
    const updatedTimeText = formatDisplayTime(variantData.fetchedAt);
    const stopMapWarningHtml = variantData.warningMessage
        ? `<p class="selection-subtitle">${escapeHtml(variantData.warningMessage)}</p>`
        : "";

    const stopsHtml = stops.map((stop) => {
        const stopKey = getStopPanelKey(currentRenderState.selectedVariantKey, stop);
        const encodedStopKey = encodeURIComponent(stopKey);
        const isExpanded = currentRenderState.expandedStopKeys.includes(stopKey);
        const isNearest = currentRenderState.nearestStopKey === stopKey;
        const stopInfo = stopMap.get(stop.stopId);
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
                    <p class="selection-subtitle">${escapeHtml(companyLabel)} • ${escapeHtml(getServiceTypeLabel(getServiceType(variant)))} • 站點共 ${stops.length} 個 • 點一下站名展開 ETA • 資料更新 ${escapeHtml(updatedTimeText)}</p>
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

    return `
        <div class="route-shell">
            <section class="selection-panel">
                <div class="selection-panel-header">
                    <!-- 依需求移除左上角的「路線 XX」標題，保留右側 GPS 控制即可。 -->
                    <div class="panel-actions">
                        <button type="button" class="location-btn ${locationState.enabled ? "is-active" : ""}" onclick="toggleLocationTracking()">${escapeHtml(locationButtonText)}</button>
                        <p class="location-note">${escapeHtml(locationStatusText)}</p>
                    </div>
                </div>
                <div class="variant-groups">
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
    const company = getItemCompany(variant);
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
    variantData.warningMessage = "";
    renderCurrentState();

    if (statusDiv) {
        statusDiv.innerHTML = isAutoRefresh
            ? `正在自動更新 <strong>${escapeHtml(getCompanyDisplayName(company))} ${escapeHtml(getRouteLabel(variant))}</strong>...`
            : `正在載入 <strong>${escapeHtml(getCompanyDisplayName(company))} ${escapeHtml(getRouteLabel(variant))}</strong> 的站點與 ETA（${escapeHtml(serviceTypeLabel)}）...`;
    }

    try {
        const etaEntries = await getRouteEta(company, route, serviceType);
        const [routeStopsResult, stopMapResult] = await Promise.all([
            getRouteStopsWithFallback(company, route, variant, etaEntries),
            getOptionalStopMap(company)
        ]);

        if (!currentRenderState || currentRenderState.route !== route || requestId !== activeVariantLoadId) {
            return;
        }

        const routeStops = routeStopsResult.routeStops;
        const routeStopMap = buildStopMapFromRouteStops(company, routeStops);
        // NLB / GMB 的 route-stop 本身就帶有部分站名資料，所以先把這些資料併進來，
        // 再用單站 API 補缺少的座標或剩餘站名，避免畫面只剩下 stop ID。
        const baseStopMap = mergeStopMaps(company, stopMapResult.stopMap, routeStopMap);
        const hydratedStopMapResult = await hydrateStopMapForStops(company, routeStops, baseStopMap);

        if (!currentRenderState || currentRenderState.route !== route || requestId !== activeVariantLoadId) {
            return;
        }

        currentRenderState.stopMapsByCompany ||= {};
        currentRenderState.stopMapsByCompany[company] = hydratedStopMapResult.stopMap;
        variantData.warningMessage = joinWarningMessages(
            routeStopsResult.warningMessage,
            stopMapResult.warningMessage,
            hydratedStopMapResult.warningMessage
        );
        currentRenderState.stopMapWarningMessage = variantData.warningMessage;

        const routeStopsByDirection = new Map([[direction, routeStops]]);
        const etaMaps = buildEtaMaps(etaEntries, serviceType);
        const routeStopsWithEtaMap = await attachEtaEntriesToStops(
            company,
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

        console.log(`[BUS ${APP_VERSION}] variant loaded`, {
            company,
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
            statusDiv.innerHTML = `已載入 <strong>${escapeHtml(getCompanyDisplayName(company))} ${escapeHtml(getRouteLabel(variant))}</strong>（${escapeHtml(serviceTypeLabel)}），可展開站點查看 ETA`;
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
            variantData.warningMessage = "";
            clearSelectedVariantState();
            currentRenderState.routeErrorMessage = friendlyErrorMessage;
            stopLiveUpdates();
            renderCurrentState();

            if (statusDiv) {
                statusDiv.innerHTML = "該方向目前無法查詢，請試其他方向或其他路線";
            }
        }

        console.error("Bus variant load failed", error);
    }
}

function selectVariant(encodedVariantKey) {
    const variantKey = decodeActionValue(encodedVariantKey);

    if (currentRenderState) {
        const existingData = ensureVariantDataBucket(variantKey);
        if (existingData && existingData.fetchedAt && existingData.routeStopsWithEta.length > 0) {
            currentRenderState.selectedVariantKey = variantKey;
            currentRenderState.routeErrorMessage = "";
            currentRenderState.stopMapWarningMessage = existingData.warningMessage || "";
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
    const resultDiv = document.getElementById("result");
    const statusDiv = document.getElementById("status");
    const searchBtn = document.getElementById("searchBtn");
    const route = routeInput.value.trim().toUpperCase();
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
        const companies = Object.keys(COMPANY_CONFIGS).sort((left, right) => {
            return (COMPANY_ORDER[left] ?? COMPANY_ORDER.unknown) - (COMPANY_ORDER[right] ?? COMPANY_ORDER.unknown);
        });
        const restrictedCompanies = companies.filter((company) => isCompanyRestrictedInLocalFileMode(company));

        const routeListResults = await Promise.allSettled(companies.map(async (company) => ({
            company,
            routeList: await getRouteList(company)
        })));

        if (searchId !== activeSearchId) {
            return;
        }

        const availableRouteLists = routeListResults
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value);

        if (availableRouteLists.length === 0) {
            throw routeListResults.find((result) => result.status === "rejected")?.reason || new Error("路線清單暫時無法載入");
        }

        const matchingRoutes = availableRouteLists.flatMap(({ routeList }) => {
            return routeList.filter((entry) => String(entry.route || "").toUpperCase() === route);
        });

        if (!matchingRoutes.length) {
            resetCurrentRouteState();
            const restrictedMessage = restrictedCompanies.length > 0
                ? ` ${getLocalModeRestrictionNotice(restrictedCompanies)}`
                : "";
            renderStandaloneError(resultDiv, `目前不支援路線 ${route}`, `目前不支援此路線，或請確認路線號。${restrictedMessage}`);
            statusDiv.innerHTML = "目前不支援此路線";
            return;
        }

        const expandedMatchingRoutes = await expandRouteEntriesForSearch(matchingRoutes);

        if (searchId !== activeSearchId) {
            return;
        }

        // 介面已移除班次下拉選單，這裡固定同時整理所有班次，不再依賴使用者手動班次偏好。
        const variants = chooseRouteVariants(expandedMatchingRoutes);
        if (!variants.length) {
            resetCurrentRouteState();
            renderStandaloneError(resultDiv, `路線 ${route} 暫時無法查詢`, "目前找不到可用方向資料，請稍後再試，或試其他路線例如 1A、2、104。");
            statusDiv.innerHTML = "找不到方向資料";
            return;
        }

        currentRenderState = createRenderState(route, variants);

        for (const variant of variants) {
            const bucket = ensureVariantDataBucket(getVariantKey(variant));
            bucket.isSummaryLoading = true;
        }

        renderCurrentState();

        statusDiv.innerHTML = `已找到 ${variants.length} 個可用方向，正在整理各公司的方向與班次摘要...`;
        await refreshVariantSummaries();

        if (!currentRenderState || currentRenderState.route !== route || searchId !== activeSearchId) {
            return;
        }

        console.log(`[BUS ${APP_VERSION}] route search`, {
            route,
            companies: [...new Set(expandedMatchingRoutes.map((entry) => getItemCompany(entry)))],
            variantCount: variants.length
        });

        const localModeNotice = restrictedCompanies.length > 0
            ? `。${getLocalModeRestrictionNotice(restrictedCompanies)}`
            : "";
        statusDiv.innerHTML = `已找到 ${variants.length} 個可用方向，並已同步載入班次摘要${localModeNotice}`;
    } catch (error) {
        console.error("Bus route search failed", error);
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
    console.log(`Ready to search KMB, CTB, NLB, and GMB routes like 1A, 2, 20, 24, and 104 (${APP_VERSION})`);
    void initializeLocationOnLoad();
};

window.addEventListener("beforeunload", () => {
    stopLiveUpdates();
});
