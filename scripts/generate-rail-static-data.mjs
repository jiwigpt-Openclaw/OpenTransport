import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HEAVY_RAIL_SOURCE_URL = "https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv";
const LIGHT_RAIL_SOURCE_URL = "https://opendata.mtr.com.hk/data/light_rail_routes_and_stops.csv";

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

async function main() {
    const [heavyRailCsv, lightRailCsv] = await Promise.all([
        fetchText(HEAVY_RAIL_SOURCE_URL),
        fetchText(LIGHT_RAIL_SOURCE_URL)
    ]);

    const outputPayload = {
        generatedAt: new Date().toISOString(),
        sources: {
            heavyRailCsv: HEAVY_RAIL_SOURCE_URL,
            lightRailCsv: LIGHT_RAIL_SOURCE_URL
        },
        heavyRail: buildHeavyRailIndex(parseCsv(heavyRailCsv)),
        lightRail: buildLightRailIndex(parseCsv(lightRailCsv))
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
