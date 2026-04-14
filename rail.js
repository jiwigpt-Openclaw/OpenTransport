(() => {
    const MTR_SCHEDULE_ENDPOINT = "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php";
    const MTR_DIRECTION_CONFIG = [{ apiKey: "UP", label: "上行" }, { apiKey: "DOWN", label: "下行" }];
    const MTR_LINE_STYLE_MAP = {
        AEL: { color: "#008A8B" },
        DRL: { color: "#F173AC" },
        EAL: { color: "#12B9ED" },
        ISL: { color: "#007DC5" },
        KTL: { color: "#00AF40" },
        SIL: { color: "#BDCF00" },
        TCL: { color: "#FF8F1B" },
        TKL: { color: "#8743A2" },
        TKZ: { color: "#8743A2" },
        TML: { color: "#9E2600" },
        TWL: { color: "#EC1D24" }
    };
    const MTR_ROUTE_VIEW_PRESETS = [
        { id: "recommended", label: "建議路線", rideCost: 1, transferCost: 4 },
        { id: "fewerTransfers", label: "較少轉線", rideCost: 1, transferCost: 8 },
        { id: "fewerStops", label: "較少站數", rideCost: 1, transferCost: 2 }
    ];
    const officialMtrMap = window.__OFFICIAL_MTR_MAP__ || null;
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
            },
            routePlanner: {
                isOpen: false,
                activeField: "destination",
                activeViewId: "",
                lastMapFocusKey: "",
                originStationCode: "",
                destinationStationCode: "",
                result: null,
                hasAutoFilledOrigin: false,
                hasUserEditedOrigin: false,
                hasUserEditedDestination: false
            },
            routing: {
                runtime: null,
                lineGroups: [],
                transferStationCodes: [],
                officialMap: null
            }
        },
        lightRail: { routeCode: "", stopId: "", routes: [], stopIndex: {} },
        ui: { isReady: false, statusKind: "info", statusMessage: "正在準備官方靜態索引..." }
    };

    function escapeHtml(value) {
        return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
    }
    function getMtrOfficialLineColor(lineCode) {
        return MTR_LINE_STYLE_MAP[String(lineCode || "").toUpperCase()]?.color || "#5A7694";
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
    function getMtrStationByCode(stationCode) {
        if (!stationCode) return null;
        return railState.mtr.stationIndex[String(stationCode).toUpperCase()] || null;
    }
    function getMtrRouteNodeId(lineCode, stationCode) {
        return `${lineCode}:${stationCode}`;
    }
    function addMtrRouteEdge(adjacency, fromNodeId, edge) {
        const entries = adjacency.get(fromNodeId) || [];
        entries.push(edge);
        adjacency.set(fromNodeId, entries);
    }
    function buildMtrRoutingRuntime(lines, stationIndex) {
        const lineOrder = new Map((Array.isArray(lines) ? lines : []).map((line, index) => [line.lineCode, index]));
        const pathMap = new Map();

        for (const line of Array.isArray(lines) ? lines : []) {
            for (const directionCode of Array.isArray(line.directions) ? line.directions : []) {
                const orderedStations = (Array.isArray(line.stations) ? line.stations : [])
                    .filter((station) => Number.isFinite(Number(station?.sequences?.[directionCode])))
                    .sort((left, right) => Number(left.sequences[directionCode]) - Number(right.sequences[directionCode]));

                if (orderedStations.length < 2) continue;

                const stationCodes = orderedStations.map((station) => station.stationCode);
                const reversedCodes = [...stationCodes].reverse();
                const canonicalSignature = stationCodes.join(">") < reversedCodes.join(">") ? stationCodes.join(">") : reversedCodes.join(">");
                const pathKey = `${line.lineCode}:${canonicalSignature}`;

                if (!pathMap.has(pathKey)) {
                    const firstCode = stationCodes[0];
                    const lastCode = stationCodes[stationCodes.length - 1];
                    pathMap.set(pathKey, {
                        pathId: pathKey,
                        lineCode: line.lineCode,
                        lineNameZh: line.lineNameZh,
                        lineNameEn: line.lineNameEn,
                        stationCodes,
                        directionCodes: new Set([directionCode]),
                        terminusStartCode: firstCode,
                        terminusEndCode: lastCode,
                        terminusStartNameZh: stationIndex[firstCode]?.nameZh || firstCode,
                        terminusEndNameZh: stationIndex[lastCode]?.nameZh || lastCode
                    });
                } else {
                    pathMap.get(pathKey).directionCodes.add(directionCode);
                }
            }
        }

        const paths = [...pathMap.values()]
            .map((pathEntry) => ({
                ...pathEntry,
                directionCodes: [...pathEntry.directionCodes].sort()
            }))
            .sort((left, right) => {
                const leftOrder = lineOrder.get(left.lineCode) ?? Number.MAX_SAFE_INTEGER;
                const rightOrder = lineOrder.get(right.lineCode) ?? Number.MAX_SAFE_INTEGER;
                if (leftOrder !== rightOrder) return leftOrder - rightOrder;
                return left.pathId.localeCompare(right.pathId, "en");
            });

        const adjacency = new Map();
        const rideEdgeKeys = new Set();
        const transferStationCodes = [];

        for (const pathEntry of paths) {
            for (let index = 0; index < pathEntry.stationCodes.length; index += 1) {
                const stationCode = pathEntry.stationCodes[index];
                const nodeId = getMtrRouteNodeId(pathEntry.lineCode, stationCode);
                if (!adjacency.has(nodeId)) adjacency.set(nodeId, []);

                if (index >= pathEntry.stationCodes.length - 1) continue;
                const nextStationCode = pathEntry.stationCodes[index + 1];
                const segmentKey = `${pathEntry.lineCode}:${[stationCode, nextStationCode].sort().join("|")}`;
                if (rideEdgeKeys.has(segmentKey)) continue;
                rideEdgeKeys.add(segmentKey);

                const fromNodeId = getMtrRouteNodeId(pathEntry.lineCode, stationCode);
                const toNodeId = getMtrRouteNodeId(pathEntry.lineCode, nextStationCode);
                const edge = {
                    kind: "ride",
                    lineCode: pathEntry.lineCode,
                    weight: 2,
                    pathId: pathEntry.pathId,
                    fromStationCode: stationCode,
                    toStationCode: nextStationCode
                };

                addMtrRouteEdge(adjacency, fromNodeId, { ...edge, nextNodeId: toNodeId });
                addMtrRouteEdge(adjacency, toNodeId, { ...edge, nextNodeId: fromNodeId, fromStationCode: nextStationCode, toStationCode: stationCode });
            }
        }

        for (const stationEntry of Object.values(stationIndex || {})) {
            const lineCodes = [...new Set((stationEntry.lines || []).map((lineMembership) => lineMembership.lineCode))];
            if (lineCodes.length < 2) continue;
            transferStationCodes.push(stationEntry.stationCode);

            for (let leftIndex = 0; leftIndex < lineCodes.length; leftIndex += 1) {
                for (let rightIndex = leftIndex + 1; rightIndex < lineCodes.length; rightIndex += 1) {
                    const leftLineCode = lineCodes[leftIndex];
                    const rightLineCode = lineCodes[rightIndex];
                    const leftNodeId = getMtrRouteNodeId(leftLineCode, stationEntry.stationCode);
                    const rightNodeId = getMtrRouteNodeId(rightLineCode, stationEntry.stationCode);
                    if (!adjacency.has(leftNodeId)) adjacency.set(leftNodeId, []);
                    if (!adjacency.has(rightNodeId)) adjacency.set(rightNodeId, []);

                    const transferEdge = {
                        kind: "transfer",
                        stationCode: stationEntry.stationCode,
                        stationNameZh: stationEntry.nameZh,
                        weight: 4
                    };

                    addMtrRouteEdge(adjacency, leftNodeId, { ...transferEdge, fromLineCode: leftLineCode, toLineCode: rightLineCode, nextNodeId: rightNodeId });
                    addMtrRouteEdge(adjacency, rightNodeId, { ...transferEdge, fromLineCode: rightLineCode, toLineCode: leftLineCode, nextNodeId: leftNodeId });
                }
            }
        }

        const lineGroups = [];
        for (const line of Array.isArray(lines) ? lines : []) {
            const groupPaths = paths
                .filter((pathEntry) => pathEntry.lineCode === line.lineCode)
                .map((pathEntry) => ({
                    pathId: pathEntry.pathId,
                    lineCode: pathEntry.lineCode,
                    label: `${pathEntry.terminusStartNameZh} ↔ ${pathEntry.terminusEndNameZh}`,
                    stationCodes: pathEntry.stationCodes
                }));

            if (groupPaths.length === 0) continue;
            lineGroups.push({
                lineCode: line.lineCode,
                lineNameZh: line.lineNameZh,
                lineNameEn: line.lineNameEn,
                paths: groupPaths
            });
        }

        return {
            paths,
            adjacency,
            lineGroups,
            transferStationCodes,
            lineOrder
        };
    }
    function buildMtrOfficialMapRuntime(mapData) {
        if (!mapData || !Array.isArray(mapData.lines) || mapData.lines.length === 0) return null;

        const stationGroups = new Map();
        const routeBoxLookup = {};
        const normalizedLines = mapData.lines.map((lineEntry) => {
            const stationIdLookup = new Map((lineEntry.stations || []).map((station) => [String(station.stationID || "").replace(/^id/i, ""), station]));
            const normalizedStations = (lineEntry.stations || []).map((station) => ({ ...station }));
            const normalizedRoutes = (lineEntry.routes || []).map((route) => {
                const [leftId, rightId] = String(route.relStation || "").split(",");
                const fromStation = stationIdLookup.get(leftId) || null;
                const toStation = stationIdLookup.get(rightId) || null;
                const fromStationCode = fromStation?.stationCode || "";
                const toStationCode = toStation?.stationCode || "";
                const pairKey = [fromStationCode, toStationCode].filter(Boolean).sort().join("|");
                const normalizedRoute = {
                    ...route,
                    fromStationCode,
                    toStationCode,
                    pairKey
                };

                if (pairKey) {
                    routeBoxLookup[`${lineEntry.lineCode}:${pairKey}`] = {
                        ...normalizedRoute,
                        lineCode: lineEntry.lineCode,
                        cssClassName: lineEntry.cssClassName
                    };
                }

                return normalizedRoute;
            });

            for (const station of normalizedStations) {
                const group = stationGroups.get(station.stationCode) || {
                    stationCode: station.stationCode,
                    stationNameZh: station.stationName?.tc || station.stationCode,
                    stationNameEn: station.stationName?.en || station.stationCode,
                    points: [],
                    lineCodes: new Set()
                };
                group.points.push({ x: station.x, y: station.y });
                group.lineCodes.add(lineEntry.lineCode);
                stationGroups.set(station.stationCode, group);
            }

            return {
                cssClassName: lineEntry.cssClassName,
                id: lineEntry.id,
                lineCode: lineEntry.lineCode,
                routes: normalizedRoutes,
                stations: normalizedStations
            };
        });

        const stationHotspots = [...stationGroups.values()]
            .map((group) => ({
                stationCode: group.stationCode,
                stationNameZh: group.stationNameZh,
                stationNameEn: group.stationNameEn,
                x: group.points.reduce((total, point) => total + point.x, 0) / group.points.length,
                y: group.points.reduce((total, point) => total + point.y, 0) / group.points.length,
                lineCodes: [...group.lineCodes].sort()
            }))
            .sort((left, right) => {
                if (left.y !== right.y) return left.y - right.y;
                return left.x - right.x;
            });

        return {
            width: Number(mapData.width) || 1200,
            height: Number(mapData.height) || 755,
            lines: normalizedLines,
            stationHotspots,
            stationHotspotLookup: Object.fromEntries(stationHotspots.map((station) => [station.stationCode, station])),
            routeBoxLookup
        };
    }
    function getMtrDirectionTerminusName(lineCode, directionKey) {
        const selectedLine = railState.mtr.lines.find((line) => line.lineCode === lineCode);
        if (!selectedLine || !Array.isArray(selectedLine.stations)) return "";
        const terminus = selectedLine.stations
            .filter((station) => Number.isFinite(Number(station?.sequences?.[directionKey])))
            .sort((left, right) => Number(left.sequences[directionKey]) - Number(right.sequences[directionKey]))[0];
        return terminus?.nameZh || "";
    }
    function getMtrOfficialMapStation(stationCode) {
        return railState.mtr.routing.officialMap?.stationHotspotLookup?.[String(stationCode || "").toUpperCase()] || null;
    }
    function buildRoutePlannerActiveRouteBoxes(activeResult) {
        const mapRuntime = railState.mtr.routing.officialMap;
        if (!mapRuntime || activeResult?.status !== "ready" || !Array.isArray(activeResult.legs)) return [];

        const seenKeys = new Set();
        const routeBoxes = [];

        for (const leg of activeResult.legs) {
            for (let index = 0; index < leg.stations.length - 1; index += 1) {
                const pairKey = [leg.stations[index], leg.stations[index + 1]].sort().join("|");
                const lookupKey = `${leg.lineCode}:${pairKey}`;
                if (seenKeys.has(lookupKey)) continue;
                seenKeys.add(lookupKey);
                const matchedRoute = mapRuntime.routeBoxLookup[lookupKey];
                if (matchedRoute) routeBoxes.push(matchedRoute);
            }
        }

        return routeBoxes;
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
            maybeAutofillRoutePlannerOriginFromNearest(nearestStation);
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
    function maybeAutofillRoutePlannerOriginFromNearest(nearestStation) {
        const planner = railState.mtr.routePlanner;
        if (!nearestStation?.stationCode || !planner || planner.hasUserEditedOrigin || planner.originStationCode) return false;
        planner.originStationCode = nearestStation.stationCode;
        planner.hasAutoFilledOrigin = true;
        planner.activeField = planner.destinationStationCode ? "origin" : "destination";
        refreshRoutePlannerResult();
        return true;
    }
    function getRoutePlannerStationEntry(stationCode) {
        return getMtrStationByCode(stationCode);
    }
    function isOrderedSubsequence(sourceStations, targetStations) {
        if (!Array.isArray(sourceStations) || !Array.isArray(targetStations) || targetStations.length === 0) return false;
        let searchIndex = 0;
        for (const stationCode of targetStations) {
            const foundIndex = sourceStations.indexOf(stationCode, searchIndex);
            if (foundIndex < 0) return false;
            searchIndex = foundIndex + 1;
        }
        return true;
    }
    function resolveRouteLegTerminusName(leg) {
        const runtime = railState.mtr.routing.runtime;
        if (!runtime?.paths || !leg?.lineCode || !Array.isArray(leg.stations) || leg.stations.length < 2) {
            return leg?.stations?.[leg?.stations?.length - 1] || "";
        }

        for (const pathEntry of runtime.paths) {
            if (pathEntry.lineCode !== leg.lineCode) continue;
            if (isOrderedSubsequence(pathEntry.stationCodes, leg.stations)) {
                return pathEntry.terminusEndNameZh;
            }
            const reversed = [...pathEntry.stationCodes].reverse();
            if (isOrderedSubsequence(reversed, leg.stations)) {
                return pathEntry.terminusStartNameZh;
            }
        }

        const fallbackStation = getRoutePlannerStationEntry(leg.stations[leg.stations.length - 1]);
        return fallbackStation?.nameZh || leg.stations[leg.stations.length - 1];
    }
    function getLineNameByCode(lineCode) {
        return railState.mtr.lines.find((line) => line.lineCode === lineCode)?.lineNameZh || lineCode;
    }
    function reconstructRoutePlannerPath(previousSteps, destinationNodeId) {
        const steps = [];
        let cursor = destinationNodeId;

        while (previousSteps.has(cursor)) {
            const previousStep = previousSteps.get(cursor);
            steps.push({
                fromNodeId: previousStep.nodeId,
                toNodeId: cursor,
                edge: previousStep.edge
            });
            cursor = previousStep.nodeId;
        }

        return steps.reverse();
    }
    function resolveRouteEdgeCost(edge, weighting) {
        const rideCost = Number.isFinite(weighting?.rideCost) ? weighting.rideCost : 1;
        const transferCost = Number.isFinite(weighting?.transferCost) ? weighting.transferCost : 4;
        return edge.kind === "transfer" ? transferCost : rideCost;
    }
    function getSuggestedRouteSignature(routeResult) {
        return (routeResult?.legs || [])
            .map((leg) => `${leg.lineCode}:${leg.stations.join(">")}`)
            .join("|");
    }
    function findSuggestedMtrRoute(originStationCode, destinationStationCode, weighting = null) {
        const runtime = railState.mtr.routing.runtime;
        const originStation = getRoutePlannerStationEntry(originStationCode);
        const destinationStation = getRoutePlannerStationEntry(destinationStationCode);

        if (!runtime || !originStation || !destinationStation) return null;
        if (originStationCode === destinationStationCode) {
            return {
                status: "sameStation",
                originStationCode,
                destinationStationCode,
                totalStops: 0,
                needsTransfer: false,
                transferStations: [],
                legs: [],
                stationCodes: [originStationCode],
                score: 0
            };
        }

        const originNodeIds = (originStation.lines || [])
            .map((lineMembership) => getMtrRouteNodeId(lineMembership.lineCode, originStationCode))
            .filter((nodeId) => runtime.adjacency.has(nodeId));
        const destinationNodeIds = new Set(
            (destinationStation.lines || [])
                .map((lineMembership) => getMtrRouteNodeId(lineMembership.lineCode, destinationStationCode))
                .filter((nodeId) => runtime.adjacency.has(nodeId))
        );

        if (originNodeIds.length === 0 || destinationNodeIds.size === 0) {
            return {
                status: "unreachable",
                originStationCode,
                destinationStationCode
            };
        }

        const distances = new Map();
        const previousSteps = new Map();
        const frontier = new Set(originNodeIds);
        const visited = new Set();

        for (const nodeId of originNodeIds) {
            distances.set(nodeId, 0);
        }

        let matchedDestinationNodeId = "";

        while (frontier.size > 0) {
            let currentNodeId = "";
            let currentDistance = Number.POSITIVE_INFINITY;

            for (const nodeId of frontier) {
                const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
                if (distance < currentDistance) {
                    currentDistance = distance;
                    currentNodeId = nodeId;
                }
            }

            if (!currentNodeId) break;
            frontier.delete(currentNodeId);
            if (visited.has(currentNodeId)) continue;
            visited.add(currentNodeId);

            if (destinationNodeIds.has(currentNodeId)) {
                matchedDestinationNodeId = currentNodeId;
                break;
            }

            for (const edge of runtime.adjacency.get(currentNodeId) || []) {
                const nextDistance = currentDistance + resolveRouteEdgeCost(edge, weighting);
                const knownDistance = distances.get(edge.nextNodeId) ?? Number.POSITIVE_INFINITY;
                if (nextDistance < knownDistance) {
                    distances.set(edge.nextNodeId, nextDistance);
                    previousSteps.set(edge.nextNodeId, {
                        nodeId: currentNodeId,
                        edge
                    });
                    frontier.add(edge.nextNodeId);
                }
            }
        }

        if (!matchedDestinationNodeId) {
            return {
                status: "unreachable",
                originStationCode,
                destinationStationCode
            };
        }

        const pathSteps = reconstructRoutePlannerPath(previousSteps, matchedDestinationNodeId);
        const transferStations = [];
        const stationCodes = [originStationCode];
        const legs = [];
        let currentLeg = null;

        for (const step of pathSteps) {
            if (step.edge.kind === "transfer") {
                if (currentLeg) {
                    currentLeg.terminusNameZh = resolveRouteLegTerminusName(currentLeg);
                    currentLeg.stopCount = Math.max(0, currentLeg.stations.length - 1);
                    legs.push(currentLeg);
                    currentLeg = null;
                }

                transferStations.push({
                    stationCode: step.edge.stationCode,
                    stationNameZh: step.edge.stationNameZh,
                    fromLineCode: step.edge.fromLineCode,
                    fromLineNameZh: getLineNameByCode(step.edge.fromLineCode),
                    toLineCode: step.edge.toLineCode,
                    toLineNameZh: getLineNameByCode(step.edge.toLineCode)
                });
                continue;
            }

            if (!currentLeg || currentLeg.lineCode !== step.edge.lineCode) {
                if (currentLeg) {
                    currentLeg.terminusNameZh = resolveRouteLegTerminusName(currentLeg);
                    currentLeg.stopCount = Math.max(0, currentLeg.stations.length - 1);
                    legs.push(currentLeg);
                }

                currentLeg = {
                    lineCode: step.edge.lineCode,
                    lineNameZh: getLineNameByCode(step.edge.lineCode),
                    stations: [step.edge.fromStationCode]
                };
            }

            if (currentLeg.stations[currentLeg.stations.length - 1] !== step.edge.toStationCode) {
                currentLeg.stations.push(step.edge.toStationCode);
            }
            if (stationCodes[stationCodes.length - 1] !== step.edge.toStationCode) {
                stationCodes.push(step.edge.toStationCode);
            }
        }

        if (currentLeg) {
            currentLeg.terminusNameZh = resolveRouteLegTerminusName(currentLeg);
            currentLeg.stopCount = Math.max(0, currentLeg.stations.length - 1);
            legs.push(currentLeg);
        }

        return {
            status: "ready",
            originStationCode,
            destinationStationCode,
            score: distances.get(matchedDestinationNodeId) ?? 0,
            totalStops: Math.max(0, stationCodes.length - 1),
            needsTransfer: transferStations.length > 0,
            transferStations,
            legs,
            stationCodes
        };
    }
    function buildSuggestedMtrRouteViews(originStationCode, destinationStationCode) {
        const routeViews = [];
        const seenSignatures = new Set();

        for (const preset of MTR_ROUTE_VIEW_PRESETS) {
            const result = findSuggestedMtrRoute(originStationCode, destinationStationCode, preset);
            if (!result || result.status === "unreachable") continue;

            if (result.status === "sameStation") {
                routeViews.push({ id: preset.id, label: preset.label, result });
                return routeViews;
            }

            const signature = getSuggestedRouteSignature(result);
            if (signature && seenSignatures.has(signature)) continue;
            if (signature) seenSignatures.add(signature);

            routeViews.push({
                id: preset.id,
                label: preset.label,
                result
            });
        }

        if (routeViews.length === 0) {
            const fallback = findSuggestedMtrRoute(originStationCode, destinationStationCode);
            if (fallback) {
                routeViews.push({
                    id: "recommended",
                    label: "建議路線",
                    result: fallback
                });
            }
        }

        return routeViews;
    }
    function refreshRoutePlannerResult() {
        const planner = railState.mtr.routePlanner;
        if (!planner.originStationCode || !planner.destinationStationCode) {
            planner.result = null;
            planner.activeViewId = "";
            return;
        }

        const nextViews = buildSuggestedMtrRouteViews(planner.originStationCode, planner.destinationStationCode);
        planner.result = nextViews;
        planner.activeViewId = nextViews.some((view) => view.id === planner.activeViewId)
            ? planner.activeViewId
            : (nextViews[0]?.id || "");
    }
    function getRoutePlannerViews() {
        return Array.isArray(railState.mtr.routePlanner.result) ? railState.mtr.routePlanner.result : [];
    }
    function getActiveRoutePlannerView() {
        const planner = railState.mtr.routePlanner;
        const views = getRoutePlannerViews();
        if (views.length === 0) return null;
        return views.find((view) => view.id === planner.activeViewId) || views[0] || null;
    }
    function getRoutePlannerActiveField() {
        const planner = railState.mtr.routePlanner;
        if (!planner.originStationCode) return "origin";
        if (!planner.destinationStationCode) return "destination";
        return planner.activeField || "destination";
    }
    function setRoutePlannerField(field) {
        railState.mtr.routePlanner.activeField = field === "origin" ? "origin" : "destination";
    }
    function setRoutePlannerView(viewId) {
        if (!viewId) return;
        const matchingView = getRoutePlannerViews().find((view) => view.id === viewId);
        if (!matchingView) return;
        railState.mtr.routePlanner.activeViewId = matchingView.id;
    }
    function selectRoutePlannerStation(stationCode) {
        const planner = railState.mtr.routePlanner;
        if (!getRoutePlannerStationEntry(stationCode)) return;

        if (getRoutePlannerActiveField() === "origin") {
            planner.originStationCode = stationCode;
            planner.hasUserEditedOrigin = true;
            planner.activeField = "destination";
        } else {
            planner.destinationStationCode = stationCode;
            planner.hasUserEditedDestination = true;
        }

        refreshRoutePlannerResult();
    }
    function clearRoutePlannerDestination() {
        railState.mtr.routePlanner.destinationStationCode = "";
        railState.mtr.routePlanner.result = null;
        railState.mtr.routePlanner.activeViewId = "";
        railState.mtr.routePlanner.activeField = "destination";
    }
    function swapRoutePlannerStations() {
        const planner = railState.mtr.routePlanner;
        const nextOrigin = planner.destinationStationCode;
        const nextDestination = planner.originStationCode;
        planner.originStationCode = nextOrigin;
        planner.destinationStationCode = nextDestination;
        planner.hasUserEditedOrigin = true;
        planner.hasUserEditedDestination = true;
        planner.activeField = "destination";
        refreshRoutePlannerResult();
    }
    function toggleRoutePlanner() {
        const planner = railState.mtr.routePlanner;
        planner.isOpen = !planner.isOpen;
        planner.lastMapFocusKey = "";
        if (planner.isOpen) {
            maybeAutofillRoutePlannerOriginFromNearest(railState.mtr.nearest.nearestStation);
            planner.activeField = getRoutePlannerActiveField();
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
        const lineColor = getMtrOfficialLineColor(summary.lineCode);
        if (summary.status === "error") {
            return `
                <article class="rail-nearest-line-card rail-nearest-line-card-error" style="--rail-line-color: ${escapeHtml(lineColor)}">
                    <div class="rail-nearest-line-top">
                        <div><p class="rail-nearest-line-kicker">${escapeHtml(summary.lineCode)}</p><h4 class="rail-nearest-line-title">${escapeHtml(summary.lineNameZh)}</h4></div>
                    </div>
                    <p class="rail-nearest-inline-note">${escapeHtml(summary.errorMessage || "暫時未能載入該線資料。")}</p>
                </article>`;
        }

        return `
            <article class="rail-nearest-line-card" style="--rail-line-color: ${escapeHtml(lineColor)}">
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
    function buildRoutePlannerBubbleMarkup() {
        const planner = railState.mtr.routePlanner;
        const originStation = getRoutePlannerStationEntry(planner.originStationCode);
        const destinationStation = getRoutePlannerStationEntry(planner.destinationStationCode);
        const summaryText = destinationStation
            ? `${originStation?.nameZh || "起點"} → ${destinationStation.nameZh}`
            : originStation
                ? `起點：${originStation.nameZh}`
                : "由最近站開始規劃";

        return `
            <button
                type="button"
                id="mtrRoutePlannerToggle"
                class="rail-planner-bubble ${planner.isOpen ? "is-active" : ""}"
                aria-expanded="${planner.isOpen ? "true" : "false"}"
            >
                <span class="rail-planner-bubble-dot" aria-hidden="true"></span>
                <span class="rail-planner-bubble-copy">
                    <span class="rail-planner-bubble-title">路線查詢</span>
                    <span class="rail-planner-bubble-meta">${escapeHtml(summaryText)}</span>
                </span>
            </button>`;
    }
    function buildRoutePlannerStationToken(field, stationEntry, isActive) {
        return `
            <button
                type="button"
                class="rail-route-station-token ${isActive ? "is-active" : ""}"
                data-route-field="${field}"
            >
                <span class="rail-route-station-token-label">${field === "origin" ? "起點" : "終點"}</span>
                <strong class="rail-route-station-token-name">${escapeHtml(stationEntry?.nameZh || (field === "origin" ? "選擇起點" : "選擇終點"))}</strong>
            </button>`;
    }
    function buildOfficialMapRouteDivMarkup(route, className = "") {
        return `<div class="rail-official-map-route ${className} r${escapeHtml(String(route.routeIndex))}" style="left:${escapeHtml(String(route.x))}px;top:${escapeHtml(String(route.y))}px;width:${escapeHtml(String(route.width))}px;height:${escapeHtml(String(route.height))}px;background-position:${escapeHtml(String(route.x * -1))}px ${escapeHtml(String(route.y * -1))}px;"></div>`;
    }
    function buildOfficialMapMarkup(activeField, activeResult, selectedOriginCode, selectedDestinationCode) {
        const mapRuntime = railState.mtr.routing.officialMap;
        if (!mapRuntime) {
            return `<section class="rail-empty-card"><h3 class="rail-empty-title">地圖資料未就緒</h3><p class="rail-empty-text">暫時未能載入官方港鐵地圖資料。</p></section>`;
        }

        const routeStationSet = new Set(Array.isArray(activeResult?.stationCodes) ? activeResult.stationCodes : []);
        const transferStationSet = new Set(Array.isArray(activeResult?.transferStations) ? activeResult.transferStations.map((station) => station.stationCode) : []);
        const activeRouteBoxes = buildRoutePlannerActiveRouteBoxes(activeResult);
        const nearestStationCode = railState.mtr.nearest.nearestStation?.stationCode || "";

        return `
            <div class="rail-route-map-panel-head">
                <div>
                    <p class="rail-route-map-title">互動港鐵地圖</p>
                    <p class="rail-route-map-hint">目前選擇：${activeField === "origin" ? "起點" : "終點"}</p>
                </div>
                <div class="rail-route-map-legend">
                    <span class="rail-route-map-legend-pill is-active">${activeField === "origin" ? "正在選起點" : "正在選終點"}</span>
                    <span class="rail-route-map-legend-pill">實心點＝轉線站</span>
                    <span class="rail-route-map-legend-pill">雙圈＝已選站</span>
                </div>
            </div>
            <div id="mtrOfficialMapViewport" class="rail-official-map-viewport">
                <div class="rail-official-map-surface" style="width:${escapeHtml(String(mapRuntime.width))}px;height:${escapeHtml(String(mapRuntime.height))}px;">
                    <div class="rail-official-map-lines rail-official-map-lines-base">
                        ${mapRuntime.lines.map((line) => `
                            <div class="rail-official-map-line ${escapeHtml(line.cssClassName)}">
                                ${line.routes.map((route) => buildOfficialMapRouteDivMarkup(route, "is-base")).join("")}
                            </div>
                        `).join("")}
                    </div>
                    <div class="rail-official-map-lines rail-official-map-lines-active" aria-hidden="true">
                        ${activeRouteBoxes.map((route) => `
                            <div class="rail-official-map-line ${escapeHtml(route.cssClassName)}">
                                ${buildOfficialMapRouteDivMarkup(route, "is-active")}
                            </div>
                        `).join("")}
                    </div>
                    <div class="rail-official-map-labels" aria-hidden="true"></div>
                    <div class="rail-official-map-hotspots">
                        ${mapRuntime.stationHotspots.map((station) => {
                            const classNames = [
                                "rail-official-map-station",
                                station.stationCode === selectedOriginCode ? "is-origin" : "",
                                station.stationCode === selectedDestinationCode ? "is-destination" : "",
                                transferStationSet.has(station.stationCode) ? "is-transfer" : "",
                                routeStationSet.has(station.stationCode) ? "is-on-route" : "",
                                station.stationCode === nearestStationCode ? "is-nearest" : ""
                            ].filter(Boolean).join(" ");
                            return `
                                <button
                                    type="button"
                                    class="${classNames}"
                                    data-route-station="${escapeHtml(station.stationCode)}"
                                    aria-label="${escapeHtml(station.stationNameZh)}"
                                    title="${escapeHtml(station.stationNameZh)}"
                                    style="left:${escapeHtml(String(station.x))}px;top:${escapeHtml(String(station.y))}px;"
                                >
                                    <span class="rail-official-map-station-ring" aria-hidden="true"></span>
                                    <span class="rail-official-map-station-pulse" aria-hidden="true"></span>
                                </button>`;
                        }).join("")}
                    </div>
                </div>
            </div>`;
    }
    function buildRoutePlannerMapPathMarkup(pathEntry, selectedOriginCode, selectedDestinationCode, routeStationSet, transferStationSet) {
        const lineColor = getMtrOfficialLineColor(pathEntry.lineCode);
        const stationButtons = pathEntry.stationCodes.map((stationCode, index) => {
            const stationEntry = getRoutePlannerStationEntry(stationCode);
            const classNames = [
                "rail-route-map-station",
                stationCode === selectedOriginCode ? "is-origin" : "",
                stationCode === selectedDestinationCode ? "is-destination" : "",
                routeStationSet.has(stationCode) ? "is-on-route" : "",
                transferStationSet.has(stationCode) ? "is-transfer" : ""
            ].filter(Boolean).join(" ");

            return `
                ${index > 0 ? '<span class="rail-route-map-link" aria-hidden="true"></span>' : ""}
                <button type="button" class="${classNames}" style="--rail-line-color: ${escapeHtml(lineColor)}" data-route-station="${escapeHtml(stationCode)}">
                    <span class="rail-route-map-station-dot" aria-hidden="true"></span>
                    <span class="rail-route-map-station-name">${escapeHtml(stationEntry?.nameZh || stationCode)}</span>
                </button>`;
        }).join("");

        return `
            <div class="rail-route-map-path" style="--rail-line-color: ${escapeHtml(lineColor)}">
                <p class="rail-route-map-path-label">${escapeHtml(pathEntry.label)}</p>
                <div class="rail-route-map-stations">
                    ${stationButtons}
                </div>
            </div>`;
    }
    function buildRoutePlannerViewTabsMarkup(routeViews, activeViewId) {
        if (!Array.isArray(routeViews) || routeViews.length < 2) return "";
        return `
            <div class="rail-route-view-tabs" role="tablist" aria-label="路線查看模式">
                ${routeViews.map((view) => `
                    <button
                        type="button"
                        class="rail-route-view-tab ${view.id === activeViewId ? "is-active" : ""}"
                        role="tab"
                        data-route-view="${escapeHtml(view.id)}"
                        aria-selected="${view.id === activeViewId ? "true" : "false"}"
                    >${escapeHtml(view.label)}</button>
                `).join("")}
            </div>`;
    }
    function buildRoutePlannerOptionCardMarkup(view, activeViewId) {
        const result = view?.result;
        if (!result || (result.status !== "ready" && result.status !== "sameStation")) return "";

        const summaryChips = result.status === "sameStation"
            ? `<span class="rail-chip">0 個站</span><span class="rail-chip">直達</span>`
            : [
                `<span class="rail-chip">${escapeHtml(String(result.totalStops))} 個站</span>`,
                `<span class="rail-chip">${result.needsTransfer ? `${escapeHtml(String(result.transferStations.length))} 次轉線` : "直達"}</span>`,
                `<span class="rail-chip">${escapeHtml(String(result.legs.length))} 段路線</span>`
            ].join("");
        const summaryText = result.status === "sameStation"
            ? "起點與終點相同"
            : result.needsTransfer
                ? `經 ${escapeHtml(result.transferStations.map((station) => station.stationNameZh).join("、"))} 轉線`
                : "不需要轉線";

        return `
            <button
                type="button"
                class="rail-route-option-card ${view.id === activeViewId ? "is-active" : ""}"
                data-route-view="${escapeHtml(view.id)}"
                aria-pressed="${view.id === activeViewId ? "true" : "false"}"
            >
                <div class="rail-route-option-card-head">
                    <div class="rail-summary-main">
                        <p class="rail-route-option-card-kicker">${escapeHtml(view.label)}</p>
                        <h4 class="rail-route-option-card-title">${escapeHtml(summaryText)}</h4>
                    </div>
                    ${view.id === activeViewId ? '<span class="rail-route-option-card-badge">目前查看</span>' : ""}
                </div>
                <div class="rail-chip-row rail-route-option-card-chips">${summaryChips}</div>
                ${result.status === "ready" ? buildRoutePlannerOptionStripMarkup(result) : ""}
            </button>`;
    }
    function buildRoutePlannerOptionGalleryMarkup(routeViews, activeViewId) {
        if (!Array.isArray(routeViews) || routeViews.length < 2) return "";
        return `
            <section class="rail-route-option-gallery" aria-label="其他建議路線">
                ${routeViews.map((view) => buildRoutePlannerOptionCardMarkup(view, activeViewId)).join("")}
            </section>`;
    }
    function buildRoutePlannerOptionStripMarkup(routeResult) {
        if (!routeResult || routeResult.status !== "ready") return "";
        const stopPoints = [
            {
                stationCode: routeResult.originStationCode,
                stationNameZh: getRoutePlannerStationEntry(routeResult.originStationCode)?.nameZh || routeResult.originStationCode,
                isTransfer: false
            },
            ...routeResult.transferStations.map((station) => ({
                stationCode: station.stationCode,
                stationNameZh: station.stationNameZh,
                isTransfer: true
            })),
            {
                stationCode: routeResult.destinationStationCode,
                stationNameZh: getRoutePlannerStationEntry(routeResult.destinationStationCode)?.nameZh || routeResult.destinationStationCode,
                isTransfer: false
            }
        ];

        const stripMarkup = stopPoints.map((stopPoint, index) => {
            const segmentMarkup = index < routeResult.legs.length
                ? `<span class="rail-route-option-segment" style="--rail-line-color: ${escapeHtml(getMtrOfficialLineColor(routeResult.legs[index].lineCode))}; --rail-segment-grow: ${Math.max(routeResult.legs[index].stopCount, 1)}" aria-hidden="true"></span>`
                : "";
            return `
                <div class="rail-route-option-stop ${stopPoint.isTransfer ? "is-transfer" : ""}">
                    <span class="rail-route-option-stop-name">${escapeHtml(stopPoint.stationNameZh)}</span>
                    <span class="rail-route-option-stop-dot" aria-hidden="true"></span>
                </div>
                ${segmentMarkup}`;
        }).join("");

        const lineBadgesMarkup = routeResult.legs.map((leg) => `
            <span class="rail-route-line-badge" style="--rail-line-color: ${escapeHtml(getMtrOfficialLineColor(leg.lineCode))}">
                <span class="rail-route-line-badge-dot" aria-hidden="true"></span>
                <span>${escapeHtml(leg.lineNameZh)}　往 ${escapeHtml(leg.terminusNameZh || (getRoutePlannerStationEntry(leg.stations[leg.stations.length - 1])?.nameZh || leg.stations[leg.stations.length - 1]))}</span>
            </span>
        `).join("");

        return `
            <div class="rail-route-option-strip-wrap">
                <div class="rail-route-option-strip">
                    ${stripMarkup}
                </div>
                <div class="rail-route-line-badge-row">
                    ${lineBadgesMarkup}
                </div>
            </div>`;
    }
    function buildRoutePlannerLegCardMarkup(leg) {
        const lineColor = getMtrOfficialLineColor(leg.lineCode);
        const intermediateStations = leg.stations.slice(1, -1).map((stationCode) => getRoutePlannerStationEntry(stationCode)?.nameZh || stationCode);
        return `
            <article class="rail-route-leg-card" style="--rail-line-color: ${escapeHtml(lineColor)}">
                <div class="rail-route-leg-head">
                    <div class="rail-route-leg-heading">
                        <span class="rail-route-leg-line-dot" aria-hidden="true"></span>
                        <div>
                            <p class="rail-route-leg-kicker">${escapeHtml(leg.lineCode)}</p>
                            <h4 class="rail-route-leg-title">${escapeHtml(leg.lineNameZh)}　往 ${escapeHtml(leg.terminusNameZh || (getRoutePlannerStationEntry(leg.stations[leg.stations.length - 1])?.nameZh || leg.stations[leg.stations.length - 1]))}</h4>
                        </div>
                    </div>
                    <span class="rail-meta-pill">${escapeHtml(String(leg.stopCount))} 個站</span>
                </div>
                <p class="rail-route-leg-stations">${escapeHtml(leg.stations.map((stationCode) => getRoutePlannerStationEntry(stationCode)?.nameZh || stationCode).join(" → "))}</p>
                ${intermediateStations.length > 0 ? `<p class="rail-route-leg-note">經過：${escapeHtml(intermediateStations.join("、"))}</p>` : ""}
            </article>`;
    }
    function buildRoutePlannerTransferCalloutMarkup(activeResult) {
        if (!activeResult?.needsTransfer || !Array.isArray(activeResult.transferStations) || activeResult.transferStations.length === 0) {
            return "";
        }
        return `
            <div class="rail-route-transfer-callout">
                <p class="rail-route-transfer-title">轉線站</p>
                <div class="rail-route-transfer-list">
                    ${activeResult.transferStations.map((station) => `
                        <span class="rail-route-transfer-pill">
                            <strong>${escapeHtml(station.stationNameZh)}</strong>
                            <span>${escapeHtml(station.fromLineNameZh)} → ${escapeHtml(station.toLineNameZh)}</span>
                        </span>
                    `).join("")}
                </div>
            </div>`;
    }
    function buildRoutePlannerResultMarkup() {
        const planner = railState.mtr.routePlanner;
        const originStation = getRoutePlannerStationEntry(planner.originStationCode);
        const destinationStation = getRoutePlannerStationEntry(planner.destinationStationCode);
        const routeViews = getRoutePlannerViews();
        const activeView = getActiveRoutePlannerView();
        const activeResult = activeView?.result || null;

        if (!originStation) {
            return `<section class="rail-route-result rail-empty-card"><h3 class="rail-empty-title">先選起點</h3><p class="rail-empty-text">如果已成功定位，起點會先帶入最近站；也可以直接在港鐵地圖上改選。</p></section>`;
        }

        if (!destinationStation) {
            return `<section class="rail-route-result rail-empty-card"><h3 class="rail-empty-title">再選終點</h3><p class="rail-empty-text">點一下上方的終點卡，再在港鐵地圖上選擇你想去的港鐵站。</p></section>`;
        }

        if (!routeViews.length || !activeResult) {
            return `<section class="rail-route-result rail-empty-card"><h3 class="rail-empty-title">暫時無法規劃路線</h3><p class="rail-empty-text">請稍後再試，或重新選擇起點與終點。</p></section>`;
        }

        if (activeResult.status === "sameStation") {
            return `
                <section class="rail-route-result rail-route-result-card">
                    <div class="rail-route-result-head">
                        <div class="rail-summary-main">
                            <p class="rail-mtr-section-kicker">${escapeHtml(activeView.label)}</p>
                            <h3 class="rail-summary-title">${escapeHtml(originStation.nameZh)} 已是目前站點</h3>
                            <p class="rail-summary-text">起點與終點相同，不需要轉線。</p>
                        </div>
                        <div class="rail-chip-row rail-route-result-chips"><span class="rail-chip">0 個站</span><span class="rail-chip">直達</span></div>
                    </div>
                </section>`;
        }

        if (activeResult.status === "unreachable") {
            return `<section class="rail-route-result rail-empty-card rail-empty-card-error"><h3 class="rail-empty-title">暫時找不到建議路線</h3><p class="rail-empty-text">目前未能用這組起點與終點算出路線，請改選其他站點再試一次。</p></section>`;
        }

        const transferSummary = activeResult.transferStations.length > 0
            ? activeResult.transferStations.map((station) => station.stationNameZh).join("、")
            : "不用轉線";
        const legMarkup = activeResult.legs.map((leg) => buildRoutePlannerLegCardMarkup(leg)).join("");
        const routeSummaryChips = [
            `<span class="rail-chip">${escapeHtml(String(activeResult.totalStops))} 個站</span>`,
            `<span class="rail-chip">${activeResult.needsTransfer ? `${escapeHtml(String(activeResult.transferStations.length))} 次轉線` : "直達"}</span>`,
            `<span class="rail-chip">${escapeHtml(String(activeResult.legs.length))} 段路線</span>`
        ].join("");

        return `
            <section class="rail-route-result rail-route-result-card">
                ${buildRoutePlannerOptionGalleryMarkup(routeViews, activeView.id)}
                <div class="rail-route-overview">
                    <div class="rail-route-endpoint is-origin">
                        <span class="rail-route-endpoint-label">起點</span>
                        <strong class="rail-route-endpoint-name">${escapeHtml(originStation.nameZh)}</strong>
                    </div>
                    <span class="rail-route-overview-arrow" aria-hidden="true">→</span>
                    <div class="rail-route-endpoint is-destination">
                        <span class="rail-route-endpoint-label">終點</span>
                        <strong class="rail-route-endpoint-name">${escapeHtml(destinationStation.nameZh)}</strong>
                    </div>
                </div>
                <div class="rail-route-result-head">
                    <div class="rail-summary-main">
                        <p class="rail-mtr-section-kicker">${escapeHtml(activeView.label)}</p>
                        <h3 class="rail-summary-title">${escapeHtml(originStation.nameZh)} → ${escapeHtml(destinationStation.nameZh)}</h3>
                        <p class="rail-summary-text">${activeResult.needsTransfer ? `需要轉線，轉線站：${escapeHtml(transferSummary)}` : "直達，不需要轉線"}</p>
                    </div>
                    <div class="rail-chip-row rail-route-result-chips">${routeSummaryChips}</div>
                </div>
                ${buildRoutePlannerOptionStripMarkup(activeResult)}
                ${buildRoutePlannerTransferCalloutMarkup(activeResult)}
                <div class="rail-route-leg-list">
                    ${legMarkup}
                </div>
            </section>`;
    }
    function buildRoutePlannerPanelMarkup() {
        const planner = railState.mtr.routePlanner;
        const selectedOriginCode = planner.originStationCode;
        const selectedDestinationCode = planner.destinationStationCode;
        const activeView = getActiveRoutePlannerView();
        const activeResult = activeView?.result || null;
        const originStation = getRoutePlannerStationEntry(selectedOriginCode);
        const destinationStation = getRoutePlannerStationEntry(selectedDestinationCode);
        const activeField = getRoutePlannerActiveField();

        return `
            <section id="mtrRoutePlannerPanel" class="rail-route-panel">
                <div class="rail-route-panel-head">
                    <div class="rail-summary-main">
                        <p class="rail-mtr-section-kicker">路線查詢</p>
                        <h3 class="rail-summary-title">點站規劃港鐵路線</h3>
                        <p class="rail-summary-text">先點起點或終點，再到下方港鐵地圖選站。</p>
                    </div>
                    <div class="rail-route-panel-actions">
                        <button type="button" id="mtrRoutePlannerSwapButton" class="rail-secondary-button rail-route-action-button" ${!selectedOriginCode || !selectedDestinationCode ? "disabled" : ""}>交換起終點</button>
                        <button type="button" id="mtrRoutePlannerClearButton" class="rail-secondary-button rail-route-action-button" ${!selectedDestinationCode ? "disabled" : ""}>清除終點</button>
                    </div>
                </div>

                <div class="rail-route-selector-row">
                    ${buildRoutePlannerStationToken("origin", originStation, activeField === "origin")}
                    ${buildRoutePlannerStationToken("destination", destinationStation, activeField === "destination")}
                </div>

                <section class="rail-route-map-panel">
                    ${buildOfficialMapMarkup(activeField, activeResult, selectedOriginCode, selectedDestinationCode)}
                </section>

                ${buildRoutePlannerResultMarkup()}
            </section>`;
    }
    function buildRoutePlannerShellMarkup() {
        return `
            <section class="rail-route-shell">
                ${buildRoutePlannerBubbleMarkup()}
                ${railState.mtr.routePlanner.isOpen ? buildRoutePlannerPanelMarkup() : ""}
            </section>`;
    }
    function maybeFocusOfficialMapViewport() {
        if (railState.currentTab !== "mtr" || !railState.mtr.routePlanner.isOpen) return;

        const viewport = document.getElementById("mtrOfficialMapViewport");
        if (!(viewport instanceof HTMLElement)) return;

        const mapRuntime = railState.mtr.routing.officialMap;
        if (!mapRuntime) return;

        const activeView = getActiveRoutePlannerView();
        const focusStationCodes = Array.isArray(activeView?.result?.stationCodes) && activeView.result.stationCodes.length > 0
            ? activeView.result.stationCodes
            : [railState.mtr.routePlanner.originStationCode, railState.mtr.routePlanner.destinationStationCode, railState.mtr.nearest.nearestStation?.stationCode].filter(Boolean);
        const focusPoints = focusStationCodes
            .map((stationCode) => getMtrOfficialMapStation(stationCode))
            .filter(Boolean);

        if (focusPoints.length === 0) return;

        const focusKey = `${activeView?.id || "idle"}:${focusStationCodes.join("|")}:${railState.mtr.routePlanner.activeField}`;
        if (railState.mtr.routePlanner.lastMapFocusKey === focusKey) return;
        railState.mtr.routePlanner.lastMapFocusKey = focusKey;

        const minX = Math.min(...focusPoints.map((point) => point.x));
        const maxX = Math.max(...focusPoints.map((point) => point.x));
        const minY = Math.min(...focusPoints.map((point) => point.y));
        const maxY = Math.max(...focusPoints.map((point) => point.y));
        const padding = 140;
        const targetLeft = Math.max(0, Math.min((minX + maxX) / 2 - viewport.clientWidth / 2, mapRuntime.width - viewport.clientWidth));
        const targetTop = Math.max(0, Math.min((minY + maxY) / 2 - viewport.clientHeight / 2 - padding * 0.15, mapRuntime.height - viewport.clientHeight));

        viewport.scrollTo({
            left: targetLeft,
            top: targetTop,
            behavior: "smooth"
        });
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
                    <p class="rail-panel-title">港鐵摘要</p>
                </div>
                ${buildNearestSectionMarkup()}
                ${buildRoutePlannerShellMarkup()}
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
        const mtrRoutePlannerToggle = document.getElementById("mtrRoutePlannerToggle");
        const mtrRoutePlannerPanel = document.getElementById("mtrRoutePlannerPanel");
        const mtrRoutePlannerSwapButton = document.getElementById("mtrRoutePlannerSwapButton");
        const mtrRoutePlannerClearButton = document.getElementById("mtrRoutePlannerClearButton");
        const lightRailRouteSelect = document.getElementById("lightRailRouteSelect");
        const lightRailStopSelect = document.getElementById("lightRailStopSelect");
        if (mtrNearestRetryButton instanceof HTMLButtonElement) mtrNearestRetryButton.addEventListener("click", () => requestNearestMtrSummary(true));
        if (mtrRoutePlannerToggle instanceof HTMLButtonElement) {
            mtrRoutePlannerToggle.addEventListener("click", () => {
                toggleRoutePlanner();
                setStatus(railState.mtr.routePlanner.isOpen ? "已展開港鐵路線查詢，可在示意圖上選起點與終點。" : "已收合港鐵路線查詢。", "info");
                renderCurrentTab();
                bindCurrentTabEvents();
            });
        }
        if (mtrRoutePlannerSwapButton instanceof HTMLButtonElement) {
            mtrRoutePlannerSwapButton.addEventListener("click", () => {
                swapRoutePlannerStations();
                renderCurrentTab();
                bindCurrentTabEvents();
            });
        }
        if (mtrRoutePlannerClearButton instanceof HTMLButtonElement) {
            mtrRoutePlannerClearButton.addEventListener("click", () => {
                clearRoutePlannerDestination();
                renderCurrentTab();
                bindCurrentTabEvents();
            });
        }
        if (mtrRoutePlannerPanel instanceof HTMLElement) {
            mtrRoutePlannerPanel.addEventListener("click", (event) => {
                const viewButton = event.target instanceof HTMLElement ? event.target.closest("[data-route-view]") : null;
                if (viewButton instanceof HTMLElement) {
                    const viewId = viewButton.getAttribute("data-route-view") || "";
                    setRoutePlannerView(viewId);
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }

                const fieldButton = event.target instanceof HTMLElement ? event.target.closest("[data-route-field]") : null;
                if (fieldButton instanceof HTMLElement) {
                    const field = fieldButton.getAttribute("data-route-field") || "destination";
                    setRoutePlannerField(field);
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }

                const stationButton = event.target instanceof HTMLElement ? event.target.closest("[data-route-station]") : null;
                if (stationButton instanceof HTMLElement) {
                    const stationCode = stationButton.getAttribute("data-route-station") || "";
                    selectRoutePlannerStation(stationCode);
                    renderCurrentTab();
                    bindCurrentTabEvents();
                }
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
                setStatus(railState.lightRail.stopId ? "輕鐵靜態索引已定位到指定站點，下一階段會接即時到站。" : "已清除輕鐵站點選擇。", "info");
                renderCurrentTab();
                bindCurrentTabEvents();
            });
        }

        requestAnimationFrame(() => {
            maybeFocusOfficialMapViewport();
        });
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
        railState.mtr.routing.runtime = buildMtrRoutingRuntime(railState.mtr.lines, railState.mtr.stationIndex);
        railState.mtr.routing.lineGroups = railState.mtr.routing.runtime?.lineGroups || [];
        railState.mtr.routing.transferStationCodes = railState.mtr.routing.runtime?.transferStationCodes || [];
        railState.mtr.routing.officialMap = buildMtrOfficialMapRuntime(officialMtrMap);
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
