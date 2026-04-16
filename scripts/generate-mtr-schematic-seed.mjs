import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const officialRailIndexPath = path.join(projectRoot, "official-rail-index.json");
const officialMapPath = path.join(projectRoot, "official-mtr-map.js");
const officialMapCssPath = path.join(projectRoot, "official-mtr-map.css");
const schematicLayoutPath = path.join(projectRoot, "mtr-schematic-layout.js");

const OFFICIAL_MAP_PADDING_X = 110;
const OFFICIAL_MAP_PADDING_Y = 90;
const OFFICIAL_MAP_SCALE = 1.78;
const OFFICIAL_ROUTE_CLIP_MARGIN = 6;
const OFFICIAL_ROUTE_SAMPLE_STEP = 3;
const OFFICIAL_ROUTE_SIMPLIFY_TOLERANCE = 1.6;

const LINE_STYLE_MAP = {
    AEL: "#008A8B",
    DRL: "#F173AC",
    EAL: "#12B9ED",
    ISL: "#007DC5",
    KTL: "#00AF40",
    SIL: "#BDCF00",
    TCL: "#FF8F1B",
    TKL: "#8743A2",
    TML: "#9E2600",
    TWL: "#EC1D24"
};

const STATION_REFERENCE_LINE = {
    ADM: "ISL",
    CEN: "ISL",
    NAC: "TML",
    MEF: "TML",
    LAK: "TWL",
    KOW: "TCL",
    HOK: "TCL",
    HUH: "TML",
    TAW: "EAL",
    KOT: "EAL",
    MKK: "EAL",
    NOP: "ISL",
    QUB: "ISL",
    YAT: "TKL",
    TIK: "TKL",
    TKO: "TKL",
    TSY: "TCL",
    SUN: "TCL",
    DIH: "TML"
};

const INTERCHANGE_ANCHOR_SCALE = 1.58;
const INTERCHANGE_ANCHOR_SCALE_OVERRIDES = {
    ADM: 1.98,
    CEN: 1.84,
    TSY: 1.9,
    KOW: 2.02,
    HOK: 1.96,
    NAC: 1.86,
    PRE: 2.1,
    MOK: 2.1,
    YMT: 2.08,
    HUH: 1.94,
    HOM: 1.86,
    TAW: 1.92,
    KOT: 1.96,
    DIH: 1.88,
    QUB: 1.94,
    NOP: 1.94,
    YAT: 1.9,
    TIK: 1.9,
    SUN: 1.76
};

const LABEL_OVERRIDES = {
    KET: middle(-34),
    HKU: middle(-34),
    SYP: middle(-34),
    SHW: middle(-34),
    CEN: { anchor: "middle", dx: 0, dy: -40 },
    ADM: { anchor: "start", dx: 22, dy: -36 },
    WAC: middle(-34),
    CAB: middle(-34),
    TIH: middle(-34),
    FOH: middle(-34),
    NOP: middle(-34),
    QUB: middle(-34),
    TAK: middle(-34),
    SWH: middle(-34),
    SKW: right(-2),
    HFC: right(22),
    CHW: right(24),

    TST: { anchor: "end", dx: -26, dy: -18 },
    JOR: { anchor: "end", dx: -24, dy: -6 },
    YMT: { anchor: "end", dx: -24, dy: -6 },
    MOK: { anchor: "end", dx: -24, dy: -8 },
    PRE: { anchor: "end", dx: -24, dy: -8 },
    SSP: middle(-28),
    CSW: middle(-28),
    LCK: middle(-28),
    SKM: left(-10),
    LOF: middle(32),
    WTS: middle(-32),
    KOT: middle(-34),
    MKK: right(28),

    TSW: middle(-30),
    TWH: middle(-30),
    KWH: middle(-30),
    KWF: middle(-30),
    LAK: left(-14),
    MEF: left(-14),
    NAC: { anchor: "end", dx: -20, dy: 36 },
    OLY: { anchor: "end", dx: -22, dy: 34 },
    KOW: { anchor: "end", dx: -22, dy: -36 },
    HOK: { anchor: "end", dx: -22, dy: -34 },
    TWW: middle(-30),
    KSR: middle(-30),
    YUL: middle(-30),
    LOP: middle(-30),
    TIS: middle(-30),
    SIH: right(26),
    TUM: right(24),
    AUS: { anchor: "end", dx: -28, dy: 40 },
    ETS: { anchor: "start", dx: 22, dy: 6 },

    HUH: { anchor: "start", dx: 20, dy: 24 },
    HOM: { anchor: "start", dx: 20, dy: 34 },
    TKW: right(30),
    SUW: right(30),
    KAT: right(30),
    DIH: right(-22),
    HIK: left(-18),
    TAW: right(-24),
    CKT: middle(30),
    STW: middle(-30),
    CIO: middle(-30),
    SHM: middle(-30),
    TSH: middle(-30),
    HEO: middle(-30),
    MOS: middle(-30),
    WKS: middle(-30),
    EXC: { anchor: "start", dx: 22, dy: -20 },

    SHT: right(-20),
    FOT: right(-20),
    UNI: right(-20),
    TAP: right(-20),
    TWO: right(-20),
    FAN: right(-20),
    SHS: right(-20),

    TUC: left(26),
    SUN: left(28),
    TSY: left(30),
    AIR: left(26),
    AWE: left(-12),
    DIS: left(26),

    YAT: middle(32),
    LAT: middle(32),
    KWT: middle(32),
    NTK: middle(32),
    KOB: middle(32),
    CHH: middle(32),
    TIK: right(30),
    TKO: right(28),
    HAH: right(28),
    POA: right(28),
    LHP: right(-22),

    OCP: right(28),
    WCH: middle(30),
    LET: middle(30),
    SOH: middle(30)
};

const SEGMENT_POINT_OVERRIDES = {
    "ISL:SKW-HFC": [[0.4, 0.12]],
    "ISL:HFC-CHW": [[0.7, 0.12]],
    "TWL:TST-ADM": [[0.55, -0.06]],
    "TWL:ADM-CEN": [[0.45, -0.1]],
    "TML:NAC-AUS": [[0.22, 0.08]],
    "TML:AUS-ETS": [[0.5, 0.08]],
    "TML:ETS-HUH": [[0.75, 0.04]],
    "TML:HUH-HOM": [[0.45, 0.08]],
    "TML:HOM-TKW": [[0.55, -0.02]],
    "TML:TKW-SUW": [[0.52, -0.05]],
    "TML:SUW-KAT": [[0.5, -0.06]],
    "TML:KAT-DIH": [[0.48, -0.08]],
    "EAL:HUH-EXC": [[0.35, 0.02]],
    "EAL:EXC-ADM": [[0.55, -0.05]],
    "TKL:TIK-YAT": [[0.38, -0.02]],
    "TKL:YAT-QUB": [[0.55, 0.02]],
    "TKL:QUB-NOP": [[0.52, -0.04]],
    "AEL:TSY-KOW": [[0.4, 0.04]],
    "AEL:KOW-HOK": [[0.45, -0.06]],
    "TCL:TSY-LAK": [[0.48, -0.04]],
    "TCL:KOW-HOK": [[0.45, -0.06]]
};

const SEGMENT_POLYLINE_OVERRIDES = {
    "ISL:SKW-HFC": [[1126, 614], [1151, 669]],
    "ISL:HFC-CHW": [[1151, 669], [1151, 717]],

    "SIL:ADM-OCP": [[575, 583], [590, 604], [605, 624]],
    "SIL:OCP-WCH": [[605, 624], [560, 636], [516, 648]],
    "SIL:WCH-LET": [[516, 648], [466, 690], [418, 690]],
    "SIL:LET-SOH": [[418, 690], [343, 690]],

    "TWL:ADM-TST": [[575, 567], [590, 525], [613, 481]],
    "TWL:PRE-SSP": [[613, 323], [599, 308], [581, 288]],

    "TCL:TUC-SUN": [[182, 470], [220, 430], [258, 393]],
    "TCL:SUN-TSY": [[258, 393], [286, 366], [313, 331]],
    "TCL:TSY-LAK": [[313, 331], [345, 300], [379, 294]],
    "TCL:LAK-NAC": [[379, 294], [392, 318], [424, 347]],
    "TCL:NAC-OLY": [[424, 347], [424, 411]],
    "TCL:OLY-KOW": [[424, 411], [424, 468]],
    "TCL:KOW-HOK": [[424, 468], [458, 504], [515, 551]],

    "AEL:AWE-AIR": [[191, 383], [168, 383], [156, 405], [156, 432]],
    "AEL:AIR-TSY": [[156, 432], [194, 404], [252, 362], [317, 335]],
    "AEL:TSY-KOW": [[317, 335], [354, 366], [396, 417], [418, 468]],
    "AEL:KOW-HOK": [[418, 468], [454, 507], [515, 556]],

    "DRL:SUN-DIS": [[262, 396], [279, 417], [297, 438]],

    "TML:TUM-SIH": [[76, 210], [76, 150]],
    "TML:SIH-TIS": [[76, 150], [76, 108], [98, 65]],
    "TML:TIS-LOP": [[98, 65], [120, 85], [120, 108]],
    "TML:LOP-YUL": [[120, 108], [120, 150]],
    "TML:YUL-KSR": [[120, 150], [120, 193]],
    "TML:KSR-TWW": [[120, 193], [132, 218], [147, 243]],
    "TML:TWW-MEF": [[147, 243], [210, 255], [320, 276], [429, 294]],
    "TML:MEF-NAC": [[429, 294], [429, 347]],
    "TML:NAC-AUS": [[429, 347], [485, 390], [537, 467]],
    "TML:AUS-ETS": [[537, 467], [585, 488], [631, 499]],
    "TML:ETS-HUH": [[631, 499], [666, 487], [693, 474]],
    "TML:HUH-HOM": [[693, 474], [721, 451], [746, 432]],
    "TML:HOM-TKW": [[746, 432], [790, 417], [831, 402]],
    "TML:TKW-SUW": [[831, 402], [852, 385], [866, 367]],
    "TML:SUW-KAT": [[866, 367], [879, 348], [888, 329]],
    "TML:KAT-DIH": [[888, 329], [888, 311], [887, 294]],
    "TML:DIH-HIK": [[887, 294], [856, 265], [819, 238]],
    "TML:HIK-TAW": [[819, 238], [776, 226], [720, 225]],
    "TML:TAW-CKT": [[720, 225], [766, 205], [806, 182]],
    "TML:CKT-STW": [[806, 182], [806, 137]],
    "TML:STW-CIO": [[806, 137], [821, 105], [838, 78]],
    "TML:CIO-SHM": [[838, 78], [900, 78]],
    "TML:SHM-TSH": [[900, 78], [965, 78]],
    "TML:TSH-HEO": [[965, 78], [1025, 78]],
    "TML:HEO-MOS": [[1025, 78], [1086, 78]],
    "TML:MOS-WKS": [[1086, 78], [1152, 78]],

    "EAL:TAW-KOT": [[715, 225], [715, 293]],
    "EAL:KOT-MKK": [[715, 293], [716, 363]],
    "EAL:MKK-HUH": [[716, 363], [708, 423], [697, 478]],
    "EAL:HUH-EXC": [[697, 478], [676, 509], [632, 551]],
    "EAL:EXC-ADM": [[632, 551], [603, 567], [575, 577]],
    "EAL:SHS-LOW": [[465, 80], [410, 78]],
    "EAL:SHS-LMC": [[465, 80], [410, 92], [368, 102]],

    "TKL:QUB-YAT": [[946, 567], [973, 518], [1005, 448]],
    "TKL:TIK-TKO": [[1063, 448], [1093, 450], [1124, 451]],
    "TKL:TKO-HAH": [[1124, 451], [1151, 389]],
    "TKL:HAH-POA": [[1151, 389], [1151, 329]],
    "TKL:TKO-LHP": [[1124, 451], [1151, 489]]
};

function middle(dy) {
    return { anchor: "middle", dx: 0, dy };
}

function right(dy = -8) {
    return { anchor: "start", dx: 18, dy };
}

function left(dy = -8) {
    return { anchor: "end", dx: -18, dy };
}

function roundCoordinate(value) {
    return Math.round(value * 10) / 10;
}

function roundPoint([x, y]) {
    return [roundCoordinate(x), roundCoordinate(y)];
}

function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeOfficialStationId(value) {
    const numericId = Number.parseInt(String(value || "").replace(/^id/i, ""), 10);
    return Number.isFinite(numericId) ? String(numericId) : "";
}

function getPointDistance([leftX, leftY], [rightX, rightY]) {
    return Math.hypot(rightX - leftX, rightY - leftY);
}

function dedupePolylinePoints(points, minDistance = 0.5) {
    const deduped = [];

    for (const point of Array.isArray(points) ? points : []) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const normalizedPoint = roundPoint(point);
        const lastPoint = deduped[deduped.length - 1];
        if (!lastPoint || getPointDistance(lastPoint, normalizedPoint) > minDistance) {
            deduped.push(normalizedPoint);
        }
    }

    if (deduped.length === 1) {
        deduped.push([...deduped[0]]);
    }

    return deduped;
}

function getPointToSegmentDistance(point, segmentStart, segmentEnd) {
    const [pointX, pointY] = point;
    const [startX, startY] = segmentStart;
    const [endX, endY] = segmentEnd;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;

    if (lengthSquared === 0) {
        return getPointDistance(point, segmentStart);
    }

    const projection = ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / lengthSquared;
    const clampedProjection = Math.max(0, Math.min(1, projection));
    return getPointDistance(point, [
        startX + deltaX * clampedProjection,
        startY + deltaY * clampedProjection
    ]);
}

function simplifyPolyline(points, tolerance = OFFICIAL_ROUTE_SIMPLIFY_TOLERANCE) {
    if (!Array.isArray(points) || points.length <= 2) {
        return dedupePolylinePoints(points);
    }

    const keepFlags = new Array(points.length).fill(false);
    keepFlags[0] = true;
    keepFlags[points.length - 1] = true;

    function markImportantPoints(startIndex, endIndex) {
        if (endIndex - startIndex <= 1) return;

        let furthestIndex = -1;
        let furthestDistance = 0;

        for (let index = startIndex + 1; index < endIndex; index += 1) {
            const distance = getPointToSegmentDistance(points[index], points[startIndex], points[endIndex]);
            if (distance > furthestDistance) {
                furthestDistance = distance;
                furthestIndex = index;
            }
        }

        if (furthestIndex > -1 && furthestDistance > tolerance) {
            keepFlags[furthestIndex] = true;
            markImportantPoints(startIndex, furthestIndex);
            markImportantPoints(furthestIndex, endIndex);
        }
    }

    markImportantPoints(0, points.length - 1);

    return dedupePolylinePoints(
        points.filter((_, index) => keepFlags[index]).map((point) => roundPoint(point))
    );
}

function cubicBezierValue(start, controlA, controlB, end, t) {
    const inverse = 1 - t;
    return inverse ** 3 * start
        + 3 * inverse ** 2 * t * controlA
        + 3 * inverse * t ** 2 * controlB
        + t ** 3 * end;
}

function parseSvgPath(pathData) {
    const tokens = String(pathData || "").match(/[A-Za-z]|-?\d*\.?\d+/g) || [];
    const segments = [];
    let tokenIndex = 0;
    let currentCommand = "";
    let currentX = 0;
    let currentY = 0;

    while (tokenIndex < tokens.length) {
        if (/^[A-Za-z]$/.test(tokens[tokenIndex])) {
            currentCommand = tokens[tokenIndex];
            tokenIndex += 1;
        }

        switch (currentCommand) {
            case "M":
                currentX = Number(tokens[tokenIndex]);
                currentY = Number(tokens[tokenIndex + 1]);
                tokenIndex += 2;
                break;
            case "L": {
                const nextX = Number(tokens[tokenIndex]);
                const nextY = Number(tokens[tokenIndex + 1]);
                tokenIndex += 2;
                segments.push({
                    type: "L",
                    x1: currentX,
                    y1: currentY,
                    x2: nextX,
                    y2: nextY
                });
                currentX = nextX;
                currentY = nextY;
                break;
            }
            case "H": {
                const nextX = Number(tokens[tokenIndex]);
                tokenIndex += 1;
                segments.push({
                    type: "L",
                    x1: currentX,
                    y1: currentY,
                    x2: nextX,
                    y2: currentY
                });
                currentX = nextX;
                break;
            }
            case "V": {
                const nextY = Number(tokens[tokenIndex]);
                tokenIndex += 1;
                segments.push({
                    type: "L",
                    x1: currentX,
                    y1: currentY,
                    x2: currentX,
                    y2: nextY
                });
                currentY = nextY;
                break;
            }
            case "C": {
                const controlAX = Number(tokens[tokenIndex]);
                const controlAY = Number(tokens[tokenIndex + 1]);
                const controlBX = Number(tokens[tokenIndex + 2]);
                const controlBY = Number(tokens[tokenIndex + 3]);
                const endX = Number(tokens[tokenIndex + 4]);
                const endY = Number(tokens[tokenIndex + 5]);
                tokenIndex += 6;
                segments.push({
                    type: "C",
                    x0: currentX,
                    y0: currentY,
                    x1: controlAX,
                    y1: controlAY,
                    x2: controlBX,
                    y2: controlBY,
                    x3: endX,
                    y3: endY
                });
                currentX = endX;
                currentY = endY;
                break;
            }
            default:
                throw new Error(`Unsupported SVG path command "${currentCommand}" in official route geometry.`);
        }
    }

    return segments;
}

function sampleSvgSegment(segment) {
    if (segment.type === "L") {
        const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
        const steps = Math.max(1, Math.ceil(length / OFFICIAL_ROUTE_SAMPLE_STEP));
        return Array.from({ length: steps + 1 }, (_, stepIndex) => {
            const ratio = stepIndex / steps;
            return roundPoint([
                segment.x1 + (segment.x2 - segment.x1) * ratio,
                segment.y1 + (segment.y2 - segment.y1) * ratio
            ]);
        });
    }

    const approximateLength = Math.hypot(segment.x1 - segment.x0, segment.y1 - segment.y0)
        + Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1)
        + Math.hypot(segment.x3 - segment.x2, segment.y3 - segment.y2)
        + Math.hypot(segment.x3 - segment.x0, segment.y3 - segment.y0);
    const steps = Math.max(12, Math.ceil(approximateLength / OFFICIAL_ROUTE_SAMPLE_STEP));

    return Array.from({ length: steps + 1 }, (_, stepIndex) => {
        const ratio = stepIndex / steps;
        return roundPoint([
            cubicBezierValue(segment.x0, segment.x1, segment.x2, segment.x3, ratio),
            cubicBezierValue(segment.y0, segment.y1, segment.y2, segment.y3, ratio)
        ]);
    });
}

function sampleSvgPath(pathData) {
    return parseSvgPath(pathData).flatMap((segment, segmentIndex) => {
        const sampledPoints = sampleSvgSegment(segment);
        return segmentIndex === 0 ? sampledPoints : sampledPoints.slice(1);
    });
}

function extractOfficialLinePathSamples(cssContent, cssClassName) {
    const patterns = [
        new RegExp(`\\.rail-official-map-line\\.${escapeRegExp(cssClassName)}\\s+\\.rail-official-map-route\\{background-image:url\\("data:image\\/svg\\+xml;charset=UTF-8,([^"]+)"\\);\\}`),
        new RegExp(`\\.lines-wrapper\\s+\\.line\\.${escapeRegExp(cssClassName)}\\s+\\.route\\{background-image:\\s*url\\("data:image\\/svg\\+xml;charset=UTF-8,([^"]+)"\\);\\}`)
    ];

    const matchedRule = patterns.map((pattern) => cssContent.match(pattern)).find(Boolean);
    if (!matchedRule?.[1]) {
        return [];
    }

    const svgMarkup = decodeURIComponent(matchedRule[1]);
    const sampledPaths = [];

    for (const pathMatch of svgMarkup.matchAll(/<path\b([^>]+?)\/>/g)) {
        const attributes = pathMatch[1];
        const pathDataMatch = attributes.match(/\bd='([^']+)'/);
        const strokeWidthMatch = attributes.match(/\bstroke-width='([^']+)'/);
        if (!pathDataMatch || !strokeWidthMatch) continue;

        const strokeWidth = Number(strokeWidthMatch[1]);
        if (!(strokeWidth >= 4.5)) continue;

        const sampledPath = sampleSvgPath(pathDataMatch[1]);
        if (sampledPath.length < 2) continue;

        const maxX = Math.max(...sampledPath.map(([x]) => x));
        if (maxX > 1200.5) continue;

        sampledPaths.push(sampledPath);
    }

    return sampledPaths;
}

function clipOfficialRoutePathCandidates(sampledPaths, routeEntry) {
    const minX = Number(routeEntry.x) - OFFICIAL_ROUTE_CLIP_MARGIN;
    const maxX = Number(routeEntry.x) + Number(routeEntry.width) + OFFICIAL_ROUTE_CLIP_MARGIN;
    const minY = Number(routeEntry.y) - OFFICIAL_ROUTE_CLIP_MARGIN;
    const maxY = Number(routeEntry.y) + Number(routeEntry.height) + OFFICIAL_ROUTE_CLIP_MARGIN;
    const candidates = [];

    for (const sampledPath of Array.isArray(sampledPaths) ? sampledPaths : []) {
        let currentRun = [];

        for (const point of sampledPath) {
            const [pointX, pointY] = point;
            const isInside = pointX >= minX && pointX <= maxX && pointY >= minY && pointY <= maxY;

            if (isInside) {
                currentRun.push(point);
                continue;
            }

            if (currentRun.length >= 2) {
                candidates.push(currentRun);
            }
            currentRun = [];
        }

        if (currentRun.length >= 2) {
            candidates.push(currentRun);
        }
    }

    return candidates;
}

function getPolylineStationScore(points, fromStation, toStation) {
    const fromPoint = [fromStation.x, fromStation.y];
    const toPoint = [toStation.x, toStation.y];
    const distancesToFrom = points.map((point) => getPointDistance(point, fromPoint));
    const distancesToTo = points.map((point) => getPointDistance(point, toPoint));

    return Math.min(...distancesToFrom) + Math.min(...distancesToTo);
}

function buildOfficialRoutePolyline(routeEntry, sampledPaths, fromStation, toStation) {
    const candidates = clipOfficialRoutePathCandidates(sampledPaths, routeEntry);
    if (candidates.length === 0) return null;

    const bestCandidate = [...candidates]
        .map((points) => ({
            points,
            score: getPolylineStationScore(points, fromStation, toStation)
        }))
        .sort((left, right) => left.score - right.score || right.points.length - left.points.length)[0];

    if (!bestCandidate) return null;

    const forwardScore = getPointDistance(bestCandidate.points[0], [fromStation.x, fromStation.y])
        + getPointDistance(bestCandidate.points[bestCandidate.points.length - 1], [toStation.x, toStation.y]);
    const reverseScore = getPointDistance(bestCandidate.points[0], [toStation.x, toStation.y])
        + getPointDistance(bestCandidate.points[bestCandidate.points.length - 1], [fromStation.x, fromStation.y]);
    const normalizedPoints = reverseScore < forwardScore
        ? [...bestCandidate.points].reverse()
        : [...bestCandidate.points];

    return simplifyPolyline([
        [fromStation.x, fromStation.y],
        ...normalizedPoints,
        [toStation.x, toStation.y]
    ]);
}

function buildOfficialRouteGeometryLookup(officialMap, cssContent) {
    const routeGeometryLookup = {};

    for (const line of Array.isArray(officialMap?.lines) ? officialMap.lines : []) {
        const sampledPaths = extractOfficialLinePathSamples(cssContent, line.cssClassName);
        if (sampledPaths.length === 0) continue;

        const stationIdLookup = new Map(
            (Array.isArray(line.stations) ? line.stations : [])
                .map((station) => [normalizeOfficialStationId(station.stationID), station])
                .filter(([stationId]) => stationId)
        );

        for (const routeEntry of Array.isArray(line.routes) ? line.routes : []) {
            const [fromStationId, toStationId] = String(routeEntry.relStation || "")
                .split(",")
                .map((stationId) => normalizeOfficialStationId(stationId));
            const fromStation = stationIdLookup.get(fromStationId);
            const toStation = stationIdLookup.get(toStationId);
            if (!fromStation || !toStation) continue;

            const polyline = buildOfficialRoutePolyline(routeEntry, sampledPaths, fromStation, toStation);
            if (!polyline || polyline.length < 2) continue;

            routeGeometryLookup[`${line.lineCode}:${fromStation.stationCode}-${toStation.stationCode}`] = polyline;
            routeGeometryLookup[`${line.lineCode}:${toStation.stationCode}-${fromStation.stationCode}`] = [...polyline].reverse();
        }
    }

    return routeGeometryLookup;
}

function getStationAveragePosition(entries) {
    return {
        x: entries.reduce((sum, entry) => sum + entry.x, 0) / entries.length,
        y: entries.reduce((sum, entry) => sum + entry.y, 0) / entries.length
    };
}

function getInterchangeAnchorScale(stationCode, anchorCount) {
    if (anchorCount <= 1) return 1;
    return INTERCHANGE_ANCHOR_SCALE_OVERRIDES[stationCode] || INTERCHANGE_ANCHOR_SCALE;
}

function buildStationLineAnchors(stationCode, officialEntries, officialBounds) {
    const averagePosition = getStationAveragePosition(officialEntries);
    const [centerX, centerY] = scaleOfficialPoint([averagePosition.x, averagePosition.y], officialBounds);
    const anchorScale = getInterchangeAnchorScale(stationCode, officialEntries.length);
    const lineAnchors = {};

    for (const officialEntry of officialEntries) {
        const [scaledX, scaledY] = scaleOfficialPoint([officialEntry.x, officialEntry.y], officialBounds);
        lineAnchors[officialEntry.lineCode] = {
            x: roundCoordinate(centerX + (scaledX - centerX) * anchorScale),
            y: roundCoordinate(centerY + (scaledY - centerY) * anchorScale)
        };
    }

    const anchorValues = Object.values(lineAnchors);
    const markerCenter = anchorValues.length > 0
        ? {
            x: roundCoordinate(anchorValues.reduce((sum, anchor) => sum + anchor.x, 0) / anchorValues.length),
            y: roundCoordinate(anchorValues.reduce((sum, anchor) => sum + anchor.y, 0) / anchorValues.length)
        }
        : {
            x: roundCoordinate(centerX),
            y: roundCoordinate(centerY)
        };

    return {
        markerCenter,
        lineAnchors
    };
}

async function loadOfficialMap() {
    const scriptContent = await fs.readFile(officialMapPath, "utf8");
    const sandbox = { window: {} };
    vm.runInNewContext(scriptContent, sandbox);
    return sandbox.window.__OFFICIAL_MTR_MAP__ || null;
}

function buildLineBranches(lines, stationIndex) {
    const branchesByLine = new Map();

    for (const line of Array.isArray(lines) ? lines : []) {
        const lineBranches = branchesByLine.get(line.lineCode) || [];
        const branchMap = new Map(lineBranches.map((branch) => [branch.signature, branch]));

        for (const directionCode of Array.isArray(line.directions) ? line.directions : []) {
            const orderedStations = (Array.isArray(line.stations) ? line.stations : [])
                .filter((station) => Number.isFinite(Number(station?.sequences?.[directionCode])))
                .sort((left, right) => Number(left.sequences[directionCode]) - Number(right.sequences[directionCode]));

            if (orderedStations.length < 2) continue;

            const stationCodes = orderedStations.map((station) => station.stationCode);
            const reversedStationCodes = [...stationCodes].reverse();
            const signature = stationCodes.join(">") < reversedStationCodes.join(">")
                ? stationCodes.join(">")
                : reversedStationCodes.join(">");

            if (!branchMap.has(signature)) {
                const firstStationCode = stationCodes[0];
                const lastStationCode = stationCodes[stationCodes.length - 1];
                const branchId = `${line.lineCode}:${firstStationCode}-${lastStationCode}`;
                branchMap.set(signature, {
                    branchId,
                    signature,
                    lineCode: line.lineCode,
                    lineNameZh: line.lineNameZh,
                    lineNameEn: line.lineNameEn,
                    directionCodes: new Set([directionCode]),
                    stationCodes,
                    labelZh: `${stationIndex[firstStationCode]?.nameZh || firstStationCode}－${stationIndex[lastStationCode]?.nameZh || lastStationCode}`
                });
            } else {
                branchMap.get(signature).directionCodes.add(directionCode);
            }
        }

        branchesByLine.set(line.lineCode, [...branchMap.values()]);
    }

    return [...branchesByLine.entries()].map(([lineCode, branches]) => ({
        lineCode,
        color: LINE_STYLE_MAP[lineCode] || "#5A7694",
        lineNameZh: branches[0]?.lineNameZh || lineCode,
        lineNameEn: branches[0]?.lineNameEn || lineCode,
        branches: branches
            .map((branch, branchIndex) => ({
                branchId: branch.branchId || `${lineCode}:branch-${branchIndex + 1}`,
                labelZh: branch.labelZh,
                directionCodes: [...branch.directionCodes].sort(),
                stationCodes: branch.stationCodes
            }))
            .sort((left, right) => left.branchId.localeCompare(right.branchId, "en"))
    }));
}

function buildStationsFromOfficialMap(stationIndex, officialMap) {
    const collected = new Map();

    for (const line of Array.isArray(officialMap?.lines) ? officialMap.lines : []) {
        for (const station of Array.isArray(line.stations) ? line.stations : []) {
            if (!stationIndex[station.stationCode]) continue;
            const stationEntries = collected.get(station.stationCode) || [];
            stationEntries.push({ x: station.x, y: station.y, lineCode: line.lineCode });
            collected.set(station.stationCode, stationEntries);
        }
    }

    const allPoints = [...collected.values()].flat();
    const minX = Math.min(...allPoints.map((point) => point.x));
    const maxX = Math.max(...allPoints.map((point) => point.x));
    const minY = Math.min(...allPoints.map((point) => point.y));
    const maxY = Math.max(...allPoints.map((point) => point.y));
    const officialBounds = { minX, maxX, minY, maxY };

    const stations = {};
    for (const [stationCode, stationEntry] of Object.entries(stationIndex)) {
        const officialEntries = collected.get(stationCode);
        if (!officialEntries || officialEntries.length === 0) {
            throw new Error(`官方地圖缺少車站座標：${stationCode}`);
        }

        const referenceLineCode = STATION_REFERENCE_LINE[stationCode];
        const preferredEntry = referenceLineCode
            ? officialEntries.find((entry) => entry.lineCode === referenceLineCode)
            : null;
        const referencePoint = preferredEntry || getStationAveragePosition(officialEntries);
        const { markerCenter, lineAnchors } = buildStationLineAnchors(stationCode, officialEntries, officialBounds);
        const x = OFFICIAL_MAP_PADDING_X + (referencePoint.x - minX) * OFFICIAL_MAP_SCALE;
        const y = OFFICIAL_MAP_PADDING_Y + (referencePoint.y - minY) * OFFICIAL_MAP_SCALE;
        const normalizedStation = {
            stationCode,
            nameZh: stationEntry.nameZh,
            nameEn: stationEntry.nameEn,
            x: roundCoordinate(x),
            y: roundCoordinate(y),
            markerX: markerCenter.x,
            markerY: markerCenter.y,
            interchange: Array.isArray(stationEntry.lines) && stationEntry.lines.length > 1,
            lines: Array.isArray(stationEntry.lines) ? stationEntry.lines.map((line) => line.lineCode) : [],
            lineAnchors
        };

        stations[stationCode] = {
            ...normalizedStation,
            label: {
                text: normalizedStation.nameZh,
                ...(LABEL_OVERRIDES[stationCode] || right())
            }
        };
    }

    return {
        stations,
        viewBox: {
            minX: 0,
            minY: 0,
            width: roundCoordinate((maxX - minX) * OFFICIAL_MAP_SCALE + OFFICIAL_MAP_PADDING_X * 2),
            height: roundCoordinate((maxY - minY) * OFFICIAL_MAP_SCALE + OFFICIAL_MAP_PADDING_Y * 2)
        },
        officialBounds
    };
}

function scaleOfficialPoint([x, y], officialBounds) {
    return [
        roundCoordinate(OFFICIAL_MAP_PADDING_X + (x - officialBounds.minX) * OFFICIAL_MAP_SCALE),
        roundCoordinate(OFFICIAL_MAP_PADDING_Y + (y - officialBounds.minY) * OFFICIAL_MAP_SCALE)
    ];
}

function getStationLineAnchor(stations, stationCode, lineCode) {
    const station = stations[stationCode];
    if (!station) return { x: 0, y: 0 };
    const lineAnchor = station.lineAnchors?.[lineCode];
    if (lineAnchor) {
        return {
            x: Number(lineAnchor.x) || 0,
            y: Number(lineAnchor.y) || 0
        };
    }
    return {
        x: Number(station.markerX ?? station.x) || 0,
        y: Number(station.markerY ?? station.y) || 0
    };
}

function buildIntermediatePoints(lineCode, fromCode, toCode, stations) {
    const key = `${lineCode}:${fromCode}-${toCode}`;
    const reverseKey = `${lineCode}:${toCode}-${fromCode}`;
    const ratios = SEGMENT_POINT_OVERRIDES[key] || SEGMENT_POINT_OVERRIDES[reverseKey] || [];
    const from = getStationLineAnchor(stations, fromCode, lineCode);
    const to = getStationLineAnchor(stations, toCode, lineCode);
    if (!from || !to || ratios.length === 0) return [];

    return ratios.map(([distanceRatio = 0.5, normalOffsetRatio = 0]) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const baseX = from.x + dx * distanceRatio;
        const baseY = from.y + dy * distanceRatio;
        const normalLength = Math.max(1, Math.hypot(dx, dy));
        const normalX = (-dy / normalLength) * normalOffsetRatio * normalLength;
        const normalY = (dx / normalLength) * normalOffsetRatio * normalLength;
        return [roundCoordinate(baseX + normalX), roundCoordinate(baseY + normalY)];
    });
}

function buildSegmentPoints(lineCode, fromCode, toCode, stations, officialBounds, officialRouteGeometry) {
    const from = getStationLineAnchor(stations, fromCode, lineCode);
    const to = getStationLineAnchor(stations, toCode, lineCode);
    if (!from || !to) return [[0, 0], [0, 0]];

    const officialRoutePolyline = officialRouteGeometry?.[`${lineCode}:${fromCode}-${toCode}`];
    if (Array.isArray(officialRoutePolyline) && officialRoutePolyline.length >= 2) {
        const scaledPolyline = officialRoutePolyline.map((point) => scaleOfficialPoint(point, officialBounds));
        return dedupePolylinePoints([
            [from.x, from.y],
            ...scaledPolyline.slice(1, -1),
            [to.x, to.y]
        ], 0.8);
    }

    const directKey = `${lineCode}:${fromCode}-${toCode}`;
    const reverseKey = `${lineCode}:${toCode}-${fromCode}`;
    const directPolyline = SEGMENT_POLYLINE_OVERRIDES[directKey];
    const reversePolyline = SEGMENT_POLYLINE_OVERRIDES[reverseKey];
    if (Array.isArray(directPolyline)) {
        const scaledPolyline = directPolyline.map((point) => scaleOfficialPoint(point, officialBounds));
        return dedupePolylinePoints([
            [from.x, from.y],
            ...scaledPolyline.slice(1, -1),
            [to.x, to.y]
        ], 0.8);
    }
    if (Array.isArray(reversePolyline)) {
        const scaledPolyline = [...reversePolyline].reverse().map((point) => scaleOfficialPoint(point, officialBounds));
        return dedupePolylinePoints([
            [from.x, from.y],
            ...scaledPolyline.slice(1, -1),
            [to.x, to.y]
        ], 0.8);
    }

    return [
        [from.x, from.y],
        ...buildIntermediatePoints(lineCode, fromCode, toCode, stations),
        [to.x, to.y]
    ];
}

function buildLinesWithSegments(lines, stations, officialBounds, officialRouteGeometry) {
    return lines.map((line) => ({
        ...line,
        branches: line.branches.map((branch) => ({
            ...branch,
            segments: branch.stationCodes.slice(0, -1).map((stationCode, index) => ({
                segmentId: `${branch.branchId}:${stationCode}-${branch.stationCodes[index + 1]}`,
                from: stationCode,
                to: branch.stationCodes[index + 1],
                points: buildSegmentPoints(
                    line.lineCode,
                    stationCode,
                    branch.stationCodes[index + 1],
                    stations,
                    officialBounds,
                    officialRouteGeometry
                )
            }))
        }))
    }));
}

function buildWalkLinksAndLandmarks(stations) {
    const austinStation = stations.AUS;
    const kowloonStation = stations.KOW;
    const tsimShaTsuiStation = stations.TST;
    const eastTsimShaTsuiStation = stations.ETS;

    if (!austinStation || !kowloonStation || !tsimShaTsuiStation || !eastTsimShaTsuiStation) {
        throw new Error("Missing core stations for schematic walk links.");
    }

    const highSpeedRailLandmark = {
        stationCode: "HSR",
        nameZh: "高鐵",
        nameEn: "High Speed Rail",
        x: roundCoordinate((austinStation.x + kowloonStation.x) / 2 + 10),
        y: roundCoordinate(Math.max(austinStation.y, kowloonStation.y) + 76),
        selectable: true,
        label: {
            text: "高鐵",
            anchor: "middle",
            dx: 0,
            dy: 0
        }
    };

    const walkLinks = [
        {
            walkId: "TST|ETS",
            linkKey: "ETS|TST",
            from: "TST",
            to: "ETS",
            points: [
                [tsimShaTsuiStation.x, tsimShaTsuiStation.y],
                [roundCoordinate(tsimShaTsuiStation.x + 12), roundCoordinate(tsimShaTsuiStation.y + 16)],
                [roundCoordinate(eastTsimShaTsuiStation.x - 14), roundCoordinate(eastTsimShaTsuiStation.y - 10)],
                [eastTsimShaTsuiStation.x, eastTsimShaTsuiStation.y]
            ]
        },
        {
            walkId: "AUS|HSR",
            linkKey: "AUS|HSR",
            from: "AUS",
            to: "HSR",
            points: [
                [austinStation.x, austinStation.y],
                [roundCoordinate(austinStation.x - 8), roundCoordinate(austinStation.y + 60)],
                [roundCoordinate(highSpeedRailLandmark.x + 18), roundCoordinate(highSpeedRailLandmark.y - 10)],
                [highSpeedRailLandmark.x, highSpeedRailLandmark.y]
            ]
        },
        {
            walkId: "HSR|KOW",
            linkKey: "HSR|KOW",
            from: "HSR",
            to: "KOW",
            points: [
                [highSpeedRailLandmark.x, highSpeedRailLandmark.y],
                [roundCoordinate(highSpeedRailLandmark.x - 24), roundCoordinate(highSpeedRailLandmark.y - 8)],
                [roundCoordinate(kowloonStation.x + 32), roundCoordinate(kowloonStation.y + 40)],
                [kowloonStation.x, kowloonStation.y]
            ]
        }
    ];

    return {
        landmarks: [highSpeedRailLandmark],
        walkLinks
    };
}

async function main() {
    const officialRailIndex = JSON.parse(await fs.readFile(officialRailIndexPath, "utf8"));
    const officialMap = await loadOfficialMap();
    const officialMapCss = await fs.readFile(officialMapCssPath, "utf8");
    const heavyRail = officialRailIndex.heavyRail;

    if (!heavyRail?.lines || !heavyRail?.stationIndex) {
        throw new Error("official-rail-index.json 缺少 heavyRail lines/stationIndex。");
    }
    if (!officialMap?.lines) {
        throw new Error("official-mtr-map.js 缺少官方地圖線路資料。");
    }

    const officialRouteGeometry = buildOfficialRouteGeometryLookup(officialMap, officialMapCss);
    const lineDefinitions = buildLineBranches(heavyRail.lines, heavyRail.stationIndex);
    const { stations, viewBox, officialBounds } = buildStationsFromOfficialMap(heavyRail.stationIndex, officialMap);
    const lines = buildLinesWithSegments(lineDefinitions, stations, officialBounds, officialRouteGeometry);
    const { landmarks, walkLinks } = buildWalkLinksAndLandmarks(stations);

    const layout = {
        generatedAt: new Date().toISOString(),
        source: "official-rail-index.json + official-mtr-map.js + official-mtr-map.css",
        version: 6,
        viewBox,
        meta: {
            lineCount: lines.length,
            stationCount: Object.keys(stations).length,
            branchCount: lines.reduce((total, line) => total + line.branches.length, 0),
            walkLinkCount: walkLinks.length,
            landmarkCount: landmarks.length
        },
        lines,
        walkLinks,
        landmarks,
        stations
    };

    const output = `window.__MTR_SCHEMATIC_LAYOUT__ = ${JSON.stringify(layout, null, 2)};\n`;
    await fs.writeFile(schematicLayoutPath, output, "utf8");
    console.log(`Generated ${path.relative(projectRoot, schematicLayoutPath)}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
