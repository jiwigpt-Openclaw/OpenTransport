import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUS_DATA_URL = "https://static.data.gov.hk/td/routes-fares-geojson/JSON_BUS.json";
const BUS_UPDATE_URL = "https://static.data.gov.hk/td/routes-fares-geojson/DATA_LAST_UPDATED_DATE.csv";
const SUPPORTED_COMPANY_CODES = new Set(["KMB", "CTB", "NLB", "GMB", "KMB+CTB"]);

function sanitizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function getRouteDirection(routeSeq) {
    return Number(routeSeq) === 2 ? "inbound" : "outbound";
}

function getRouteDestination(properties = {}) {
    if (getRouteDirection(properties.routeSeq) === "inbound") {
        return sanitizeText(
            properties.locStartNameC
            || properties.locStartNameE
            || properties.locEndNameC
            || properties.locEndNameE
        );
    }

    return sanitizeText(
        properties.locEndNameC
        || properties.locEndNameE
        || properties.locStartNameC
        || properties.locStartNameE
    );
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url} (${response.status})`);
    }

    return response.json();
}

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url} (${response.status})`);
    }

    return response.text();
}

function buildStopIndex(features = []) {
    const stopMap = new Map();

    for (const feature of features) {
        const properties = feature?.properties || {};
        const companyCode = sanitizeText(properties.companyCode).toUpperCase();
        if (!SUPPORTED_COMPANY_CODES.has(companyCode)) {
            continue;
        }

        if (Number(properties.routeType) !== 1) {
            continue;
        }

        const stopId = sanitizeText(properties.stopId);
        const route = sanitizeText(properties.routeNameC || properties.routeNameE).toUpperCase();
        const latitude = Number(feature?.geometry?.coordinates?.[1]);
        const longitude = Number(feature?.geometry?.coordinates?.[0]);
        if (!stopId || !route || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            continue;
        }

        const stopKey = `${companyCode}|${stopId}`;
        let stopEntry = stopMap.get(stopKey);
        if (!stopEntry) {
            stopEntry = {
                companyCode,
                stopId,
                nameTc: sanitizeText(properties.stopNameC),
                nameEn: sanitizeText(properties.stopNameE),
                latitude,
                longitude,
                routes: []
            };
            stopMap.set(stopKey, stopEntry);
        }

        const routeEntry = {
            companyCode,
            route,
            direction: getRouteDirection(properties.routeSeq),
            destination: getRouteDestination(properties)
        };
        const routeKey = [
            routeEntry.companyCode,
            routeEntry.route,
            routeEntry.direction,
            routeEntry.destination
        ].join("|");

        if (!stopEntry._seenRouteKeys) {
            stopEntry._seenRouteKeys = new Set();
        }

        if (stopEntry._seenRouteKeys.has(routeKey)) {
            continue;
        }

        stopEntry._seenRouteKeys.add(routeKey);
        stopEntry.routes.push(routeEntry);
    }

    return [...stopMap.values()]
        .map((stopEntry) => {
            delete stopEntry._seenRouteKeys;
            stopEntry.routes.sort((left, right) => {
                if (left.companyCode !== right.companyCode) {
                    return left.companyCode.localeCompare(right.companyCode, "en");
                }

                if (left.route !== right.route) {
                    return left.route.localeCompare(right.route, "en", {
                        numeric: true,
                        sensitivity: "base"
                    });
                }

                return left.destination.localeCompare(right.destination, "zh-HK");
            });

            return stopEntry;
        })
        .sort((left, right) => {
            if (left.companyCode !== right.companyCode) {
                return left.companyCode.localeCompare(right.companyCode, "en");
            }

            return left.stopId.localeCompare(right.stopId, "en");
        });
}

async function main() {
    const [busData, dataLastUpdated] = await Promise.all([
        fetchJson(BUS_DATA_URL),
        fetchText(BUS_UPDATE_URL).catch(() => "")
    ]);

    const outputPayload = {
        generatedAt: new Date().toISOString(),
        dataLastUpdated: sanitizeText(dataLastUpdated),
        sourceUrl: BUS_DATA_URL,
        stopCount: 0,
        stops: []
    };

    outputPayload.stops = buildStopIndex(Array.isArray(busData?.features) ? busData.features : []);
    outputPayload.stopCount = outputPayload.stops.length;

    const currentFilePath = fileURLToPath(import.meta.url);
    const projectRoot = path.resolve(path.dirname(currentFilePath), "..");
    const outputJsonPath = path.join(projectRoot, "official-bus-stop-index.json");
    const outputScriptPath = path.join(projectRoot, "official-bus-stop-index.js");
    const outputJson = JSON.stringify(outputPayload);
    const outputScript = `window.__OFFICIAL_BUS_STOP_INDEX__ = ${outputJson};\n`;
    await fs.writeFile(outputJsonPath, outputJson);
    await fs.writeFile(outputScriptPath, outputScript);

    const sizeBytes = Buffer.byteLength(outputJson);
    console.log(
        JSON.stringify(
            {
                outputJsonPath,
                outputScriptPath,
                stopCount: outputPayload.stopCount,
                sizeBytes,
                sizeMB: Number((sizeBytes / 1024 / 1024).toFixed(2))
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
