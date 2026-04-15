import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const officialRailIndexPath = path.join(projectRoot, "official-rail-index.json");
const officialMapPath = path.join(projectRoot, "official-mtr-map.js");
const schematicLayoutPath = path.join(projectRoot, "mtr-schematic-layout.js");

const OFFICIAL_MAP_PADDING_X = 110;
const OFFICIAL_MAP_PADDING_Y = 90;
const OFFICIAL_MAP_SCALE = 1.78;

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

const LABEL_OVERRIDES = {
    KET: middle(-34),
    HKU: middle(-34),
    SYP: middle(-34),
    SHW: middle(-34),
    CEN: middle(-34),
    ADM: right(-28),
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

    TST: left(-10),
    JOR: left(-10),
    YMT: left(-10),
    MOK: left(-10),
    PRE: left(-10),
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
    NAC: left(34),
    OLY: left(30),
    KOW: left(-24),
    HOK: left(-26),
    TWW: middle(-30),
    KSR: middle(-30),
    YUL: middle(-30),
    LOP: middle(-30),
    TIS: middle(-30),
    SIH: right(26),
    TUM: right(24),
    AUS: left(30),
    ETS: left(-18),

    HUH: right(30),
    HOM: right(30),
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
    EXC: right(-30),

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

function getStationAveragePosition(entries) {
    return {
        x: entries.reduce((sum, entry) => sum + entry.x, 0) / entries.length,
        y: entries.reduce((sum, entry) => sum + entry.y, 0) / entries.length
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

    const stations = {};
    for (const [stationCode, stationEntry] of Object.entries(stationIndex)) {
        const officialEntries = collected.get(stationCode);
        if (!officialEntries || officialEntries.length === 0) {
            throw new Error(`官方地圖缺少車站座標：${stationCode}`);
        }

        const averaged = getStationAveragePosition(officialEntries);
        const x = OFFICIAL_MAP_PADDING_X + (averaged.x - minX) * OFFICIAL_MAP_SCALE;
        const y = OFFICIAL_MAP_PADDING_Y + (averaged.y - minY) * OFFICIAL_MAP_SCALE;
        const normalizedStation = {
            stationCode,
            nameZh: stationEntry.nameZh,
            nameEn: stationEntry.nameEn,
            x: roundCoordinate(x),
            y: roundCoordinate(y),
            interchange: Array.isArray(stationEntry.lines) && stationEntry.lines.length > 1,
            lines: Array.isArray(stationEntry.lines) ? stationEntry.lines.map((line) => line.lineCode) : []
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
        officialBounds: { minX, maxX, minY, maxY }
    };
}

function scaleOfficialPoint([x, y], officialBounds) {
    return [
        roundCoordinate(OFFICIAL_MAP_PADDING_X + (x - officialBounds.minX) * OFFICIAL_MAP_SCALE),
        roundCoordinate(OFFICIAL_MAP_PADDING_Y + (y - officialBounds.minY) * OFFICIAL_MAP_SCALE)
    ];
}

function buildIntermediatePoints(lineCode, fromCode, toCode, stations) {
    const key = `${lineCode}:${fromCode}-${toCode}`;
    const reverseKey = `${lineCode}:${toCode}-${fromCode}`;
    const ratios = SEGMENT_POINT_OVERRIDES[key] || SEGMENT_POINT_OVERRIDES[reverseKey] || [];
    const from = stations[fromCode];
    const to = stations[toCode];
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

function buildSegmentPoints(lineCode, fromCode, toCode, stations, officialBounds) {
    const from = stations[fromCode];
    const to = stations[toCode];
    if (!from || !to) return [[0, 0], [0, 0]];

    const directKey = `${lineCode}:${fromCode}-${toCode}`;
    const reverseKey = `${lineCode}:${toCode}-${fromCode}`;
    const directPolyline = SEGMENT_POLYLINE_OVERRIDES[directKey];
    const reversePolyline = SEGMENT_POLYLINE_OVERRIDES[reverseKey];
    if (Array.isArray(directPolyline)) {
        return directPolyline.map((point) => scaleOfficialPoint(point, officialBounds));
    }
    if (Array.isArray(reversePolyline)) {
        return [...reversePolyline].reverse().map((point) => scaleOfficialPoint(point, officialBounds));
    }

    return [
        [from.x, from.y],
        ...buildIntermediatePoints(lineCode, fromCode, toCode, stations),
        [to.x, to.y]
    ];
}

function buildLinesWithSegments(lines, stations, officialBounds) {
    return lines.map((line) => ({
        ...line,
        branches: line.branches.map((branch) => ({
            ...branch,
            segments: branch.stationCodes.slice(0, -1).map((stationCode, index) => ({
                segmentId: `${branch.branchId}:${stationCode}-${branch.stationCodes[index + 1]}`,
                from: stationCode,
                to: branch.stationCodes[index + 1],
                points: buildSegmentPoints(line.lineCode, stationCode, branch.stationCodes[index + 1], stations, officialBounds)
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
        x: roundCoordinate((austinStation.x + kowloonStation.x) / 2 + 2),
        y: roundCoordinate(Math.max(austinStation.y, kowloonStation.y) + 42),
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
    const heavyRail = officialRailIndex.heavyRail;

    if (!heavyRail?.lines || !heavyRail?.stationIndex) {
        throw new Error("official-rail-index.json 缺少 heavyRail lines/stationIndex。");
    }
    if (!officialMap?.lines) {
        throw new Error("official-mtr-map.js 缺少官方地圖線路資料。");
    }

    const lineDefinitions = buildLineBranches(heavyRail.lines, heavyRail.stationIndex);
    const { stations, viewBox, officialBounds } = buildStationsFromOfficialMap(heavyRail.stationIndex, officialMap);
    const lines = buildLinesWithSegments(lineDefinitions, stations, officialBounds);
    const { landmarks, walkLinks } = buildWalkLinksAndLandmarks(stations);

    const layout = {
        generatedAt: new Date().toISOString(),
        source: "official-rail-index.json + official-mtr-map.js",
        version: 4,
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
