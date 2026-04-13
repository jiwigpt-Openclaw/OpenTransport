(() => {
    const MTR_SCHEDULE_ENDPOINT = "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php";
    const MTR_DIRECTION_CONFIG = [
        { apiKey: "UP", label: "上行" },
        { apiKey: "DOWN", label: "下行" }
    ];

    const statusElement = document.getElementById("railStatus");
    const contentElement = document.getElementById("railContent");
    const tabButtons = Array.from(document.querySelectorAll("[data-tab-trigger]"));

    if (!(statusElement instanceof HTMLElement) || !(contentElement instanceof HTMLElement)) {
        return;
    }

    const railIndex = window.__OFFICIAL_RAIL_INDEX__ || null;
    const railState = {
        currentTab: "mtr",
        mtr: {
            lineCode: "",
            stationCode: "",
            lines: [],
            stationIndex: {},
            fetchStatus: "idle",
            errorMessage: "",
            schedule: null,
            requestId: 0,
            activeController: null
        },
        lightRail: {
            routeCode: "",
            stopId: "",
            routes: [],
            stopIndex: {}
        },
        ui: {
            isReady: false,
            statusKind: "info",
            statusMessage: "正在準備官方靜態索引..."
        }
    };

    function escapeHtml(value) {
        return String(value || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
    }

    function setStatus(message, kind = "info") {
        railState.ui.statusMessage = message;
        railState.ui.statusKind = kind;
        statusElement.className = `rail-status rail-status-${kind}`;
        statusElement.innerHTML = message;
    }

    function syncTabButtons() {
        for (const button of tabButtons) {
            const tab = button.getAttribute("data-tab-trigger") || "";
            const isActive = tab === railState.currentTab;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        }
    }

    function parseApiDateTime(value) {
        const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
        if (!match) {
            return null;
        }

        const [, year, month, day, hour, minute, second] = match;
        return new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second)
        );
    }

    function formatClockTime(value) {
        const parsed = parseApiDateTime(value);
        if (!parsed) {
            return value || "--";
        }

        return new Intl.DateTimeFormat("zh-HK", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).format(parsed);
    }

    function resolveMinutes(ttntValue, currentTime, serviceTime) {
        const parsedMinutes = Number.parseInt(String(ttntValue || ""), 10);
        if (Number.isFinite(parsedMinutes)) {
            return Math.max(0, parsedMinutes);
        }

        const currentDate = parseApiDateTime(currentTime);
        const serviceDate = parseApiDateTime(serviceTime);
        if (!currentDate || !serviceDate) {
            return null;
        }

        return Math.max(0, Math.round((serviceDate.getTime() - currentDate.getTime()) / 60000));
    }

    function formatMinutesLabel(minutes) {
        if (!Number.isFinite(minutes)) {
            return "時間未提供";
        }

        if (minutes <= 0) {
            return "即將到站";
        }

        return `${minutes} 分鐘`;
    }

    function getTimeTypeLabel(timeType) {
        if (timeType === "A") {
            return "到達";
        }

        if (timeType === "D") {
            return "開出";
        }

        return "";
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

    function getLightRailStopOptions() {
        if (!railState.lightRail.routeCode) {
            return Object.values(railState.lightRail.stopIndex).sort((left, right) => left.nameZh.localeCompare(right.nameZh, "zh-HK"));
        }

        const selectedRoute = railState.lightRail.routes.find((route) => route.routeCode === railState.lightRail.routeCode);
        if (!selectedRoute) {
            return [];
        }

        const stopMap = new Map();
        for (const directionEntry of selectedRoute.directions || []) {
            for (const stopEntry of directionEntry.stops || []) {
                if (!stopMap.has(stopEntry.stopId)) {
                    stopMap.set(stopEntry.stopId, {
                        stopId: stopEntry.stopId,
                        stopCode: stopEntry.stopCode,
                        nameZh: stopEntry.nameZh,
                        nameEn: stopEntry.nameEn
                    });
                }
            }
        }

        return [...stopMap.values()].sort((left, right) => left.nameZh.localeCompare(right.nameZh, "zh-HK"));
    }

    function abortActiveMtrRequest() {
        if (railState.mtr.activeController instanceof AbortController) {
            railState.mtr.activeController.abort();
        }
        railState.mtr.activeController = null;
    }

    function resetMtrRealtimeState() {
        abortActiveMtrRequest();
        railState.mtr.fetchStatus = "idle";
        railState.mtr.errorMessage = "";
        railState.mtr.schedule = null;
    }

    function resolveMtrStationName(stationCode) {
        const stationEntry = railState.mtr.stationIndex[String(stationCode || "").toUpperCase()] || null;
        return stationEntry?.nameZh || stationCode || "未命名目的地";
    }

    function buildMtrServiceNotes(entry) {
        const notes = [];

        if (entry.source && entry.source !== "-") {
            notes.push(entry.source);
        }

        if (entry.route) {
            notes.push(entry.route === "RAC" ? "經馬場站" : `路線資訊 ${entry.route}`);
        }

        if (entry.valid && entry.valid !== "Y") {
            notes.push("官方資料未標記為有效班次");
        }

        return notes;
    }

    function normalizeMtrService(service, directionLabel, responseTime) {
        const destinationCode = String(service.dest || "").toUpperCase();
        const minutes = resolveMinutes(service.ttnt, responseTime, service.time);
        const timeTypeLabel = getTimeTypeLabel(service.timeType);

        return {
            id: [
                directionLabel,
                service.seq || "",
                service.time || "",
                destinationCode || "",
                service.plat || ""
            ].join("-"),
            sequence: Number.parseInt(String(service.seq || ""), 10) || null,
            destinationCode,
            destinationNameZh: resolveMtrStationName(destinationCode),
            platform: String(service.plat || "").trim(),
            scheduleTime: String(service.time || "").trim(),
            clockTime: formatClockTime(service.time),
            minutes,
            minutesLabel: formatMinutesLabel(minutes),
            timeType: String(service.timeType || "").trim(),
            timeTypeLabel,
            route: String(service.route || "").trim(),
            valid: String(service.valid || "").trim(),
            source: String(service.source || "").trim(),
            notes: buildMtrServiceNotes(service)
        };
    }

    function normalizeMtrDirection(directionConfig, entry, responseTime) {
        const rawServices = Array.isArray(entry) ? entry : [];
        const services = rawServices
            .filter((service) => service && typeof service === "object")
            .map((service) => normalizeMtrService(service, directionConfig.apiKey, responseTime));

        return {
            apiKey: directionConfig.apiKey,
            label: directionConfig.label,
            services,
            hasData: services.length > 0
        };
    }

    function normalizeMtrScheduleResponse(payload, lineCode, stationCode) {
        const queryKey = `${lineCode}-${stationCode}`;
        const rawEntry = payload?.data?.[queryKey] || Object.values(payload?.data || {})[0] || null;
        const selectedLine = getSelectedMtrLine();
        const selectedStation = getSelectedMtrStation();
        const responseTime = rawEntry?.curr_time || payload?.curr_time || "";
        const systemTime = rawEntry?.sys_time || payload?.sys_time || "";
        const directions = MTR_DIRECTION_CONFIG.map((directionConfig) => normalizeMtrDirection(directionConfig, rawEntry?.[directionConfig.apiKey], responseTime));

        return {
            queryKey,
            lineCode,
            lineNameZh: selectedLine?.lineNameZh || lineCode,
            stationCode,
            stationNameZh: selectedStation?.nameZh || stationCode,
            stationNameEn: selectedStation?.nameEn || stationCode,
            currentTime: responseTime,
            currentTimeLabel: formatClockTime(responseTime),
            systemTime,
            systemTimeLabel: formatClockTime(systemTime),
            isDelay: payload?.isdelay === "Y",
            alertMessage: payload?.message && payload.message !== "successful" ? String(payload.message) : "",
            alertUrl: payload?.url ? String(payload.url) : "",
            directions,
            hasAnyData: directions.some((direction) => direction.hasData)
        };
    }

    async function fetchMtrSchedule(lineCode, stationCode, signal) {
        const query = new URLSearchParams({
            line: lineCode,
            sta: stationCode
        });
        const response = await fetch(`${MTR_SCHEDULE_ENDPOINT}?${query.toString()}`, {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            signal
        });

        if (!response.ok) {
            throw new Error(`官方港鐵 API 暫時無法回應（HTTP ${response.status}）。`);
        }

        const payload = await response.json();
        if (payload?.status !== 1) {
            throw new Error(payload?.error?.errorMsg || payload?.message || "官方港鐵 API 暫時未能提供資料。");
        }

        return normalizeMtrScheduleResponse(payload, lineCode, stationCode);
    }

    async function requestMtrSchedule() {
        const selectedLine = getSelectedMtrLine();
        const selectedStation = getSelectedMtrStation();

        if (!selectedLine || !selectedStation) {
            resetMtrRealtimeState();
            renderCurrentTab();
            bindCurrentTabEvents();
            return;
        }

        abortActiveMtrRequest();

        const requestId = railState.mtr.requestId + 1;
        const controller = new AbortController();

        railState.mtr.requestId = requestId;
        railState.mtr.activeController = controller;
        railState.mtr.fetchStatus = "loading";
        railState.mtr.errorMessage = "";
        railState.mtr.schedule = null;

        setStatus(
            `正在讀取 <strong>${escapeHtml(selectedLine.lineNameZh)}</strong> <strong>${escapeHtml(selectedStation.nameZh)}</strong> 的港鐵即時到站資料...`,
            "info"
        );
        renderCurrentTab();
        bindCurrentTabEvents();

        try {
            const normalizedSchedule = await fetchMtrSchedule(selectedLine.lineCode, selectedStation.stationCode, controller.signal);

            if (railState.mtr.requestId !== requestId) {
                return;
            }

            railState.mtr.schedule = normalizedSchedule;
            railState.mtr.fetchStatus = normalizedSchedule.hasAnyData ? "success" : "empty";
            railState.mtr.errorMessage = "";

            setStatus(
                normalizedSchedule.hasAnyData
                    ? `已更新 <strong>${escapeHtml(normalizedSchedule.lineNameZh)}</strong> <strong>${escapeHtml(normalizedSchedule.stationNameZh)}</strong> 的即時到站資料。`
                    : `官方目前沒有提供 <strong>${escapeHtml(normalizedSchedule.stationNameZh)}</strong> 的可用到站資料。`,
                normalizedSchedule.hasAnyData ? "info" : "warning"
            );
        } catch (error) {
            if (controller.signal.aborted || railState.mtr.requestId !== requestId) {
                return;
            }

            railState.mtr.fetchStatus = "error";
            railState.mtr.errorMessage = error instanceof Error ? error.message : "目前未能載入港鐵即時到站資料。";
            railState.mtr.schedule = null;

            setStatus(railState.mtr.errorMessage, "error");
        } finally {
            if (railState.mtr.requestId !== requestId) {
                return;
            }

            railState.mtr.activeController = null;
            renderCurrentTab();
            bindCurrentTabEvents();
        }
    }

    function buildMtrResultHeader(selectedLine, selectedStation, schedule) {
        const lastUpdatedMarkup = schedule
            ? `
                <span class="rail-chip">資料時間 ${escapeHtml(schedule.currentTimeLabel)}</span>
                <span class="rail-chip">系統時間 ${escapeHtml(schedule.systemTimeLabel)}</span>
                ${schedule.isDelay || schedule.alertMessage ? '<span class="rail-chip rail-chip-alert">服務提示</span>' : ""}
            `
            : "";

        return `
            <section class="rail-summary-card rail-result-header-card">
                <div class="rail-result-header-main">
                    <div class="rail-chip-row">
                        <span class="rail-chip">港鐵</span>
                        <span class="rail-chip">${escapeHtml(selectedLine.lineNameZh)}</span>
                        <span class="rail-chip">${escapeHtml(selectedStation.nameZh)}</span>
                        ${lastUpdatedMarkup}
                    </div>
                    <div class="rail-summary-main">
                        <h3 class="rail-summary-title">${escapeHtml(selectedStation.nameZh)} 即時到站</h3>
                        <p class="rail-summary-text">只會在你選定綫路與車站後，才向官方港鐵即時到站 API 發送查詢。</p>
                    </div>
                </div>
                <button type="button" id="mtrRefreshButton" class="rail-secondary-button" ${railState.mtr.fetchStatus === "loading" ? "disabled" : ""}>
                    ${railState.mtr.fetchStatus === "loading" ? "更新中..." : "重新整理"}
                </button>
            </section>
        `;
    }

    function buildMtrDirectionCard(direction) {
        if (!direction.hasData) {
            return `
                <section class="rail-direction-card">
                    <div class="rail-direction-header">
                        <div>
                            <p class="rail-direction-kicker">${escapeHtml(direction.apiKey)}</p>
                            <h4 class="rail-direction-title">${escapeHtml(direction.label)}</h4>
                        </div>
                        <span class="rail-direction-count">0 班</span>
                    </div>
                    <div class="rail-direction-empty">
                        這個方向目前沒有官方到站資料。
                    </div>
                </section>
            `;
        }

        return `
            <section class="rail-direction-card">
                <div class="rail-direction-header">
                    <div>
                        <p class="rail-direction-kicker">${escapeHtml(direction.apiKey)}</p>
                        <h4 class="rail-direction-title">${escapeHtml(direction.label)}</h4>
                    </div>
                    <span class="rail-direction-count">${direction.services.length} 班</span>
                </div>
                <div class="rail-service-list">
                    ${direction.services.map((service) => `
                        <article class="rail-service-card">
                            <div class="rail-service-eta">
                                <span class="rail-service-eta-value">${Number.isFinite(service.minutes) ? escapeHtml(String(service.minutes)) : "--"}</span>
                                <span class="rail-service-eta-label">${escapeHtml(service.minutesLabel)}</span>
                            </div>
                            <div class="rail-service-main">
                                <div class="rail-service-header">
                                    <h5 class="rail-service-destination">${escapeHtml(service.destinationNameZh)}</h5>
                                    <div class="rail-service-tags">
                                        ${service.platform ? `<span class="rail-meta-pill">月台 ${escapeHtml(service.platform)}</span>` : ""}
                                        ${service.timeTypeLabel ? `<span class="rail-meta-pill">${escapeHtml(service.timeTypeLabel)}</span>` : ""}
                                    </div>
                                </div>
                                <p class="rail-service-time">預計 ${escapeHtml(service.clockTime)} 到站</p>
                                ${service.notes.length > 0 ? `
                                    <ul class="rail-note-list">
                                        ${service.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
                                    </ul>
                                ` : ""}
                            </div>
                        </article>
                    `).join("")}
                </div>
            </section>
        `;
    }

    function buildMtrResultMarkup(selectedLine, selectedStation) {
        if (!selectedLine) {
            return `
                <section class="rail-empty-card">
                    <h3 class="rail-empty-title">先選一條港鐵綫路</h3>
                    <p class="rail-empty-text">請先從上方選擇綫路，再選擇車站後才會查詢官方即時到站資料。</p>
                </section>
            `;
        }

        if (!selectedStation) {
            return `
                <section class="rail-empty-card">
                    <h3 class="rail-empty-title">再選一個車站</h3>
                    <p class="rail-empty-text">已選擇 ${escapeHtml(selectedLine.lineNameZh)}。請繼續選車站，系統才會向官方港鐵 API 發出查詢。</p>
                </section>
            `;
        }

        const headerMarkup = buildMtrResultHeader(selectedLine, selectedStation, railState.mtr.schedule);

        if (railState.mtr.fetchStatus === "loading") {
            return `
                ${headerMarkup}
                <section class="rail-loading-card" aria-live="polite">
                    <span class="rail-loading-dot" aria-hidden="true"></span>
                    <div class="rail-loading-copy">
                        <h3 class="rail-empty-title">正在查詢港鐵即時到站</h3>
                        <p class="rail-empty-text">官方資料每十秒更新一次，現在正在讀取最新班次。</p>
                    </div>
                </section>
            `;
        }

        if (railState.mtr.fetchStatus === "error") {
            return `
                ${headerMarkup}
                <section class="rail-empty-card rail-empty-card-error">
                    <h3 class="rail-empty-title">暫時無法載入港鐵資料</h3>
                    <p class="rail-empty-text">${escapeHtml(railState.mtr.errorMessage || "官方港鐵 API 暫時沒有成功回應。")}</p>
                </section>
            `;
        }

        if (railState.mtr.fetchStatus === "empty" || !railState.mtr.schedule) {
            return `
                ${headerMarkup}
                <section class="rail-empty-card">
                    <h3 class="rail-empty-title">官方暫時沒有到站資料</h3>
                    <p class="rail-empty-text">這個站目前沒有可顯示的上行或下行班次，稍後可以再重新整理一次。</p>
                </section>
            `;
        }

        return `
            ${headerMarkup}
            ${railState.mtr.schedule.isDelay || railState.mtr.schedule.alertMessage ? `
                <section class="rail-inline-banner">
                    <strong>服務提示：</strong>
                    ${railState.mtr.schedule.alertMessage
                        ? `${escapeHtml(railState.mtr.schedule.alertMessage)}`
                        : "官方回應顯示目前列車服務可能有延誤，請以現場資訊為準。"}
                    ${railState.mtr.schedule.alertUrl
                        ? ` <a class="rail-inline-link" href="${escapeHtml(railState.mtr.schedule.alertUrl)}" target="_blank" rel="noreferrer">查看官方安排</a>`
                        : ""}
                </section>
            ` : ""}
            <section class="rail-direction-grid">
                ${railState.mtr.schedule.directions.map((direction) => buildMtrDirectionCard(direction)).join("")}
            </section>
        `;
    }

    function buildMtrMarkup() {
        const stationOptions = getMtrStationOptions();
        const selectedLine = getSelectedMtrLine();
        const selectedStation = getSelectedMtrStation();

        return `
            <section class="rail-panel">
                <h2 class="rail-panel-title">港鐵即時到站</h2>
                <div class="rail-selector-grid">
                    <label class="rail-field">
                        <span class="rail-field-label">綫路</span>
                        <select id="mtrLineSelect" class="rail-select">
                            <option value="">選擇港鐵綫路</option>
                            ${railState.mtr.lines.map((line) => `
                                <option value="${escapeHtml(line.lineCode)}" ${line.lineCode === railState.mtr.lineCode ? "selected" : ""}>
                                    ${escapeHtml(line.lineNameZh)} (${escapeHtml(line.lineCode)})
                                </option>
                            `).join("")}
                        </select>
                        <span class="rail-field-hint">綫路與車站索引來自官方 mtr_lines_and_stations.csv。</span>
                    </label>

                    <label class="rail-field">
                        <span class="rail-field-label">車站</span>
                        <select id="mtrStationSelect" class="rail-select" ${stationOptions.length === 0 ? "disabled" : ""}>
                            <option value="">${stationOptions.length === 0 ? "請先選擇綫路" : "選擇港鐵車站"}</option>
                            ${stationOptions.map((station) => `
                                <option value="${escapeHtml(station.stationCode)}" ${station.stationCode === railState.mtr.stationCode ? "selected" : ""}>
                                    ${escapeHtml(station.nameZh)} (${escapeHtml(station.stationCode)})
                                </option>
                            `).join("")}
                        </select>
                        <span class="rail-field-hint">選定綫路與車站後，才會向官方 <code>line + sta</code> 即時 API 查詢。</span>
                    </label>
                </div>
            </section>
            ${buildMtrResultMarkup(selectedLine, selectedStation)}
        `;
    }

    function buildLightRailMarkup() {
        const stopOptions = getLightRailStopOptions();
        const selectedRoute = railState.lightRail.routes.find((route) => route.routeCode === railState.lightRail.routeCode) || null;
        const selectedStop = railState.lightRail.stopIndex[railState.lightRail.stopId] || null;

        const summaryMarkup = selectedStop
            ? `
                <section class="rail-summary-card">
                    <div class="rail-chip-row">
                        <span class="rail-chip">輕鐵</span>
                        ${selectedRoute ? `<span class="rail-chip">路線 ${escapeHtml(selectedRoute.routeCode)}</span>` : ""}
                    </div>
                    <div class="rail-summary-main">
                        <h3 class="rail-summary-title">${escapeHtml(selectedStop.nameZh)}</h3>
                        <p class="rail-summary-text">
                            已完成輕鐵路線與站點索引。下一步會在這裡接入按站點查詢的即時到站資料。
                        </p>
                    </div>
                </section>
            `
            : `
                <section class="rail-empty-card">
                    <h3 class="rail-empty-title">輕鐵 tab 已就緒</h3>
                    <p class="rail-empty-text">可以先用路線篩選站點。這一輪先完成靜態索引，不接即時輕鐵資料。</p>
                </section>
            `;

        return `
            <section class="rail-panel">
                <h2 class="rail-panel-title">輕鐵靜態索引</h2>
                <div class="rail-selector-grid">
                    <label class="rail-field">
                        <span class="rail-field-label">路線</span>
                        <select id="lightRailRouteSelect" class="rail-select">
                            <option value="">全部輕鐵路線</option>
                            ${railState.lightRail.routes.map((route) => `
                                <option value="${escapeHtml(route.routeCode)}" ${route.routeCode === railState.lightRail.routeCode ? "selected" : ""}>
                                    路線 ${escapeHtml(route.routeCode)}
                                </option>
                            `).join("")}
                        </select>
                        <span class="rail-field-hint">資料來自官方 light_rail_routes_and_stops.csv。</span>
                    </label>

                    <label class="rail-field">
                        <span class="rail-field-label">站點</span>
                        <select id="lightRailStopSelect" class="rail-select">
                            <option value="">選擇輕鐵站點</option>
                            ${stopOptions.map((stop) => `
                                <option value="${escapeHtml(stop.stopId)}" ${stop.stopId === railState.lightRail.stopId ? "selected" : ""}>
                                    ${escapeHtml(stop.nameZh)} (${escapeHtml(stop.stopCode)})
                                </option>
                            `).join("")}
                        </select>
                        <span class="rail-field-hint">輕鐵即時到站會在下一輪以 station_id 串接官方 API。</span>
                    </label>
                </div>
            </section>
            ${summaryMarkup}
        `;
    }

    function renderCurrentTab() {
        syncTabButtons();
        if (!railState.ui.isReady) {
            contentElement.innerHTML = `
                <section class="rail-empty-card">
                    <h2 class="rail-empty-title">載入中</h2>
                    <p class="rail-empty-text">正在整理官方鐵路靜態索引...</p>
                </section>
            `;
            return;
        }

        contentElement.innerHTML = railState.currentTab === "lightRail"
            ? buildLightRailMarkup()
            : buildMtrMarkup();
    }

    function bindCurrentTabEvents() {
        const mtrLineSelect = document.getElementById("mtrLineSelect");
        const mtrStationSelect = document.getElementById("mtrStationSelect");
        const mtrRefreshButton = document.getElementById("mtrRefreshButton");
        const lightRailRouteSelect = document.getElementById("lightRailRouteSelect");
        const lightRailStopSelect = document.getElementById("lightRailStopSelect");

        if (mtrLineSelect instanceof HTMLSelectElement) {
            mtrLineSelect.addEventListener("change", () => {
                railState.mtr.lineCode = mtrLineSelect.value;
                railState.mtr.stationCode = "";
                resetMtrRealtimeState();
                setStatus("已切換港鐵綫路，請再選擇車站以查詢即時到站。", "info");
                renderCurrentTab();
                bindCurrentTabEvents();
            });
        }

        if (mtrStationSelect instanceof HTMLSelectElement) {
            mtrStationSelect.addEventListener("change", () => {
                railState.mtr.stationCode = mtrStationSelect.value;

                if (!railState.mtr.stationCode) {
                    resetMtrRealtimeState();
                    setStatus("已清除港鐵車站選擇。", "info");
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }

                requestMtrSchedule();
            });
        }

        if (mtrRefreshButton instanceof HTMLButtonElement) {
            mtrRefreshButton.addEventListener("click", () => {
                requestMtrSchedule();
            });
        }

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
                setStatus(
                    railState.lightRail.stopId
                        ? "輕鐵靜態索引已定位到指定站點，下一階段會接即時到站。"
                        : "已清除輕鐵站點選擇。",
                    "info"
                );
                renderCurrentTab();
                bindCurrentTabEvents();
            });
        }
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

        setStatus(
            `已載入官方靜態索引：港鐵 <strong>${railIndex.heavyRail.lineCount}</strong> 條綫 / <strong>${railIndex.heavyRail.stationCount}</strong> 個車站，輕鐵 <strong>${railIndex.lightRail.routeCount}</strong> 條路線 / <strong>${railIndex.lightRail.stopCount}</strong> 個站點。`,
            "info"
        );

        renderCurrentTab();
        bindCurrentTabEvents();
    }

    for (const button of tabButtons) {
        button.addEventListener("click", () => {
            const nextTab = button.getAttribute("data-tab-trigger") || "";
            if (!nextTab || railState.currentTab === nextTab) {
                return;
            }

            railState.currentTab = nextTab;
            setStatus(
                nextTab === "lightRail"
                    ? "已切換到輕鐵頁殼，這一輪只載入靜態路線與站點資料。"
                    : "已切換到港鐵頁殼，可直接查詢官方即時到站資料。",
                "info"
            );
            renderCurrentTab();
            bindCurrentTabEvents();
        });
    }

    renderCurrentTab();
    initializeIndex();
})();
