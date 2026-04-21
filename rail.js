(() => {
    const MTR_SCHEDULE_ENDPOINT = "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php";
    const LIGHT_RAIL_SCHEDULE_ENDPOINT = "https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule";
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
        TWL: { color: "#EC1D24" },
        WALK: { color: "#98A3B3" }
    };
    const MTR_ROUTE_VIEW_PRESETS = [
        { id: "recommended", label: "建議路線", rideCost: 1, transferCost: 4 },
        { id: "fewerTransfers", label: "較少轉線", rideCost: 1, transferCost: 8 },
        { id: "fewerStops", label: "較少站數", rideCost: 1, transferCost: 2 }
    ];
    const MTR_VIRTUAL_ROUTE_POINTS = {
        HSR: {
            stationCode: "HSR",
            nameZh: "高鐵站",
            nameEn: "High Speed Rail",
            lines: [],
            isVirtual: true
        }
    };
    const MTR_BASE_WALK_LINKS = [
        {
            walkId: "TST|ETS",
            from: "TST",
            to: "ETS",
            stations: ["TST", "ETS"],
            labelZh: "尖沙咀／尖東步行連接",
            weight: 2
        },
        {
            walkId: "AUS|HSR",
            from: "AUS",
            to: "HSR",
            stations: ["AUS", "HSR"],
            labelZh: "步行前往高鐵站",
            weight: 2
        },
        {
            walkId: "HSR|KOW",
            from: "HSR",
            to: "KOW",
            stations: ["HSR", "KOW"],
            labelZh: "步行前往九龍站",
            weight: 2
        }
    ];
    const MTR_SPECIAL_WALK_ROUTES = [
        {
            walkId: "AUS|KOW",
            from: "AUS",
            to: "KOW",
            stations: ["AUS", "HSR", "KOW"],
            labelZh: "經高鐵站步行連接",
            weight: 2.6
        }
    ];
    MTR_VIRTUAL_ROUTE_POINTS.HSR.nameZh = "香港西九龍";
    MTR_VIRTUAL_ROUTE_POINTS.HSR.nameEn = "Hong Kong West Kowloon";
    const walkLinkToWestKowloon = MTR_BASE_WALK_LINKS.find((walkLink) => walkLink.walkId === "AUS|HSR");
    const walkLinkFromWestKowloon = MTR_BASE_WALK_LINKS.find((walkLink) => walkLink.walkId === "HSR|KOW");
    const walkRouteViaWestKowloon = MTR_SPECIAL_WALK_ROUTES.find((walkRoute) => walkRoute.walkId === "AUS|KOW");
    if (walkLinkToWestKowloon) walkLinkToWestKowloon.labelZh = "步行前往香港西九龍";
    if (walkLinkFromWestKowloon) walkLinkFromWestKowloon.labelZh = "步行前往九龍站";
    if (walkRouteViaWestKowloon) walkRouteViaWestKowloon.labelZh = "經香港西九龍步行連接";
    MTR_VIRTUAL_ROUTE_POINTS.HSR.nameZh = "高鐵";
    MTR_VIRTUAL_ROUTE_POINTS.HSR.nameEn = "High Speed Rail";
    if (walkLinkToWestKowloon) walkLinkToWestKowloon.labelZh = "步行前往高鐵";
    if (walkRouteViaWestKowloon) walkRouteViaWestKowloon.labelZh = "經高鐵步行連接";
    const officialMtrMap = window.__OFFICIAL_MTR_MAP__ || null;
    const customMtrSchematicLayout = window.__MTR_SCHEMATIC_LAYOUT__ || null;
    const lightRailStopLocationData = window.__LIGHT_RAIL_STOP_LOCATIONS__ || null;
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
                lastSchematicFocusKey: "",
                originStationCode: "",
                destinationStationCode: "",
                result: null,
                hasAutoFilledOrigin: false,
                hasUserEditedOrigin: false,
                hasUserEditedDestination: false,
                legPopover: {
                    viewId: "",
                    legIndex: -1
                },
                transferStopPopover: {
                    viewId: "",
                    stationCode: "",
                    stationNameZh: "",
                    stationNameEn: "",
                    legIndex: -1,
                    lineCode: "",
                    lineNameZh: "",
                    terminusCode: "",
                    terminusNameZh: "",
                    directionKey: "",
                    status: "idle",
                    errorMessage: "",
                    services: [],
                    requestId: 0,
                    activeController: null
                },
                mapView: {
                    scale: 1,
                    x: 0,
                    y: 0,
                    minScale: 0.56,
                    maxScale: 2.8,
                    isInitialized: false,
                    hasUserAdjusted: false
                },
                schematicView: {
                    scale: 1,
                    x: 0,
                    y: 0,
                    minScale: 0.42,
                    maxScale: 3.4,
                    isInitialized: false,
                    hasUserAdjusted: false
                }
            },
            routing: {
                runtime: null,
                lineGroups: [],
                transferStationCodes: [],
                officialMap: null,
                customSchematic: null
            }
        },
        lightRail: {
            routeCode: "",
            stopId: "",
            routes: [],
            stopIndex: {},
            nearest: {
                status: "idle",
                hasAttempted: false,
                errorMessage: "",
                userLocation: null,
                nearestStop: null,
                schedule: null,
                requestId: 0,
                activeController: null
            },
            realtime: {
                status: "idle",
                errorMessage: "",
                schedule: null,
                requestId: 0,
                activeController: null
            }
        },
        ui: { isReady: false, statusKind: "info", statusMessage: "正在準備官方靜態索引..." }
    };
    railState.ui.nextTrainModal = {
        isOpen: false,
        lineCode: "",
        directionKey: ""
    };
    const mapGestureState = {
        activePointers: new Map(),
        mode: "idle",
        dragStartPoint: null,
        dragStartView: null,
        pinchStartDistance: 0,
        pinchStartScale: 1,
        pinchContentPoint: null,
        suppressClickUntil: 0,
        hasDragged: false
    };
    const schematicGestureState = {
        activePointers: new Map(),
        mode: "idle",
        dragStartPoint: null,
        dragStartView: null,
        pinchStartDistance: 0,
        pinchStartScale: 1,
        pinchContentPoint: null,
        pressedStationCode: "",
        pressedPointerId: null,
        suppressClickUntil: 0,
        hasDragged: false
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
    function getVirtualRoutePlannerStation(stationCode) {
        if (!stationCode) return null;
        return MTR_VIRTUAL_ROUTE_POINTS[String(stationCode).toUpperCase()] || null;
    }
    function getWalkPairKey(leftStationCode, rightStationCode) {
        return [String(leftStationCode || "").toUpperCase(), String(rightStationCode || "").toUpperCase()]
            .filter(Boolean)
            .sort()
            .join("|");
    }
    function getWalkLinkDefinition(leftStationCode, rightStationCode) {
        const pairKey = getWalkPairKey(leftStationCode, rightStationCode);
        return [...MTR_BASE_WALK_LINKS, ...MTR_SPECIAL_WALK_ROUTES].find((link) => getWalkPairKey(link.from, link.to) === pairKey) || null;
    }
    function orientWalkStations(stationCodes, originStationCode, destinationStationCode) {
        const normalizedCodes = Array.isArray(stationCodes) ? stationCodes.map((stationCode) => String(stationCode || "").toUpperCase()).filter(Boolean) : [];
        if (normalizedCodes.length < 2) return [String(originStationCode || "").toUpperCase(), String(destinationStationCode || "").toUpperCase()].filter(Boolean);
        if (normalizedCodes[0] === String(originStationCode || "").toUpperCase() && normalizedCodes[normalizedCodes.length - 1] === String(destinationStationCode || "").toUpperCase()) {
            return normalizedCodes;
        }
        const reversedCodes = [...normalizedCodes].reverse();
        if (reversedCodes[0] === String(originStationCode || "").toUpperCase() && reversedCodes[reversedCodes.length - 1] === String(destinationStationCode || "").toUpperCase()) {
            return reversedCodes;
        }
        return normalizedCodes;
    }
    function mergeStationSequences(...sequences) {
        const merged = [];
        for (const sequence of sequences) {
            for (const stationCode of Array.isArray(sequence) ? sequence : []) {
                const normalizedCode = String(stationCode || "").toUpperCase();
                if (!normalizedCode) continue;
                if (merged[merged.length - 1] !== normalizedCode) merged.push(normalizedCode);
            }
        }
        return merged;
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
    function buildMtrSchematicRuntime(layoutData) {
        if (!layoutData || !layoutData.viewBox || !layoutData.lines || !layoutData.stations) return null;

        const stations = Object.fromEntries(
            Object.entries(layoutData.stations).map(([stationCode, stationEntry]) => [
                stationCode,
                {
                    stationCode,
                    nameZh: stationEntry.nameZh || stationCode,
                    nameEn: stationEntry.nameEn || stationCode,
                    x: Number(stationEntry.x) || 0,
                    y: Number(stationEntry.y) || 0,
                    marker: {
                        x: Number(stationEntry.markerX ?? stationEntry.x) || 0,
                        y: Number(stationEntry.markerY ?? stationEntry.y) || 0
                    },
                    interchange: Boolean(stationEntry.interchange),
                    lines: Array.isArray(stationEntry.lines) ? stationEntry.lines : [],
                    lineAnchors: Object.fromEntries(
                        Object.entries(stationEntry.lineAnchors || {}).map(([lineCode, anchorEntry]) => [
                            lineCode,
                            {
                                x: Number(anchorEntry?.x) || Number(stationEntry.markerX ?? stationEntry.x) || 0,
                                y: Number(anchorEntry?.y) || Number(stationEntry.markerY ?? stationEntry.y) || 0
                            }
                        ])
                    ),
                    label: {
                        text: stationEntry.label?.text || stationEntry.nameZh || stationCode,
                        anchor: stationEntry.label?.anchor || "start",
                        dx: Number(stationEntry.label?.dx) || 0,
                        dy: Number(stationEntry.label?.dy) || 0
                    }
                }
            ])
        );

        const lines = (Array.isArray(layoutData.lines) ? layoutData.lines : []).map((lineEntry) => ({
            lineCode: lineEntry.lineCode,
            color: lineEntry.color || getMtrOfficialLineColor(lineEntry.lineCode),
            lineNameZh: lineEntry.lineNameZh || lineEntry.lineCode,
            lineNameEn: lineEntry.lineNameEn || lineEntry.lineCode,
            branches: (Array.isArray(lineEntry.branches) ? lineEntry.branches : []).map((branchEntry) => ({
                branchId: branchEntry.branchId,
                labelZh: branchEntry.labelZh || branchEntry.branchId,
                directionCodes: Array.isArray(branchEntry.directionCodes) ? branchEntry.directionCodes : [],
                stationCodes: Array.isArray(branchEntry.stationCodes) ? branchEntry.stationCodes : [],
                segments: (Array.isArray(branchEntry.segments) ? branchEntry.segments : []).map((segmentEntry) => ({
                    segmentId: segmentEntry.segmentId,
                    from: segmentEntry.from,
                    to: segmentEntry.to,
                    points: Array.isArray(segmentEntry.points) ? segmentEntry.points : []
                }))
            }))
        }));
        const walkLinks = (Array.isArray(layoutData.walkLinks) ? layoutData.walkLinks : []).map((walkLinkEntry) => ({
            walkId: walkLinkEntry.walkId || getWalkPairKey(walkLinkEntry.from, walkLinkEntry.to),
            linkKey: walkLinkEntry.linkKey || getWalkPairKey(walkLinkEntry.from, walkLinkEntry.to),
            from: String(walkLinkEntry.from || "").toUpperCase(),
            to: String(walkLinkEntry.to || "").toUpperCase(),
            points: Array.isArray(walkLinkEntry.points) ? walkLinkEntry.points : []
        }));
        const landmarks = Object.fromEntries(
            (Array.isArray(layoutData.landmarks) ? layoutData.landmarks : []).map((landmarkEntry) => {
                const stationCode = String(landmarkEntry.stationCode || landmarkEntry.landmarkCode || "").toUpperCase();
                return [
                    stationCode,
                    {
                        stationCode,
                        nameZh: landmarkEntry.nameZh || stationCode,
                        nameEn: landmarkEntry.nameEn || stationCode,
                        x: Number(landmarkEntry.x) || 0,
                        y: Number(landmarkEntry.y) || 0,
                        selectable: landmarkEntry.selectable !== false,
                        label: {
                            text: landmarkEntry.label?.text || landmarkEntry.nameZh || stationCode,
                            anchor: landmarkEntry.label?.anchor || "middle",
                            dx: Number(landmarkEntry.label?.dx) || 0,
                            dy: Number(landmarkEntry.label?.dy) || 0
                        }
                    }
                ];
            })
        );

        const stationList = Object.values(stations).sort((left, right) => {
            if ((left.marker?.y ?? left.y) !== (right.marker?.y ?? right.y)) {
                return (left.marker?.y ?? left.y) - (right.marker?.y ?? right.y);
            }
            return (left.marker?.x ?? left.x) - (right.marker?.x ?? right.x);
        });
        const landmarkList = Object.values(landmarks).sort((left, right) => {
            if (left.y !== right.y) return left.y - right.y;
            return left.x - right.x;
        });

        return {
            generatedAt: layoutData.generatedAt || "",
            version: layoutData.version || 1,
            viewBox: {
                minX: Number(layoutData.viewBox.minX) || 0,
                minY: Number(layoutData.viewBox.minY) || 0,
                width: Number(layoutData.viewBox.width) || 1600,
                height: Number(layoutData.viewBox.height) || 1100
            },
            meta: layoutData.meta || {},
            lines,
            walkLinks,
            landmarks,
            stations,
            stationList,
            landmarkList
        };
    }
    function pointsToSvgPath(points) {
        if (!Array.isArray(points) || points.length === 0) return "";
        return points
            .map((point, index) => {
                const [x = 0, y = 0] = Array.isArray(point) ? point : [point?.x || 0, point?.y || 0];
                return `${index === 0 ? "M" : "L"} ${x} ${y}`;
            })
            .join(" ");
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
    function getMapViewportState() {
        return railState.mtr.routePlanner.mapView;
    }
    function clampMapScale(value) {
        const mapView = getMapViewportState();
        return Math.min(mapView.maxScale, Math.max(mapView.minScale, value));
    }
    function getMapViewportMetrics(viewport, scale = getMapViewportState().scale) {
        const mapRuntime = railState.mtr.routing.officialMap;
        if (!(viewport instanceof HTMLElement) || !mapRuntime) return null;
        const scaledWidth = mapRuntime.width * scale;
        const scaledHeight = mapRuntime.height * scale;
        return {
            viewportWidth: viewport.clientWidth,
            viewportHeight: viewport.clientHeight,
            mapWidth: mapRuntime.width,
            mapHeight: mapRuntime.height,
            scaledWidth,
            scaledHeight
        };
    }
    function clampMapOffset(viewport, x, y, scale = getMapViewportState().scale) {
        const metrics = getMapViewportMetrics(viewport, scale);
        if (!metrics) return { x, y };

        const clampedX = metrics.scaledWidth <= metrics.viewportWidth
            ? (metrics.viewportWidth - metrics.scaledWidth) / 2
            : Math.min(0, Math.max(metrics.viewportWidth - metrics.scaledWidth, x));
        const clampedY = metrics.scaledHeight <= metrics.viewportHeight
            ? (metrics.viewportHeight - metrics.scaledHeight) / 2
            : Math.min(0, Math.max(metrics.viewportHeight - metrics.scaledHeight, y));

        return { x: clampedX, y: clampedY };
    }
    function getViewportLocalPoint(viewport, clientX, clientY) {
        const rect = viewport.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
    }
    function getMapFocusBounds(stationCodes) {
        const points = stationCodes.map((stationCode) => getMtrOfficialMapStation(stationCode)).filter(Boolean);
        if (points.length === 0) return null;

        return {
            points,
            minX: Math.min(...points.map((point) => point.x)),
            maxX: Math.max(...points.map((point) => point.x)),
            minY: Math.min(...points.map((point) => point.y)),
            maxY: Math.max(...points.map((point) => point.y))
        };
    }
    function getDefaultMapScale(viewport) {
        const metrics = getMapViewportMetrics(viewport, 1);
        if (!metrics) return 1;
        const viewportWidth = metrics.viewportWidth;
        if (viewportWidth < 420) return clampMapScale(0.72);
        if (viewportWidth < 720) return clampMapScale(0.82);
        if (viewportWidth < 1080) return clampMapScale(0.92);
        return clampMapScale(1.02);
    }
    function setMapView(viewport, nextScale, nextX, nextY, { markAdjusted = false } = {}) {
        const mapView = getMapViewportState();
        const scale = clampMapScale(nextScale);
        const offset = clampMapOffset(viewport, nextX, nextY, scale);
        mapView.scale = scale;
        mapView.x = offset.x;
        mapView.y = offset.y;
        if (markAdjusted) mapView.hasUserAdjusted = true;
        applyMapTransform(viewport);
    }
    function applyMapTransform(viewport) {
        const scene = document.getElementById("mtrOfficialMapScene");
        if (!(viewport instanceof HTMLElement) || !(scene instanceof HTMLElement)) return;
        const mapView = getMapViewportState();
        scene.style.transform = `translate3d(${mapView.x}px, ${mapView.y}px, 0) scale(${mapView.scale})`;
    }
    function centerMapOnBounds(viewport, bounds, { scaleOverride = null, markAdjusted = false } = {}) {
        if (!(viewport instanceof HTMLElement) || !bounds) return;
        const metrics = getMapViewportMetrics(viewport, 1);
        if (!metrics) return;

        const scale = clampMapScale(scaleOverride ?? getMapViewportState().scale);
        const paddingX = Math.min(110, Math.max(54, metrics.viewportWidth * 0.12));
        const paddingY = Math.min(110, Math.max(54, metrics.viewportHeight * 0.14));
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const targetX = metrics.viewportWidth / 2 - centerX * scale;
        const targetY = metrics.viewportHeight / 2 - centerY * scale - paddingY * 0.08;

        setMapView(viewport, scale, targetX, targetY, { markAdjusted });
    }
    function zoomMapAtPoint(viewport, nextScale, focusPoint, { markAdjusted = false } = {}) {
        if (!(viewport instanceof HTMLElement) || !focusPoint) return;
        const mapView = getMapViewportState();
        const scale = clampMapScale(nextScale);
        const contentX = (focusPoint.x - mapView.x) / mapView.scale;
        const contentY = (focusPoint.y - mapView.y) / mapView.scale;
        const nextX = focusPoint.x - contentX * scale;
        const nextY = focusPoint.y - contentY * scale;
        setMapView(viewport, scale, nextX, nextY, { markAdjusted });
    }
    function initializeMapViewport(viewport, focusStationCodes = []) {
        const mapView = getMapViewportState();
        if (!(viewport instanceof HTMLElement) || mapView.isInitialized) {
            applyMapTransform(viewport);
            return;
        }

        const focusBounds = getMapFocusBounds(focusStationCodes);
        const defaultScale = getDefaultMapScale(viewport);
        mapView.isInitialized = true;
        if (focusBounds) {
            centerMapOnBounds(viewport, focusBounds, { scaleOverride: defaultScale });
            return;
        }

        setMapView(viewport, defaultScale, 0, 0);
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
    function getSelectedLightRailRoute() {
        return railState.lightRail.routes.find((route) => route.routeCode === railState.lightRail.routeCode) || null;
    }
    function getSelectedLightRailStop() {
        return railState.lightRail.stopIndex[railState.lightRail.stopId] || null;
    }
    function getLightRailStopLocation(stopId) {
        return lightRailStopLocationData?.stopLocations?.[String(stopId || "")] || null;
    }
    function enrichLightRailStopIndexWithLocations(stopIndex) {
        const nextStopIndex = {};
        for (const [stopId, stopEntry] of Object.entries(stopIndex || {})) {
            const location = getLightRailStopLocation(stopId);
            nextStopIndex[stopId] = location
                ? {
                    ...stopEntry,
                    location: {
                        latitude: Number(location.latitude),
                        longitude: Number(location.longitude),
                        source: "Official GTFS stop data + MTR Bus/Feeder Bus stop data"
                    }
                }
                : { ...stopEntry };
        }
        return nextStopIndex;
    }
    function abortLightRailRealtimeRequest() {
        if (railState.lightRail.realtime.activeController instanceof AbortController) railState.lightRail.realtime.activeController.abort();
        railState.lightRail.realtime.activeController = null;
    }
    function abortLightRailNearestRequest() {
        if (railState.lightRail.nearest.activeController instanceof AbortController) railState.lightRail.nearest.activeController.abort();
        railState.lightRail.nearest.activeController = null;
    }
    function resetLightRailRealtimeState() {
        abortLightRailRealtimeRequest();
        railState.lightRail.realtime.status = "idle";
        railState.lightRail.realtime.errorMessage = "";
        railState.lightRail.realtime.schedule = null;
    }
    function parseLightRailMinutes(...values) {
        for (const value of values) {
            const text = String(value || "").trim();
            if (!text) continue;
            const match = text.match(/(\d+)/);
            if (match) return Number.parseInt(match[1], 10);
            if (/(arriving|departing|即將抵達|正在離開)/i.test(text)) return 0;
        }
        return null;
    }
    function resolveLightRailCountdownState(service) {
        const timeZh = String(service?.time_ch || "").trim();
        const timeEn = String(service?.time_en || "").trim();
        const isDeparture = String(service?.arrival_departure || "").toUpperCase() === "D";
        const isStopped = Number.parseInt(String(service?.stop || "0"), 10) === 1;
        if (isStopped) return "停站中";
        if (timeZh === "正在離開" || /departing/i.test(timeEn)) return "正在離開";
        if (timeZh === "即將抵達" || /arriving/i.test(timeEn)) return "即將抵達";
        if (timeZh === "-" || timeEn === "-") return isDeparture ? "即將開出" : "即將進站";
        if (parseLightRailMinutes(timeZh, timeEn) !== null) return "倒數中";
        return "時間未提供";
    }
    function compareLightRailServices(left, right) {
        const leftMinutes = Number.isFinite(left?.minutes) ? left.minutes : Number.POSITIVE_INFINITY;
        const rightMinutes = Number.isFinite(right?.minutes) ? right.minutes : Number.POSITIVE_INFINITY;
        if (leftMinutes !== rightMinutes) return leftMinutes - rightMinutes;
        const leftRoute = String(left?.routeNo || "");
        const rightRoute = String(right?.routeNo || "");
        return leftRoute.localeCompare(rightRoute, "en", { numeric: true });
    }
    function normalizeLightRailService(service, platformId) {
        const remarks = [
            service?.additionalInfo1,
            service?.routeRemarkChi2,
            service?.routeRemarkEng2
        ]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
            .filter((value, index, array) => array.indexOf(value) === index);
        const routeNo = String(service?.route_no || "").trim();
        const timeTextZh = String(service?.time_ch || "").trim();
        const timeTextEn = String(service?.time_en || "").trim();
        const minutes = parseLightRailMinutes(timeTextZh, timeTextEn);
        const trainLength = Number.parseInt(String(service?.train_length || ""), 10);
        const arrivalDeparture = String(service?.arrival_departure || "").toUpperCase() === "D" ? "departure" : "arrival";

        return {
            id: [platformId, routeNo, service?.dest_ch || service?.dest_en || "", timeTextZh, timeTextEn].join("-"),
            platformId: String(platformId || ""),
            routeNo,
            destinationNameZh: String(service?.dest_ch || service?.dest_en || "未提供目的地").trim(),
            destinationNameEn: String(service?.dest_en || "").trim(),
            arrivalDeparture,
            arrivalDepartureLabel: arrivalDeparture === "departure" ? "開出" : "到站",
            timeTextZh: timeTextZh || timeTextEn || "時間未提供",
            timeTextEn,
            minutes,
            statusLabel: resolveLightRailCountdownState(service),
            trainLength: Number.isFinite(trainLength) ? trainLength : null,
            trainLengthLabel: Number.isFinite(trainLength) ? `${trainLength} 卡列車` : "",
            isSpecial: Number.parseInt(String(service?.special || "0"), 10) === 1,
            isStopped: Number.parseInt(String(service?.stop || "0"), 10) === 1,
            remarks
        };
    }
    function normalizeLightRailScheduleResponse(payload, stopEntry) {
        const platforms = (Array.isArray(payload?.platform_list) ? payload.platform_list : [])
            .map((platformEntry) => {
                const platformId = String(platformEntry?.platform_id || "").trim();
                const services = (Array.isArray(platformEntry?.route_list) ? platformEntry.route_list : [])
                    .filter((service) => service && typeof service === "object")
                    .map((service) => normalizeLightRailService(service, platformId))
                    .sort(compareLightRailServices);
                return {
                    platformId,
                    services,
                    nextService: services[0] || null
                };
            })
            .filter((platform) => platform.platformId && platform.services.length > 0)
            .sort((left, right) => Number.parseInt(left.platformId, 10) - Number.parseInt(right.platformId, 10));

        return {
            stopId: String(stopEntry?.stopId || ""),
            stopCode: String(stopEntry?.stopCode || ""),
            stopNameZh: String(stopEntry?.nameZh || stopEntry?.stopId || ""),
            stopNameEn: String(stopEntry?.nameEn || ""),
            systemTime: String(payload?.system_time || "").trim(),
            systemTimeLabel: formatClockTime(payload?.system_time || ""),
            statusCode: Number.parseInt(String(payload?.status || "0"), 10) || 0,
            isNormal: Number.parseInt(String(payload?.status || "0"), 10) === 1,
            platforms,
            hasAnyData: platforms.length > 0
        };
    }
    async function fetchLightRailSchedule(stopEntry, signal) {
        const query = new URLSearchParams({ station_id: String(stopEntry.stopId || "") });
        const response = await fetch(`${LIGHT_RAIL_SCHEDULE_ENDPOINT}?${query.toString()}`, { method: "GET", headers: { Accept: "application/json" }, signal });
        if (!response.ok) throw new Error(`輕鐵即時資料服務回應失敗（HTTP ${response.status}）。`);
        const payload = await response.json();
        const normalizedSchedule = normalizeLightRailScheduleResponse(payload, stopEntry);
        if (!normalizedSchedule.isNormal && !normalizedSchedule.hasAnyData) {
            throw new Error("官方暫時未能提供此輕鐵站的即時班次。");
        }
        return normalizedSchedule;
    }
    async function requestLightRailSchedule() {
        const selectedStop = getSelectedLightRailStop();
        if (!selectedStop) {
            resetLightRailRealtimeState();
            renderCurrentTab();
            bindCurrentTabEvents();
            return;
        }

        abortLightRailRealtimeRequest();
        const requestId = railState.lightRail.realtime.requestId + 1;
        const controller = new AbortController();
        railState.lightRail.realtime.requestId = requestId;
        railState.lightRail.realtime.activeController = controller;
        railState.lightRail.realtime.status = "loading";
        railState.lightRail.realtime.errorMessage = "";
        railState.lightRail.realtime.schedule = null;
        setStatus(`正在讀取輕鐵 <strong>${escapeHtml(selectedStop.nameZh)}</strong> 的即時班次…`, "info");
        renderCurrentTab();
        bindCurrentTabEvents();

        try {
            const normalizedSchedule = await fetchLightRailSchedule(selectedStop, controller.signal);
            if (railState.lightRail.realtime.requestId !== requestId) return;
            railState.lightRail.realtime.schedule = normalizedSchedule;
            railState.lightRail.realtime.status = normalizedSchedule.hasAnyData ? "success" : "empty";
            railState.lightRail.realtime.errorMessage = "";
            if (railState.lightRail.nearest.nearestStop?.stopId === normalizedSchedule.stopId) {
                railState.lightRail.nearest.schedule = normalizedSchedule;
                railState.lightRail.nearest.status = normalizedSchedule.hasAnyData ? "ready" : "empty";
            }
            setStatus(
                normalizedSchedule.hasAnyData
                    ? `已更新輕鐵 <strong>${escapeHtml(normalizedSchedule.stopNameZh)}</strong> 的即時班次。`
                    : `官方暫時未有 <strong>${escapeHtml(normalizedSchedule.stopNameZh)}</strong> 的可顯示班次。`,
                normalizedSchedule.hasAnyData ? "info" : "warning"
            );
        } catch (error) {
            if (controller.signal.aborted || railState.lightRail.realtime.requestId !== requestId) return;
            railState.lightRail.realtime.status = "error";
            railState.lightRail.realtime.errorMessage = error instanceof Error ? error.message : "暫時未能讀取輕鐵即時班次。";
            railState.lightRail.realtime.schedule = null;
            setStatus(railState.lightRail.realtime.errorMessage, "error");
        } finally {
            if (railState.lightRail.realtime.requestId !== requestId) return;
            railState.lightRail.realtime.activeController = null;
            renderCurrentTab();
            bindCurrentTabEvents();
        }
    }
    function findNearestLightRailStop(position) {
        return Object.values(railState.lightRail.stopIndex)
            .filter((stop) => Number.isFinite(stop.location?.latitude) && Number.isFinite(stop.location?.longitude))
            .map((stop) => ({
                ...stop,
                distanceMeters: haversineDistanceMeters(position.latitude, position.longitude, stop.location.latitude, stop.location.longitude)
            }))
            .sort((left, right) => left.distanceMeters - right.distanceMeters)[0] || null;
    }
    function getLightRailNearestPreviewServices(schedule, selectedRoute) {
        const services = (Array.isArray(schedule?.platforms) ? schedule.platforms : [])
            .flatMap((platform) => Array.isArray(platform.services) ? platform.services : [])
            .filter(Boolean);
        if (services.length === 0) return [];
        const selectedRouteCode = selectedRoute?.routeCode || "";
        const focusedServices = selectedRouteCode ? services.filter((service) => service.routeNo === selectedRouteCode) : [];
        return (focusedServices.length > 0 ? focusedServices : services)
            .slice()
            .sort(compareLightRailServices)
            .slice(0, 3);
    }
    async function requestNearestLightRailSummary(force = false) {
        if (railState.currentTab !== "lightRail") return;
        if (!force && railState.lightRail.nearest.hasAttempted) return;

        abortLightRailNearestRequest();
        railState.lightRail.nearest.requestId += 1;
        const requestId = railState.lightRail.nearest.requestId;
        const controller = new AbortController();
        railState.lightRail.nearest.activeController = controller;
        railState.lightRail.nearest.hasAttempted = true;
        railState.lightRail.nearest.status = "locating";
        railState.lightRail.nearest.errorMessage = "";
        railState.lightRail.nearest.userLocation = null;
        railState.lightRail.nearest.nearestStop = null;
        railState.lightRail.nearest.schedule = null;
        setStatus("正在定位最近輕鐵站…", "info");
        renderCurrentTab();
        bindCurrentTabEvents();

        try {
            const position = await locateUserPosition();
            if (railState.lightRail.nearest.requestId !== requestId) return;

            railState.lightRail.nearest.userLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            const nearestStop = findNearestLightRailStop(railState.lightRail.nearest.userLocation);
            if (!nearestStop) {
                railState.lightRail.nearest.status = "notFound";
                railState.lightRail.nearest.errorMessage = "暫時未能從現有輕鐵站點資料計算最近站。";
                setStatus(railState.lightRail.nearest.errorMessage, "warning");
                renderCurrentTab();
                bindCurrentTabEvents();
                return;
            }

            railState.lightRail.nearest.nearestStop = nearestStop;
            railState.lightRail.nearest.status = "loading";
            setStatus(`已找到最近輕鐵站 <strong>${escapeHtml(nearestStop.nameZh)}</strong>，距離約 ${escapeHtml(formatDistance(nearestStop.distanceMeters))}。正在整理即時班次…`, "info");
            renderCurrentTab();
            bindCurrentTabEvents();

            const schedule = await fetchLightRailSchedule(nearestStop, controller.signal);
            if (railState.lightRail.nearest.requestId !== requestId) return;
            railState.lightRail.nearest.schedule = schedule;
            railState.lightRail.nearest.status = schedule.hasAnyData ? "ready" : "empty";
            setStatus(
                schedule.hasAnyData
                    ? `最近輕鐵站 <strong>${escapeHtml(nearestStop.nameZh)}</strong> 的即時班次已準備好。`
                    : `已找到最近輕鐵站 <strong>${escapeHtml(nearestStop.nameZh)}</strong>，但官方暫時未有可顯示的班次。`,
                schedule.hasAnyData ? "info" : "warning"
            );
        } catch (error) {
            if (controller.signal.aborted || railState.lightRail.nearest.requestId !== requestId) return;
            const code = error && typeof error === "object" && "code" in error ? error.code : null;
            if (code === 1) {
                railState.lightRail.nearest.status = "permissionDenied";
                railState.lightRail.nearest.errorMessage = "你未允許定位權限，可以按重新定位再試一次。";
            } else if (code === 2) {
                railState.lightRail.nearest.status = "locationError";
                railState.lightRail.nearest.errorMessage = "目前無法判斷你的位置，請確認裝置定位服務已開啟。";
            } else if (code === 3) {
                railState.lightRail.nearest.status = "locationError";
                railState.lightRail.nearest.errorMessage = "定位逾時，請稍後再試一次。";
            } else {
                railState.lightRail.nearest.status = "locationError";
                railState.lightRail.nearest.errorMessage = error instanceof Error ? error.message : "暫時未能完成最近輕鐵站定位。";
            }
            railState.lightRail.nearest.schedule = null;
            setStatus(railState.lightRail.nearest.errorMessage, "warning");
        } finally {
            if (railState.lightRail.nearest.requestId !== requestId) return;
            railState.lightRail.nearest.activeController = null;
            renderCurrentTab();
            bindCurrentTabEvents();
        }
    }
    function applyNearestLightRailStop() {
        const nearestStop = railState.lightRail.nearest.nearestStop;
        if (!nearestStop?.stopId) return;

        const routeStillMatches = !railState.lightRail.routeCode || nearestStop.routes?.some((route) => route.routeCode === railState.lightRail.routeCode);
        if (!routeStillMatches) railState.lightRail.routeCode = "";

        railState.lightRail.stopId = nearestStop.stopId;
        setStatus(
            routeStillMatches
                ? `已帶入最近輕鐵站 <strong>${escapeHtml(nearestStop.nameZh)}</strong>。`
                : `已帶入最近輕鐵站 <strong>${escapeHtml(nearestStop.nameZh)}</strong>，並清除不相容的路線篩選。`,
            "info"
        );
        renderCurrentTab();
        bindCurrentTabEvents();
        void requestLightRailSchedule();
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
        closeNextTrainModal();
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
        return getMtrStationByCode(stationCode) || getVirtualRoutePlannerStation(stationCode);
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
        if (String(lineCode || "").toUpperCase() === "WALK") return "步行";
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
            .map((leg) => `${leg.kind || "ride"}:${leg.lineCode}:${leg.stations.join(">")}`)
            .join("|");
    }
    function findPureMtrRoute(originStationCode, destinationStationCode, weighting = null) {
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
            stationCodes,
            hasWalkConnections: false
        };
    }
    function getWalkRouteScore(linkDefinition, weighting) {
        const baseScore = Number.isFinite(Number(linkDefinition?.weight)) ? Number(linkDefinition.weight) : 2;
        const transferBias = Number.isFinite(weighting?.transferCost) ? Math.max(0, weighting.transferCost - 4) * 0.04 : 0;
        return baseScore + transferBias;
    }
    function buildWalkLeg(linkDefinition, originStationCode, destinationStationCode) {
        const stations = orientWalkStations(linkDefinition?.stations, originStationCode, destinationStationCode);
        return {
            kind: "walk",
            lineCode: "WALK",
            lineNameZh: "步行",
            stations,
            stopCount: 0,
            terminusNameZh: getRoutePlannerStationEntry(destinationStationCode)?.nameZh || destinationStationCode,
            walkLabelZh: linkDefinition?.labelZh || "步行連接"
        };
    }
    function buildWalkOnlyRoute(originStationCode, destinationStationCode, linkDefinition, weighting = null) {
        const walkLeg = buildWalkLeg(linkDefinition, originStationCode, destinationStationCode);
        return {
            status: "ready",
            originStationCode,
            destinationStationCode,
            score: getWalkRouteScore(linkDefinition, weighting),
            totalStops: 0,
            needsTransfer: false,
            transferStations: [],
            legs: [walkLeg],
            stationCodes: mergeStationSequences(walkLeg.stations),
            hasWalkConnections: true
        };
    }
    function appendWalkLegToRoute(routeResult, originStationCode, destinationStationCode, linkDefinition, weighting = null) {
        if (!routeResult || routeResult.status === "unreachable") return null;
        const walkLeg = buildWalkLeg(linkDefinition, originStationCode, destinationStationCode);
        return {
            ...routeResult,
            destinationStationCode,
            score: (routeResult.score ?? 0) + getWalkRouteScore(linkDefinition, weighting),
            legs: [...(Array.isArray(routeResult.legs) ? routeResult.legs : []), walkLeg],
            stationCodes: mergeStationSequences(routeResult.stationCodes, walkLeg.stations),
            hasWalkConnections: true
        };
    }
    function prependWalkLegToRoute(routeResult, originStationCode, destinationStationCode, linkDefinition, weighting = null) {
        if (!routeResult || routeResult.status === "unreachable") return null;
        const walkLeg = buildWalkLeg(linkDefinition, originStationCode, destinationStationCode);
        return {
            ...routeResult,
            originStationCode,
            score: (routeResult.score ?? 0) + getWalkRouteScore(linkDefinition, weighting),
            legs: [walkLeg, ...(Array.isArray(routeResult.legs) ? routeResult.legs : [])],
            stationCodes: mergeStationSequences(walkLeg.stations, routeResult.stationCodes),
            hasWalkConnections: true
        };
    }
    function compareRouteCandidates(leftRoute, rightRoute) {
        if (!leftRoute) return 1;
        if (!rightRoute) return -1;
        const leftScore = Number.isFinite(leftRoute.score) ? leftRoute.score : Number.POSITIVE_INFINITY;
        const rightScore = Number.isFinite(rightRoute.score) ? rightRoute.score : Number.POSITIVE_INFINITY;
        if (leftScore !== rightScore) return leftScore - rightScore;

        const leftTransfers = Array.isArray(leftRoute.transferStations) ? leftRoute.transferStations.length : 0;
        const rightTransfers = Array.isArray(rightRoute.transferStations) ? rightRoute.transferStations.length : 0;
        if (leftTransfers !== rightTransfers) return leftTransfers - rightTransfers;

        const leftWalkLegs = Array.isArray(leftRoute.legs) ? leftRoute.legs.filter((leg) => leg.kind === "walk").length : 0;
        const rightWalkLegs = Array.isArray(rightRoute.legs) ? rightRoute.legs.filter((leg) => leg.kind === "walk").length : 0;
        if (leftWalkLegs !== rightWalkLegs) return leftWalkLegs - rightWalkLegs;

        const leftStops = Number.isFinite(leftRoute.totalStops) ? leftRoute.totalStops : Number.POSITIVE_INFINITY;
        const rightStops = Number.isFinite(rightRoute.totalStops) ? rightRoute.totalStops : Number.POSITIVE_INFINITY;
        if (leftStops !== rightStops) return leftStops - rightStops;

        return (leftRoute.legs?.length || 0) - (rightRoute.legs?.length || 0);
    }
    function getBestRouteCandidate(candidates) {
        return (Array.isArray(candidates) ? candidates : [])
            .filter((candidate) => candidate && candidate.status !== "unreachable")
            .sort(compareRouteCandidates)[0] || null;
    }
    function findSuggestedMtrRoute(originStationCode, destinationStationCode, weighting = null) {
        const normalizedOrigin = String(originStationCode || "").toUpperCase();
        const normalizedDestination = String(destinationStationCode || "").toUpperCase();
        const originStation = getRoutePlannerStationEntry(normalizedOrigin);
        const destinationStation = getRoutePlannerStationEntry(normalizedDestination);

        if (!originStation || !destinationStation) return null;
        if (normalizedOrigin === normalizedDestination) {
            return {
                status: "sameStation",
                originStationCode: normalizedOrigin,
                destinationStationCode: normalizedDestination,
                totalStops: 0,
                needsTransfer: false,
                transferStations: [],
                legs: [],
                stationCodes: [normalizedOrigin],
                score: 0,
                hasWalkConnections: false
            };
        }

        const candidates = [];
        const railOnlyRoute = findPureMtrRoute(normalizedOrigin, normalizedDestination, weighting);
        if (railOnlyRoute) candidates.push(railOnlyRoute);

        const directBaseWalk = MTR_BASE_WALK_LINKS.find((link) => getWalkPairKey(link.from, link.to) === getWalkPairKey(normalizedOrigin, normalizedDestination));
        if (directBaseWalk) {
            candidates.push(buildWalkOnlyRoute(normalizedOrigin, normalizedDestination, directBaseWalk, weighting));
        }

        const directSpecialWalk = MTR_SPECIAL_WALK_ROUTES.find((link) => getWalkPairKey(link.from, link.to) === getWalkPairKey(normalizedOrigin, normalizedDestination));
        if (directSpecialWalk) {
            candidates.push(buildWalkOnlyRoute(normalizedOrigin, normalizedDestination, directSpecialWalk, weighting));
        }

        for (const walkLink of MTR_BASE_WALK_LINKS) {
            const walkFrom = String(walkLink.from || "").toUpperCase();
            const walkTo = String(walkLink.to || "").toUpperCase();

            if (normalizedOrigin === walkFrom && normalizedDestination !== walkTo) {
                const continuationRoute = findPureMtrRoute(walkTo, normalizedDestination, weighting);
                if (continuationRoute) {
                    candidates.push(prependWalkLegToRoute(continuationRoute, normalizedOrigin, walkTo, walkLink, weighting));
                }
            }
            if (normalizedOrigin === walkTo && normalizedDestination !== walkFrom) {
                const continuationRoute = findPureMtrRoute(walkFrom, normalizedDestination, weighting);
                if (continuationRoute) {
                    candidates.push(prependWalkLegToRoute(continuationRoute, normalizedOrigin, walkFrom, walkLink, weighting));
                }
            }
            if (normalizedDestination === walkFrom && normalizedOrigin !== walkTo) {
                const accessRoute = findPureMtrRoute(normalizedOrigin, walkTo, weighting);
                if (accessRoute) {
                    candidates.push(appendWalkLegToRoute(accessRoute, walkTo, normalizedDestination, walkLink, weighting));
                }
            }
            if (normalizedDestination === walkTo && normalizedOrigin !== walkFrom) {
                const accessRoute = findPureMtrRoute(normalizedOrigin, walkFrom, weighting);
                if (accessRoute) {
                    candidates.push(appendWalkLegToRoute(accessRoute, walkFrom, normalizedDestination, walkLink, weighting));
                }
            }
        }

        return getBestRouteCandidate(candidates) || {
            status: "unreachable",
            originStationCode: normalizedOrigin,
            destinationStationCode: normalizedDestination
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
        closeRoutePlannerLegPopover();
        closeRoutePlannerTransferStopPopover();
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
    function abortRoutePlannerTransferStopRequest() {
        const transferPopover = railState.mtr.routePlanner.transferStopPopover;
        if (transferPopover.activeController instanceof AbortController) {
            transferPopover.activeController.abort();
        }
        transferPopover.activeController = null;
    }
    function closeRoutePlannerTransferStopPopover() {
        const transferPopover = railState.mtr.routePlanner.transferStopPopover;
        abortRoutePlannerTransferStopRequest();
        transferPopover.viewId = "";
        transferPopover.stationCode = "";
        transferPopover.stationNameZh = "";
        transferPopover.stationNameEn = "";
        transferPopover.legIndex = -1;
        transferPopover.lineCode = "";
        transferPopover.lineNameZh = "";
        transferPopover.terminusCode = "";
        transferPopover.terminusNameZh = "";
        transferPopover.directionKey = "";
        transferPopover.status = "idle";
        transferPopover.errorMessage = "";
        transferPopover.services = [];
        transferPopover.requestId += 1;
    }
    function isRoutePlannerTransferStopPopoverOpen(viewId, stationCode, legIndex = -1) {
        const transferPopover = railState.mtr.routePlanner.transferStopPopover;
        if (!viewId || !stationCode) return false;
        return transferPopover.viewId === viewId
            && transferPopover.stationCode === String(stationCode || "").toUpperCase()
            && (legIndex < 0 || transferPopover.legIndex === legIndex);
    }
    function closeRoutePlannerLegPopover() {
        const popoverState = railState.mtr.routePlanner.legPopover;
        popoverState.viewId = "";
        popoverState.legIndex = -1;
    }
    function isRoutePlannerLegPopoverOpen(viewId, legIndex) {
        const popoverState = railState.mtr.routePlanner.legPopover;
        return popoverState.viewId === viewId && popoverState.legIndex === legIndex;
    }
    function toggleRoutePlannerLegPopover(viewId, legIndex) {
        if (!viewId || !Number.isInteger(legIndex) || legIndex < 0) {
            closeRoutePlannerLegPopover();
            return;
        }
        if (isRoutePlannerLegPopoverOpen(viewId, legIndex)) {
            closeRoutePlannerLegPopover();
            return;
        }
        closeRoutePlannerTransferStopPopover();
        railState.mtr.routePlanner.legPopover.viewId = viewId;
        railState.mtr.routePlanner.legPopover.legIndex = legIndex;
    }
    function getRoutePlannerStationDisplayName(stationCode) {
        if (!stationCode) return "";
        return getRoutePlannerStationEntry(stationCode)?.nameZh
            || getVirtualRoutePlannerStation(stationCode)?.nameZh
            || String(stationCode).toUpperCase();
    }
    function getRoutePlannerLegPopoverData(viewId, legIndex) {
        if (!viewId || !Number.isInteger(legIndex) || legIndex < 0) return null;
        const routeView = getRoutePlannerViews().find((view) => view.id === viewId);
        const routeResult = routeView?.result;
        if (!routeResult || routeResult.status !== "ready" || !Array.isArray(routeResult.legs)) return null;
        const leg = routeResult.legs[legIndex];
        if (!leg) return null;

        const stationNames = Array.isArray(leg.stations)
            ? leg.stations.map((stationCode) => getRoutePlannerStationDisplayName(stationCode)).filter(Boolean)
            : [];
        const originName = stationNames[0] || getRoutePlannerStationDisplayName(leg.stations?.[0]) || "";
        const destinationName = stationNames[stationNames.length - 1]
            || getRoutePlannerStationDisplayName(leg.stations?.[leg.stations.length - 1])
            || "";

        return {
            routeView,
            routeResult,
            leg,
            stationNames,
            originName,
            destinationName
        };
    }
    function buildRoutePlannerLegPopoverMarkup(viewId, legIndex) {
        if (!isRoutePlannerLegPopoverOpen(viewId, legIndex)) return "";

        const popoverData = getRoutePlannerLegPopoverData(viewId, legIndex);
        if (!popoverData) {
            return `
                <div class="rail-route-leg-popover" data-route-leg-popover role="dialog" aria-modal="false" aria-label="路段站序資料">
                    <div class="rail-route-leg-popover-head">
                        <div class="rail-summary-main">
                            <h5 class="rail-route-leg-popover-title">此段資料暫時不足</h5>
                            <p class="rail-route-leg-popover-path">請稍後再試，或切換其他建議方案。</p>
                        </div>
                        <button type="button" class="rail-route-leg-popover-close" data-route-leg-close aria-label="關閉路段站序">關閉</button>
                    </div>
                </div>`;
        }

        const { leg, stationNames, originName, destinationName } = popoverData;
        const headline = getRoutePlannerLegHeadline(leg) || "路段資料";
        const pathText = originName && destinationName
            ? `${originName} → ${destinationName}`
            : originName || destinationName || "起點 / 終點資料暫時不足";
        const stationSummary = stationNames.length > 0
            ? `${leg.kind === "walk" ? "步行途經：" : "途經站："}${stationNames.join("、")}`
            : `${leg.kind === "walk" ? "步行段說明：" : "友善提示："}${leg.kind === "walk" ? (leg.walkLabelZh || "請按站內指示步行接駁。") : "目前未能整理此段完整站序，但路線規劃結果本身仍可使用。"}`;
        const walkSummary = leg.kind === "walk" && leg.walkLabelZh
            ? `<p class="rail-route-leg-popover-copy">${escapeHtml(`步行說明：${leg.walkLabelZh}`)}</p>`
            : "";

        return `
            <div class="rail-route-leg-popover" data-route-leg-popover role="dialog" aria-modal="false" aria-label="路段站序資料">
                <div class="rail-route-leg-popover-head">
                    <div class="rail-summary-main">
                        <h5 class="rail-route-leg-popover-title">${escapeHtml(headline)}</h5>
                        <p class="rail-route-leg-popover-path">${escapeHtml(pathText)}</p>
                    </div>
                    <button type="button" class="rail-route-leg-popover-close" data-route-leg-close aria-label="關閉路段站序">關閉</button>
                </div>
                <div class="rail-route-leg-popover-body">
                    ${walkSummary}
                    <p class="rail-route-leg-popover-copy">${escapeHtml(stationSummary)}</p>
                </div>
            </div>`;
    }
    function resolveRouteLegTerminusStationCode(leg) {
        const runtime = railState.mtr.routing.runtime;
        if (!runtime?.paths || !leg?.lineCode || !Array.isArray(leg.stations) || leg.stations.length < 2) {
            return leg?.stations?.[leg?.stations?.length - 1] || "";
        }

        for (const pathEntry of runtime.paths) {
            if (pathEntry.lineCode !== leg.lineCode) continue;
            if (isOrderedSubsequence(pathEntry.stationCodes, leg.stations)) {
                return pathEntry.terminusEndCode;
            }
            const reversed = [...pathEntry.stationCodes].reverse();
            if (isOrderedSubsequence(reversed, leg.stations)) {
                return pathEntry.terminusStartCode;
            }
        }

        return leg.stations[leg.stations.length - 1] || "";
    }
    function buildRoutePlannerTransferStopTargetMap(routeResult, viewId) {
        const targetMap = new Map();
        if (!routeResult || routeResult.status !== "ready" || !Array.isArray(routeResult.legs) || !viewId) return targetMap;
        const transferStationSet = new Set(
            Array.isArray(routeResult.transferStations)
                ? routeResult.transferStations.map((station) => String(station.stationCode || "").toUpperCase()).filter(Boolean)
                : []
        );

        for (let legIndex = 1; legIndex < routeResult.legs.length; legIndex += 1) {
            const nextLeg = routeResult.legs[legIndex];
            const previousLeg = routeResult.legs[legIndex - 1];
            if (!nextLeg || nextLeg.kind === "walk") continue;
            const stationCode = String(nextLeg.stations?.[0] || "").toUpperCase();
            const previousTerminal = String(previousLeg?.stations?.[previousLeg.stations.length - 1] || "").toUpperCase();
            if (!stationCode || stationCode !== previousTerminal || !transferStationSet.has(stationCode)) continue;

            const stationEntry = getRoutePlannerStationEntry(stationCode);
            const terminusCode = String(resolveRouteLegTerminusStationCode(nextLeg) || "").toUpperCase();
            targetMap.set(`${stationCode}:${legIndex}`, {
                viewId,
                stationCode,
                stationNameZh: stationEntry?.nameZh || stationCode,
                stationNameEn: stationEntry?.nameEn || "",
                legIndex,
                lineCode: nextLeg.lineCode,
                lineNameZh: nextLeg.lineNameZh || getLineNameByCode(nextLeg.lineCode),
                terminusCode,
                terminusNameZh: nextLeg.terminusNameZh || getRoutePlannerStationDisplayName(terminusCode) || getRoutePlannerStationDisplayName(nextLeg.stations?.[nextLeg.stations.length - 1])
            });
        }

        return targetMap;
    }
    function getRoutePlannerTransferStopTarget(viewId, stationCode, legIndex = -1) {
        if (!viewId || !stationCode) return null;
        const routeView = getRoutePlannerViews().find((view) => view.id === viewId);
        const routeResult = routeView?.result;
        if (!routeResult || routeResult.status !== "ready") return null;
        const normalizedStationCode = String(stationCode || "").toUpperCase();
        const targetMap = buildRoutePlannerTransferStopTargetMap(routeResult, viewId);
        if (Number.isInteger(legIndex) && legIndex >= 0) {
            return targetMap.get(`${normalizedStationCode}:${legIndex}`) || null;
        }
        return [...targetMap.values()].find((target) => target.stationCode === normalizedStationCode) || null;
    }
    function findScheduleTerminusGroupForRouteLeg(schedule, transferTarget) {
        const terminusGroups = Array.isArray(schedule?.terminusGroups) ? schedule.terminusGroups : [];
        if (!transferTarget) return null;
        const normalizedTerminusCode = String(transferTarget.terminusCode || "").toUpperCase();
        const normalizedTerminusName = String(transferTarget.terminusNameZh || "").trim();
        return terminusGroups.find((group) => String(group.terminusCode || "").toUpperCase() === normalizedTerminusCode)
            || terminusGroups.find((group) => String(group.terminusNameZh || "").trim() === normalizedTerminusName)
            || null;
    }
    async function requestRoutePlannerTransferStopSchedule(transferTarget, requestId, controller) {
        try {
            const schedule = await fetchMtrSchedule(
                { lineCode: transferTarget.lineCode, lineNameZh: transferTarget.lineNameZh },
                {
                    stationCode: transferTarget.stationCode,
                    stationNameZh: transferTarget.stationNameZh,
                    stationNameEn: transferTarget.stationNameEn
                },
                controller.signal
            );
            const transferPopover = railState.mtr.routePlanner.transferStopPopover;
            if (transferPopover.requestId !== requestId) return;

            const matchedGroup = findScheduleTerminusGroupForRouteLeg(schedule, transferTarget);
            if (!matchedGroup || !Array.isArray(matchedGroup.services) || matchedGroup.services.length === 0) {
                transferPopover.status = "empty";
                transferPopover.directionKey = Array.isArray(matchedGroup?.directionKeys) ? matchedGroup.directionKeys[0] || "" : "";
                transferPopover.errorMessage = isWithinGeneralMtrClosedWindow(schedule.currentTime || schedule.systemTime)
                    ? "已過港鐵一般營業時間，這個換乘方向暫時沒有官方班次。"
                    : "官方暫時未有這個換乘方向的即時班次。";
                transferPopover.services = [];
                return;
            }

            transferPopover.status = "success";
            transferPopover.directionKey = Array.isArray(matchedGroup.directionKeys) ? matchedGroup.directionKeys[0] || "" : "";
            transferPopover.errorMessage = "";
            transferPopover.services = matchedGroup.services.slice(0, 2);
        } catch (error) {
            const transferPopover = railState.mtr.routePlanner.transferStopPopover;
            if (controller.signal.aborted || transferPopover.requestId !== requestId) return;
            transferPopover.status = "error";
            transferPopover.errorMessage = error instanceof Error ? error.message : "暫時未能讀取換乘班次。";
            transferPopover.services = [];
        } finally {
            const transferPopover = railState.mtr.routePlanner.transferStopPopover;
            if (transferPopover.requestId !== requestId) return;
            transferPopover.activeController = null;
            renderCurrentTab();
            bindCurrentTabEvents();
        }
    }
    function toggleRoutePlannerTransferStopPopover(transferTarget) {
        if (!transferTarget?.viewId || !transferTarget.stationCode) {
            closeRoutePlannerTransferStopPopover();
            return;
        }

        if (isRoutePlannerTransferStopPopoverOpen(transferTarget.viewId, transferTarget.stationCode, transferTarget.legIndex)) {
            closeRoutePlannerTransferStopPopover();
            return;
        }

        closeRoutePlannerLegPopover();
        abortRoutePlannerTransferStopRequest();

        const transferPopover = railState.mtr.routePlanner.transferStopPopover;
        const requestId = transferPopover.requestId + 1;
        const controller = new AbortController();
        transferPopover.viewId = transferTarget.viewId;
        transferPopover.stationCode = transferTarget.stationCode;
        transferPopover.stationNameZh = transferTarget.stationNameZh;
        transferPopover.stationNameEn = transferTarget.stationNameEn;
        transferPopover.legIndex = transferTarget.legIndex;
        transferPopover.lineCode = transferTarget.lineCode;
        transferPopover.lineNameZh = transferTarget.lineNameZh;
        transferPopover.terminusCode = transferTarget.terminusCode;
        transferPopover.terminusNameZh = transferTarget.terminusNameZh;
        transferPopover.directionKey = "";
        transferPopover.status = "loading";
        transferPopover.errorMessage = "";
        transferPopover.services = [];
        transferPopover.requestId = requestId;
        transferPopover.activeController = controller;

        void requestRoutePlannerTransferStopSchedule(transferTarget, requestId, controller);
    }
    function buildRoutePlannerTransferStopPopoverMarkup(transferTarget) {
        if (!transferTarget || !isRoutePlannerTransferStopPopoverOpen(transferTarget.viewId, transferTarget.stationCode, transferTarget.legIndex)) return "";

        const transferPopover = railState.mtr.routePlanner.transferStopPopover;
        const services = Array.isArray(transferPopover.services) ? transferPopover.services : [];
        const serviceMarkup = services.slice(0, 2).map((service, index) => {
            const orderLabel = index === 0 ? "下一班車" : `第${index + 1}班車`;
            const timeText = service.clockTime ? `（預計 ${service.clockTime}${service.timeTypeLabel ? ` · ${service.timeTypeLabel}` : ""}）` : "";
            return `<p class="rail-route-transfer-stop-service"><strong>${escapeHtml(orderLabel)}：</strong>${escapeHtml(service.minutesLabel || "時間未提供")}${escapeHtml(timeText)}</p>`;
        }).join("");
        const platformLabel = services.find((service) => service.platform)?.platform || "";

        let bodyMarkup = "";
        if (transferPopover.status === "loading") {
            bodyMarkup = '<p class="rail-route-transfer-stop-copy">正在讀取這一程換乘的官方班次…</p>';
        } else if (transferPopover.status === "success") {
            bodyMarkup = `
                <div class="rail-route-transfer-stop-service-list">
                    ${serviceMarkup}
                </div>
                ${platformLabel ? `<p class="rail-route-transfer-stop-copy">${escapeHtml(`${platformLabel}號月台`)}</p>` : ""}`;
        } else {
            bodyMarkup = `<p class="rail-route-transfer-stop-copy">${escapeHtml(transferPopover.errorMessage || "官方暫時未有可顯示的換乘班次。")}</p>`;
        }

        return `
            <div class="rail-route-transfer-stop-popover" data-route-transfer-popover role="dialog" aria-modal="false" aria-label="換乘班次">
                <div class="rail-route-transfer-stop-head">
                    <div class="rail-summary-main">
                        <h5 class="rail-route-transfer-stop-title">${escapeHtml(transferTarget.stationNameZh)}</h5>
                        <p class="rail-route-transfer-stop-subtitle">${escapeHtml(`${transferTarget.lineNameZh}　往 ${transferTarget.terminusNameZh}`)}</p>
                    </div>
                    <button type="button" class="rail-route-transfer-stop-close" data-route-transfer-close aria-label="關閉換乘班次">關閉</button>
                </div>
                ${bodyMarkup}
            </div>`;
    }
    function syncRoutePlannerStatusMessage() {
        const planner = railState.mtr.routePlanner;
        const originStation = getRoutePlannerStationEntry(planner.originStationCode);
        const destinationStation = getRoutePlannerStationEntry(planner.destinationStationCode);
        const activeView = getActiveRoutePlannerView();
        const activeResult = activeView?.result || null;

        if (!originStation) {
            setStatus("請先在 custom SVG 港鐵圖上選擇起點。", "info");
            return;
        }
        if (!destinationStation) {
            setStatus(`已選起點 ${originStation.nameZh}，請再選終點。`, "info");
            return;
        }
        if (!activeResult) {
            setStatus(`正在整理 ${originStation.nameZh} → ${destinationStation.nameZh} 的建議方案。`, "info");
            return;
        }
        if (activeResult.status === "sameStation") {
            setStatus("起點與終點相同，無需乘車或步行接駁。", "warning");
            return;
        }
        if (activeResult.status === "unreachable") {
            setStatus(`暫時找不到 ${originStation.nameZh} 到 ${destinationStation.nameZh} 的合理路線。`, "warning");
            return;
        }

        const transferSummary = activeResult.needsTransfer
            ? `，於 ${activeResult.transferStations.map((station) => station.stationNameZh).join("、")} 轉線`
            : activeResult.hasWalkConnections
                ? "，包含步行連接"
                : "，直達";
        setStatus(`已載入 ${activeView?.label || "建議方案"}：${originStation.nameZh} → ${destinationStation.nameZh}${transferSummary}。`, "info");
    }
    function getRoutePlannerActiveField() {
        const planner = railState.mtr.routePlanner;
        if (!planner.originStationCode) return "origin";
        if (!planner.destinationStationCode) return "destination";
        return planner.activeField || "destination";
    }
    function setRoutePlannerField(field) {
        closeRoutePlannerLegPopover();
        closeRoutePlannerTransferStopPopover();
        railState.mtr.routePlanner.activeField = field === "origin" ? "origin" : "destination";
    }
    function setRoutePlannerView(viewId) {
        if (!viewId) return;
        const matchingView = getRoutePlannerViews().find((view) => view.id === viewId);
        if (!matchingView) return;
        railState.mtr.routePlanner.activeViewId = matchingView.id;
        closeRoutePlannerLegPopover();
        closeRoutePlannerTransferStopPopover();
        syncRoutePlannerStatusMessage();
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
        syncRoutePlannerStatusMessage();
    }
    function clearRoutePlannerDestination() {
        closeRoutePlannerLegPopover();
        closeRoutePlannerTransferStopPopover();
        railState.mtr.routePlanner.destinationStationCode = "";
        railState.mtr.routePlanner.result = null;
        railState.mtr.routePlanner.activeViewId = "";
        railState.mtr.routePlanner.activeField = "destination";
        syncRoutePlannerStatusMessage();
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
        syncRoutePlannerStatusMessage();
    }
    function toggleRoutePlanner() {
        const planner = railState.mtr.routePlanner;
        closeRoutePlannerLegPopover();
        closeRoutePlannerTransferStopPopover();
        planner.isOpen = !planner.isOpen;
        planner.lastMapFocusKey = "";
        planner.lastSchematicFocusKey = "";
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
    function getRouteSegmentState(activeResult, selectedOriginCode, selectedDestinationCode) {
        const hasActiveRoute = activeResult?.status === "ready";
        const routeStationSet = new Set(Array.isArray(activeResult?.stationCodes) ? activeResult.stationCodes : []);
        const transferStationSet = new Set(Array.isArray(activeResult?.transferStations) ? activeResult.transferStations.map((station) => station.stationCode) : []);
        const activeSegmentSet = new Set();
        const activeWalkSegmentSet = new Set();
        const activeLineSet = new Set();

        if (hasActiveRoute) {
            for (const leg of Array.isArray(activeResult?.legs) ? activeResult.legs : []) {
                if (leg.kind === "walk") {
                    for (let index = 0; index < leg.stations.length - 1; index += 1) {
                        const leftCode = leg.stations[index];
                        const rightCode = leg.stations[index + 1];
                        activeWalkSegmentSet.add(getWalkPairKey(leftCode, rightCode));
                    }
                    continue;
                }
                activeLineSet.add(leg.lineCode);
                for (let index = 0; index < leg.stations.length - 1; index += 1) {
                    const leftCode = leg.stations[index];
                    const rightCode = leg.stations[index + 1];
                    const pairKey = [leftCode, rightCode].sort().join("|");
                    activeSegmentSet.add(`${leg.lineCode}:${pairKey}`);
                }
            }
        }

        return {
            hasActiveRoute,
            selectedOriginCode,
            selectedDestinationCode,
            routeStationSet,
            transferStationSet,
            activeSegmentSet,
            activeWalkSegmentSet,
            activeLineSet
        };
    }
    function getSchematicStationCenter(station) {
        return {
            x: Number(station?.marker?.x ?? station?.x) || 0,
            y: Number(station?.marker?.y ?? station?.y) || 0
        };
    }
    function dedupeSchematicAnchorPoints(anchorPoints, minDistance = 1.4) {
        const deduped = [];
        for (const anchorPoint of Array.isArray(anchorPoints) ? anchorPoints : []) {
            const normalizedPoint = {
                x: Number(anchorPoint?.x) || 0,
                y: Number(anchorPoint?.y) || 0
            };
            const exists = deduped.some((existingPoint) => Math.hypot(existingPoint.x - normalizedPoint.x, existingPoint.y - normalizedPoint.y) < minDistance);
            if (!exists) deduped.push(normalizedPoint);
        }
        return deduped;
    }
    function getSchematicStationAnchorPoints(station) {
        const center = getSchematicStationCenter(station);
        const anchorPoints = dedupeSchematicAnchorPoints(Object.values(station?.lineAnchors || {}));
        return anchorPoints.length > 0 ? anchorPoints : [center];
    }
    function getSchematicConnectorAxis(anchorPoints) {
        if (!Array.isArray(anchorPoints) || anchorPoints.length <= 1) return { x: 1, y: 0 };
        let startPoint = anchorPoints[0];
        let endPoint = anchorPoints[anchorPoints.length - 1];
        let furthestDistance = -1;
        for (let leftIndex = 0; leftIndex < anchorPoints.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < anchorPoints.length; rightIndex += 1) {
                const distance = Math.hypot(
                    anchorPoints[rightIndex].x - anchorPoints[leftIndex].x,
                    anchorPoints[rightIndex].y - anchorPoints[leftIndex].y
                );
                if (distance > furthestDistance) {
                    furthestDistance = distance;
                    startPoint = anchorPoints[leftIndex];
                    endPoint = anchorPoints[rightIndex];
                }
            }
        }
        const length = Math.max(1, Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y));
        return {
            x: (endPoint.x - startPoint.x) / length,
            y: (endPoint.y - startPoint.y) / length
        };
    }
    function getSchematicStationGeometry(station) {
        const center = getSchematicStationCenter(station);
        const anchorPoints = getSchematicStationAnchorPoints(station);
        const isInterchangeMarker = anchorPoints.length > 1 || Boolean(station?.interchange);
        const axis = getSchematicConnectorAxis(anchorPoints);
        const nodes = anchorPoints
            .slice()
            .sort((leftPoint, rightPoint) => {
                const leftProjection = leftPoint.x * axis.x + leftPoint.y * axis.y;
                const rightProjection = rightPoint.x * axis.x + rightPoint.y * axis.y;
                return leftProjection - rightProjection;
            });
        const connectors = [];

        if (isInterchangeMarker) {
            for (let index = 0; index < nodes.length - 1; index += 1) {
                const leftNode = nodes[index];
                const rightNode = nodes[index + 1];
                const distance = Math.hypot(rightNode.x - leftNode.x, rightNode.y - leftNode.y);
                if (distance < 0.8) continue;
                connectors.push({
                    x1: leftNode.x,
                    y1: leftNode.y,
                    x2: rightNode.x,
                    y2: rightNode.y
                });
            }
        }

        return {
            center,
            nodes,
            connectors,
            isInterchangeMarker,
            hitRadius: isInterchangeMarker ? Math.max(19, 13 + nodes.length * 1.8) : 15,
            haloRadius: isInterchangeMarker ? Math.max(13.5, 9.5 + nodes.length * 1.25) : 10.5,
            bedRadius: isInterchangeMarker ? 8.9 : 8.2,
            nodeRadius: isInterchangeMarker ? 6.3 : 6
        };
    }
    function buildSchematicStationVisualMarkup(station) {
        const geometry = getSchematicStationGeometry(station);
        const centerPoint = geometry.center;

        return `
            <circle
                class="rail-schematic-station-hit"
                cx="${escapeHtml(String(centerPoint.x))}"
                cy="${escapeHtml(String(centerPoint.y))}"
                r="${escapeHtml(String(geometry.hitRadius))}"
            />
            <g class="rail-schematic-station-visual" aria-hidden="true">
                <circle
                    class="rail-schematic-station-halo"
                    cx="${escapeHtml(String(centerPoint.x))}"
                    cy="${escapeHtml(String(centerPoint.y))}"
                    r="${escapeHtml(String(geometry.haloRadius))}"
                />
                ${geometry.connectors.map((connector) => `
                    <line
                        class="rail-schematic-station-bed-connector"
                        x1="${escapeHtml(String(connector.x1))}"
                        y1="${escapeHtml(String(connector.y1))}"
                        x2="${escapeHtml(String(connector.x2))}"
                        y2="${escapeHtml(String(connector.y2))}"
                    />
                `).join("")}
                ${geometry.nodes.map((node) => `
                    <circle
                        class="rail-schematic-station-bed"
                        cx="${escapeHtml(String(node.x))}"
                        cy="${escapeHtml(String(node.y))}"
                        r="${escapeHtml(String(geometry.bedRadius))}"
                    />
                `).join("")}
                ${geometry.connectors.map((connector) => `
                    <line
                        class="rail-schematic-station-connector-casing"
                        x1="${escapeHtml(String(connector.x1))}"
                        y1="${escapeHtml(String(connector.y1))}"
                        x2="${escapeHtml(String(connector.x2))}"
                        y2="${escapeHtml(String(connector.y2))}"
                    />
                    <line
                        class="rail-schematic-station-connector"
                        x1="${escapeHtml(String(connector.x1))}"
                        y1="${escapeHtml(String(connector.y1))}"
                        x2="${escapeHtml(String(connector.x2))}"
                        y2="${escapeHtml(String(connector.y2))}"
                    />
                `).join("")}
                ${geometry.nodes.map((node) => `
                    <circle
                        class="rail-schematic-station-dot"
                        cx="${escapeHtml(String(node.x))}"
                        cy="${escapeHtml(String(node.y))}"
                        r="${escapeHtml(String(geometry.nodeRadius))}"
                    />
                `).join("")}
            </g>`;
    }
    function buildSchematicStationLabelMarkup(station) {
        const labelX = station.x + station.label.dx;
        const labelY = station.y + station.label.dy;
        const englishName = String(station.nameEn || "").trim();
        const hasEnglishName = englishName.length > 0;

        return `
            <g
                class="rail-schematic-station-label"
                transform="translate(${escapeHtml(String(labelX))} ${escapeHtml(String(labelY))})"
                text-anchor="${escapeHtml(station.label.anchor)}"
                aria-hidden="true"
            >
                <text
                    class="rail-schematic-station-name-zh"
                    x="0"
                    y="${hasEnglishName ? "-6" : "1"}"
                >${escapeHtml(station.nameZh || station.label.text || station.stationCode)}</text>
                ${hasEnglishName ? `
                    <text
                        class="rail-schematic-station-name-en"
                        x="0"
                        y="10"
                    >${escapeHtml(englishName)}</text>
                ` : ""}
            </g>`;
    }
    function buildSchematicLandmarkMarkup(landmark) {
        const labelText = String(landmark.label?.text || landmark.nameZh || landmark.stationCode || "").trim();
        const labelLength = Math.max(2, Array.from(labelText).length);
        const badgeWidth = Math.max(68, 28 + labelLength * 14);
        const badgeHeight = 32;
        const badgeRadius = badgeHeight / 2;

        return `
            <circle
                class="rail-schematic-landmark-hit"
                cx="${escapeHtml(String(landmark.x))}"
                cy="${escapeHtml(String(landmark.y))}"
                r="24"
            />
            <g class="rail-schematic-landmark-visual" aria-hidden="true">
                <rect
                    class="rail-schematic-landmark-badge"
                    x="${escapeHtml(String(landmark.x - badgeWidth / 2))}"
                    y="${escapeHtml(String(landmark.y - badgeHeight / 2))}"
                    width="${escapeHtml(String(badgeWidth))}"
                    height="${escapeHtml(String(badgeHeight))}"
                    rx="${escapeHtml(String(badgeRadius))}"
                    ry="${escapeHtml(String(badgeRadius))}"
                />
                <text
                    class="rail-schematic-landmark-text"
                    x="${escapeHtml(String(landmark.x))}"
                    y="${escapeHtml(String(landmark.y))}"
                    text-anchor="middle"
                >${escapeHtml(labelText)}</text>
            </g>`;
    }
    function buildCustomSchematicMarkup() {
        const schematicRuntime = railState.mtr.routing.customSchematic;
        if (!schematicRuntime) {
            return `<section class="rail-empty-card"><h3 class="rail-empty-title">Custom schematic seed 未就緒</h3><p class="rail-empty-text">暫時未能載入自訂港鐵 schematic layout 資料。</p></section>`;
        }
        const planner = railState.mtr.routePlanner;
        const activeView = getActiveRoutePlannerView();
        const activeResult = activeView?.result || null;
        const {
            hasActiveRoute,
            selectedOriginCode,
            selectedDestinationCode,
            routeStationSet,
            transferStationSet,
            activeSegmentSet,
            activeWalkSegmentSet
        } = getRouteSegmentState(activeResult, planner.originStationCode, planner.destinationStationCode);
        const hasSelections = Boolean(selectedOriginCode || selectedDestinationCode);

        return `
            <section class="rail-schematic-panel">
                <div class="rail-route-map-panel-head">
                    <div>
                        <p class="rail-route-map-title">Custom SVG 港鐵地圖</p>
                        <p class="rail-route-map-hint">目前選擇：${planner.activeField === "origin" ? "起點" : "終點"}${hasActiveRoute && activeView ? ` · ${escapeHtml(activeView.label)}` : ""}</p>
                    </div>
                    <div class="rail-route-map-legend">
                        <span class="rail-route-map-legend-pill is-active">${planner.activeField === "origin" ? "正在選起點" : "正在選終點"}</span>
                        <span class="rail-route-map-legend-pill">${escapeHtml(String(schematicRuntime.meta.lineCount || 0))} 條重鐵線</span>
                        ${hasActiveRoute ? '<span class="rail-route-map-legend-pill">未命中路徑的綫路已淡化</span>' : hasSelections ? '<span class="rail-route-map-legend-pill">選好起終點後會高亮建議路線</span>' : '<span class="rail-route-map-legend-pill">單指拖曳、雙指縮放、點站選起終點</span>'}
                    </div>
                </div>
                <div class="rail-schematic-frame">
                    <div id="mtrSchematicViewport" class="rail-schematic-viewport">
                        <div
                            id="mtrSchematicScene"
                            class="rail-schematic-scene"
                            style="width:${escapeHtml(String(schematicRuntime.viewBox.width))}px;height:${escapeHtml(String(schematicRuntime.viewBox.height))}px;"
                        >
                            <svg
                                class="rail-schematic-svg ${hasActiveRoute ? "has-active-route" : ""}"
                                viewBox="${escapeHtml(String(schematicRuntime.viewBox.minX))} ${escapeHtml(String(schematicRuntime.viewBox.minY))} ${escapeHtml(String(schematicRuntime.viewBox.width))} ${escapeHtml(String(schematicRuntime.viewBox.height))}"
                                width="${escapeHtml(String(schematicRuntime.viewBox.width))}"
                                height="${escapeHtml(String(schematicRuntime.viewBox.height))}"
                                role="img"
                                aria-label="港鐵 custom schematic map"
                            >
                                <g class="rail-schematic-line-layer" aria-hidden="true">
                                    ${schematicRuntime.lines.map((line) => `
                                        <g
                                            class="rail-schematic-line ${hasActiveRoute && !line.branches.some((branch) => branch.segments.some((segment) => activeSegmentSet.has(`${line.lineCode}:${[segment.from, segment.to].sort().join("|")}`))) ? "is-dimmed" : ""}"
                                            data-line-code="${escapeHtml(line.lineCode)}"
                                            style="--rail-line-color:${escapeHtml(line.color)}"
                                        >
                                            ${line.branches.map((branch) => `
                                                <g class="rail-schematic-branch" data-branch-id="${escapeHtml(branch.branchId)}">
                                                    ${branch.segments.map((segment) => `
                                                        <path
                                                            class="rail-schematic-segment-casing ${hasActiveRoute && activeSegmentSet.has(`${line.lineCode}:${[segment.from, segment.to].sort().join("|")}`) ? "is-on-route" : hasActiveRoute ? "is-dimmed" : ""}"
                                                            d="${escapeHtml(pointsToSvgPath(segment.points))}"
                                                        />
                                                        <path
                                                            class="rail-schematic-segment ${hasActiveRoute && activeSegmentSet.has(`${line.lineCode}:${[segment.from, segment.to].sort().join("|")}`) ? "is-on-route" : hasActiveRoute ? "is-dimmed" : ""}"
                                                            d="${escapeHtml(pointsToSvgPath(segment.points))}"
                                                        />
                                                    `).join("")}
                                                </g>
                                            `).join("")}
                                        </g>
                                    `).join("")}
                                </g>
                                <g class="rail-schematic-walk-layer" aria-hidden="true">
                                    ${schematicRuntime.walkLinks.map((walkLink) => `
                                        <path
                                            class="rail-schematic-walk-link-casing ${hasActiveRoute && activeWalkSegmentSet.has(walkLink.linkKey) ? "is-on-route" : hasActiveRoute ? "is-dimmed" : ""}"
                                            d="${escapeHtml(pointsToSvgPath(walkLink.points))}"
                                        />
                                        <path
                                            class="rail-schematic-walk-link ${hasActiveRoute && activeWalkSegmentSet.has(walkLink.linkKey) ? "is-on-route" : hasActiveRoute ? "is-dimmed" : ""}"
                                            d="${escapeHtml(pointsToSvgPath(walkLink.points))}"
                                        />
                                    `).join("")}
                                </g>
                                <g class="rail-schematic-landmark-layer">
                                    ${schematicRuntime.landmarkList.map((landmark) => `
                                        <g
                                            class="rail-schematic-landmark ${landmark.stationCode === selectedOriginCode ? "is-origin" : ""} ${landmark.stationCode === selectedDestinationCode ? "is-destination" : ""} ${routeStationSet.has(landmark.stationCode) ? "is-on-route" : ""} ${hasActiveRoute && !routeStationSet.has(landmark.stationCode) && landmark.stationCode !== selectedOriginCode && landmark.stationCode !== selectedDestinationCode ? "is-dimmed" : ""}"
                                            data-station-code="${escapeHtml(landmark.stationCode)}"
                                            data-route-station="${escapeHtml(landmark.stationCode)}"
                                            role="button"
                                            tabindex="0"
                                            aria-label="選擇 ${escapeHtml(landmark.nameZh)} 作為${planner.activeField === "origin" ? "起點" : "終點"}"
                                        >
                                            ${buildSchematicLandmarkMarkup(landmark)}
                                        </g>
                                    `).join("")}
                                </g>
                                <g class="rail-schematic-station-layer">
                                    ${schematicRuntime.stationList.map((station) => `
                                        <g
                                            class="rail-schematic-station ${station.interchange ? "is-interchange" : ""} ${station.stationCode === selectedOriginCode ? "is-origin" : ""} ${station.stationCode === selectedDestinationCode ? "is-destination" : ""} ${transferStationSet.has(station.stationCode) ? "is-transfer" : ""} ${routeStationSet.has(station.stationCode) ? "is-on-route" : ""} ${hasActiveRoute && !routeStationSet.has(station.stationCode) && station.stationCode !== selectedOriginCode && station.stationCode !== selectedDestinationCode ? "is-dimmed" : ""}"
                                            data-station-code="${escapeHtml(station.stationCode)}"
                                            data-route-station="${escapeHtml(station.stationCode)}"
                                            role="button"
                                            tabindex="0"
                                            aria-label="選擇 ${escapeHtml(station.nameZh)} 作為${planner.activeField === "origin" ? "起點" : "終點"}"
                                        >
                                            ${buildSchematicStationVisualMarkup(station)}
                                            ${buildSchematicStationLabelMarkup(station)}
                                        </g>
                                    `).join("")}
                                </g>
                            </svg>
                        </div>
                    </div>
                </div>
            </section>`;
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
                    <span class="rail-route-map-legend-pill">拖曳平移</span>
                    <span class="rail-route-map-legend-pill">雙指縮放</span>
                </div>
            </div>
            <div id="mtrOfficialMapViewport" class="rail-official-map-viewport">
                <div id="mtrOfficialMapScene" class="rail-official-map-scene">
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
                                        <span class="rail-official-map-station-pulse" aria-hidden="true"></span>
                                        <span class="rail-official-map-station-ring" aria-hidden="true"></span>
                                        <span class="rail-official-map-station-core" aria-hidden="true"></span>
                                    </button>`;
                            }).join("")}
                        </div>
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
            <article
                class="rail-route-option-card ${view.id === activeViewId ? "is-active" : ""}"
                role="button"
                tabindex="0"
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
    function buildRoutePlannerOptionCardMarkup(view, activeViewId) {
        const result = view?.result;
        if (!result || (result.status !== "ready" && result.status !== "sameStation")) return "";

        const summaryChips = result.status === "sameStation"
            ? `<span class="rail-chip">0 站</span><span class="rail-chip">同站</span>`
            : [
                `<span class="rail-chip">${escapeHtml(String(result.totalStops))} 站</span>`,
                `<span class="rail-chip">${result.needsTransfer ? `${escapeHtml(String(result.transferStations.length))} 次轉線` : "直達"}</span>`,
                result.hasWalkConnections ? '<span class="rail-chip">步行接駁</span>' : "",
                `<span class="rail-chip">${escapeHtml(String(result.legs.length))} 段路線</span>`
            ].filter(Boolean).join("");

        const summaryText = result.status === "sameStation"
            ? "起點與終點相同"
            : result.needsTransfer
                ? `經 ${escapeHtml(result.transferStations.map((station) => station.stationNameZh).join("、"))} 轉線${result.hasWalkConnections ? "並接步行" : ""}`
                : result.hasWalkConnections
                    ? "步行接駁"
                    : "直達";

        return `
            <article
                class="rail-route-option-card ${view.id === activeViewId ? "is-active" : ""}"
                role="button"
                tabindex="0"
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
    function buildRoutePlannerOptionStripMarkup(routeResult) {
        if (!routeResult || routeResult.status !== "ready") return "";
        const transferStationSet = new Set(Array.isArray(routeResult.transferStations) ? routeResult.transferStations.map((station) => station.stationCode) : []);
        const stopPoints = [];
        const displaySegments = [];
        const pushStopPoint = (stationCode) => {
            const normalizedStationCode = String(stationCode || "").toUpperCase();
            if (!normalizedStationCode || stopPoints[stopPoints.length - 1]?.stationCode === normalizedStationCode) return;
            stopPoints.push({
                stationCode: normalizedStationCode,
                stationNameZh: getRoutePlannerStationEntry(normalizedStationCode)?.nameZh || normalizedStationCode,
                isTransfer: transferStationSet.has(normalizedStationCode)
            });
        };

        pushStopPoint(routeResult.originStationCode);
        for (const leg of Array.isArray(routeResult.legs) ? routeResult.legs : []) {
            if (leg.kind === "walk") {
                for (const stationCode of leg.stations.slice(1)) {
                    pushStopPoint(stationCode);
                    displaySegments.push({
                        lineCode: leg.lineCode,
                        grow: 1
                    });
                }
                continue;
            }
            pushStopPoint(leg.stations[leg.stations.length - 1]);
            displaySegments.push({
                lineCode: leg.lineCode,
                grow: Math.max(leg.stopCount, 1)
            });
        }
        pushStopPoint(routeResult.destinationStationCode);

        const stripMarkup = stopPoints.map((stopPoint, index) => {
            const segmentMarkup = displaySegments[index]
                ? `<span class="rail-route-option-segment" style="--rail-line-color: ${escapeHtml(getMtrOfficialLineColor(displaySegments[index].lineCode))}; --rail-segment-grow: ${Math.max(displaySegments[index].grow, 1)}" aria-hidden="true"></span>`
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
                <span>${escapeHtml(leg.kind === "walk" ? leg.walkLabelZh || "步行連接" : `${leg.lineNameZh}　往 ${leg.terminusNameZh || (getRoutePlannerStationEntry(leg.stations[leg.stations.length - 1])?.nameZh || leg.stations[leg.stations.length - 1])}`)}</span>
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
                            <p class="rail-route-leg-kicker">${escapeHtml(leg.kind === "walk" ? "WALK" : leg.lineCode)}</p>
                            <h4 class="rail-route-leg-title">${escapeHtml(leg.kind === "walk" ? leg.walkLabelZh || "步行連接" : `${leg.lineNameZh}　往 ${leg.terminusNameZh || (getRoutePlannerStationEntry(leg.stations[leg.stations.length - 1])?.nameZh || leg.stations[leg.stations.length - 1])}`)}</h4>
                        </div>
                    </div>
                    <span class="rail-meta-pill">${leg.kind === "walk" ? "步行" : `${escapeHtml(String(leg.stopCount))} 站`}</span>
                </div>
                <p class="rail-route-leg-stations">${escapeHtml(leg.stations.map((stationCode) => getRoutePlannerStationEntry(stationCode)?.nameZh || stationCode).join(" → "))}</p>
                ${intermediateStations.length > 0 ? `<p class="rail-route-leg-note">途經：${escapeHtml(intermediateStations.join("、"))}</p>` : ""}
            </article>`;
    }
    function buildRoutePlannerResultMarkup() {
        const planner = railState.mtr.routePlanner;
        const originStation = getRoutePlannerStationEntry(planner.originStationCode);
        const destinationStation = getRoutePlannerStationEntry(planner.destinationStationCode);
        const routeViews = getRoutePlannerViews();
        const activeView = getActiveRoutePlannerView();
        const activeResult = activeView?.result || null;

        if (!originStation) {
            return `<section class="rail-route-result rail-empty-card"><h3 class="rail-empty-title">先選起點</h3><p class="rail-empty-text">請先在上方選擇起點，再到地圖上點選終點。</p></section>`;
        }

        if (!destinationStation) {
            return `<section class="rail-route-result rail-empty-card"><h3 class="rail-empty-title">再選終點</h3><p class="rail-empty-text">已經選好起點，現在請在 custom SVG 港鐵地圖上點第二個站。</p></section>`;
        }

        if (!routeViews.length || !activeResult) {
            return `<section class="rail-route-result rail-empty-card"><h3 class="rail-empty-title">暫時沒有建議路線</h3><p class="rail-empty-text">目前找不到合適路徑，請試試重新選擇起點或終點。</p></section>`;
        }

        if (activeResult.status === "sameStation") {
            return `
                <section class="rail-route-result rail-route-result-card">
                    <div class="rail-route-result-head">
                        <div class="rail-summary-main">
                            <p class="rail-mtr-section-kicker">${escapeHtml(activeView.label)}</p>
                            <h3 class="rail-summary-title">${escapeHtml(originStation.nameZh)} 已是目的地</h3>
                            <p class="rail-summary-text">起點與終點相同，不需要搭乘或步行轉乘。</p>
                        </div>
                        <div class="rail-chip-row rail-route-result-chips"><span class="rail-chip">0 站</span><span class="rail-chip">同站</span></div>
                    </div>
                </section>`;
        }

        if (activeResult.status === "unreachable") {
            return `<section class="rail-route-result rail-empty-card rail-empty-card-error"><h3 class="rail-empty-title">暫時找不到建議路線</h3><p class="rail-empty-text">請試試重新選擇起點或終點，或改用附近可步行連接的站點。</p></section>`;
        }

        const transferSummary = activeResult.transferStations.length > 0
            ? activeResult.transferStations.map((station) => station.stationNameZh).join("、")
            : "不需轉線";
        const legMarkup = activeResult.legs.map((leg) => buildRoutePlannerLegCardMarkup(leg)).join("");
        const routeSummaryChips = [
            `<span class="rail-chip">${escapeHtml(String(activeResult.totalStops))} 站</span>`,
            `<span class="rail-chip">${activeResult.needsTransfer ? `${escapeHtml(String(activeResult.transferStations.length))} 次轉線` : "直達"}</span>`,
            activeResult.hasWalkConnections ? '<span class="rail-chip">步行接駁</span>' : "",
            `<span class="rail-chip">${escapeHtml(String(activeResult.legs.length))} 段路線</span>`
        ].filter(Boolean).join("");
        const summaryText = activeResult.needsTransfer
            ? `經 ${escapeHtml(transferSummary)} 轉線${activeResult.hasWalkConnections ? "，並接步行" : ""}`
            : activeResult.hasWalkConnections
                ? "包含官方步行連接建議"
                : "直達路線";

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
                        <p class="rail-summary-text">${summaryText}</p>
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
    function getRoutePlannerLegHeadline(leg) {
        if (!leg) return "";
        if (leg.kind === "walk") return leg.walkLabelZh || "步行連接";
        const fallbackTerminus = getRoutePlannerStationEntry(leg.stations?.[leg.stations.length - 1])?.nameZh || leg.stations?.[leg.stations.length - 1] || "";
        return `${leg.lineNameZh}　往 ${leg.terminusNameZh || fallbackTerminus}`;
    }
    function getRoutePlannerLegStationNames(leg) {
        return Array.isArray(leg?.stations)
            ? leg.stations.map((stationCode) => getRoutePlannerStationEntry(stationCode)?.nameZh || stationCode)
            : [];
    }
    function getRoutePlannerViewSummaryText(result) {
        if (!result) return "";
        if (result.status === "sameStation") return "起點與終點相同";
        if (result.needsTransfer) {
            const transferSummary = result.transferStations.map((station) => station.stationNameZh).join("、");
            return `於 ${transferSummary} 轉線${result.hasWalkConnections ? "，含步行連接" : ""}`;
        }
        if (result.hasWalkConnections) return "直達，含步行連接";
        return "直達";
    }
    function buildRoutePlannerSummaryGridMarkup(activeView, activeResult) {
        const transferSummary = activeResult.needsTransfer
            ? activeResult.transferStations.map((station) => station.stationNameZh).join("、")
            : "無需轉線";
        const walkSummary = activeResult.hasWalkConnections
            ? `${activeResult.legs.filter((leg) => leg.kind === "walk").length} 段步行`
            : "全程乘車";
        const legSummary = activeResult.legs.map((leg) => getRoutePlannerLegHeadline(leg)).join(" / ");

        return `
            <div class="rail-route-summary-grid">
                <article class="rail-route-summary-card">
                    <span class="rail-route-summary-label">建議方案</span>
                    <strong class="rail-route-summary-value">${escapeHtml(activeView.label)}</strong>
                    <p class="rail-route-summary-note">${escapeHtml(getRoutePlannerViewSummaryText(activeResult))}</p>
                </article>
                <article class="rail-route-summary-card">
                    <span class="rail-route-summary-label">轉線安排</span>
                    <strong class="rail-route-summary-value">${escapeHtml(activeResult.needsTransfer ? `${activeResult.transferStations.length} 次轉線` : "無需轉線")}</strong>
                    <p class="rail-route-summary-note">${escapeHtml(transferSummary)}</p>
                </article>
                <article class="rail-route-summary-card">
                    <span class="rail-route-summary-label">各段路線</span>
                    <strong class="rail-route-summary-value">${escapeHtml(String(activeResult.legs.length))} 段</strong>
                    <p class="rail-route-summary-note">${escapeHtml(`${walkSummary}；${legSummary}`)}</p>
                </article>
            </div>`;
    }
    function buildRoutePlannerOptionCardMarkup(view, activeViewId) {
        const result = view?.result;
        if (!result || (result.status !== "ready" && result.status !== "sameStation")) return "";
        const hasOpenPopover = railState.mtr.routePlanner.legPopover.viewId === view.id
            || railState.mtr.routePlanner.transferStopPopover.viewId === view.id;
        const transferStationNames = Array.isArray(result.transferStations)
            ? result.transferStations.map((station) => station.stationNameZh).filter(Boolean)
            : [];
        const transferCount = transferStationNames.length;
        const totalStops = Number.isFinite(result.totalStops) ? result.totalStops : 0;
        const routeMetaText = result.status === "sameStation"
            ? "同站 · 0站 · 0次轉線"
            : [
                transferCount > 0 ? `於 ${transferStationNames.join("、")} 轉線` : "直達",
                `共${totalStops}站`,
                `${transferCount}次轉線`
            ].join(" · ");

        return `
            <article
                class="rail-route-option-card ${view.id === activeViewId ? "is-active" : ""} ${hasOpenPopover ? "has-open-popover" : ""}"
                role="button"
                tabindex="0"
                data-route-view="${escapeHtml(view.id)}"
                aria-pressed="${view.id === activeViewId ? "true" : "false"}"
            >
                <div class="rail-route-option-card-head">
                    <div class="rail-summary-main">
                        <p class="rail-route-option-card-kicker">${escapeHtml(view.label)}</p>
                        <h4 class="rail-route-option-card-title">${escapeHtml(routeMetaText)}</h4>
                    </div>
                    ${view.id === activeViewId ? '<span class="rail-route-option-card-badge">目前查看</span>' : ""}
                </div>
                ${result.status === "ready" ? buildRoutePlannerOptionStripMarkup(result, view.id) : ""}
            </article>`;
    }
    function buildRoutePlannerOptionStripMarkup(routeResult, viewId = "") {
        if (!routeResult || routeResult.status !== "ready" || !viewId) return "";
        const transferStationSet = new Set(Array.isArray(routeResult.transferStations) ? routeResult.transferStations.map((station) => station.stationCode) : []);
        const stopPoints = [];
        const displaySegments = [];
        const pushStopPoint = (stationCode, options = {}) => {
            const normalizedStationCode = String(stationCode || "").toUpperCase();
            const transferLegIndex = Number.isInteger(options.transferLegIndex) ? options.transferLegIndex : -1;
            const lastStopPoint = stopPoints[stopPoints.length - 1] || null;
            if (!normalizedStationCode) return;
            if (lastStopPoint?.stationCode === normalizedStationCode) {
                if (transferLegIndex >= 0 && (!Number.isInteger(lastStopPoint.transferLegIndex) || lastStopPoint.transferLegIndex < 0)) {
                    lastStopPoint.transferLegIndex = transferLegIndex;
                }
                return;
            }
            stopPoints.push({
                stationCode: normalizedStationCode,
                stationNameZh: getRoutePlannerStationEntry(normalizedStationCode)?.nameZh || normalizedStationCode,
                isTransfer: transferStationSet.has(normalizedStationCode),
                isOrigin: normalizedStationCode === routeResult.originStationCode,
                isDestination: normalizedStationCode === routeResult.destinationStationCode,
                isWalkNode: Boolean(getVirtualRoutePlannerStation(normalizedStationCode)) || normalizedStationCode === "HSR",
                transferLegIndex
            });
        };

        pushStopPoint(routeResult.originStationCode);
        for (const [legIndex, leg] of (Array.isArray(routeResult.legs) ? routeResult.legs : []).entries()) {
            if (leg.kind === "walk") {
                for (const stationCode of leg.stations.slice(1)) {
                    pushStopPoint(stationCode);
                    displaySegments.push({
                        lineCode: leg.lineCode,
                        grow: 1,
                        kind: "walk"
                    });
                }
                continue;
            }
            const terminalStationCode = String(leg.stations[leg.stations.length - 1] || "").toUpperCase();
            const nextLeg = routeResult.legs[legIndex + 1];
            const nextLegStartsHere = String(nextLeg?.stations?.[0] || "").toUpperCase() === terminalStationCode;
            const transferLegIndex = nextLeg && nextLeg.kind !== "walk" && nextLegStartsHere && transferStationSet.has(terminalStationCode)
                ? legIndex + 1
                : -1;
            pushStopPoint(terminalStationCode, { transferLegIndex });
            displaySegments.push({
                lineCode: leg.lineCode,
                grow: Math.max(leg.stopCount, 1),
                kind: "ride"
            });
        }
        pushStopPoint(routeResult.destinationStationCode);

        const stripMarkup = stopPoints.map((stopPoint, index) => {
            const segmentEntry = displaySegments[index] || null;
            const transferTarget = Number.isInteger(stopPoint.transferLegIndex) && stopPoint.transferLegIndex >= 0
                ? getRoutePlannerTransferStopTarget(viewId, stopPoint.stationCode, stopPoint.transferLegIndex)
                : null;
            const isTransferTrigger = Boolean(transferTarget);
            const segmentWidth = segmentEntry
                ? segmentEntry.kind === "walk"
                    ? 52
                    : Math.min(108, 26 + Math.max(segmentEntry.grow, 1) * 14)
                : 0;
            const segmentMarkup = segmentEntry
                ? `<span class="rail-route-option-segment ${segmentEntry.kind === "walk" ? "is-walk" : ""}" style="--rail-line-color: ${escapeHtml(getMtrOfficialLineColor(segmentEntry.lineCode))}; --rail-segment-width: ${escapeHtml(String(segmentWidth))}px" aria-hidden="true"></span>`
                : "";
            return `
                <div class="rail-route-option-step ${segmentEntry ? "" : "is-terminal"}">
                    <div class="rail-route-option-stop ${stopPoint.isTransfer ? "is-transfer" : ""} ${stopPoint.isOrigin ? "is-origin" : ""} ${stopPoint.isDestination ? "is-destination" : ""} ${stopPoint.isWalkNode ? "is-walk" : ""}">
                        <span class="rail-route-option-stop-name">${escapeHtml(stopPoint.stationNameZh)}</span>
                        <div class="rail-route-option-stop-rail">
                            <span class="rail-route-option-stop-dot-wrap ${isTransferTrigger ? "is-transfer-target" : ""}">
                                ${isTransferTrigger ? `
                                    <button
                                        type="button"
                                        class="rail-route-option-stop-dot rail-route-option-stop-dot-button"
                                        data-route-transfer-trigger
                                        data-route-transfer-view="${escapeHtml(viewId)}"
                                        data-route-transfer-station="${escapeHtml(stopPoint.stationCode)}"
                                        data-route-transfer-leg-index="${escapeHtml(String(transferTarget.legIndex))}"
                                        aria-expanded="${isRoutePlannerTransferStopPopoverOpen(viewId, stopPoint.stationCode, transferTarget.legIndex) ? "true" : "false"}"
                                        aria-label="查看 ${escapeHtml(stopPoint.stationNameZh)} 的換乘班次"
                                    ></button>
                                    ${buildRoutePlannerTransferStopPopoverMarkup(transferTarget)}
                                ` : '<span class="rail-route-option-stop-dot" aria-hidden="true"></span>'}
                            </span>
                            ${segmentMarkup}
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        const lineBadgesMarkup = routeResult.legs.map((leg, legIndex) => `
            <div class="rail-route-line-badge-wrap ${isRoutePlannerLegPopoverOpen(viewId, legIndex) ? "is-open" : ""}" data-route-leg-badge-wrap>
                <button
                    type="button"
                    class="rail-route-line-badge ${leg.kind === "walk" ? "is-walk" : ""}"
                    style="--rail-line-color: ${escapeHtml(getMtrOfficialLineColor(leg.lineCode))}"
                    data-route-leg-trigger
                    data-route-leg-view="${escapeHtml(viewId)}"
                    data-route-leg-index="${escapeHtml(String(legIndex))}"
                    aria-expanded="${isRoutePlannerLegPopoverOpen(viewId, legIndex) ? "true" : "false"}"
                >
                    <span class="rail-route-line-badge-dot" aria-hidden="true"></span>
                    <span>${escapeHtml(getRoutePlannerLegHeadline(leg))}</span>
                </button>
                ${buildRoutePlannerLegPopoverMarkup(viewId, legIndex)}
            </div>
        `).join("");

        return `
            <div class="rail-route-option-strip-wrap">
                <div class="rail-route-line-badge-row">
                    ${lineBadgesMarkup}
                </div>
                <div class="rail-route-option-strip">
                    ${stripMarkup}
                </div>
            </div>`;
    }
    function buildRoutePlannerLegCardMarkup(leg, legIndex) {
        const lineColor = getMtrOfficialLineColor(leg.lineCode);
        const stationNames = getRoutePlannerLegStationNames(leg);
        const originName = stationNames[0] || "";
        const destinationName = stationNames[stationNames.length - 1] || "";
        const intermediateStations = stationNames.slice(1, -1);
        const noteText = leg.kind === "walk"
            ? `請跟隨灰色步行連接前往 ${destinationName}`
            : intermediateStations.length > 0
                ? `途經 ${intermediateStations.join("、")}`
                : "此段直達，無需中途轉線";

        return `
            <article class="rail-route-leg-card ${leg.kind === "walk" ? "is-walk" : ""}" style="--rail-line-color: ${escapeHtml(lineColor)}">
                <div class="rail-route-leg-head">
                    <div class="rail-route-leg-heading">
                        <span class="rail-route-leg-line-dot" aria-hidden="true"></span>
                        <div>
                            <p class="rail-route-leg-kicker">${escapeHtml(leg.kind === "walk" ? `第 ${legIndex + 1} 段｜WALK` : `第 ${legIndex + 1} 段｜${leg.lineCode}`)}</p>
                            <h4 class="rail-route-leg-title">${escapeHtml(getRoutePlannerLegHeadline(leg))}</h4>
                        </div>
                    </div>
                    <span class="rail-meta-pill">${leg.kind === "walk" ? "步行" : `${escapeHtml(String(leg.stopCount))} 站`}</span>
                </div>
                <div class="rail-route-leg-meta-grid">
                    <div class="rail-route-leg-meta">
                        <span class="rail-route-leg-meta-label">由</span>
                        <strong class="rail-route-leg-meta-value">${escapeHtml(originName)}</strong>
                    </div>
                    <div class="rail-route-leg-meta">
                        <span class="rail-route-leg-meta-label">到</span>
                        <strong class="rail-route-leg-meta-value">${escapeHtml(destinationName)}</strong>
                    </div>
                    <div class="rail-route-leg-meta">
                        <span class="rail-route-leg-meta-label">${leg.kind === "walk" ? "方式" : "方向"}</span>
                        <strong class="rail-route-leg-meta-value">${escapeHtml(leg.kind === "walk" ? "步行連接" : leg.terminusNameZh || destinationName)}</strong>
                    </div>
                </div>
                <p class="rail-route-leg-stations">${escapeHtml(stationNames.join(" → "))}</p>
                <p class="rail-route-leg-note">${escapeHtml(noteText)}</p>
            </article>`;
    }
    function buildRoutePlannerResultMarkup() {
        const planner = railState.mtr.routePlanner;
        const originStation = getRoutePlannerStationEntry(planner.originStationCode);
        const destinationStation = getRoutePlannerStationEntry(planner.destinationStationCode);
        const routeViews = getRoutePlannerViews();
        const activeView = getActiveRoutePlannerView();
        const activeResult = activeView?.result || null;

        if (!originStation) {
            return `<section class="rail-route-result rail-empty-card"><h3 class="rail-empty-title">先選起點</h3><p class="rail-empty-text">請先在 custom SVG 港鐵圖上選擇起點，系統便會引導你繼續選終點。</p></section>`;
        }

        if (!destinationStation) {
            return `<section class="rail-route-result rail-empty-card"><h3 class="rail-empty-title">再選終點</h3><p class="rail-empty-text">起點已選好，接著在 custom SVG 港鐵圖上選擇終點，結果卡會立即更新。</p></section>`;
        }

        if (!routeViews.length || !activeResult) {
            return `<section class="rail-route-result rail-empty-card"><h3 class="rail-empty-title">正在整理建議方案</h3><p class="rail-empty-text">路線資料暫時未完成更新，請重新選擇終點或稍後再試一次。</p></section>`;
        }

        if (activeResult.status === "sameStation") {
            return `
                <section class="rail-route-result rail-route-result-card">
                    <div class="rail-route-result-head">
                        <div class="rail-summary-main">
                            <p class="rail-mtr-section-kicker">${escapeHtml(activeView.label)}</p>
                            <h3 class="rail-summary-title">${escapeHtml(originStation.nameZh)} 已是起點與終點</h3>
                            <p class="rail-summary-text">不用乘車、轉線或步行接駁；如需查詢其他路線，請改選另一個終點。</p>
                        </div>
                        <div class="rail-chip-row rail-route-result-chips"><span class="rail-chip">0 站</span><span class="rail-chip">同站</span></div>
                    </div>
                </section>`;
        }

        if (activeResult.status === "unreachable") {
            return `<section class="rail-route-result rail-empty-card rail-empty-card-error"><h3 class="rail-empty-title">暫時找不到合理路線</h3><p class="rail-empty-text">請重選起點或終點，或改查附近可步行接駁的站點組合。</p></section>`;
        }

        const transferSummary = activeResult.transferStations.length > 0
            ? activeResult.transferStations.map((station) => station.stationNameZh).join("、")
            : "無需轉線";
        const legMarkup = activeResult.legs.map((leg, index) => buildRoutePlannerLegCardMarkup(leg, index)).join("");
        const routeSummaryChips = [
            `<span class="rail-chip">${escapeHtml(String(activeResult.totalStops))} 站</span>`,
            `<span class="rail-chip">${activeResult.needsTransfer ? `${escapeHtml(String(activeResult.transferStations.length))} 次轉線` : "無需轉線"}</span>`,
            activeResult.hasWalkConnections ? '<span class="rail-chip">含步行連接</span>' : "",
            `<span class="rail-chip">${escapeHtml(String(activeResult.legs.length))} 段路線</span>`
        ].filter(Boolean).join("");
        const summaryText = activeResult.needsTransfer
            ? `建議於 ${transferSummary} 轉線${activeResult.hasWalkConnections ? "，並包含步行連接" : ""}`
            : activeResult.hasWalkConnections
                ? "建議方案包含步行連接"
                : "建議直達";

        return `
            <section class="rail-route-result rail-route-result-card">
                ${buildRoutePlannerViewTabsMarkup(routeViews, activeView.id)}
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
                        <p class="rail-summary-text">${escapeHtml(summaryText)}</p>
                    </div>
                    <div class="rail-chip-row rail-route-result-chips">${routeSummaryChips}</div>
                </div>
                ${buildRoutePlannerSummaryGridMarkup(activeView, activeResult)}
                ${buildRoutePlannerOptionStripMarkup(activeResult)}
                ${buildRoutePlannerTransferCalloutMarkup(activeResult)}
                <div class="rail-route-leg-list">
                    ${legMarkup}
                </div>
            </section>`;
    }
    function buildRoutePlannerOptionGalleryMarkup(routeViews, activeViewId) {
        if (!Array.isArray(routeViews) || routeViews.length === 0) return "";
        const galleryClassName = routeViews.length === 1
            ? "rail-route-option-gallery is-single"
            : "rail-route-option-gallery";
        return `
            <section class="${galleryClassName}" aria-label="路線方案">
                ${routeViews.map((view) => buildRoutePlannerOptionCardMarkup(view, activeViewId)).join("")}
            </section>`;
    }
    function buildRoutePlannerResultMarkup() {
        const planner = railState.mtr.routePlanner;
        const originStation = getRoutePlannerStationEntry(planner.originStationCode);
        const destinationStation = getRoutePlannerStationEntry(planner.destinationStationCode);
        const routeViews = getRoutePlannerViews();
        const activeView = getActiveRoutePlannerView();
        const activeResult = activeView?.result || null;

        if (!originStation) {
            return `<section class="rail-route-result rail-empty-card"><h3 class="rail-empty-title">請先選擇起點</h3><p class="rail-empty-text">你可以直接在 custom SVG 港鐵圖上點選起點站，之後再選終點。</p></section>`;
        }

        if (!destinationStation) {
            return `<section class="rail-route-result rail-empty-card"><h3 class="rail-empty-title">請再選擇終點</h3><p class="rail-empty-text">起點已設定，現在請在 custom SVG 港鐵圖上點選終點站。</p></section>`;
        }

        if (!routeViews.length || !activeView || !activeResult) {
            return `<section class="rail-route-result rail-empty-card"><h3 class="rail-empty-title">未找到可顯示的方案</h3><p class="rail-empty-text">請嘗試重新選擇起點與終點。</p></section>`;
        }

        if (activeResult.status === "unreachable") {
            return `<section class="rail-route-result rail-empty-card rail-empty-card-error"><h3 class="rail-empty-title">暫時未找到合理路線</h3><p class="rail-empty-text">請檢查站點是否正確，或改用其他起點 / 終點再試一次。</p></section>`;
        }

        return `
            <section class="rail-route-result rail-route-result-card rail-route-result-card-compact">
                ${buildRoutePlannerOptionGalleryMarkup(routeViews, activeView.id)}
            </section>`;
    }
    function buildRoutePlannerPanelMarkup() {
        const planner = railState.mtr.routePlanner;
        const selectedOriginCode = planner.originStationCode;
        const selectedDestinationCode = planner.destinationStationCode;
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

                ${buildRoutePlannerResultMarkup()}

                ${buildCustomSchematicMarkup()}
            </section>`;
    }
    function buildRoutePlannerShellMarkup() {
        return `
            <section class="rail-route-shell">
                ${buildRoutePlannerBubbleMarkup()}
                ${railState.mtr.routePlanner.isOpen ? buildRoutePlannerPanelMarkup() : ""}
            </section>`;
    }
    function bindOfficialMapInteractions() {
        const viewport = document.getElementById("mtrOfficialMapViewport");
        if (!(viewport instanceof HTMLElement)) return;
        mapGestureState.activePointers.clear();
        mapGestureState.mode = "idle";
        mapGestureState.dragStartPoint = null;
        mapGestureState.dragStartView = null;
        mapGestureState.pinchStartDistance = 0;
        mapGestureState.pinchContentPoint = null;
        mapGestureState.hasDragged = false;

        const updateDragCursor = () => {
            viewport.classList.toggle("is-dragging", mapGestureState.mode !== "idle");
        };
        const beginPinchFromActivePointers = () => {
            if (mapGestureState.activePointers.size < 2) return;
            const [firstPoint, secondPoint] = Array.from(mapGestureState.activePointers.values());
            const mapView = getMapViewportState();
            const startMid = {
                x: (firstPoint.x + secondPoint.x) / 2,
                y: (firstPoint.y + secondPoint.y) / 2
            };
            mapGestureState.mode = "pinch";
            mapGestureState.hasDragged = true;
            mapGestureState.dragStartPoint = null;
            mapGestureState.dragStartView = null;
            mapGestureState.pinchStartDistance = Math.max(1, Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y));
            mapGestureState.pinchStartScale = mapView.scale;
            mapGestureState.pinchContentPoint = {
                x: (startMid.x - mapView.x) / mapView.scale,
                y: (startMid.y - mapView.y) / mapView.scale
            };
            updateDragCursor();
        };
        const handlePointerDown = (event) => {
            if (event.button !== undefined && event.pointerType === "mouse" && event.button !== 0) return;
            const point = getViewportLocalPoint(viewport, event.clientX, event.clientY);
            mapGestureState.activePointers.set(event.pointerId, point);
            viewport.setPointerCapture(event.pointerId);

            if (mapGestureState.activePointers.size >= 2) {
                beginPinchFromActivePointers();
                return;
            }

            mapGestureState.mode = "pan";
            mapGestureState.dragStartPoint = point;
            mapGestureState.dragStartView = { x: getMapViewportState().x, y: getMapViewportState().y };
            mapGestureState.hasDragged = false;
            updateDragCursor();
        };
        const handlePointerMove = (event) => {
            if (!mapGestureState.activePointers.has(event.pointerId)) return;
            const point = getViewportLocalPoint(viewport, event.clientX, event.clientY);
            mapGestureState.activePointers.set(event.pointerId, point);

            if (mapGestureState.activePointers.size >= 2) {
                if (mapGestureState.mode !== "pinch") beginPinchFromActivePointers();
                const [firstPoint, secondPoint] = Array.from(mapGestureState.activePointers.values());
                const currentDistance = Math.max(1, Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y));
                const currentMid = {
                    x: (firstPoint.x + secondPoint.x) / 2,
                    y: (firstPoint.y + secondPoint.y) / 2
                };
                const nextScale = clampMapScale(mapGestureState.pinchStartScale * (currentDistance / mapGestureState.pinchStartDistance));
                const contentPoint = mapGestureState.pinchContentPoint || { x: 0, y: 0 };
                const nextX = currentMid.x - contentPoint.x * nextScale;
                const nextY = currentMid.y - contentPoint.y * nextScale;
                setMapView(viewport, nextScale, nextX, nextY, { markAdjusted: true });
                mapGestureState.hasDragged = true;
                return;
            }

            if (mapGestureState.mode !== "pan" || !mapGestureState.dragStartPoint || !mapGestureState.dragStartView) return;
            const deltaX = point.x - mapGestureState.dragStartPoint.x;
            const deltaY = point.y - mapGestureState.dragStartPoint.y;
            if (!mapGestureState.hasDragged && Math.hypot(deltaX, deltaY) > 6) {
                mapGestureState.hasDragged = true;
            }
            if (!mapGestureState.hasDragged) return;
            setMapView(
                viewport,
                getMapViewportState().scale,
                mapGestureState.dragStartView.x + deltaX,
                mapGestureState.dragStartView.y + deltaY,
                { markAdjusted: true }
            );
        };
        const finishPointerInteraction = (event) => {
            if (mapGestureState.activePointers.has(event.pointerId)) {
                mapGestureState.activePointers.delete(event.pointerId);
            }
            try {
                if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
            } catch {}

            if (mapGestureState.activePointers.size >= 2) {
                beginPinchFromActivePointers();
                return;
            }

            if (mapGestureState.activePointers.size === 1) {
                const remainingPoint = Array.from(mapGestureState.activePointers.values())[0];
                mapGestureState.mode = "pan";
                mapGestureState.dragStartPoint = { x: remainingPoint.x, y: remainingPoint.y };
                mapGestureState.dragStartView = { x: getMapViewportState().x, y: getMapViewportState().y };
                updateDragCursor();
                return;
            }

            if (mapGestureState.hasDragged) {
                mapGestureState.suppressClickUntil = Date.now() + 220;
            }
            mapGestureState.mode = "idle";
            mapGestureState.dragStartPoint = null;
            mapGestureState.dragStartView = null;
            mapGestureState.pinchStartDistance = 0;
            mapGestureState.pinchContentPoint = null;
            mapGestureState.hasDragged = false;
            updateDragCursor();
        };
        const handleWheel = (event) => {
            event.preventDefault();
            const localPoint = getViewportLocalPoint(viewport, event.clientX, event.clientY);
            const zoomFactor = Math.exp(event.deltaY * -0.0015);
            zoomMapAtPoint(viewport, getMapViewportState().scale * zoomFactor, localPoint, { markAdjusted: true });
            mapGestureState.suppressClickUntil = Date.now() + 120;
        };
        const handleClickCapture = (event) => {
            const stationButton = event.target instanceof HTMLElement ? event.target.closest("[data-route-station]") : null;
            if (!(stationButton instanceof HTMLElement)) return;
            if (Date.now() < mapGestureState.suppressClickUntil) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        viewport.addEventListener("pointerdown", handlePointerDown);
        viewport.addEventListener("pointermove", handlePointerMove);
        viewport.addEventListener("pointerup", finishPointerInteraction);
        viewport.addEventListener("pointercancel", finishPointerInteraction);
        viewport.addEventListener("lostpointercapture", finishPointerInteraction);
        viewport.addEventListener("wheel", handleWheel, { passive: false });
        viewport.addEventListener("click", handleClickCapture, true);

        initializeMapViewport(viewport, [
            railState.mtr.routePlanner.originStationCode,
            railState.mtr.routePlanner.destinationStationCode,
            railState.mtr.nearest.nearestStation?.stationCode
        ].filter(Boolean));
        applyMapTransform(viewport);
    }
    function maybeFocusOfficialMapViewport() {
        if (railState.currentTab !== "mtr" || !railState.mtr.routePlanner.isOpen) return;

        const viewport = document.getElementById("mtrOfficialMapViewport");
        if (!(viewport instanceof HTMLElement)) return;

        const activeView = getActiveRoutePlannerView();
        const focusStationCodes = Array.isArray(activeView?.result?.stationCodes) && activeView.result.stationCodes.length > 0
            ? activeView.result.stationCodes
            : [railState.mtr.routePlanner.originStationCode, railState.mtr.routePlanner.destinationStationCode, railState.mtr.nearest.nearestStation?.stationCode].filter(Boolean);
        const focusBounds = getMapFocusBounds(focusStationCodes);
        if (!focusBounds) return;

        const focusKey = `${activeView?.id || "idle"}:${focusStationCodes.join("|")}:${railState.mtr.routePlanner.activeField}`;
        if (railState.mtr.routePlanner.lastMapFocusKey === focusKey) return;
        railState.mtr.routePlanner.lastMapFocusKey = focusKey;
        initializeMapViewport(viewport, focusStationCodes);
        const currentScale = getMapViewportState().scale;
        const metrics = getMapViewportMetrics(viewport, currentScale);
        if (!metrics) return;

        const focusWidth = Math.max(72, focusBounds.maxX - focusBounds.minX);
        const focusHeight = Math.max(72, focusBounds.maxY - focusBounds.minY);
        const fitScale = clampMapScale(Math.min(
            (metrics.viewportWidth - 84) / focusWidth,
            (metrics.viewportHeight - 96) / focusHeight
        ));
        const nextScale = getMapViewportState().hasUserAdjusted
            ? currentScale
            : Math.max(Math.min(currentScale, fitScale), getDefaultMapScale(viewport));

        centerMapOnBounds(viewport, focusBounds, { scaleOverride: nextScale });
    }
    function getSchematicViewportState() {
        return railState.mtr.routePlanner.schematicView;
    }
    function getSchematicViewportMetrics(viewport, scale = getSchematicViewportState().scale) {
        const schematicRuntime = railState.mtr.routing.customSchematic;
        if (!(viewport instanceof HTMLElement) || !schematicRuntime) return null;
        const mapWidth = schematicRuntime.viewBox.width;
        const mapHeight = schematicRuntime.viewBox.height;
        return {
            viewportWidth: viewport.clientWidth,
            viewportHeight: viewport.clientHeight,
            mapWidth,
            mapHeight,
            scaledWidth: mapWidth * scale,
            scaledHeight: mapHeight * scale
        };
    }
    function clampSchematicScale(value) {
        const schematicView = getSchematicViewportState();
        return Math.min(schematicView.maxScale, Math.max(schematicView.minScale, value));
    }
    function clampSchematicOffset(viewport, x, y, scale = getSchematicViewportState().scale) {
        const metrics = getSchematicViewportMetrics(viewport, scale);
        if (!metrics) return { x, y };

        const clampedX = metrics.scaledWidth <= metrics.viewportWidth
            ? (metrics.viewportWidth - metrics.scaledWidth) / 2
            : Math.min(0, Math.max(metrics.viewportWidth - metrics.scaledWidth, x));
        const clampedY = metrics.scaledHeight <= metrics.viewportHeight
            ? (metrics.viewportHeight - metrics.scaledHeight) / 2
            : Math.min(0, Math.max(metrics.viewportHeight - metrics.scaledHeight, y));

        return { x: clampedX, y: clampedY };
    }
    function getSchematicStation(stationCode) {
        const normalizedStationCode = String(stationCode || "").toUpperCase();
        return railState.mtr.routing.customSchematic?.stations?.[normalizedStationCode]
            || railState.mtr.routing.customSchematic?.landmarks?.[normalizedStationCode]
            || null;
    }
    function getSchematicFocusBounds(stationCodes) {
        const points = stationCodes.map((stationCode) => getSchematicStation(stationCode)).filter(Boolean);
        if (points.length === 0) return null;

        return {
            points,
            minX: Math.min(...points.map((point) => point.marker?.x ?? point.x)),
            maxX: Math.max(...points.map((point) => point.marker?.x ?? point.x)),
            minY: Math.min(...points.map((point) => point.marker?.y ?? point.y)),
            maxY: Math.max(...points.map((point) => point.marker?.y ?? point.y))
        };
    }
    function getDefaultSchematicBounds() {
        return {
            minX: 340,
            maxX: 1880,
            minY: 140,
            maxY: 1120
        };
    }
    function getDefaultSchematicScale(viewport) {
        const metrics = getSchematicViewportMetrics(viewport, 1);
        if (!metrics) return 1;

        const bounds = getDefaultSchematicBounds();
        const fitScale = Math.min(
            (metrics.viewportWidth - 84) / Math.max(320, bounds.maxX - bounds.minX),
            (metrics.viewportHeight - 92) / Math.max(260, bounds.maxY - bounds.minY)
        );

        return clampSchematicScale(fitScale);
    }
    function applySchematicTransform(viewport) {
        const scene = document.getElementById("mtrSchematicScene");
        if (!(viewport instanceof HTMLElement) || !(scene instanceof HTMLElement)) return;
        const schematicView = getSchematicViewportState();
        scene.style.transform = `translate3d(${schematicView.x}px, ${schematicView.y}px, 0) scale(${schematicView.scale})`;
    }
    function setSchematicView(viewport, nextScale, nextX, nextY, { markAdjusted = false } = {}) {
        const schematicView = getSchematicViewportState();
        const scale = clampSchematicScale(nextScale);
        const offset = clampSchematicOffset(viewport, nextX, nextY, scale);
        schematicView.scale = scale;
        schematicView.x = offset.x;
        schematicView.y = offset.y;
        if (markAdjusted) schematicView.hasUserAdjusted = true;
        applySchematicTransform(viewport);
    }
    function centerSchematicOnBounds(viewport, bounds, { scaleOverride = null, markAdjusted = false } = {}) {
        if (!(viewport instanceof HTMLElement) || !bounds) return;
        const metrics = getSchematicViewportMetrics(viewport, 1);
        if (!metrics) return;

        const scale = clampSchematicScale(scaleOverride ?? getSchematicViewportState().scale);
        const paddingX = Math.min(140, Math.max(54, metrics.viewportWidth * 0.12));
        const paddingY = Math.min(120, Math.max(54, metrics.viewportHeight * 0.14));
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const targetX = metrics.viewportWidth / 2 - centerX * scale;
        const targetY = metrics.viewportHeight / 2 - centerY * scale + paddingY * 0.04;

        setSchematicView(viewport, scale, targetX, targetY, { markAdjusted });
    }
    function zoomSchematicAtPoint(viewport, nextScale, focusPoint, { markAdjusted = false } = {}) {
        if (!(viewport instanceof HTMLElement) || !focusPoint) return;
        const schematicView = getSchematicViewportState();
        const scale = clampSchematicScale(nextScale);
        const contentX = (focusPoint.x - schematicView.x) / schematicView.scale;
        const contentY = (focusPoint.y - schematicView.y) / schematicView.scale;
        const nextX = focusPoint.x - contentX * scale;
        const nextY = focusPoint.y - contentY * scale;
        setSchematicView(viewport, scale, nextX, nextY, { markAdjusted });
    }
    function initializeSchematicViewport(viewport, focusStationCodes = []) {
        const schematicView = getSchematicViewportState();
        if (!(viewport instanceof HTMLElement) || schematicView.isInitialized) {
            applySchematicTransform(viewport);
            return;
        }

        schematicView.isInitialized = true;
        const defaultScale = getDefaultSchematicScale(viewport);
        const focusBounds = getSchematicFocusBounds(focusStationCodes) || getDefaultSchematicBounds();
        centerSchematicOnBounds(viewport, focusBounds, { scaleOverride: defaultScale });
    }
    function maybeFocusCustomSchematicViewport() {
        if (railState.currentTab !== "mtr" || !railState.mtr.routePlanner.isOpen) return;

        const viewport = document.getElementById("mtrSchematicViewport");
        if (!(viewport instanceof HTMLElement)) return;

        const activeView = getActiveRoutePlannerView();
        const hasActiveRoute = activeView?.result?.status === "ready";
        const focusStationCodes = Array.isArray(activeView?.result?.stationCodes) && activeView.result.stationCodes.length > 0
            ? activeView.result.stationCodes
            : [railState.mtr.routePlanner.originStationCode, railState.mtr.routePlanner.destinationStationCode].filter(Boolean);

        initializeSchematicViewport(viewport, focusStationCodes);
        if (getSchematicViewportState().hasUserAdjusted) return;
        if (!hasActiveRoute && focusStationCodes.length <= 1) return;

        const focusBounds = getSchematicFocusBounds(focusStationCodes) || getDefaultSchematicBounds();
        const focusKey = `${activeView?.id || "idle"}:${focusStationCodes.join("|") || "default"}`;
        if (railState.mtr.routePlanner.lastSchematicFocusKey === focusKey) return;
        railState.mtr.routePlanner.lastSchematicFocusKey = focusKey;

        const currentScale = getSchematicViewportState().scale;
        const metrics = getSchematicViewportMetrics(viewport, currentScale);
        if (!metrics) return;

        const focusWidth = Math.max(180, focusBounds.maxX - focusBounds.minX);
        const focusHeight = Math.max(160, focusBounds.maxY - focusBounds.minY);
        const fitScale = clampSchematicScale(Math.min(
            (metrics.viewportWidth - 120) / focusWidth,
            (metrics.viewportHeight - 128) / focusHeight
        ));
        const nextScale = getSchematicViewportState().hasUserAdjusted
            ? currentScale
            : fitScale;

        centerSchematicOnBounds(viewport, focusBounds, { scaleOverride: nextScale });
    }
    function bindCustomSchematicInteractions() {
        const viewport = document.getElementById("mtrSchematicViewport");
        if (!(viewport instanceof HTMLElement)) return;

        schematicGestureState.activePointers.clear();
        schematicGestureState.mode = "idle";
        schematicGestureState.dragStartPoint = null;
        schematicGestureState.dragStartView = null;
        schematicGestureState.pinchStartDistance = 0;
        schematicGestureState.pinchContentPoint = null;
        schematicGestureState.pressedStationCode = "";
        schematicGestureState.pressedPointerId = null;
        schematicGestureState.hasDragged = false;

        const updateDragCursor = () => {
            viewport.classList.toggle("is-dragging", schematicGestureState.mode !== "idle");
        };
        const beginPinchFromActivePointers = () => {
            if (schematicGestureState.activePointers.size < 2) return;
            const [firstPoint, secondPoint] = Array.from(schematicGestureState.activePointers.values());
            const schematicView = getSchematicViewportState();
            const startMid = {
                x: (firstPoint.x + secondPoint.x) / 2,
                y: (firstPoint.y + secondPoint.y) / 2
            };
            schematicGestureState.mode = "pinch";
            schematicGestureState.hasDragged = true;
            schematicGestureState.dragStartPoint = null;
            schematicGestureState.dragStartView = null;
            schematicGestureState.pinchStartDistance = Math.max(1, Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y));
            schematicGestureState.pinchStartScale = schematicView.scale;
            schematicGestureState.pinchContentPoint = {
                x: (startMid.x - schematicView.x) / schematicView.scale,
                y: (startMid.y - schematicView.y) / schematicView.scale
            };
            updateDragCursor();
        };
        const handlePointerDown = (event) => {
            const point = getViewportLocalPoint(viewport, event.clientX, event.clientY);
            schematicGestureState.activePointers.set(event.pointerId, point);
            schematicGestureState.pressedStationCode = event.target instanceof Element
                ? (event.target.closest("[data-route-station]")?.getAttribute("data-route-station") || "")
                : "";
            schematicGestureState.pressedPointerId = event.pointerId;
            viewport.setPointerCapture(event.pointerId);

            if (schematicGestureState.activePointers.size >= 2) {
                beginPinchFromActivePointers();
                return;
            }

            schematicGestureState.mode = "pan";
            schematicGestureState.dragStartPoint = point;
            schematicGestureState.dragStartView = { x: getSchematicViewportState().x, y: getSchematicViewportState().y };
            schematicGestureState.hasDragged = false;
            updateDragCursor();
        };
        const handlePointerMove = (event) => {
            if (!schematicGestureState.activePointers.has(event.pointerId)) return;
            const point = getViewportLocalPoint(viewport, event.clientX, event.clientY);
            schematicGestureState.activePointers.set(event.pointerId, point);

            if (schematicGestureState.activePointers.size >= 2) {
                if (schematicGestureState.mode !== "pinch") beginPinchFromActivePointers();
                const [firstPoint, secondPoint] = Array.from(schematicGestureState.activePointers.values());
                const midPoint = {
                    x: (firstPoint.x + secondPoint.x) / 2,
                    y: (firstPoint.y + secondPoint.y) / 2
                };
                const currentDistance = Math.max(1, Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y));
                const nextScale = clampSchematicScale(schematicGestureState.pinchStartScale * (currentDistance / schematicGestureState.pinchStartDistance));
                const contentPoint = schematicGestureState.pinchContentPoint || { x: 0, y: 0 };
                const nextX = midPoint.x - contentPoint.x * nextScale;
                const nextY = midPoint.y - contentPoint.y * nextScale;
                setSchematicView(viewport, nextScale, nextX, nextY, { markAdjusted: true });
                schematicGestureState.hasDragged = true;
                return;
            }

            if (schematicGestureState.mode !== "pan" || !schematicGestureState.dragStartPoint || !schematicGestureState.dragStartView) return;
            const deltaX = point.x - schematicGestureState.dragStartPoint.x;
            const deltaY = point.y - schematicGestureState.dragStartPoint.y;
            if (!schematicGestureState.hasDragged && Math.hypot(deltaX, deltaY) > 6) {
                schematicGestureState.hasDragged = true;
                schematicGestureState.pressedStationCode = "";
            }
            if (!schematicGestureState.hasDragged) return;

            setSchematicView(
                viewport,
                getSchematicViewportState().scale,
                schematicGestureState.dragStartView.x + deltaX,
                schematicGestureState.dragStartView.y + deltaY,
                { markAdjusted: true }
            );
        };
        const endPointerInteraction = (event) => {
            if (schematicGestureState.activePointers.has(event.pointerId)) {
                schematicGestureState.activePointers.delete(event.pointerId);
            }

            if (viewport.hasPointerCapture(event.pointerId)) {
                viewport.releasePointerCapture(event.pointerId);
            }
            if (schematicGestureState.activePointers.size >= 2) {
                beginPinchFromActivePointers();
                updateDragCursor();
                return;
            }
            if (schematicGestureState.activePointers.size === 1) {
                const remainingPoint = Array.from(schematicGestureState.activePointers.values())[0];
                schematicGestureState.mode = "pan";
                schematicGestureState.dragStartPoint = { x: remainingPoint.x, y: remainingPoint.y };
                schematicGestureState.dragStartView = { x: getSchematicViewportState().x, y: getSchematicViewportState().y };
                updateDragCursor();
                return;
            }

            if (schematicGestureState.hasDragged) {
                schematicGestureState.suppressClickUntil = Date.now() + 220;
            }
            if (!schematicGestureState.hasDragged && schematicGestureState.pressedPointerId === event.pointerId && schematicGestureState.pressedStationCode) {
                const stationCode = schematicGestureState.pressedStationCode;
                schematicGestureState.suppressClickUntil = Date.now() + 220;
                schematicGestureState.pressedStationCode = "";
                schematicGestureState.pressedPointerId = null;
                selectRoutePlannerStation(stationCode);
                renderCurrentTab();
                bindCurrentTabEvents();
                return;
            }
            schematicGestureState.mode = "idle";
            schematicGestureState.dragStartPoint = null;
            schematicGestureState.dragStartView = null;
            schematicGestureState.pinchStartDistance = 0;
            schematicGestureState.pinchContentPoint = null;
            schematicGestureState.pressedStationCode = "";
            schematicGestureState.pressedPointerId = null;
            schematicGestureState.hasDragged = false;
            updateDragCursor();
        };
        const handleWheel = (event) => {
            event.preventDefault();
            const localPoint = getViewportLocalPoint(viewport, event.clientX, event.clientY);
            const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
            zoomSchematicAtPoint(viewport, getSchematicViewportState().scale * zoomFactor, localPoint, { markAdjusted: true });
            schematicGestureState.suppressClickUntil = Date.now() + 120;
        };

        viewport.addEventListener("pointerdown", handlePointerDown);
        viewport.addEventListener("pointermove", handlePointerMove);
        viewport.addEventListener("pointerup", endPointerInteraction);
        viewport.addEventListener("pointercancel", endPointerInteraction);
        viewport.addEventListener("pointerleave", endPointerInteraction);
        viewport.addEventListener("wheel", handleWheel, { passive: false });

        initializeSchematicViewport(viewport);
        applySchematicTransform(viewport);
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
    function getNextTrainModalServiceLabel(index) {
        if (index === 0) return "下一班車";
        const chineseNumbers = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
        const numberLabel = chineseNumbers[index] || String(index + 1);
        return `第${numberLabel}班車`;
    }
    function buildNextTrainModalServiceLineMarkup(service, index) {
        const lineLabel = getNextTrainModalServiceLabel(index);
        const scheduleText = service.clockTime ? `（預計 ${service.clockTime}）` : "（官方未提供時鐘時間）";
        const metaParts = [
            service.platform ? `${service.platform}號月台` : "",
            service.timeTypeLabel || "",
            ...(Array.isArray(service.notes) ? service.notes : [])
        ].filter(Boolean);

        return `
            <li class="rail-next-train-list-item ${index === 0 ? "is-primary" : ""}">
                <span class="rail-next-train-list-label">${escapeHtml(lineLabel)}：</span>
                <span class="rail-next-train-list-text">${escapeHtml(service.minutesLabel || "時間未提供")}${escapeHtml(scheduleText)}</span>
                ${metaParts.length > 0 ? `<span class="rail-next-train-list-meta"> · ${escapeHtml(metaParts.join(" · "))}</span>` : ""}
            </li>`;
    }
    function buildNextTrainModalMarkup() {
        const modalState = railState.ui.nextTrainModal;
        if (!modalState?.isOpen) return "";

        const detail = getNextTrainModalDetail();
        const lineSummary = detail?.lineSummary || null;
        const directionSummary = detail?.directionSummary || null;
        const services = Array.isArray(detail?.services) ? detail.services : [];
        const lineColor = getMtrOfficialLineColor(lineSummary?.lineCode || modalState.lineCode || "");
        const modalTitle = lineSummary && directionSummary
            ? `${lineSummary.lineNameZh}　往 ${directionSummary.terminusNameZh}`
            : "下一班車詳情";
        const modalSubtitleBits = [directionSummary?.stationNameZh || lineSummary?.stationNameZh || ""];
        if (lineSummary?.referenceTimeLabel) modalSubtitleBits.push(`更新 ${lineSummary.referenceTimeLabel}`);
        const modalSubtitle = modalSubtitleBits.filter(Boolean).join(" · ");
        const listMarkup = services.length > 0
            ? `<ul class="rail-next-train-list">${services.map((service, index) => buildNextTrainModalServiceLineMarkup(service, index)).join("")}</ul>`
            : '<p class="rail-next-train-empty">暫時沒有班次資料</p>';

        return `
            <section class="rail-next-train-modal-layer" id="mtrNextTrainModal">
                <button type="button" class="rail-next-train-modal-backdrop" data-next-train-modal-close aria-label="關閉下一班車詳情"></button>
                <div class="rail-next-train-modal" style="--rail-bubble-color: ${escapeHtml(lineColor)};" role="dialog" aria-modal="true" aria-labelledby="mtrNextTrainModalTitle" aria-describedby="mtrNextTrainModalSubtitle">
                    <div class="rail-next-train-modal-head">
                        <div class="rail-summary-main">
                            <p class="rail-mtr-section-kicker">下一班車詳情</p>
                            <h3 class="rail-summary-title" id="mtrNextTrainModalTitle">${escapeHtml(modalTitle)}</h3>
                            <p class="rail-summary-text" id="mtrNextTrainModalSubtitle">${escapeHtml(modalSubtitle)}</p>
                        </div>
                        <button type="button" class="rail-next-train-modal-close" id="mtrNextTrainModalClose" data-next-train-modal-close aria-label="關閉">關閉</button>
                    </div>
                    <div class="rail-next-train-modal-body">${listMarkup}</div>
                </div>
            </section>`;
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
    function buildNearestLineSummary(lineMembership, schedule) {
        const directions = Array.isArray(schedule?.directions) ? schedule.directions : [];
        const hasAnyDirectionData = directions.some((direction) => direction.hasData);
        const referenceTime = schedule?.currentTime || schedule?.systemTime || "";
        const referenceTimeLabel = schedule?.currentTimeLabel || schedule?.systemTimeLabel || "";
        const stationCode = schedule?.stationCode || lineMembership.stationCode || "";
        const stationNameZh = schedule?.stationNameZh || resolveMtrStationName(stationCode);

        const directionSummaries = directions.map((direction) => {
            const services = Array.isArray(direction.services) ? direction.services : [];
            const nextService = services[0] || null;
            const directionTerminusName = getMtrDirectionTerminusName(lineMembership.lineCode, direction.apiKey);

            if (!nextService) {
                return {
                    status: "empty",
                    lineCode: lineMembership.lineCode,
                    lineNameZh: lineMembership.lineNameZh,
                    stationCode,
                    stationNameZh,
                    directionKey: direction.apiKey,
                    terminusNameZh: directionTerminusName || "終點站未提供",
                    title: directionTerminusName ? `${lineMembership.lineNameZh} 往 ${directionTerminusName}` : lineMembership.lineNameZh,
                    metaText: "下一班車 暫無官方資料",
                    platformLabel: "",
                    timeTypeLabel: "",
                    notes: [],
                    services: []
                };
            }

            const terminusName = nextService.destinationNameZh || directionTerminusName || "終點站未提供";

            return {
                status: "success",
                lineCode: lineMembership.lineCode,
                lineNameZh: lineMembership.lineNameZh,
                stationCode,
                stationNameZh,
                directionKey: direction.apiKey,
                terminusNameZh: terminusName,
                title: `${lineMembership.lineNameZh} 往 ${terminusName}`,
                metaText: `下一班車 ${nextService.clockTime} ${nextService.minutesLabel}`,
                platformLabel: nextService.platform ? `${nextService.platform}號月台` : "",
                timeTypeLabel: nextService.timeTypeLabel || "",
                notes: nextService.notes || [],
                services
            };
        });

        if (!hasAnyDirectionData) {
            return {
                status: "empty",
                lineCode: lineMembership.lineCode,
                lineNameZh: lineMembership.lineNameZh,
                stationCode,
                stationNameZh,
                referenceTime,
                referenceTimeLabel,
                directionSummaries,
                alertMessage: schedule?.alertMessage || "",
                isDelay: Boolean(schedule?.isDelay)
            };
        }

        return {
            status: "success",
            lineCode: lineMembership.lineCode,
            lineNameZh: lineMembership.lineNameZh,
            stationCode,
            stationNameZh,
            referenceTime,
            referenceTimeLabel,
            directionSummaries,
            alertMessage: schedule?.alertMessage || "",
            isDelay: Boolean(schedule?.isDelay)
        };
    }
    function openNextTrainModal(lineCode, directionKey) {
        railState.ui.nextTrainModal = {
            isOpen: true,
            lineCode: String(lineCode || "").toUpperCase(),
            directionKey: String(directionKey || "").toUpperCase()
        };
    }
    function closeNextTrainModal() {
        railState.ui.nextTrainModal = {
            isOpen: false,
            lineCode: "",
            directionKey: ""
        };
    }
    function getNextTrainModalDetail() {
        const modalState = railState.ui.nextTrainModal;
        if (!modalState?.isOpen) return null;
        const lineSummary = (railState.mtr.nearest.lineSummaries || []).find((summary) => summary.lineCode === modalState.lineCode) || null;
        if (!lineSummary) return null;
        const directionSummary = (lineSummary.directionSummaries || []).find((summary) => summary.directionKey === modalState.directionKey && summary.status === "success") || null;
        if (!directionSummary) return null;
        const services = Array.isArray(directionSummary.services) ? directionSummary.services : [];
        return {
            lineSummary,
            directionSummary,
            services,
            nextService: services[0] || null,
            followUpServices: services.slice(1)
        };
    }
    function buildNearestDirectionRow(directionSummary) {
        const notesMarkup = directionSummary.notes.length > 0
            ? `<ul class="rail-note-list rail-nearest-note-list">${directionSummary.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`
            : "";
        const tagsMarkup = directionSummary.platformLabel || directionSummary.timeTypeLabel
            ? `<div class="rail-service-tags rail-nearest-direction-tags">${directionSummary.platformLabel ? `<span class="rail-meta-pill">${escapeHtml(directionSummary.platformLabel)}</span>` : ""}${directionSummary.timeTypeLabel ? `<span class="rail-meta-pill">${escapeHtml(directionSummary.timeTypeLabel)}</span>` : ""}</div>`
            : "";

        if (directionSummary.status !== "success") {
            return `
                <section class="rail-nearest-direction-row is-empty">
                    <div class="rail-nearest-direction-main">
                        <h5 class="rail-nearest-direction-title">${escapeHtml(directionSummary.title)}</h5>
                        <p class="rail-nearest-direction-meta">${escapeHtml(directionSummary.metaText)}</p>
                        ${notesMarkup}
                    </div>
                    ${tagsMarkup}
                </section>`;
        }

        return `
            <button
                type="button"
                class="rail-nearest-direction-row rail-nearest-direction-button"
                data-next-train-trigger="true"
                data-line-code="${escapeHtml(directionSummary.lineCode)}"
                data-direction-key="${escapeHtml(directionSummary.directionKey)}"
                aria-haspopup="dialog"
                aria-controls="mtrNextTrainModal"
            >
                <div class="rail-nearest-direction-main">
                    <h5 class="rail-nearest-direction-title">${escapeHtml(directionSummary.title)}</h5>
                    <p class="rail-nearest-direction-meta">${escapeHtml(directionSummary.metaText)}</p>
                    <span class="rail-nearest-direction-hint">查看其餘班車</span>
                    ${notesMarkup}
                </div>
                ${tagsMarkup}
            </button>`;
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
    function buildNextTrainModalServiceCardMarkup(service, index, terminusNameZh) {
        const orderLabel = `第 ${index + 2} 班`;
        const metaTags = `${service.platform ? `<span class="rail-meta-pill">${escapeHtml(service.platform)}號月台</span>` : ""}${service.timeTypeLabel ? `<span class="rail-meta-pill">${escapeHtml(service.timeTypeLabel)}</span>` : ""}`;
        return `
            <article class="rail-service-card rail-next-train-service-card">
                <div class="rail-service-eta">
                    <span class="rail-service-eta-value">${Number.isFinite(service.minutes) ? escapeHtml(String(service.minutes)) : "--"}</span>
                    <span class="rail-service-eta-label">${escapeHtml(service.minutesLabel || "時間未提供")}</span>
                </div>
                <div class="rail-service-main">
                    <div class="rail-service-header">
                        <div>
                            <p class="rail-next-train-service-kicker">${escapeHtml(orderLabel)}</p>
                            <h5 class="rail-service-destination">${escapeHtml(terminusNameZh)}</h5>
                        </div>
                        ${metaTags ? `<div class="rail-service-tags">${metaTags}</div>` : ""}
                    </div>
                    <p class="rail-service-time">${service.clockTime ? `預計 ${escapeHtml(service.clockTime)}` : "官方未提供時鐘時間"}</p>
                    ${service.notes.length > 0 ? `<ul class="rail-note-list rail-next-train-note-list">${service.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
                </div>
            </article>`;
    }
    function buildNextTrainModalMarkup() {
        const detail = getNextTrainModalDetail();
        if (!detail || !detail.nextService) return "";

        const { lineSummary, directionSummary, nextService, followUpServices, services } = detail;
        const modalTitle = `${lineSummary.lineNameZh}　往 ${directionSummary.terminusNameZh}`;
        const modalSubtitleBits = [directionSummary.stationNameZh || lineSummary.stationNameZh || ""];
        if (lineSummary.referenceTimeLabel) modalSubtitleBits.push(`更新 ${lineSummary.referenceTimeLabel}`);
        const modalSubtitle = modalSubtitleBits.filter(Boolean).join("　·　");
        const summaryTags = `${nextService.platform ? `<span class="rail-meta-pill">${escapeHtml(nextService.platform)}號月台</span>` : ""}${nextService.timeTypeLabel ? `<span class="rail-meta-pill">${escapeHtml(nextService.timeTypeLabel)}</span>` : ""}`;

        return `
            <section class="rail-next-train-modal-layer" id="mtrNextTrainModal">
                <button type="button" class="rail-next-train-modal-backdrop" data-next-train-modal-close aria-label="關閉下一班車詳情"></button>
                <div class="rail-next-train-modal" role="dialog" aria-modal="true" aria-labelledby="mtrNextTrainModalTitle" aria-describedby="mtrNextTrainModalSubtitle">
                    <div class="rail-next-train-modal-head">
                        <div class="rail-summary-main">
                            <p class="rail-mtr-section-kicker">下一班車詳情</p>
                            <h3 class="rail-summary-title" id="mtrNextTrainModalTitle">${escapeHtml(modalTitle)}</h3>
                            <p class="rail-summary-text" id="mtrNextTrainModalSubtitle">${escapeHtml(modalSubtitle)}</p>
                        </div>
                        <button type="button" class="rail-next-train-modal-close" id="mtrNextTrainModalClose" data-next-train-modal-close aria-label="關閉">關閉</button>
                    </div>
                    <div class="rail-next-train-modal-body">
                        <section class="rail-next-train-hero">
                            <div class="rail-next-train-hero-main">
                                <p class="rail-next-train-hero-kicker">下一班車：${escapeHtml(nextService.minutesLabel || "時間未提供")}</p>
                                <h4 class="rail-next-train-hero-title">${escapeHtml(directionSummary.terminusNameZh)}</h4>
                                <p class="rail-next-train-hero-time">${nextService.clockTime ? `預計 ${escapeHtml(nextService.clockTime)}` : "官方未提供時鐘時間"}</p>
                            </div>
                            ${summaryTags ? `<div class="rail-service-tags">${summaryTags}</div>` : ""}
                            ${nextService.notes.length > 0 ? `<ul class="rail-note-list rail-next-train-note-list">${nextService.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
                        </section>
                        <section class="rail-next-train-followup">
                            <div class="rail-next-train-followup-head">
                                <h4 class="rail-next-train-followup-title">後續班車</h4>
                                <p class="rail-next-train-followup-text">${followUpServices.length > 0 ? `官方目前提供 ${services.length} 班可顯示資料。` : "目前只有一班官方班次資料。"}</p>
                            </div>
                            ${followUpServices.length > 0
                                ? `<div class="rail-service-list rail-next-train-service-list">${followUpServices.map((service, index) => buildNextTrainModalServiceCardMarkup(service, index, directionSummary.terminusNameZh)).join("")}</div>`
                                : `<div class="rail-next-train-empty-state">目前只有一班官方班次資料。</div>`}
                        </section>
                    </div>
                </div>
            </section>`;
    }
    function buildMtrMarkup() {
        return `
            <section class="rail-panel rail-mtr-panel">
                <div class="rail-mtr-panel-head">
                    <p class="rail-panel-title">港鐵摘要</p>
                </div>
                ${buildNearestSectionMarkup()}
                ${buildRoutePlannerShellMarkup()}
            </section>
            ${buildNextTrainModalMarkup()}`;
    }
    function buildNextTrainModalMarkup() {
        const modalState = railState.ui.nextTrainModal;
        if (!modalState?.isOpen) return "";

        const detail = getNextTrainModalDetail();
        const lineSummary = detail?.lineSummary || null;
        const directionSummary = detail?.directionSummary || null;
        const services = Array.isArray(detail?.services) ? detail.services : [];
        const modalTitle = lineSummary && directionSummary
            ? `${lineSummary.lineNameZh}　往 ${directionSummary.terminusNameZh}`
            : "下一班車詳情";
        const modalSubtitleBits = [directionSummary?.stationNameZh || lineSummary?.stationNameZh || ""];
        if (lineSummary?.referenceTimeLabel) modalSubtitleBits.push(`更新 ${lineSummary.referenceTimeLabel}`);
        const modalSubtitle = modalSubtitleBits.filter(Boolean).join(" · ");
        const listMarkup = services.length > 0
            ? `<ul class="rail-next-train-list">${services.map((service, index) => buildNextTrainModalServiceLineMarkup(service, index)).join("")}</ul>`
            : '<p class="rail-next-train-empty">暫時沒有班次資料</p>';

        return `
            <section class="rail-next-train-modal-layer" id="mtrNextTrainModal">
                <button type="button" class="rail-next-train-modal-backdrop" data-next-train-modal-close aria-label="關閉下一班車詳情"></button>
                <div class="rail-next-train-modal" role="dialog" aria-modal="true" aria-labelledby="mtrNextTrainModalTitle" aria-describedby="mtrNextTrainModalSubtitle">
                    <div class="rail-next-train-modal-head">
                        <div class="rail-summary-main">
                            <p class="rail-mtr-section-kicker">下一班車詳情</p>
                            <h3 class="rail-summary-title" id="mtrNextTrainModalTitle">${escapeHtml(modalTitle)}</h3>
                            <p class="rail-summary-text" id="mtrNextTrainModalSubtitle">${escapeHtml(modalSubtitle)}</p>
                        </div>
                        <button type="button" class="rail-next-train-modal-close" id="mtrNextTrainModalClose" data-next-train-modal-close aria-label="關閉">關閉</button>
                    </div>
                    <div class="rail-next-train-modal-body">${listMarkup}</div>
                </div>
            </section>`;
    }
    function buildLightRailMarkupLegacy() {
        const stopOptions = getLightRailStopOptions();
        const selectedRoute = railState.lightRail.routes.find((route) => route.routeCode === railState.lightRail.routeCode) || null;
        const selectedStop = railState.lightRail.stopIndex[railState.lightRail.stopId] || null;
        const summaryMarkup = selectedStop ? `<section class="rail-summary-card"><div class="rail-chip-row"><span class="rail-chip">輕鐵</span>${selectedRoute ? `<span class="rail-chip">路線 ${escapeHtml(selectedRoute.routeCode)}</span>` : ""}</div><div class="rail-summary-main"><h3 class="rail-summary-title">${escapeHtml(selectedStop.nameZh)}</h3><p class="rail-summary-text">已完成輕鐵路線與站點索引。下一步會在這裡接入按站點查詢的即時到站資料。</p></div></section>` : `<section class="rail-empty-card"><h3 class="rail-empty-title">輕鐵 tab 已就緒</h3><p class="rail-empty-text">可以先用路線篩選站點。這一輪先維持靜態索引，不接即時輕鐵資料。</p></section>`;
        return `<section class="rail-panel"><h2 class="rail-panel-title">輕鐵靜態索引</h2><div class="rail-selector-grid"><label class="rail-field"><span class="rail-field-label">路線</span><select id="lightRailRouteSelect" class="rail-select"><option value="">全部輕鐵路線</option>${railState.lightRail.routes.map((route) => `<option value="${escapeHtml(route.routeCode)}" ${route.routeCode === railState.lightRail.routeCode ? "selected" : ""}>路線 ${escapeHtml(route.routeCode)}</option>`).join("")}</select><span class="rail-field-hint">資料來自官方 <code>light_rail_routes_and_stops.csv</code>。</span></label><label class="rail-field"><span class="rail-field-label">站點</span><select id="lightRailStopSelect" class="rail-select"><option value="">選擇輕鐵站點</option>${stopOptions.map((stop) => `<option value="${escapeHtml(stop.stopId)}" ${stop.stopId === railState.lightRail.stopId ? "selected" : ""}>${escapeHtml(stop.nameZh)} (${escapeHtml(stop.stopCode)})</option>`).join("")}</select><span class="rail-field-hint">輕鐵即時到站會在下一輪以 <code>station_id</code> 串接官方 API。</span></label></div></section>${summaryMarkup}`;
    }
    function buildLightRailNearestServiceMarkup(service) {
        return `
            <article class="rail-lrt-nearest-service">
                <span class="rail-lrt-nearest-service-route">${escapeHtml(service.routeNo || "--")}</span>
                <div class="rail-lrt-nearest-service-copy">
                    <strong>往 ${escapeHtml(service.destinationNameZh)}</strong>
                    <span>${escapeHtml(service.arrivalDepartureLabel)} · ${escapeHtml(service.timeTextZh)}${service.platformId ? ` · ${escapeHtml(service.platformId)}號月台` : ""}</span>
                </div>
            </article>`;
    }
    function buildLightRailNearestCard(selectedRoute) {
        const nearestState = railState.lightRail.nearest;
        const hasCoordinateData = Object.values(railState.lightRail.stopIndex).some((stop) => Number.isFinite(stop.location?.latitude) && Number.isFinite(stop.location?.longitude));
        const retryDisabled = nearestState.status === "locating" || nearestState.status === "loading";
        const nearestStop = nearestState.nearestStop || null;
        const isCurrentStop = Boolean(nearestStop?.stopId) && nearestStop.stopId === railState.lightRail.stopId;
        const applyDisabled = !nearestStop?.stopId || isCurrentStop;
        const actionMarkup = `
            <div class="rail-lrt-nearest-actions">
                <button type="button" id="lightRailNearestRetryButton" class="rail-secondary-button rail-lrt-nearest-button" ${retryDisabled || !hasCoordinateData ? "disabled" : ""}>${retryDisabled ? "定位中…" : "重新定位"}</button>
                <button type="button" id="lightRailNearestApplyButton" class="rail-secondary-button rail-accent-button rail-lrt-nearest-button" ${applyDisabled ? "disabled" : ""}>${isCurrentStop ? "目前已是此站" : "帶入此站"}</button>
            </div>`;

        if (!hasCoordinateData) {
            return `
                <section class="rail-summary-card rail-lrt-nearest-card">
                    <div class="rail-lrt-nearest-head">
                        <div class="rail-summary-main">
                            <p class="rail-lrt-section-kicker">最近輕鐵站</p>
                            <h3 class="rail-summary-title">定位資料未就緒</h3>
                            <p class="rail-summary-text">目前輕鐵站點缺少可用座標，暫時未能計算最近站。</p>
                        </div>
                        ${actionMarkup}
                    </div>
                </section>`;
        }

        if (nearestState.status === "locating") {
            return `
                <section class="rail-summary-card rail-lrt-nearest-card">
                    <div class="rail-lrt-nearest-head">
                        <div class="rail-summary-main">
                            <p class="rail-lrt-section-kicker">最近輕鐵站</p>
                            <h3 class="rail-summary-title">正在定位</h3>
                            <p class="rail-summary-text">正在嘗試找出你附近的輕鐵站與即將到站班次。</p>
                        </div>
                        ${actionMarkup}
                    </div>
                </section>`;
        }

        if (nearestState.status === "permissionDenied" || nearestState.status === "locationError" || nearestState.status === "notFound") {
            return `
                <section class="rail-summary-card rail-lrt-nearest-card">
                    <div class="rail-lrt-nearest-head">
                        <div class="rail-summary-main">
                            <p class="rail-lrt-section-kicker">最近輕鐵站</p>
                            <h3 class="rail-summary-title">最近站未就緒</h3>
                            <p class="rail-summary-text">${escapeHtml(nearestState.errorMessage || "暫時未能完成最近站定位。")}</p>
                        </div>
                        ${actionMarkup}
                    </div>
                </section>`;
        }

        if (!nearestStop) {
            return `
                <section class="rail-summary-card rail-lrt-nearest-card">
                    <div class="rail-lrt-nearest-head">
                        <div class="rail-summary-main">
                            <p class="rail-lrt-section-kicker">最近輕鐵站</p>
                            <h3 class="rail-summary-title">可嘗試定位最近站</h3>
                            <p class="rail-summary-text">按重新定位後，會找出最近的輕鐵站並提供一鍵帶入選站。</p>
                        </div>
                        ${actionMarkup}
                    </div>
                </section>`;
        }

        const previewServices = getLightRailNearestPreviewServices(nearestState.schedule, selectedRoute);
        const nearestChips = [
            `<span class="rail-chip">${escapeHtml(nearestStop.nameZh)}</span>`,
            `<span class="rail-chip">${escapeHtml(formatDistance(nearestStop.distanceMeters))}</span>`,
            nearestStop.stopCode ? `<span class="rail-chip">站點 ${escapeHtml(nearestStop.stopCode)}</span>` : "",
            selectedRoute?.routeCode ? `<span class="rail-chip">路線 ${escapeHtml(selectedRoute.routeCode)}</span>` : "",
            nearestState.schedule?.systemTimeLabel ? `<span class="rail-chip">更新 ${escapeHtml(nearestState.schedule.systemTimeLabel)}</span>` : ""
        ].filter(Boolean).join("");
        const serviceMarkup = previewServices.length > 0
            ? `<div class="rail-lrt-nearest-service-list">${previewServices.map((service) => buildLightRailNearestServiceMarkup(service)).join("")}</div>`
            : `<p class="rail-lrt-nearest-inline-note">${nearestState.status === "loading" ? "正在讀取這個站的即時班次…" : "官方暫時未有這個最近站的可顯示班次。"}${selectedRoute?.routeCode ? " 如已選路線，摘要會優先顯示該路線班次。" : ""}</p>`;

        return `
            <section class="rail-summary-card rail-lrt-nearest-card">
                <div class="rail-lrt-nearest-head">
                    <div class="rail-summary-main">
                        <p class="rail-lrt-section-kicker">最近輕鐵站</p>
                        <h3 class="rail-summary-title">${escapeHtml(nearestStop.nameZh)}</h3>
                        <p class="rail-summary-text">距離約 ${escapeHtml(formatDistance(nearestStop.distanceMeters))}。${selectedRoute?.routeCode ? "如果該站有你已選路線，摘要會優先顯示相關班次。" : "可直接帶入成目前查詢站點。"}</p>
                    </div>
                    ${actionMarkup}
                </div>
                ${nearestChips ? `<div class="rail-chip-row rail-lrt-chip-row">${nearestChips}</div>` : ""}
                ${serviceMarkup}
            </section>`;
    }
    function buildLightRailResultHeader(selectedRoute, selectedStop, schedule) {
        const refreshButton = selectedStop
            ? `<button type="button" id="lightRailRefreshButton" class="rail-secondary-button rail-lrt-refresh-button" ${railState.lightRail.realtime.status === "loading" ? "disabled" : ""}>${railState.lightRail.realtime.status === "loading" ? "更新中…" : "重新整理班次"}</button>`
            : "";
        const summaryChips = [
            '<span class="rail-chip">輕鐵</span>',
            selectedRoute ? `<span class="rail-chip">路線 ${escapeHtml(selectedRoute.routeCode)}</span>` : "",
            selectedStop ? `<span class="rail-chip">${escapeHtml(selectedStop.nameZh)}</span>` : "",
            selectedStop?.stopCode ? `<span class="rail-chip">站碼 ${escapeHtml(selectedStop.stopCode)}</span>` : "",
            schedule?.systemTimeLabel ? `<span class="rail-chip">資料時間 ${escapeHtml(schedule.systemTimeLabel)}</span>` : "",
            schedule && !schedule.isNormal ? '<span class="rail-chip rail-chip-alert">官方提示</span>' : ""
        ].filter(Boolean).join("");

        return `
            <div class="rail-lrt-result-head">
                <div class="rail-summary-main">
                    <p class="rail-lrt-section-kicker">輕鐵即時班次</p>
                    <h3 class="rail-summary-title">${selectedStop ? `${escapeHtml(selectedStop.nameZh)} 站` : "選擇輕鐵站點"}</h3>
                    <p class="rail-summary-text">${selectedRoute ? `目前用路線 ${escapeHtml(selectedRoute.routeCode)} 協助篩站；結果仍會保留這個站的全部月台班次。` : "先選站，再查看該站各月台的即將到站 / 開出班次。"}</p>
                </div>
                ${refreshButton}
            </div>
            ${summaryChips ? `<div class="rail-chip-row rail-lrt-chip-row">${summaryChips}</div>` : ""}`;
    }
    function buildLightRailServiceCard(service, selectedRoute) {
        const tagsMarkup = [
            service.trainLengthLabel ? `<span class="rail-meta-pill">${escapeHtml(service.trainLengthLabel)}</span>` : "",
            service.isSpecial ? '<span class="rail-meta-pill">特別班次</span>' : ""
        ].filter(Boolean).join("");
        const noteMarkup = service.remarks.length > 0
            ? `<ul class="rail-note-list rail-lrt-note-list">${service.remarks.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`
            : "";
        const isFocusedRoute = selectedRoute?.routeCode && service.routeNo === selectedRoute.routeCode;

        return `
            <article class="rail-lrt-service-card ${isFocusedRoute ? "is-focused-route" : ""}">
                <div class="rail-lrt-service-top">
                    <span class="rail-lrt-route-badge">${escapeHtml(service.routeNo || "--")}</span>
                    <div class="rail-lrt-service-main">
                        <h5 class="rail-lrt-service-title">往 ${escapeHtml(service.destinationNameZh)}</h5>
                        <p class="rail-lrt-service-meta">${escapeHtml(service.arrivalDepartureLabel)}時間 · ${escapeHtml(service.timeTextZh)}</p>
                    </div>
                    <div class="rail-lrt-eta-badge">
                        <span class="rail-lrt-eta-label">${escapeHtml(service.arrivalDepartureLabel)}</span>
                        <strong class="rail-lrt-eta-value">${escapeHtml(service.timeTextZh)}</strong>
                    </div>
                </div>
                <div class="rail-lrt-service-facts">
                    <p class="rail-lrt-service-fact"><span>路線</span><strong>${escapeHtml(service.routeNo || "--")}</strong></p>
                    <p class="rail-lrt-service-fact"><span>班次狀態</span><strong>${escapeHtml(service.statusLabel)}</strong></p>
                </div>
                ${tagsMarkup ? `<div class="rail-service-tags rail-lrt-service-tags">${tagsMarkup}</div>` : ""}
                ${noteMarkup}
            </article>`;
    }
    function buildLightRailPlatformCard(platform, selectedRoute) {
        const nextService = platform.nextService || null;
        return `
            <section class="rail-lrt-platform-card">
                <div class="rail-lrt-platform-head">
                    <div>
                        <p class="rail-lrt-platform-kicker">Platform ${escapeHtml(platform.platformId)}</p>
                        <h4 class="rail-lrt-platform-title">${escapeHtml(platform.platformId)} 號月台</h4>
                        <p class="rail-lrt-platform-meta">共 ${escapeHtml(String(platform.services.length))} 班可顯示班次</p>
                    </div>
                    ${nextService ? `<span class="rail-lrt-platform-count">${escapeHtml(nextService.timeTextZh)}</span>` : ""}
                </div>
                <div class="rail-lrt-service-list">
                    ${platform.services.map((service) => buildLightRailServiceCard(service, selectedRoute)).join("")}
                </div>
            </section>`;
    }
    function buildLightRailResultMarkup(selectedRoute, selectedStop) {
        const realtimeState = railState.lightRail.realtime;
        const headerMarkup = buildLightRailResultHeader(selectedRoute, selectedStop, realtimeState.schedule);

        let bodyMarkup = "";
        if (!selectedStop) {
            bodyMarkup = `<section class="rail-empty-card"><h3 class="rail-empty-title">先選擇一個輕鐵站點</h3><p class="rail-empty-text">站點選好後，這裡會按月台列出路線號、目的地、到站 / 開出時間，以及班次狀態。</p></section>`;
        } else if (realtimeState.status === "loading") {
            bodyMarkup = `<section class="rail-loading-card" aria-live="polite"><span class="rail-loading-dot" aria-hidden="true"></span><div class="rail-loading-copy"><h3 class="rail-empty-title">正在讀取 ${escapeHtml(selectedStop.nameZh)} 站班次</h3><p class="rail-empty-text">會依官方回傳的月台資料整理為較易閱讀的輕鐵班次卡片。</p></div></section>`;
        } else if (realtimeState.status === "error") {
            bodyMarkup = `<section class="rail-empty-card rail-empty-card-error"><h3 class="rail-empty-title">暫時未能讀取輕鐵班次</h3><p class="rail-empty-text">${escapeHtml(realtimeState.errorMessage || "官方輕鐵即時資料暫時不可用。")}</p></section>`;
        } else if (realtimeState.status === "empty" || !realtimeState.schedule) {
            bodyMarkup = `<section class="rail-empty-card"><h3 class="rail-empty-title">暫時未有可顯示班次</h3><p class="rail-empty-text">官方暫時未回傳 ${escapeHtml(selectedStop.nameZh)} 站的月台班次，稍後可以再重新整理一次。</p></section>`;
        } else {
            const schedule = realtimeState.schedule;
            const alertMarkup = !schedule.isNormal
                ? '<section class="rail-inline-banner"><strong>官方提示：</strong>系統目前回傳非一般狀態，請同時留意車站現場資訊。</section>'
                : "";
            bodyMarkup = `
                ${alertMarkup}
                <section class="rail-lrt-platform-grid">
                    ${schedule.platforms.map((platform) => buildLightRailPlatformCard(platform, selectedRoute)).join("")}
                </section>`;
        }

        return `<section class="rail-summary-card rail-lrt-result-card">${headerMarkup}${bodyMarkup}</section>`;
    }
    function buildLightRailMarkup() {
        const stopOptions = getLightRailStopOptions();
        const selectedRoute = getSelectedLightRailRoute();
        const selectedStop = getSelectedLightRailStop();
        return `
            <section class="rail-panel rail-lrt-panel">
                ${buildLightRailNearestCard(selectedRoute)}
                <h2 class="rail-panel-title">輕鐵站點與即時班次</h2>
                <div class="rail-selector-grid">
                    <label class="rail-field">
                        <span class="rail-field-label">路線</span>
                        <select id="lightRailRouteSelect" class="rail-select">
                            <option value="">全部輕鐵路線</option>
                            ${railState.lightRail.routes.map((route) => `<option value="${escapeHtml(route.routeCode)}" ${route.routeCode === railState.lightRail.routeCode ? "selected" : ""}>路線 ${escapeHtml(route.routeCode)}</option>`).join("")}
                        </select>
                        <span class="rail-field-hint">先用路線縮小站點範圍，再挑選站點查即時班次。</span>
                    </label>
                    <label class="rail-field">
                        <span class="rail-field-label">站點</span>
                        <select id="lightRailStopSelect" class="rail-select">
                            <option value="">選擇輕鐵站點</option>
                            ${stopOptions.map((stop) => `<option value="${escapeHtml(stop.stopId)}" ${stop.stopId === railState.lightRail.stopId ? "selected" : ""}>${escapeHtml(stop.nameZh)} (${escapeHtml(stop.stopCode)})</option>`).join("")}
                        </select>
                        <span class="rail-field-hint">即時資料使用官方 <code>station_id</code> API，結果會依月台分組顯示。</span>
                    </label>
                </div>
                ${buildLightRailResultMarkup(selectedRoute, selectedStop)}
            </section>`;
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
        const lightRailRefreshButton = document.getElementById("lightRailRefreshButton");
        const lightRailNearestRetryButton = document.getElementById("lightRailNearestRetryButton");
        const lightRailNearestApplyButton = document.getElementById("lightRailNearestApplyButton");
        if (mtrNearestRetryButton instanceof HTMLButtonElement) mtrNearestRetryButton.addEventListener("click", () => requestNearestMtrSummary(true));
        if (lightRailNearestRetryButton instanceof HTMLButtonElement) lightRailNearestRetryButton.addEventListener("click", () => { void requestNearestLightRailSummary(true); });
        if (lightRailNearestApplyButton instanceof HTMLButtonElement) lightRailNearestApplyButton.addEventListener("click", () => { applyNearestLightRailStop(); });
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
                const transferCloseButton = event.target instanceof Element ? event.target.closest("[data-route-transfer-close]") : null;
                if (transferCloseButton instanceof Element) {
                    closeRoutePlannerTransferStopPopover();
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }

                const transferTrigger = event.target instanceof Element ? event.target.closest("[data-route-transfer-trigger]") : null;
                if (transferTrigger instanceof Element) {
                    const viewId = transferTrigger.getAttribute("data-route-transfer-view") || "";
                    const stationCode = transferTrigger.getAttribute("data-route-transfer-station") || "";
                    const legIndex = Number.parseInt(transferTrigger.getAttribute("data-route-transfer-leg-index") || "", 10);
                    const transferTarget = getRoutePlannerTransferStopTarget(viewId, stationCode, Number.isInteger(legIndex) ? legIndex : -1);
                    toggleRoutePlannerTransferStopPopover(transferTarget);
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }

                const transferPopoverSurface = event.target instanceof Element ? event.target.closest("[data-route-transfer-popover]") : null;
                if (transferPopoverSurface instanceof Element) return;

                const legCloseButton = event.target instanceof Element ? event.target.closest("[data-route-leg-close]") : null;
                if (legCloseButton instanceof Element) {
                    closeRoutePlannerLegPopover();
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }

                const legTrigger = event.target instanceof Element ? event.target.closest("[data-route-leg-trigger]") : null;
                if (legTrigger instanceof Element) {
                    const viewId = legTrigger.getAttribute("data-route-leg-view") || "";
                    const legIndex = Number.parseInt(legTrigger.getAttribute("data-route-leg-index") || "", 10);
                    toggleRoutePlannerLegPopover(viewId, Number.isInteger(legIndex) ? legIndex : -1);
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }

                const popoverSurface = event.target instanceof Element ? event.target.closest("[data-route-leg-popover]") : null;
                if (popoverSurface instanceof Element) return;

                const viewButton = event.target instanceof Element ? event.target.closest("[data-route-view]") : null;
                if (viewButton instanceof Element) {
                    const viewId = viewButton.getAttribute("data-route-view") || "";
                    setRoutePlannerView(viewId);
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }

                const fieldButton = event.target instanceof Element ? event.target.closest("[data-route-field]") : null;
                if (fieldButton instanceof Element) {
                    const field = fieldButton.getAttribute("data-route-field") || "destination";
                    setRoutePlannerField(field);
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }

                const stationButton = event.target instanceof Element ? event.target.closest("[data-route-station]") : null;
                if (stationButton instanceof Element) {
                    if (Date.now() < schematicGestureState.suppressClickUntil) return;
                    const stationCode = stationButton.getAttribute("data-route-station") || "";
                    selectRoutePlannerStation(stationCode);
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }

                if (railState.mtr.routePlanner.legPopover.viewId) {
                    closeRoutePlannerTransferStopPopover();
                    closeRoutePlannerLegPopover();
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }

                if (railState.mtr.routePlanner.transferStopPopover.viewId) {
                    closeRoutePlannerTransferStopPopover();
                    renderCurrentTab();
                    bindCurrentTabEvents();
                }
            });
            mtrRoutePlannerPanel.addEventListener("keydown", (event) => {
                if (!(event.target instanceof Element)) return;
                const viewButton = event.target.matches("[data-route-view]") ? event.target : null;
                if (viewButton instanceof Element && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    const viewId = viewButton.getAttribute("data-route-view") || "";
                    setRoutePlannerView(viewId);
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }
                const stationButton = event.target.closest("[data-route-station]");
                if (!(stationButton instanceof Element)) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                const stationCode = stationButton.getAttribute("data-route-station") || "";
                selectRoutePlannerStation(stationCode);
                renderCurrentTab();
                bindCurrentTabEvents();
            });
        }
        if (lightRailRouteSelect instanceof HTMLSelectElement) {
            lightRailRouteSelect.addEventListener("change", () => {
                railState.lightRail.routeCode = lightRailRouteSelect.value;
                railState.lightRail.stopId = "";
                resetLightRailRealtimeState();
                setStatus("已更新輕鐵路線篩選，請再選擇站點讀取即時班次。", "info");
                renderCurrentTab();
                bindCurrentTabEvents();
                return;
                setStatus("已更新輕鐵路線篩選，請再選擇站點讀取即時班次。", "info");
                setStatus("已更新輕鐵路線篩選，這一輪只更新靜態選擇器。", "info");
                renderCurrentTab();
                bindCurrentTabEvents();
            });
        }
        if (lightRailStopSelect instanceof HTMLSelectElement) {
            lightRailStopSelect.addEventListener("change", () => {
                railState.lightRail.stopId = lightRailStopSelect.value;
                if (!railState.lightRail.stopId) {
                    resetLightRailRealtimeState();
                    setStatus("已清除輕鐵站點選擇。", "info");
                    renderCurrentTab();
                    bindCurrentTabEvents();
                    return;
                }
                void requestLightRailSchedule();
                return;
                setStatus(railState.lightRail.stopId ? "輕鐵靜態索引已定位到指定站點，下一階段會接即時到站。" : "已清除輕鐵站點選擇。", "info");
                renderCurrentTab();
                bindCurrentTabEvents();
            });
        }
        if (lightRailRefreshButton instanceof HTMLButtonElement) {
            lightRailRefreshButton.addEventListener("click", () => {
                void requestLightRailSchedule();
            });
        }

        maybeStartNearestLightRailSummary();
        bindOfficialMapInteractions();
        bindCustomSchematicInteractions();
        requestAnimationFrame(() => {
            maybeFocusOfficialMapViewport();
            maybeFocusCustomSchematicViewport();
        });
    }
    function maybeStartNearestMtrSummary() {
        if (railState.currentTab === "mtr" && !railState.mtr.nearest.hasAttempted) requestNearestMtrSummary(false);
    }
    function maybeStartNearestLightRailSummary() {
        if (railState.currentTab === "lightRail" && !railState.lightRail.nearest.hasAttempted) void requestNearestLightRailSummary(false);
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
        railState.mtr.routing.customSchematic = buildMtrSchematicRuntime(customMtrSchematicLayout);
        railState.lightRail.routes = Array.isArray(railIndex.lightRail.routes) ? railIndex.lightRail.routes : [];
        railState.lightRail.stopIndex = enrichLightRailStopIndexWithLocations(railIndex.lightRail.stopIndex || {});
        railState.ui.isReady = true;
        setStatus(`已載入官方靜態索引：港鐵 <strong>${railIndex.heavyRail.lineCount}</strong> 條綫 / <strong>${railIndex.heavyRail.stationCount}</strong> 個車站，輕鐵 <strong>${railIndex.lightRail.routeCount}</strong> 條路線 / <strong>${railIndex.lightRail.stopCount}</strong> 個站點。`, "info");
        renderCurrentTab();
        bindCurrentTabEvents();
        maybeStartNearestMtrSummary();
    }
    contentElement.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) return;

        const nextTrainTrigger = event.target.closest("[data-next-train-trigger]");
        if (nextTrainTrigger instanceof Element) {
            const lineCode = nextTrainTrigger.getAttribute("data-line-code") || "";
            const directionKey = nextTrainTrigger.getAttribute("data-direction-key") || "";
            if (!lineCode || !directionKey) return;
            openNextTrainModal(lineCode, directionKey);
            renderCurrentTab();
            bindCurrentTabEvents();
            requestAnimationFrame(() => {
                const closeButton = document.getElementById("mtrNextTrainModalClose");
                if (closeButton instanceof HTMLButtonElement) closeButton.focus();
            });
            return;
        }

        const modalCloseTrigger = event.target.closest("[data-next-train-modal-close]");
        if (modalCloseTrigger instanceof Element) {
            closeNextTrainModal();
            renderCurrentTab();
            bindCurrentTabEvents();
            return;
        }

        const nearestRetryButton = event.target.closest("#mtrNearestRetryButton");
        if (nearestRetryButton instanceof Element && railState.ui.nextTrainModal?.isOpen) {
            closeNextTrainModal();
        }
    });
    document.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) return;
        if (!railState.mtr.routePlanner.legPopover.viewId && !railState.mtr.routePlanner.transferStopPopover.viewId) return;
        if (event.target.closest("#mtrRoutePlannerPanel")) return;
        closeRoutePlannerTransferStopPopover();
        closeRoutePlannerLegPopover();
        renderCurrentTab();
        bindCurrentTabEvents();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (railState.ui.nextTrainModal?.isOpen) {
            closeNextTrainModal();
            renderCurrentTab();
            bindCurrentTabEvents();
            return;
        }
        if (!railState.mtr.routePlanner.legPopover.viewId && !railState.mtr.routePlanner.transferStopPopover.viewId) return;
        closeRoutePlannerTransferStopPopover();
        closeRoutePlannerLegPopover();
        renderCurrentTab();
        bindCurrentTabEvents();
    });
    for (const button of tabButtons) {
        button.addEventListener("click", () => {
            const nextTab = button.getAttribute("data-tab-trigger") || "";
            if (!nextTab || railState.currentTab === nextTab) return;
            closeNextTrainModal();
            closeRoutePlannerTransferStopPopover();
            closeRoutePlannerLegPopover();
            railState.currentTab = nextTab;
            if (nextTab === "lightRail") {
                setStatus("已切換到輕鐵 tab，可按站點查看官方即時班次。", "info");
                renderCurrentTab();
                bindCurrentTabEvents();
                return;
            }
            setStatus(nextTab === "lightRail" ? "已切換到輕鐵頁殼，這一輪只載入靜態路線與站點資料。" : "已切換到港鐵頁殼，可使用最近站摘要與手動即時查詢。", "info");
            renderCurrentTab();
            bindCurrentTabEvents();
            maybeStartNearestMtrSummary();
        });
    }
    renderCurrentTab();
    initializeIndex();
})();
