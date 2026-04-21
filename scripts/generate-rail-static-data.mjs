import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const HEAVY_RAIL_SOURCE_URL = "https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv";
const LIGHT_RAIL_SOURCE_URL = "https://opendata.mtr.com.hk/data/light_rail_routes_and_stops.csv";
const STATION_POINT_SOURCE_URL = "https://open.hkmapservice.gov.hk/OpenData/directDownload?productName=iGeoCom&sheetName=iGeoCom&productFormat=CSV";
const COORDINATE_TRANSFORM_URL = "https://www.geodetic.gov.hk/transform/v2/";

const HEAVY_RAIL_LINE_META = {
    AEL: { zh: "機場快綫", en: "Airport Express", order: 80 },
    DRL: { zh: "迪士尼綫", en: "Disneyland Resort Line", order: 90 },
    EAL: { zh: "東鐵綫", en: "East Rail Line", order: 110 },
    ISL: { zh: "港島綫", en: "Island Line", order: 30 },
    KTL: { zh: "觀塘綫", en: "Kwun Tong Line", order: 20 },
    SIL: { zh: "南港島綫", en: "South Island Line", order: 100 },
    TCL: { zh: "東涌綫", en: "Tung Chung Line", order: 70 },
    TKL: { zh: "將軍澳綫", en: "Tseung Kwan O Line", order: 50 },
    TKZ: { zh: "將軍澳綫（康城支線）", en: "Tseung Kwan O Line (LOHAS Park Branch)", order: 60 },
    TML: { zh: "屯馬綫", en: "Tuen Ma Line", order: 40 },
    TWL: { zh: "荃灣綫", en: "Tsuen Wan Line", order: 10 }
};

function sanitizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
    return sanitizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}

function roundCoordinate(value) {
    return Number(Number(value).toFixed(6));
}

function parseCsv(csvText) {
    const rows = [];
    let currentCell = "";
    let currentRow = [];
    let inQuotes = false;
    const normalized = String(csvText || "").replace(/^\uFEFF/, "");

    for (let index = 0; index < normalized.length; index += 1) {
        const char = normalized[index];
        const nextChar = normalized[index + 1];

        if (char === "\"") {
            if (inQuotes && nextChar === "\"") {
                currentCell += "\"";
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && nextChar === "\n") {
                index += 1;
            }
            currentRow.push(currentCell);
            currentCell = "";
            if (currentRow.some((cell) => cell.length > 0)) {
                rows.push(currentRow);
            }
            currentRow = [];
            continue;
        }

        currentCell += char;
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell);
        if (currentRow.some((cell) => cell.length > 0)) {
            rows.push(currentRow);
        }
    }

    if (rows.length === 0) {
        return [];
    }

    const [headerRow, ...dataRows] = rows;
    return dataRows.map((cells) => {
        const entry = {};
        for (let index = 0; index < headerRow.length; index += 1) {
            entry[sanitizeText(headerRow[index])] = sanitizeText(cells[index]);
        }
        return entry;
    });
}

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url} (${response.status})`);
    }
    return response.text();
}

async function fetchBuffer(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url} (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
}

function extractFirstZipEntry(zipBuffer) {
    const endSignature = 0x06054b50;
    let endOffset = -1;
    for (let index = zipBuffer.length - 22; index >= 0; index -= 1) {
        if (zipBuffer.readUInt32LE(index) === endSignature) {
            endOffset = index;
            break;
        }
    }

    if (endOffset < 0) {
        throw new Error("ZIP end of central directory not found.");
    }

    const totalEntries = zipBuffer.readUInt16LE(endOffset + 10);
    const centralDirectoryOffset = zipBuffer.readUInt32LE(endOffset + 16);
    if (totalEntries < 1) {
        throw new Error("ZIP archive does not contain entries.");
    }

    const centralSignature = zipBuffer.readUInt32LE(centralDirectoryOffset);
    if (centralSignature !== 0x02014b50) {
        throw new Error("ZIP central directory header is invalid.");
    }

    const compressionMethod = zipBuffer.readUInt16LE(centralDirectoryOffset + 10);
    const compressedSize = zipBuffer.readUInt32LE(centralDirectoryOffset + 20);
    const fileNameLength = zipBuffer.readUInt16LE(centralDirectoryOffset + 28);
    const extraLength = zipBuffer.readUInt16LE(centralDirectoryOffset + 30);
    const commentLength = zipBuffer.readUInt16LE(centralDirectoryOffset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(centralDirectoryOffset + 42);

    if (fileNameLength < 1 || extraLength < 0 || commentLength < 0) {
        throw new Error("ZIP entry metadata is invalid.");
    }

    const localSignature = zipBuffer.readUInt32LE(localHeaderOffset);
    if (localSignature !== 0x04034b50) {
        throw new Error("ZIP local file header is invalid.");
    }

    const localFileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressedData = zipBuffer.subarray(dataOffset, dataOffset + compressedSize);

    if (compressionMethod === 0) {
        return compressedData;
    }

    if (compressionMethod === 8) {
        return zlib.inflateRawSync(compressedData);
    }

    throw new Error(`ZIP compression method ${compressionMethod} is not supported.`);
}

function getHeavyRailLineMeta(lineCode) {
    return HEAVY_RAIL_LINE_META[lineCode] || {
        zh: lineCode,
        en: lineCode,
        order: 999
    };
}

function buildHeavyRailIndex(rows) {
    const lineMap = new Map();
    const stationMap = new Map();

    for (const row of rows) {
        const lineCode = sanitizeText(row["Line Code"]).toUpperCase();
        const directionCode = sanitizeText(row.Direction).toUpperCase();
        const stationCode = sanitizeText(row["Station Code"]).toUpperCase();
        const stationId = sanitizeText(row["Station ID"]);
        const nameZh = sanitizeText(row["Chinese Name"]);
        const nameEn = sanitizeText(row["English Name"]);
        const sequence = Number.parseFloat(row.Sequence);

        if (!lineCode || !stationCode || !stationId || !nameZh || !nameEn || !Number.isFinite(sequence)) {
            continue;
        }

        let lineEntry = lineMap.get(lineCode);
        if (!lineEntry) {
            const lineMeta = getHeavyRailLineMeta(lineCode);
            lineEntry = {
                lineCode,
                lineNameZh: lineMeta.zh,
                lineNameEn: lineMeta.en,
                order: lineMeta.order,
                directions: new Set(),
                stations: []
            };
            lineMap.set(lineCode, lineEntry);
        }

        lineEntry.directions.add(directionCode);

        let stationEntry = lineEntry.stations.find((item) => item.stationCode === stationCode);
        if (!stationEntry) {
            stationEntry = {
                stationCode,
                stationId,
                nameZh,
                nameEn,
                sequences: {}
            };
            lineEntry.stations.push(stationEntry);
        }
        stationEntry.sequences[directionCode] = sequence;

        let stationIndexEntry = stationMap.get(stationCode);
        if (!stationIndexEntry) {
            stationIndexEntry = {
                stationCode,
                stationId,
                nameZh,
                nameEn,
                lines: []
            };
            stationMap.set(stationCode, stationIndexEntry);
        }

        const lineMembership = stationIndexEntry.lines.find((item) => item.lineCode === lineCode);
        if (lineMembership) {
            lineMembership.directions = [...new Set([...lineMembership.directions, directionCode])].sort();
            if (!Number.isFinite(lineMembership.sequence) || sequence < lineMembership.sequence) {
                lineMembership.sequence = sequence;
            }
        } else {
            stationIndexEntry.lines.push({
                lineCode,
                lineNameZh: lineEntry.lineNameZh,
                lineNameEn: lineEntry.lineNameEn,
                directions: [directionCode],
                sequence
            });
        }
    }

    const lines = [...lineMap.values()]
        .map((lineEntry) => ({
            lineCode: lineEntry.lineCode,
            lineNameZh: lineEntry.lineNameZh,
            lineNameEn: lineEntry.lineNameEn,
            directions: [...lineEntry.directions].sort(),
            stations: lineEntry.stations
                .map((stationEntry) => ({
                    ...stationEntry,
                    sortSequence: Math.min(...Object.values(stationEntry.sequences))
                }))
                .sort((left, right) => left.sortSequence - right.sortSequence)
                .map(({ sortSequence, ...stationEntry }) => stationEntry)
        }))
        .sort((left, right) => {
            const leftMeta = getHeavyRailLineMeta(left.lineCode);
            const rightMeta = getHeavyRailLineMeta(right.lineCode);
            if (leftMeta.order !== rightMeta.order) {
                return leftMeta.order - rightMeta.order;
            }
            return left.lineCode.localeCompare(right.lineCode, "en");
        });

    const stationIndex = Object.fromEntries(
        [...stationMap.entries()]
            .sort((left, right) => left[0].localeCompare(right[0], "en"))
            .map(([stationCode, stationEntry]) => [
                stationCode,
                {
                    ...stationEntry,
                    lines: stationEntry.lines
                        .sort((leftLine, rightLine) => {
                            const leftMeta = getHeavyRailLineMeta(leftLine.lineCode);
                            const rightMeta = getHeavyRailLineMeta(rightLine.lineCode);
                            if (leftMeta.order !== rightMeta.order) {
                                return leftMeta.order - rightMeta.order;
                            }
                            return leftLine.sequence - rightLine.sequence;
                        })
                        .map(({ sequence, ...lineMembership }) => lineMembership)
                }
            ])
    );

    return {
        lineCount: lines.length,
        stationCount: Object.keys(stationIndex).length,
        lines,
        stationIndex
    };
}

function buildLightRailIndex(rows) {
    const routeMap = new Map();
    const stopMap = new Map();

    for (const row of rows) {
        const routeCode = sanitizeText(row["Line Code"]);
        const directionCode = sanitizeText(row.Direction);
        const stopCode = sanitizeText(row["Stop Code"]).toUpperCase();
        const stopId = sanitizeText(row["Stop ID"]);
        const nameZh = sanitizeText(row["Chinese Name"]);
        const nameEn = sanitizeText(row["English Name"]);
        const sequence = Number.parseFloat(row.Sequence);

        if (!routeCode || !directionCode || !stopCode || !stopId || !nameZh || !nameEn || !Number.isFinite(sequence)) {
            continue;
        }

        let routeEntry = routeMap.get(routeCode);
        if (!routeEntry) {
            routeEntry = {
                routeCode,
                directions: new Map()
            };
            routeMap.set(routeCode, routeEntry);
        }

        let directionEntry = routeEntry.directions.get(directionCode);
        if (!directionEntry) {
            directionEntry = {
                direction: directionCode,
                stops: []
            };
            routeEntry.directions.set(directionCode, directionEntry);
        }

        directionEntry.stops.push({
            stopCode,
            stopId,
            nameZh,
            nameEn,
            sequence
        });

        let stopEntry = stopMap.get(stopId);
        if (!stopEntry) {
            stopEntry = {
                stopId,
                stopCode,
                nameZh,
                nameEn,
                routes: []
            };
            stopMap.set(stopId, stopEntry);
        }

        const routeMembership = stopEntry.routes.find((item) => item.routeCode === routeCode);
        if (routeMembership) {
            routeMembership.directions = [...new Set([...routeMembership.directions, directionCode])].sort();
            if (!Number.isFinite(routeMembership.sequence) || sequence < routeMembership.sequence) {
                routeMembership.sequence = sequence;
            }
        } else {
            stopEntry.routes.push({
                routeCode,
                directions: [directionCode],
                sequence
            });
        }
    }

    const routes = [...routeMap.values()]
        .map((routeEntry) => ({
            routeCode: routeEntry.routeCode,
            directions: [...routeEntry.directions.values()]
                .map((directionEntry) => ({
                    direction: directionEntry.direction,
                    stops: directionEntry.stops
                        .sort((left, right) => left.sequence - right.sequence)
                        .map(({ sequence, ...stopEntry }) => stopEntry)
                }))
                .sort((left, right) => left.direction.localeCompare(right.direction, "en"))
        }))
        .sort((left, right) => left.routeCode.localeCompare(right.routeCode, "en", { numeric: true, sensitivity: "base" }));

    const stopIndex = Object.fromEntries(
        [...stopMap.entries()]
            .sort((left, right) => left[0].localeCompare(right[0], "en", { numeric: true, sensitivity: "base" }))
            .map(([stopId, stopEntry]) => [
                stopId,
                {
                    ...stopEntry,
                    routes: stopEntry.routes
                        .sort((leftRoute, rightRoute) => leftRoute.routeCode.localeCompare(rightRoute.routeCode, "en", { numeric: true, sensitivity: "base" }))
                        .map(({ sequence, ...routeMembership }) => routeMembership)
                }
            ])
    );

    return {
        routeCount: routes.length,
        stopCount: Object.keys(stopIndex).length,
        routes,
        stopIndex
    };
}

function extractHeavyRailStationPoints(rows) {
    const stationPointMap = new Map();

    for (const row of rows) {
        if (sanitizeText(row.CLASS) !== "TRS" || sanitizeText(row.TYPE) !== "RSN") {
            continue;
        }

        const englishName = sanitizeText(row.ENGLISHNAME);
        const chineseName = sanitizeText(row.CHINESENAME);
        const match = englishName.match(/^(?:Mass Transit Railway|MTR) (.+?) Station$/);
        const easting = Number.parseFloat(row.EASTING);
        const northing = Number.parseFloat(row.NORTHING);

        if (!match || !Number.isFinite(easting) || !Number.isFinite(northing)) {
            continue;
        }

        const stationNameEn = sanitizeText(match[1]);
        stationPointMap.set(normalizeName(stationNameEn), {
            stationNameEn,
            stationNameZh: chineseName.replace(/^香港鐵路/, "").replace(/站$/, ""),
            easting,
            northing
        });
    }

    return stationPointMap;
}

async function transformGridToWgs84(easting, northing) {
    const query = new URLSearchParams({
        inSys: "hkgrid",
        outSys: "wgsgeog",
        e: String(easting),
        n: String(northing)
    });

    const response = await fetch(`${COORDINATE_TRANSFORM_URL}?${query.toString()}`);
    if (!response.ok) {
        throw new Error(`Failed to transform coordinates (${response.status})`);
    }

    const payload = await response.json();
    if (!Number.isFinite(payload?.wgsLat) || !Number.isFinite(payload?.wgsLong)) {
        throw new Error("Invalid coordinate transform response.");
    }

    return {
        latitude: roundCoordinate(payload.wgsLat),
        longitude: roundCoordinate(payload.wgsLong)
    };
}

async function buildHeavyRailLocationMap(heavyRailIndex, stationPointRows) {
    const stationPointMap = extractHeavyRailStationPoints(stationPointRows);
    const stationEntries = Object.values(heavyRailIndex.stationIndex);
    const outputMap = new Map();

    for (const stationEntry of stationEntries) {
        const stationPoint = stationPointMap.get(normalizeName(stationEntry.nameEn));
        if (!stationPoint) {
            continue;
        }

        const transformed = await transformGridToWgs84(stationPoint.easting, stationPoint.northing);
        outputMap.set(stationEntry.stationCode, {
            latitude: transformed.latitude,
            longitude: transformed.longitude,
            easting: Math.round(stationPoint.easting),
            northing: Math.round(stationPoint.northing),
            source: "LandsD iGeoCom TRS/RSN + Coordinates Transformation API"
        });
    }

    return outputMap;
}

function enrichHeavyRailIndexWithLocations(heavyRailIndex, locationMap) {
    for (const lineEntry of heavyRailIndex.lines) {
        for (const stationEntry of lineEntry.stations) {
            const location = locationMap.get(stationEntry.stationCode);
            if (location) {
                stationEntry.location = location;
            }
        }
    }

    for (const stationEntry of Object.values(heavyRailIndex.stationIndex)) {
        const location = locationMap.get(stationEntry.stationCode);
        if (location) {
            stationEntry.location = location;
        }
    }

    heavyRailIndex.stationLocationCount = locationMap.size;
    return heavyRailIndex;
}

async function main() {
    const [heavyRailCsv, lightRailCsv, stationPointZip] = await Promise.all([
        fetchText(HEAVY_RAIL_SOURCE_URL),
        fetchText(LIGHT_RAIL_SOURCE_URL),
        fetchBuffer(STATION_POINT_SOURCE_URL)
    ]);

    const heavyRailIndex = buildHeavyRailIndex(parseCsv(heavyRailCsv));
    const lightRailIndex = buildLightRailIndex(parseCsv(lightRailCsv));
    const stationPointCsv = extractFirstZipEntry(stationPointZip).toString("utf8");
    const stationPointRows = parseCsv(stationPointCsv);
    const stationLocationMap = await buildHeavyRailLocationMap(heavyRailIndex, stationPointRows);

    enrichHeavyRailIndexWithLocations(heavyRailIndex, stationLocationMap);

    const outputPayload = {
        generatedAt: new Date().toISOString(),
        sources: {
            heavyRailCsv: HEAVY_RAIL_SOURCE_URL,
            lightRailCsv: LIGHT_RAIL_SOURCE_URL,
            heavyRailStationPoints: STATION_POINT_SOURCE_URL,
            coordinateTransformApi: COORDINATE_TRANSFORM_URL
        },
        heavyRail: heavyRailIndex,
        lightRail: lightRailIndex
    };

    const currentFilePath = fileURLToPath(import.meta.url);
    const projectRoot = path.resolve(path.dirname(currentFilePath), "..");
    const outputJsonPath = path.join(projectRoot, "official-rail-index.json");
    const outputScriptPath = path.join(projectRoot, "official-rail-index.js");
    const outputJson = JSON.stringify(outputPayload);
    const outputScript = `window.__OFFICIAL_RAIL_INDEX__ = ${outputJson};\n`;

    await fs.writeFile(outputJsonPath, outputJson);
    await fs.writeFile(outputScriptPath, outputScript);

    console.log(
        JSON.stringify(
            {
                outputJsonPath,
                outputScriptPath,
                heavyRailLineCount: outputPayload.heavyRail.lineCount,
                heavyRailStationCount: outputPayload.heavyRail.stationCount,
                heavyRailStationLocationCount: outputPayload.heavyRail.stationLocationCount,
                lightRailRouteCount: outputPayload.lightRail.routeCount,
                lightRailStopCount: outputPayload.lightRail.stopCount
            },
            null,
            2
        )
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
