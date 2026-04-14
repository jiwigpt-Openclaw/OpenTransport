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

const LABEL_OVERRIDES = {
    KET: middle(-30),
    HKU: middle(-30),
    SYP: middle(-30),
    SHW: middle(-30),
    CEN: middle(-30),
    ADM: right(-22),
    WAC: middle(-30),
    CAB: middle(-30),
    TIH: middle(-30),
    FOH: middle(-30),
    NOP: middle(-30),
    QUB: middle(-30),
    TAK: middle(-30),
    SWH: middle(-30),
    SKW: right(-8),
    HFC: right(-8),
    CHW: right(-8),
    TST: left(-8),
    JOR: right(-8),
    YMT: right(-8),
    MOK: right(-8),
    PRE: right(-8),
    SSP: left(-8),
    CSW: left(-8),
    LCK: left(-8),
    LAK: left(-10),
    MEF: left(-10),
    NAC: left(24),
    OLY: left(24),
    KOW: left(-18),
    HOK: left(-18),
    AUS: left(24),
    ETS: left(-16),
    HUH: right(28),
    HOM: right(26),
    TKW: right(26),
    SUW: right(26),
    KAT: right(26),
    HIK: right(-20),
    DIH: right(-18),
    LOF: middle(28),
    WTS: middle(-28),
    KOT: middle(-30),
    SKM: left(-8),
    MKK: right(24),
    EXC: right(-20),
    TAW: right(-20),
    CKT: middle(28),
    STW: middle(-28),
    CIO: middle(-28),
    SHM: middle(-28),
    TSH: middle(-28),
    HEO: middle(-28),
    MOS: middle(-28),
    WKS: middle(-28),
    SHS: right(-18),
    FAN: right(-18),
    TWO: right(-18),
    TAP: right(-18),
    UNI: right(-18),
    FOT: right(-18),
    SHT: right(-18),
    POA: right(24),
    HAH: right(24),
    TKO: right(24),
    LHP: right(-18),
    YAT: middle(28),
    LAT: middle(28),
    KWT: middle(28),
    NTK: middle(28),
    KOB: middle(28),
    CHH: middle(28),
    TIK: right(28),
    SOH: right(26),
    LET: right(26),
    WCH: right(26),
    OCP: right(26),
    TUC: left(22),
    SUN: left(24),
    TSY: left(26),
    AIR: left(24),
    AWE: left(-10),
    DIS: left(24),
    TWW: right(-10),
    KSR: right(-10),
    YUL: right(-10),
    LOP: right(-10),
    TIS: right(-10),
    SIH: right(24),
    TSW: left(-12),
    TWH: left(-12),
    KWH: left(-12),
    KWF: left(-12),
    HOK: left(-24),
    KOW: left(-20),
    OLY: left(24),
    NAC: left(28),
    EXC: right(-24),
    ADM: right(-24)
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
    "TCL:TUC-SUN": [[182, 470], [220, 430], [258, 393]],
    "TCL:SUN-TSY": [[258, 393], [286, 366], [313, 331]],
    "TCL:TSY-LAK": [[313, 331], [345, 300], [379, 294]],
    "TCL:LAK-NAC": [[379, 294], [392, 318], [424, 347]],
    "TCL:NAC-OLY": [[424, 347], [424, 411]],
    "TCL:OLY-KOW": [[424, 411], [424, 468]],
    "TCL:KOW-HOK": [[424, 468], [452, 501], [486, 534], [515, 551]],

    "AEL:AWE-AIR": [[191, 383], [168, 383], [156, 405], [156, 432]],
    "AEL:AIR-TSY": [[156, 432], [194, 404], [252, 362], [317, 335]],
    "AEL:TSY-KOW": [[317, 335], [354, 366], [396, 417], [418, 468]],
    "AEL:KOW-HOK": [[418, 468], [446, 501], [486, 539], [515, 556]],

    "DRL:SUN-DIS": [[262, 396], [279, 415], [297, 438]],

    "TML:TUM-SIH": [[76, 210], [76, 150]],
    "TML:SIH-TIS": [[76, 150], [76, 108], [98, 65]],
    "TML:TIS-LOP": [[98, 65], [120, 85], [120, 108]],
    "TML:LOP-YUL": [[120, 108], [120, 150]],
    "TML:YUL-KSR": [[120, 150], [120, 193]],
    "TML:KSR-TWW": [[120, 193], [132, 218], [147, 243]],
    "TML:TWW-MEF": [[147, 243], [210, 255], [320, 276], [429, 294]],
    "TML:MEF-NAC": [[429, 294], [429, 347]],

    "EAL:TAW-KOT": [[715, 225], [715, 293]],
    "EAL:KOT-MKK": [[715, 293], [716, 363]],
    "EAL:MKK-HUH": [[716, 363], [716, 430], [697, 478]],
    "EAL:HUH-EXC": [[697, 478], [694, 509], [666, 540], [632, 551]],
    "EAL:EXC-ADM": [[632, 551], [606, 566], [575, 577]]
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
