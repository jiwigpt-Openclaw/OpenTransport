(() => {
    const MTR_SCHEDULE_ENDPOINT = "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php";
    const MTR_DIRECTION_CONFIG = [{ apiKey: "UP", label: "上行" }, { apiKey: "DOWN", label: "下行" }];
    const statusElement = document.getElementById("railStatus");
    const contentElement = document.getElementById("railContent");
    const tabButtons = Array.from(document.querySelectorAll("[data-tab-trigger]"));
    if (!(statusElement instanceof HTMLElement) || !(contentElement instanceof HTMLElement)) return;

    const railIndex = window.__OFFICIAL_RAIL_INDEX__ || null;
    const railState = {
        currentTab: "mtr",
        mtr: {
            lineCode: "",
            stationCode: "",
            lines: [],
            stationIndex: {},
            manual: {
                status: "idle",
                errorMessage: "",
                schedule: null,
                requestId: 0,
                activeController: null,
                hasUserInteracted: false,
                hasAutoFilledFromNearest: false
            },
            nearest: {
                status: "idle",
                errorMessage: "",
                hasAttempted: false,
                userLocation: null,
                nearestStation: null,
                lineSummaries: [],
                requestId: 0,
                activeController: null
            }
        },
        lightRail: { routeCode: "", stopId: "", routes: [], stopIndex: {} },
        ui: { isReady: false, statusKind: "info", statusMessage: "正在準備官方靜態索引..." }
    };

    function escapeHtml(value) {
        return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
    }
    function setStatus(message, kind = "info") {
        railState.ui.statusMessage = message;
        railState.ui.statusKind = kind;
        statusElement.className = `rail-status rail-status-${kind}`;
        statusElement.innerHTML = message;
    }
    function syncTabButtons() {
        for (const button of tabButtons) {
            const nextTab = button.getAttribute("data-tab-trigger") || "";
            const isActive = nextTab === railState.currentTab;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        }
    }
    function parseApiDateTime(value) {
        const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
        if (!match) return null;
        const [, year, month, day, hour, minute, second] = match;
        return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    }
    function formatClockTime(value) {
        const parsed = parseApiDateTime(value);
        return parsed
            ? new Intl.DateTimeFormat("zh-HK", { hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed)
            : value || "--";
    }
    function resolveMinutes(ttntValue, currentTime, serviceTime) {
        const parsedMinutes = Number.parseInt(String(ttntValue || ""), 10);
        if (Number.isFinite(parsedMinutes)) return Math.max(0, parsedMinutes);
        const currentDate = parseApiDateTime(currentTime);
        const serviceDate = parseApiDateTime(serviceTime);
        if (!currentDate || !serviceDate) return null;
        return Math.max(0, Math.round((serviceDate.getTime() - currentDate.getTime()) / 60000));
    }
    function formatMinutesLabel(minutes) {
        if (!Number.isFinite(minutes)) return "時間未提供";
        if (minutes <= 0) return "即將到站";
        return `${minutes} 分鐘`;
    }
    function getTimeTypeLabel(timeType) {
        if (timeType === "A") return "到達";
        if (timeType === "D") return "開出";
        return "";
    }
    function formatDistance(distanceMeters) {
        if (!Number.isFinite(distanceMeters)) return "距離未提供";
        return distanceMeters < 1000 ? `約 ${Math.round(distanceMeters)} 米` : `約 ${(distanceMeters / 1000).toFixed(distanceMeters >= 10000 ? 0 : 1)} 公里`;
    }
    function isWithinGeneralMtrClosedWindow(value) {
        const parsed = parseApiDateTime(value);
        if (!parsed) return false;
        const minutesOfDay = parsed.getHours() * 60 + parsed.getMinutes();
        return minutesOfDay >= 60 && minutesOfDay < 360;
    }
    function haversineDistanceMeters(latA, lonA, latB, lonB) {
        const toRadians = (value) => value * Math.PI / 180;
        const earthRadius = 6371000;
        const deltaLatitude = toRadians(latB - latA);
        const deltaLongitude = toRadians(lonB - lonA);
        const sinLatitude = Math.sin(deltaLatitude / 2);
        const sinLongitude = Math.sin(deltaLongitude / 2);
        const angle = sinLatitude * sinLatitude + Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * sinLongitude * sinLongitude;
        return 2 * earthRadius * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle));
    }
    function compareServices(left, right) {
        const leftMinutes = Number.isFinite(left.minutes) ? left.minutes : Number.POSITIVE_INFINITY;
        const rightMinutes = Number.isFinite(right.minutes) ? right.minutes : Number.POSITIVE_INFINITY;
        if (leftMinutes !== rightMinutes) return leftMinutes - rightMinutes;
        return String(left.scheduleTime || "").localeCompare(String(right.scheduleTime || ""), "en");
    }
    function getSelectedMtrLine() {
        return railState.mtr.lines.find((line) => line.lineCode === railState.mtr.lineCode) || null;
    }
    function getSelectedMtrStation() {
        const selectedLine = getSelectedMtrLine();
        return selectedLine?.stations.find((station) => station.stationCode === railState.mtr.stationCode) || null;
    }
    function getMtrStationOptions() {
        return getSelectedMtrLine()?.stations || [];
    }
    function getMtrDirectionTerminusName(lineCode, directionKey) {
        const selectedLine = railState.mtr.lines.find((line) => line.lineCode === lineCode);
        if (!selectedLine || !Array.isArray(selectedLine.stations)) return "";
        const terminus = selectedLine.stations
            .filter((station) => Number.isFinite(Number(station?.sequences?.[directionKey])))
            .sort((left, right) => Number(left.sequences[directionKey]) - Number(right.sequences[directionKey]))[0];
        return terminus?.nameZh || "";
    }
    function findPreferredNearestLineMembership(nearestStation) {
        const memberships = Array.isArray(nearestStation?.lines) ? nearestStation.lines : [];
        if (memberships.length === 0) return null;
        const lineOrder = new Map(railState.mtr.lines.map((line, index) => [line.lineCode, index]));
        return [...memberships].sort((left, right) => {
            const leftOrder = lineOrder.get(left.lineCode) ?? Number.MAX_SAFE_INTEGER;
            const rightOrder = lineOrder.get(right.lineCode) ?? Number.MAX_SAFE_INTEGER;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            return String(left.lineCode || "").localeCompare(String(right.lineCode || ""), "en");
        })[0] || null;
    }
    function getPreferredNearestSelection(nearestStation) {
        const preferredLine = findPreferredNearestLineMembership(nearestStation);
        if (!preferredLine?.lineCode || !nearestStation?.stationCode) return null;
        return {
            lineCode: preferredLine.lineCode,
            lineNameZh: preferredLine.lineNameZh,
            stationCode: nearestStation.stationCode,
            stationNameZh: nearestStation.nameZh
        };
    }
    function isPreferredNearestSelectionActive(nearestStation) {
        const preferredSelection = getPreferredNearestSelection(nearestStation);
        return Boolean(
            preferredSelection &&
            railState.mtr.lineCode === preferredSelection.lineCode &&
            railState.mtr.stationCode === preferredSelection.stationCode
        );
    }
    async function applyNearestStationToManualQuery(nearestStation, options = {}) {
        const { markUserInteracted = false, forceRefresh = false } = options;
        if (markUserInteracted) railState.mtr.manual.hasUserInteracted = true;
        if (!markUserInteracted && (railState.mtr.manual.hasUserInteracted || railState.mtr.manual.hasAutoFilledFromNearest)) return false;
        const preferredSelection = getPreferredNearestSelection(nearestStation);
        if (!preferredSelection) return false;
        const selectionChanged = railState.mtr.lineCode !== preferredSelection.lineCode || railState.mtr.stationCode !== preferredSelection.stationCode;
        railState.mtr.lineCode = preferredSelection.lineCode;
        railState.mtr.stationCode = preferredSelection.stationCode;
        railState.mtr.manual.hasAutoFilledFromNearest = true;
        if (!selectionChanged && !forceRefresh) return false;
        await requestManualMtrSchedule();
        return true;
    }
    function getLightRailStopOptions() {
        if (!railState.lightRail.routeCode) {
            return Object.values(railState.lightRail.stopIndex).sort((left, right) => left.nameZh.localeCompare(right.nameZh, "zh-HK"));
        }
        const selectedRoute = railState.lightRail.routes.find((route) => route.routeCode === railState.lightRail.routeCode);
        if (!selectedRoute) return [];
        const stopMap = new Map();
        for (const directionEntry of selectedRoute.directions || []) {
            for (const stopEntry of directionEntry.stops || []) {
                if (!stopMap.has(stopEntry.stopId)) {
                    stopMap.set(stopEntry.stopId, { stopId: stopEntry.stopId, stopCode: stopEntry.stopCode, nameZh: stopEntry.nameZh, nameEn: stopEntry.nameEn });
                }
            }
        }
        return [...stopMap.values()].sort((left, right) => left.nameZh.localeCompare(right.nameZh, "zh-HK"));
    }
    function abortManualMtrRequest() {
        if (railState.mtr.manual.activeController instanceof AbortController) railState.mtr.manual.activeController.abort();
        railState.mtr.manual.activeController = null;
    }
    function abortNearestMtrRequest() {
        if (railState.mtr.nearest.activeController instanceof AbortController) railState.mtr.nearest.activeController.abort();
        railState.mtr.nearest.activeController = null;
    }
    function resetManualMtrState() {
        abortManualMtrRequest();
        railState.mtr.manual.status = "idle";
        railState.mtr.manual.errorMessage = "";
        railState.mtr.manual.schedule = null;
    }
    function resolveMtrStationName(stationCode) {
        const stationEntry = railState.mtr.stationIndex[String(stationCode || "").toUpperCase()] || null;
        return stationEntry?.nameZh || stationCode || "未命名終點站";
    }
    function buildMtrServiceNotes(entry) {
        const notes = [];
        if (entry.source && entry.source !== "-") notes.push(entry.source);
        if (entry.route) notes.push(entry.route === "RAC" ? "經馬場站" : `路線資訊 ${entry.route}`);
        if (entry.valid && entry.valid !== "Y") notes.push("官方資料未標記為有效班次");
        return notes;
    }
    function normalizeMtrService(service, directionKey, responseTime) {
        const destinationCode = String(service.dest || "").toUpperCase();
        const minutes = resolveMinutes(service.ttnt, responseTime, service.time);
        return {
            id: [directionKey, service.seq || "", service.time || "", destinationCode || "", service.plat || ""].join("-"),
            sequence: Number.parseInt(String(service.seq || ""), 10) || null,
            directionKey,
            destinationCode,
            destinationNameZh: resolveMtrStationName(destinationCode),
            platform: String(service.plat || "").trim(),
            scheduleTime: String(service.time || "").trim(),
            clockTime: formatClockTime(service.time),
            minutes,
            minutesLabel: formatMinutesLabel(minutes),
            timeType: String(service.timeType || "").trim(),
            timeTypeLabel: getTimeTypeLabel(service.timeType),
            route: String(service.route || "").trim(),
            valid: String(service.valid || "").trim(),
            source: String(service.source || "").trim(),
            notes: buildMtrServiceNotes(service)
        };
    }
    function normalizeMtrDirection(directionConfig, entry, responseTime) {
        const services = (Array.isArray(entry) ? entry : [])
            .filter((service) => service && typeof service === "object")
            .map((service) => normalizeMtrService(service, directionConfig.apiKey, responseTime))
            .sort(compareServices);
        return { apiKey: directionConfig.apiKey, label: directionConfig.label, services, hasData: services.length > 0 };
    }
    function buildMtrTerminusGroups(directions) {
        const groupMap = new Map();
        for (const direction of directions) {
            for (const service of direction.services) {
                const key = service.destinationCode || service.destinationNameZh || service.directionKey;
                let group = groupMap.get(key);
                if (!group) {
                    group = { key, terminusCode: service.destinationCode, terminusNameZh: service.destinationNameZh, services: [], directionKeys: [] };
                    groupMap.set(key, group);
                }
                group.services.push(service);
                if (!group.directionKeys.includes(service.directionKey)) group.directionKeys.push(service.directionKey);
            }
        }
        return [...groupMap.values()]
            .map((group) => {
                const services = group.services.sort(compareServices);
                return { ...group, services, earliestService: services[0] || null };
            })
            .sort((left, right) => compareServices(left.earliestService || {}, right.earliestService || {}));
    }
    function normalizeMtrScheduleResponse(payload, lineMeta, stationMeta) {
        const queryKey = `${lineMeta.lineCode}-${stationMeta.stationCode}`;
        const rawEntry = payload?.data?.[queryKey] || Object.values(payload?.data || {})[0] || null;
        const responseTime = rawEntry?.curr_time || payload?.curr_time || "";
        const systemTime = rawEntry?.sys_time || payload?.sys_time || "";
        const directions = MTR_DIRECTION_CONFIG.map((directionConfig) => normalizeMtrDirection(directionConfig, rawEntry?.[directionConfig.apiKey], responseTime));
        const terminusGroups = buildMtrTerminusGroups(directions);
        return {
            queryKey,
            lineCode: lineMeta.lineCode,
            lineNameZh: lineMeta.lineNameZh,
            stationCode: stationMeta.stationCode,
            stationNameZh: stationMeta.stationNameZh,
            stationNameEn: stationMeta.stationNameEn,
            currentTime: responseTime,
            currentTimeLabel: formatClockTime(responseTime),
            systemTime,
            systemTimeLabel: formatClockTime(systemTime),
            isDelay: payload?.isdelay === "Y",
            alertMessage: payload?.message && payload.message !== "successful" ? String(payload.message) : "",
            alertUrl: payload?.url ? String(payload.url) : "",
            directions,
            terminusGroups,
            hasAnyData: terminusGroups.length > 0
        };
    }
    async function fetchMtrSchedule(lineMeta, stationMeta, signal) {
        const query = new URLSearchParams({ line: lineMeta.lineCode, sta: stationMeta.stationCode });
        const response = await fetch(`${MTR_SCHEDULE_ENDPOINT}?${query.toString()}`, { method: "GET", headers: { Accept: "application/json" }, signal });
        if (!response.ok) throw new Error(`官方港鐵 API 暫時無法回應（HTTP ${response.status}）。`);
        const payload = await response.json();
        if (payload?.status !== 1) throw new Error(payload?.error?.errorMsg || payload?.message || "官方港鐵 API 暫時未能提供資料。");
        return normalizeMtrScheduleResponse(payload, lineMeta, stationMeta);
    }
    async function requestManualMtrSchedule() {
        const selectedLine = getSelectedMtrLine();
        const selectedStation = getSelectedMtrStation();
        if (!selectedLine || !selectedStation) {
            resetManualMtrState();
            renderCurrentTab();
            bindCurrentTabEvents();
            return;
        }
        abortManualMtrRequest();
        const requestId = railState.mtr.manual.requestId + 1;
        const controller = new AbortController();
        railState.mtr.manual.requestId = requestId;
        railState.mtr.manual.activeController = controller;
        railState.mtr.manual.status = "loading";
        railState.mtr.manual.errorMessage = "";
        railState.mtr.manual.schedule = null;
        setStatus(`正在讀取 <strong>${escapeHtml(selectedLine.lineNameZh)}</strong> <strong>${escapeHtml(selectedStation.nameZh)}</strong> 的港鐵即時到站資料...`, "info");
        renderCurrentTab();
        bindCurrentTabEvents();
        try {
            const normalizedSchedule = await fetchMtrSchedule(
                { lineCode: selectedLine.lineCode, lineNameZh: selectedLine.lineNameZh },
                { stationCode: selectedStation.stationCode, stationNameZh: selectedStation.nameZh, stationNameEn: selectedStation.nameEn },
                controller.signal
            );
            if (railState.mtr.manual.requestId !== requestId) return;
            railState.mtr.manual.schedule = normalizedSchedule;
            railState.mtr.manual.status = normalizedSchedule.hasAnyData ? "success" : "empty";
            railState.mtr.manual.errorMessage = "";
            setStatus(
                normalizedSchedule.hasAnyData
                    ? `已更新 <strong>${escapeHtml(normalizedSchedule.lineNameZh)}</strong> <strong>${escapeHtml(normalizedSchedule.stationNameZh)}</strong> 的即時到站資料。`
                    : `官方目前沒有提供 <strong>${escapeHtml(normalizedSchedule.stationNameZh)}</strong> 的可用到站資料。`,
                normalizedSchedule.hasAnyData ? "info" : "warning"
            );
        } catch (error) {
            if (controller.signal.aborted || railState.mtr.manual.requestId !== requestId) return;
            railState.mtr.manual.status = "error";
            railState.mtr.manual.errorMessage = error instanceof Error ? error.message : "目前未能載入港鐵即時到站資料。";
            railState.mtr.manual.schedule = null;
            setStatus(railState.mtr.manual.errorMessage, "error");
        } finally {
            if (railState.mtr.manual.requestId !== requestId) return;
            railState.mtr.manual.activeController = null;
            renderCurrentTab();
            bindCurrentTabEvents();
        }
    }
    function locateUserPosition() {
        return new Promise((resolve, reject) => {
            if (!("geolocation" in navigator) || !navigator.geolocation) {
                reject(new Error("你的瀏覽器目前不支援定位功能。"));
                return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
        });
    }
    function findNearestMtrStation(position) {
        return Object.values(railState.mtr.stationIndex)
            .filter((station) => Number.isFinite(station.location?.latitude) && Number.isFinite(station.location?.longitude))
            .map((station) => ({
                ...station,
                distanceMeters: haversineDistanceMeters(position.latitude, position.longitude, station.location.latitude, station.location.longitude)
            }))
            .sort((left, right) => left.distanceMeters - right.distanceMeters)[0] || null;
    }
    function buildNearestLineSummary(lineMembership, schedule) {
        const directions = Array.isArray(schedule?.directions) ? schedule.directions : [];
        const hasAnyDirectionData = directions.some((direction) => direction.hasData);
        const referenceTime = schedule?.currentTime || schedule?.systemTime || "";

        const directionSummaries = directions.map((direction) => {
            const nextService = Array.isArray(direction.services) ? direction.services[0] || null : null;
            const directionTerminusName = getMtrDirectionTerminusName(lineMembership.lineCode, direction.apiKey);

            if (!nextService) {
                return {
                    status: "empty",
                    directionKey: direction.apiKey,
                    title: directionTerminusName ? `${lineMembership.lineNameZh}　往 ${directionTerminusName}` : lineMembership.lineNameZh,
                    metaText: "下一班車　暫無官方資料",
                    platformLabel: "",
                    timeTypeLabel: "",
                    notes: []
                };
            }

            const terminusName = nextService.destinationNameZh || directionTerminusName || "終點站未提供";

            return {
                status: "success",
                directionKey: direction.apiKey,
                title: `${lineMembership.lineNameZh}　往 ${terminusName}`,
                metaText: `下一班車　${nextService.clockTime}　${nextService.minutesLabel}`,
                platformLabel: nextService.platform ? `${nextService.platform}號月台` : "",
                timeTypeLabel: nextService.timeTypeLabel || "",
                notes: nextService.notes || []
            };
        });

        if (!hasAnyDirectionData) {
            return {
                status: "empty",
                lineCode: lineMembership.lineCode,
                lineNameZh: lineMembership.lineNameZh,
                referenceTime,
                directionSummaries,
                alertMessage: schedule?.alertMessage || "",
                isDelay: Boolean(schedule?.isDelay)
            };
        }

        return {
            status: "success",
            lineCode: lineMembership.lineCode,
            lineNameZh: lineMembership.lineNameZh,
            referenceTime,
            directionSummaries,
            alertMessage: schedule.alertMessage,
            isDelay: schedule.isDelay
        };
    }
    function shouldShowNearestAfterHoursMessage(lineSummaries) {
        const summaries = Array.isArray(lineSummaries) ? lineSummaries.filter(Boolean) : [];
        if (summaries.length === 0) return false;
        if (summaries.some((summary) => summary.status === "error" || summary.status === "success")) return false;
        const referenceTimes = summaries.map((summary) => summary.referenceTime).filter(Boolean);
        if (referenceTimes.length === 0) return false;
        return referenceTimes.every((referenceTime) => isWithinGeneralMtrClosedWindow(referenceTime));
    }
    function buildNearestNoServiceBannerMarkup(lineSummaries) {
        if (shouldShowNearestAfterHoursMessage(lineSummaries)) {
            return `
                <section class="rail-inline-banner">
                    <strong>已過港鐵營業時間，暫時沒有下一班車。</strong>
                    <p class="rail-inline-banner-detail">一般服務時間：約 06:00 – 01:00（實際以各線為準）</p>
                </section>`;
        }
        return `<section class="rail-inline-banner"><strong>提示：</strong> 最近站已找到，但官方暫時未有可顯示的即時班次。</section>`;
    }
    async function requestNearestMtrSummary(force = false) {
        if (railState.currentTab !== "mtr") return;
        if (!force && railState.mtr.nearest.hasAttempted) return;
        abortNearestMtrRequest();
        railState.mtr.nearest.requestId += 1;
        const requestId = railState.mtr.nearest.requestId;
        const controller = new AbortController();
        railState.mtr.nearest.activeController = controller;
        railState.mtr.nearest.hasAttempted = true;
        railState.mtr.nearest.status = "locating";
        railState.mtr.nearest.errorMessage = "";
        railState.mtr.nearest.userLocation = null;
        railState.mtr.nearest.nearestStation = null;
        railState.mtr.nearest.lineSummaries = [];
        setStatus("正在取得你附近的港鐵站位置...", "info");
        renderCurrentTab();
        bindCurrentTabEvents();
        try {
            const position = await locateUserPosition();
            if (railState.mtr.nearest.requestId !== requestId) return;
            railState.mtr.nearest.userLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
            const nearestStation = findNearestMtrStation(railState.mtr.nearest.userLocation);
            if (!nearestStation) {
                railState.mtr.nearest.status = "notFound";
                railState.mtr.nearest.errorMessage = "找不到可用座標的港鐵站資料。";
                setStatus(railState.mtr.nearest.errorMessage, "warning");
                renderCurrentTab();
                bindCurrentTabEvents();
                return;
            }
            railState.mtr.nearest.nearestStation = nearestStation;
            railState.mtr.nearest.status = "loading";
            setStatus(`最近的港鐵站是 <strong>${escapeHtml(nearestStation.nameZh)}</strong>（${escapeHtml(formatDistance(nearestStation.distanceMeters))}），正在讀取各線下一班車摘要。`, "info");
            renderCurrentTab();
            bindCurrentTabEvents();
            const lineSummaries = await Promise.all(nearestStation.lines.map(async (lineMembership) => {
                try {
                    const schedule = await fetchMtrSchedule(
                        { lineCode: lineMembership.lineCode, lineNameZh: lineMembership.lineNameZh },
                        { stationCode: nearestStation.stationCode, stationNameZh: nearestStation.nameZh, stationNameEn: nearestStation.nameEn },
                        controller.signal
                    );
                    return buildNearestLineSummary(lineMembership, schedule);
                } catch (error) {
                    if (controller.signal.aborted) return null;
                    return { status: "error", lineCode: lineMembership.lineCode, lineNameZh: lineMembership.lineNameZh, errorMessage: error instanceof Error ? error.message : "無法讀取該線即時資料。" };
                }
            }));
            if (railState.mtr.nearest.requestId !== requestId) return;
            railState.mtr.nearest.lineSummaries = lineSummaries.filter(Boolean);
            railState.mtr.nearest.status = "ready";
            const hasAnyAvailableSummary = railState.mtr.nearest.lineSummaries.some((summary) => summary.status === "success");
            setStatus(
                hasAnyAvailableSummary
                    ? `已更新 <strong>${escapeHtml(nearestStation.nameZh)}</strong> 的港鐵下一班車摘要。`
                    : `已找到最近港鐵站 <strong>${escapeHtml(nearestStation.nameZh)}</strong>，但官方暫時未有可顯示的即時班次。`,
                hasAnyAvailableSummary ? "info" : "warning"
            );
        } catch (error) {
            if (controller.signal.aborted || railState.mtr.nearest.requestId !== requestId) return;
            const code = error && typeof error === "object" && "code" in error ? error.code : null;
            if (code === 1) {
                railState.mtr.nearest.status = "permissionDenied";
                railState.mtr.nearest.errorMessage = "你已拒絕定位權限。可以在瀏覽器允許定位後再試一次。";
            } else if (code === 2) {
                railState.mtr.nearest.status = "locationError";
                railState.mtr.nearest.errorMessage = "目前無法判斷你的位置。請確認裝置定位服務已開啟。";
            } else if (code === 3) {
                railState.mtr.nearest.status = "locationError";
                railState.mtr.nearest.errorMessage = "定位逾時，請稍後再試一次。";
            } else {
                railState.mtr.nearest.status = "locationError";
                railState.mtr.nearest.errorMessage = error instanceof Error ? error.message : "暫時未能完成最近站定位。";
            }
            setStatus(railState.mtr.nearest.errorMessage, "warning");
        } finally {
            if (railState.mtr.nearest.requestId !== requestId) return;
            railState.mtr.nearest.activeController = null;
            renderCurrentTab();
            bindCurrentTabEvents();
        }
    }
    function buildNearestDirectionRow(directionSummary) {
        return `
            <section class="rail-nearest-direction-row ${directionSummary.status === "empty" ? "is-empty" : ""}">
                <div class="rail-nearest-direction-main">
                    <h5 class="rail-nearest-direction-title">${escapeHtml(directionSummary.title)}</h5>
                    <p class="rail-nearest-direction-meta">${escapeHtml(directionSummary.metaText)}</p>
                    ${directionSummary.notes.length > 0 ? `<ul class="rail-note-list rail-nearest-note-list">${directionSummary.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
                </div>
                ${directionSummary.platformLabel || directionSummary.timeTypeLabel
                    ? `<div class="rail-service-tags rail-nearest-direction-tags">${directionSummary.platformLabel ? `<span class="rail-meta-pill">${escapeHtml(directionSummary.platformLabel)}</span>` : ""}${directionSummary.timeTypeLabel ? `<span class="rail-meta-pill">${escapeHtml(directionSummary.timeTypeLabel)}</span>` : ""}</div>`
                    : ""}
            </section>`;
    }
    function buildNearestLineCard(summary) {
        if (summary.status === "error") {
            return `
                <article class="rail-nearest-line-card rail-nearest-line-card-error">
                    <div class="rail-nearest-line-top">
                        <div><p class="rail-nearest-line-kicker">${escapeHtml(summary.lineCode)}</p><h4 class="rail-nearest-line-title">${escapeHtml(summary.lineNameZh)}</h4></div>
                    </div>
                    <p class="rail-nearest-inline-note">${escapeHtml(summary.errorMessage || "暫時未能載入該線資料。")}</p>
                </article>`;
        }

        return `
            <article class="rail-nearest-line-card">
                <div class="rail-nearest-line-top">
                    <div><p class="rail-nearest-line-kicker">${escapeHtml(summary.lineCode)}</p><h4 class="rail-nearest-line-title">${escapeHtml(summary.lineNameZh)}</h4></div>
                    ${summary.isDelay || summary.alertMessage ? '<span class="rail-meta-pill">服務提示</span>' : ""}
                </div>
                <section class="rail-nearest-direction-list">
                    ${(summary.directionSummaries || []).map((directionSummary) => buildNearestDirectionRow(directionSummary)).join("")}
                </section>
                ${summary.alertMessage ? `<p class="rail-nearest-inline-note">${escapeHtml(summary.alertMessage)}</p>` : ""}
            </article>`;
    }
    function buildNearestSectionMarkup() {
        const nearestState = railState.mtr.nearest;
        const hasCoordinateData = Object.values(railState.mtr.stationIndex).some((station) => Number.isFinite(station.location?.latitude) && Number.isFinite(station.location?.longitude));
        const retryDisabled = nearestState.status === "locating" || nearestState.status === "loading";
        const retryButton = `<button type="button" id="mtrNearestRetryButton" class="rail-secondary-button rail-nearest-retry" ${retryDisabled ? "disabled" : ""}>${retryDisabled ? "更新中..." : "重新定位"}</button>`;
        const buildStateSection = (summaryMarkup, contentMarkup) => `
            <section class="rail-mtr-nearest-block rail-mtr-nearest-state">
                <div class="rail-mtr-section-head">
                    <div class="rail-summary-main">
                        <p class="rail-mtr-section-kicker">最近站</p>
                        ${summaryMarkup}
                    </div>
                    ${retryButton}
                </div>
                ${contentMarkup}
            </section>`;
        if (!hasCoordinateData) {
            return buildStateSection(
                `<h3 class="rail-summary-title">無法使用最近站</h3>`,
                `<section class="rail-empty-card"><h3 class="rail-empty-title">沒有座標資料</h3><p class="rail-empty-text">因此目前無法計算最近站。</p></section>`
            );
        }
        if (nearestState.status === "locating") {
            return buildStateSection(
                `<h3 class="rail-summary-title">正在找最近站</h3>`,
                `<section class="rail-loading-card"><span class="rail-loading-dot" aria-hidden="true"></span><div class="rail-loading-copy"><h3 class="rail-empty-title">定位中</h3><p class="rail-empty-text">如果瀏覽器詢問定位權限，請選擇允許。</p></div></section>`
            );
        }
        if (nearestState.status === "permissionDenied" || nearestState.status === "locationError" || nearestState.status === "notFound") {
            return buildStateSection(
                `<h3 class="rail-summary-title">最近站未就緒</h3><p class="rail-summary-text">${escapeHtml(nearestState.errorMessage || "暫時未能完成最近站定位。")}</p>`,
                ""
            );
        }
        if (!nearestState.nearestStation) {
            return buildStateSection(
                `<h3 class="rail-summary-title">最近站尚未取得</h3>`,
                ""
            );
        }
        const nearestStation = nearestState.nearestStation;
        const hasAnyAvailableSummary = nearestState.lineSummaries.some((summary) => summary.status === "success");
        const noServiceBannerMarkup = hasAnyAvailableSummary ? "" : buildNearestNoServiceBannerMarkup(nearestState.lineSummaries);
        return `
            <section class="rail-mtr-nearest-block">
                <div class="rail-mtr-summary-row">
                    <div class="rail-chip-row rail-mtr-chip-row">
                        <span class="rail-chip">最近站</span>
                        <span class="rail-chip">${escapeHtml(nearestStation.nameZh)}</span>
                        <span class="rail-chip">${escapeHtml(formatDistance(nearestStation.distanceMeters))}</span>
                    </div>
                    ${retryButton}
                </div>
                ${nearestState.status === "loading"
                    ? `<section class="rail-loading-card"><span class="rail-loading-dot" aria-hidden="true"></span><div class="rail-loading-copy"><h3 class="rail-empty-title">正在整理下一班車</h3><p class="rail-empty-text">已定位到 ${escapeHtml(nearestStation.nameZh)}，正在讀取各條相關綫路的即時資料。</p></div></section>`
                    : `${noServiceBannerMarkup}<section class="rail-nearest-line-grid">${nearestState.lineSummaries.map((summary) => buildNearestLineCard(summary)).join("")}</section>`}
            </section>`;
    }
    function buildMtrManualControlsMarkup(stationOptions) {
        return `
            <section class="rail-mtr-block rail-mtr-control-block">
                <div class="rail-mtr-section-head">
                    <div class="rail-summary-main">
                        <p class="rail-mtr-section-kicker">手動查詢</p>
                        <h3 class="rail-summary-title">綫路與車站</h3>
                    </div>
                </div>
                <div class="rail-selector-grid">
                    <label class="rail-field">
                        <span class="rail-field-label">綫路</span>
                        <select id="mtrLineSelect" class="rail-select">
                            <option value="">選擇港鐵綫路</option>
                            ${railState.mtr.lines.map((line) => `<option value="${escapeHtml(line.lineCode)}" ${line.lineCode === railState.mtr.lineCode ? "selected" : ""}>${escapeHtml(line.lineNameZh)} (${escapeHtml(line.lineCode)})</option>`).join("")}
                        </select>
                    </label>
                    <label class="rail-field">
                        <span class="rail-field-label">車站</span>
                        <select id="mtrStationSelect" class="rail-select" ${stationOptions.length === 0 ? "disabled" : ""}>
                            <option value="">${stationOptions.length === 0 ? "請先選擇綫路" : "選擇港鐵車站"}</option>
                            ${stationOptions.map((station) => `<option value="${escapeHtml(station.stationCode)}" ${station.stationCode === railState.mtr.stationCode ? "selected" : ""}>${escapeHtml(station.nameZh)} (${escapeHtml(station.stationCode)})</option>`).join("")}
                        </select>
                    </label>
                </div>
            </section>`;
    }
    function buildMtrManualResultHeader(selectedLine, selectedStation, schedule) {
        const refreshButton = selectedStation
            ? `<button type="button" id="mtrManualRefreshButton" class="rail-secondary-button rail-mtr-refresh-button" ${railState.mtr.manual.status === "loading" ? "disabled" : ""}>${railState.mtr.manual.status === "loading" ? "更新中..." : "重新整理"}</button>`
            : "";
        const summaryChips = [
            selectedLine ? `<span class="rail-chip">${escapeHtml(selectedLine.lineNameZh)}</span>` : "",
            selectedStation ? `<span class="rail-chip">${escapeHtml(selectedStation.nameZh)}</span>` : "",
            schedule ? `<span class="rail-chip">資料時間 ${escapeHtml(schedule.currentTimeLabel)}</span>` : "",
            schedule ? `<span class="rail-chip">系統時間 ${escapeHtml(schedule.systemTimeLabel)}</span>` : "",
            schedule && (schedule.isDelay || schedule.alertMessage) ? '<span class="rail-chip rail-chip-alert">服務提示</span>' : ""
        ].filter(Boolean).join("");
        return `
            <div class="rail-mtr-result-head">
                <div class="rail-summary-main">
                    <p class="rail-mtr-section-kicker">即時結果</p>
                    <h3 class="rail-summary-title">${selectedStation ? `${escapeHtml(selectedStation.nameZh)} 即時到站` : "港鐵即時到站"}</h3>
                </div>
                ${refreshButton}
            </div>
            ${summaryChips ? `<div class="rail-chip-row rail-mtr-chip-row">${summaryChips}</div>` : ""}`;
    }
    function buildManualTerminusCard(group) {
        return `<section class="rail-direction-card"><div class="rail-direction-header"><div><h4 class="rail-direction-title">${escapeHtml(group.terminusNameZh)}</h4><p class="rail-direction-subtitle">共有 ${group.services.length} 班可顯示班次</p></div><span class="rail-direction-count">${escapeHtml(group.services[0]?.minutesLabel || "時間未提供")}</span></div><div class="rail-service-list">${group.services.map((service) => `<article class="rail-service-card"><div class="rail-service-eta"><span class="rail-service-eta-value">${Number.isFinite(service.minutes) ? escapeHtml(String(service.minutes)) : "--"}</span><span class="rail-service-eta-label">${escapeHtml(service.minutesLabel)}</span></div><div class="rail-service-main"><div class="rail-service-header"><h5 class="rail-service-destination">${escapeHtml(group.terminusNameZh)}</h5><div class="rail-service-tags">${service.platform ? `<span class="rail-meta-pill">${escapeHtml(service.platform)}號月台</span>` : ""}${service.timeTypeLabel ? `<span class="rail-meta-pill">${escapeHtml(service.timeTypeLabel)}</span>` : ""}</div></div><p class="rail-service-time">預計 ${escapeHtml(service.clockTime)}${service.timeTypeLabel ? ` · ${escapeHtml(service.timeTypeLabel)}` : ""}</p>${service.notes.length > 0 ? `<ul class="rail-note-list">${service.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}</div></article>`).join("")}</div></section>`;
    }
    function buildMtrManualResultMarkup(selectedLine, selectedStation) {
        const headerMarkup = buildMtrManualResultHeader(selectedLine, selectedStation, railState.mtr.manual.schedule);
        let bodyMarkup = "";
        if (!selectedLine) {
            bodyMarkup = `<section class="rail-empty-card"><h3 class="rail-empty-title">先選一條港鐵綫路</h3><p class="rail-empty-text">請先從上方選擇綫路，再選車站後才會查詢官方即時到站資料。</p></section>`;
        } else if (!selectedStation) {
            bodyMarkup = `<section class="rail-empty-card"><h3 class="rail-empty-title">再選一個車站</h3><p class="rail-empty-text">已選擇 ${escapeHtml(selectedLine.lineNameZh)}。請繼續選車站，系統才會向官方港鐵 API 發出查詢。</p></section>`;
        } else if (railState.mtr.manual.status === "loading") {
            bodyMarkup = `<section class="rail-loading-card" aria-live="polite"><span class="rail-loading-dot" aria-hidden="true"></span><div class="rail-loading-copy"><h3 class="rail-empty-title">正在查詢港鐵即時到站</h3><p class="rail-empty-text">官方資料每十秒更新一次，現在正在讀取最新班次。</p></div></section>`;
        } else if (railState.mtr.manual.status === "error") {
            bodyMarkup = `<section class="rail-empty-card rail-empty-card-error"><h3 class="rail-empty-title">暫時無法載入港鐵資料</h3><p class="rail-empty-text">${escapeHtml(railState.mtr.manual.errorMessage || "官方港鐵 API 暫時沒有成功回應。")}</p></section>`;
        } else if (railState.mtr.manual.status === "empty" || !railState.mtr.manual.schedule) {
            bodyMarkup = `<section class="rail-empty-card"><h3 class="rail-empty-title">官方暫時沒有到站資料</h3><p class="rail-empty-text">這個站目前沒有可顯示的班次，稍後可以再重新整理一次。</p></section>`;
        } else {
            bodyMarkup = `${railState.mtr.manual.schedule.isDelay || railState.mtr.manual.schedule.alertMessage ? `<section class="rail-inline-banner"><strong>服務提示：</strong>${railState.mtr.manual.schedule.alertMessage ? `${escapeHtml(railState.mtr.manual.schedule.alertMessage)}` : "官方回應顯示目前列車服務可能有延誤，請以現場資訊為準。"}${railState.mtr.manual.schedule.alertUrl ? ` <a class="rail-inline-link" href="${escapeHtml(railState.mtr.manual.schedule.alertUrl)}" target="_blank" rel="noreferrer">查看官方安排</a>` : ""}</section>` : ""}<section class="rail-direction-grid">${railState.mtr.manual.schedule.terminusGroups.map((group) => buildManualTerminusCard(group)).join("")}</section>`;
        }
        return `<section class="rail-mtr-block rail-mtr-result-block">${headerMarkup}${bodyMarkup}</section>`;
    }
    function buildMtrMarkup() {
        return `
            <section class="rail-panel rail-mtr-panel">
                <div class="rail-mtr-panel-head">
                    <p class="rail-panel-title">最近港鐵站</p>
                </div>
                ${buildNearestSectionMarkup()}
            </section>`;
    }
    function buildLightRailMarkup() {
        const stopOptions = getLightRailStopOptions();
        const selectedRoute = railState.lightRail.routes.find((route) => route.routeCode === railState.lightRail.routeCode) || null;
        const selectedStop = railState.lightRail.stopIndex[railState.lightRail.stopId] || null;
        const summaryMarkup = selectedStop ? `<section class="rail-summary-card"><div class="rail-chip-row"><span class="rail-chip">輕鐵</span>${selectedRoute ? `<span class="rail-chip">路線 ${escapeHtml(selectedRoute.routeCode)}</span>` : ""}</div><div class="rail-summary-main"><h3 class="rail-summary-title">${escapeHtml(selectedStop.nameZh)}</h3><p class="rail-summary-text">已完成輕鐵路線與站點索引。下一步會在這裡接入按站點查詢的即時到站資料。</p></div></section>` : `<section class="rail-empty-card"><h3 class="rail-empty-title">輕鐵 tab 已就緒</h3><p class="rail-empty-text">可以先用路線篩選站點。這一輪先維持靜態索引，不接即時輕鐵資料。</p></section>`;
        return `<section class="rail-panel"><h2 class="rail-panel-title">輕鐵靜態索引</h2><div class="rail-selector-grid"><label class="rail-field"><span class="rail-field-label">路線</span><select id="lightRailRouteSelect" class="rail-select"><option value="">全部輕鐵路線</option>${railState.lightRail.routes.map((route) => `<option value="${escapeHtml(route.routeCode)}" ${route.routeCode === railState.lightRail.routeCode ? "selected" : ""}>路線 ${escapeHtml(route.routeCode)}</option>`).join("")}</select><span class="rail-field-hint">資料來自官方 <code>light_rail_routes_and_stops.csv</code>。</span></label><label class="rail-field"><span class="rail-field-label">站點</span><select id="lightRailStopSelect" class="rail-select"><option value="">選擇輕鐵站點</option>${stopOptions.map((stop) => `<option value="${escapeHtml(stop.stopId)}" ${stop.stopId === railState.lightRail.stopId ? "selected" : ""}>${escapeHtml(stop.nameZh)} (${escapeHtml(stop.stopCode)})</option>`).join("")}</select><span class="rail-field-hint">輕鐵即時到站會在下一輪以 <code>station_id</code> 串接官方 API。</span></label></div></section>${summaryMarkup}`;
    }
    function renderCurrentTab() {
        syncTabButtons();
        if (!railState.ui.isReady) {
            contentElement.innerHTML = `<section class="rail-empty-card"><h2 class="rail-empty-title">載入中</h2><p class="rail-empty-text">正在整理官方鐵路靜態索引...</p></section>`;
            return;
        }
        contentElement.innerHTML = railState.currentTab === "lightRail" ? buildLightRailMarkup() : buildMtrMarkup();
    }
    function bindCurrentTabEvents() {
        const mtrNearestRetryButton = document.getElementById("mtrNearestRetryButton");
        const lightRailRouteSelect = document.getElementById("lightRailRouteSelect");
        const lightRailStopSelect = document.getElementById("lightRailStopSelect");
        if (mtrNearestRetryButton instanceof HTMLButtonElement) mtrNearestRetryButton.addEventListener("click", () => requestNearestMtrSummary(true));
        if (lightRailRouteSelect instanceof HTMLSelectElement) {
            lightRailRouteSelect.addEventListener("change", () => {
                railState.lightRail.routeCode = lightRailRouteSelect.value;
                railState.lightRail.stopId = "";
                setStatus("已更新輕鐵路線篩選，這一輪只更新靜態選擇器。", "info");
                renderCurrentTab();
                bindCurrentTabEvents();
            });
        }
        if (lightRailStopSelect instanceof HTMLSelectElement) {
            lightRailStopSelect.addEventListener("change", () => {
                railState.lightRail.stopId = lightRailStopSelect.value;
                setStatus(railState.lightRail.stopId ? "輕鐵靜態索引已定位到指定站點，下一階段會接即時到站。" : "已清除輕鐵站點選擇。", "info");
                renderCurrentTab();
                bindCurrentTabEvents();
            });
        }
    }
    function maybeStartNearestMtrSummary() {
        if (railState.currentTab === "mtr" && !railState.mtr.nearest.hasAttempted) requestNearestMtrSummary(false);
    }
    function initializeIndex() {
        if (!railIndex?.heavyRail || !railIndex?.lightRail) {
            setStatus("找不到官方鐵路靜態索引，請先生成 official-rail-index.*。", "error");
            renderCurrentTab();
            return;
        }
        railState.mtr.lines = Array.isArray(railIndex.heavyRail.lines) ? railIndex.heavyRail.lines : [];
        railState.mtr.stationIndex = railIndex.heavyRail.stationIndex || {};
        railState.lightRail.routes = Array.isArray(railIndex.lightRail.routes) ? railIndex.lightRail.routes : [];
        railState.lightRail.stopIndex = railIndex.lightRail.stopIndex || {};
        railState.ui.isReady = true;
        setStatus(`已載入官方靜態索引：港鐵 <strong>${railIndex.heavyRail.lineCount}</strong> 條綫 / <strong>${railIndex.heavyRail.stationCount}</strong> 個車站，輕鐵 <strong>${railIndex.lightRail.routeCount}</strong> 條路線 / <strong>${railIndex.lightRail.stopCount}</strong> 個站點。`, "info");
        renderCurrentTab();
        bindCurrentTabEvents();
        maybeStartNearestMtrSummary();
    }
    for (const button of tabButtons) {
        button.addEventListener("click", () => {
            const nextTab = button.getAttribute("data-tab-trigger") || "";
            if (!nextTab || railState.currentTab === nextTab) return;
            railState.currentTab = nextTab;
            setStatus(nextTab === "lightRail" ? "已切換到輕鐵頁殼，這一輪只載入靜態路線與站點資料。" : "已切換到港鐵頁殼，可使用最近站摘要與手動即時查詢。", "info");
            renderCurrentTab();
            bindCurrentTabEvents();
            maybeStartNearestMtrSummary();
        });
    }
    renderCurrentTab();
    initializeIndex();
})();
