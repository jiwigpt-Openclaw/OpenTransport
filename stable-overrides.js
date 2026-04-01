(() => {
    let officialIndexScriptPromise = null;
    let officialRouteCompanyIndexPromise = null;
    const SAME_STOP_FALLBACK_THRESHOLD_METERS = 80;

    function getSortedCompanyCodesLocal(companyCodes = []) {
        return [...new Set(companyCodes.map((company) => getCompanyConfig(company).code).filter(Boolean))]
            .sort((left, right) => {
                return (COMPANY_ORDER[left] ?? COMPANY_ORDER.unknown) - (COMPANY_ORDER[right] ?? COMPANY_ORDER.unknown);
            });
    }

    function formatDistanceInMetersLocal(distanceMeters) {
        return `${Math.max(0, Math.round(Number(distanceMeters) || 0))}米`;
    }

    function renderStopInfoSectionLocal(title, contentHtml) {
        return `
            <section class="stop-info-section">
                <h3 class="stop-info-section-title">${escapeHtml(title)}</h3>
                ${contentHtml}
            </section>
        `;
    }

    function buildCurrentRouteFallbackLocal(selectedContext, stop) {
        if (!selectedContext?.variant) {
            return [];
        }

        return [{
            companyCode: getItemCompany(selectedContext.variant),
            route: normalizeRouteCode(selectedContext.variant.route),
            direction: getItemDirection(selectedContext.variant),
            destination: getEntryDestinationLabel(selectedContext.variant),
            serviceType: getServiceType(selectedContext.variant),
            stopId: normalizeStopId(stop?.stopId)
        }];
    }

    function getRouteEntryScoreLocal(routeInfo = {}, preferredCompany = "") {
        let score = 0;

        if (routeInfo.destination) {
            score += 20;
        }

        if (routeInfo.stopId) {
            score += 10;
        }

        if (routeInfo.direction) {
            score += 5;
        }

        if (preferredCompany && (routeInfo.companyHints || []).includes(preferredCompany)) {
            score += 1;
        }

        return score;
    }

    function buildStopInfoRouteListFromOfficialLocal(routeEntries = [], { preferredCompany = "" } = {}) {
        const normalizedPreferredCompany = getCompanyConfig(preferredCompany).code;
        const uniqueRoutes = new Map();

        for (const routeEntry of routeEntries) {
            const companyDisplayCode = String(routeEntry?.companyCode || routeEntry?.company || "").trim().toUpperCase();
            const companyHints = getOfficialStopCompanyHints(companyDisplayCode, normalizedPreferredCompany);
            const route = normalizeRouteCode(routeEntry?.route);
            const direction = normalizeDirection(routeEntry?.direction);
            const destination = String(
                routeEntry?.destination
                || routeEntry?.dest_tc
                || routeEntry?.dest_en
                || ""
            ).trim();
            const stopId = normalizeStopId(routeEntry?.stopId || routeEntry?.stop || "");
            const serviceType = String(routeEntry?.serviceType || routeEntry?.service_type || "1").trim() || "1";

            if (!companyDisplayCode || !route || companyHints.length === 0) {
                continue;
            }

            const routeKey = [
                companyDisplayCode,
                route,
                direction || "unknown",
                normalizeTerminusLabel(destination) || "unknown"
            ].join("|");

            const nextValue = {
                company: companyHints[0],
                companyDisplayCode,
                companyHints,
                route,
                direction,
                destination,
                serviceType,
                stopId
            };
            const existingValue = uniqueRoutes.get(routeKey);

            if (!existingValue) {
                uniqueRoutes.set(routeKey, nextValue);
                continue;
            }

            const nextScore = getRouteEntryScoreLocal(nextValue, normalizedPreferredCompany);
            const existingScore = getRouteEntryScoreLocal(existingValue, normalizedPreferredCompany);
            const preferredValue = nextScore > existingScore ? nextValue : existingValue;
            const fallbackValue = preferredValue === nextValue ? existingValue : nextValue;

            uniqueRoutes.set(routeKey, {
                ...preferredValue,
                companyHints: preferredValue.companyHints.length > 0 ? preferredValue.companyHints : fallbackValue.companyHints,
                destination: preferredValue.destination || fallbackValue.destination,
                direction: preferredValue.direction || fallbackValue.direction,
                stopId: preferredValue.stopId || fallbackValue.stopId
            });
        }

        return [...uniqueRoutes.values()].sort((left, right) => {
            const leftCompanyOrder = COMPANY_ORDER[left.companyHints[0]] ?? COMPANY_ORDER.unknown;
            const rightCompanyOrder = COMPANY_ORDER[right.companyHints[0]] ?? COMPANY_ORDER.unknown;
            if (leftCompanyOrder !== rightCompanyOrder) {
                return leftCompanyOrder - rightCompanyOrder;
            }

            if (left.route !== right.route) {
                return left.route.localeCompare(right.route, "en", { numeric: true, sensitivity: "base" });
            }

            const leftDirectionOrder = left.direction === "outbound" ? 0 : left.direction === "inbound" ? 1 : 2;
            const rightDirectionOrder = right.direction === "outbound" ? 0 : right.direction === "inbound" ? 1 : 2;
            if (leftDirectionOrder !== rightDirectionOrder) {
                return leftDirectionOrder - rightDirectionOrder;
            }

            return left.destination.localeCompare(right.destination, "zh-HK");
        });
    }

    function loadOfficialBusStopIndexFromScriptTagLocal() {
        if (Array.isArray(window.__OFFICIAL_BUS_STOP_INDEX__?.stops)) {
            return Promise.resolve(window.__OFFICIAL_BUS_STOP_INDEX__.stops);
        }

        if (!officialIndexScriptPromise) {
            officialIndexScriptPromise = new Promise((resolve, reject) => {
                const resolveFromWindow = () => {
                    if (Array.isArray(window.__OFFICIAL_BUS_STOP_INDEX__?.stops)) {
                        resolve(window.__OFFICIAL_BUS_STOP_INDEX__.stops);
                        return;
                    }

                    reject(new Error("官方巴士站索引腳本已載入，但沒有可用資料"));
                };
                const rejectLoad = () => {
                    reject(new Error("官方巴士站索引腳本載入失敗"));
                };
                const existingScript = document.querySelector('script[data-official-stop-index="true"]');

                if (existingScript) {
                    if (Array.isArray(window.__OFFICIAL_BUS_STOP_INDEX__?.stops)) {
                        resolveFromWindow();
                        return;
                    }

                    existingScript.addEventListener("load", resolveFromWindow, { once: true });
                    existingScript.addEventListener("error", rejectLoad, { once: true });
                    window.setTimeout(resolveFromWindow, 0);
                    return;
                }

                const script = document.createElement("script");
                script.src = `${OFFICIAL_BUS_STOP_INDEX_SCRIPT_URL}?v=${encodeURIComponent(APP_VERSION)}`;
                script.async = true;
                script.defer = true;
                script.dataset.officialStopIndex = "true";
                script.onload = resolveFromWindow;
                script.onerror = rejectLoad;
                (document.head || document.body || document.documentElement).appendChild(script);
            }).catch((error) => {
                officialIndexScriptPromise = null;
                throw error;
            });
        }

        return officialIndexScriptPromise;
    }

    async function getOfficialBusStopIndexLocal() {
        return loadOfficialBusStopIndexFromScriptTagLocal();
    }

    function officialCandidateMatchesCurrentVariant(candidate, selectedContext) {
        const currentVariant = selectedContext?.variant;
        if (!currentVariant || !candidate) {
            return false;
        }

        const currentCompany = getItemCompany(currentVariant);
        const currentRoute = normalizeRouteCode(currentVariant.route);

        return (Array.isArray(candidate.routes) ? candidate.routes : []).some((routeEntry) => {
            const routeCompanyHints = getOfficialStopCompanyHints(
                routeEntry?.companyCode || candidate.companyCode || "",
                currentCompany
            );
            return normalizeRouteCode(routeEntry?.route) === currentRoute
                && routeCompanyHints.includes(currentCompany);
        });
    }

    function createOfficialStopCandidate(stopEntry, centerCoordinates, currentStopName, selectedContext, maxDistanceMeters) {
        const latitude = Number(stopEntry?.latitude);
        const longitude = Number(stopEntry?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
        }

        const distanceMeters = Math.round(getDistanceInKm(
            centerCoordinates.latitude,
            centerCoordinates.longitude,
            latitude,
            longitude
        ) * 1000);

        if (distanceMeters > maxDistanceMeters) {
            return null;
        }

        const stopName = sanitizeOfficialStopName(stopEntry?.nameTc || stopEntry?.nameEn || "");
        const candidate = {
            companyCode: String(stopEntry?.companyCode || "").trim().toUpperCase(),
            stopId: normalizeStopId(stopEntry?.stopId),
            stopName,
            distanceMeters,
            isExactStop: distanceMeters <= SAME_STOP_THRESHOLD_METERS
                || stopInfoNamesLikelyMatch(currentStopName, stopName),
            routes: (Array.isArray(stopEntry?.routes) ? stopEntry.routes : []).map((routeEntry) => ({
                ...routeEntry,
                companyCode: String(routeEntry?.companyCode || stopEntry?.companyCode || "").trim().toUpperCase(),
                stopId: normalizeStopId(stopEntry?.stopId),
                stopName
            }))
        };

        if (!candidate.isExactStop
            && maxDistanceMeters > NEARBY_STOP_THRESHOLD_METERS
            && officialCandidateMatchesCurrentVariant(candidate, selectedContext)) {
            candidate.isExactStop = true;
        }

        return candidate;
    }

    async function getOfficialNearbyStopCandidatesLocal(centerCoordinates, currentStopName, selectedContext) {
        const officialStops = await getOfficialBusStopIndexLocal();
        const candidateMap = new Map();
        const primaryCandidates = officialStops
            .map((stopEntry) => {
                return createOfficialStopCandidate(
                    stopEntry,
                    centerCoordinates,
                    currentStopName,
                    selectedContext,
                    NEARBY_STOP_THRESHOLD_METERS
                );
            })
            .filter(Boolean);

        primaryCandidates.forEach((candidate) => {
            candidateMap.set(`${candidate.companyCode}|${candidate.stopId}`, candidate);
        });

        if (!primaryCandidates.some((candidate) => candidate.isExactStop)) {
            const fallbackCandidates = officialStops
                .map((stopEntry) => {
                    return createOfficialStopCandidate(
                        stopEntry,
                        centerCoordinates,
                        currentStopName,
                        selectedContext,
                        SAME_STOP_FALLBACK_THRESHOLD_METERS
                    );
                })
                .filter((candidate) => {
                    if (!candidate) {
                        return false;
                    }

                    if (candidate.distanceMeters <= NEARBY_STOP_THRESHOLD_METERS) {
                        return false;
                    }

                    return candidate.isExactStop;
                });

            fallbackCandidates.forEach((candidate) => {
                candidateMap.set(`${candidate.companyCode}|${candidate.stopId}`, candidate);
            });
        }

        const candidates = [...candidateMap.values()]
            .sort((left, right) => {
                if (left.distanceMeters !== right.distanceMeters) {
                    return left.distanceMeters - right.distanceMeters;
                }

                const leftCompanyOrder = COMPANY_ORDER[left.companyCode] ?? COMPANY_ORDER.unknown;
                const rightCompanyOrder = COMPANY_ORDER[right.companyCode] ?? COMPANY_ORDER.unknown;
                if (leftCompanyOrder !== rightCompanyOrder) {
                    return leftCompanyOrder - rightCompanyOrder;
                }

                return left.stopName.localeCompare(right.stopName, "zh-HK");
            });

        if (candidates.length > 0 && !candidates.some((candidate) => candidate.isExactStop)) {
            const closestDistance = candidates[0].distanceMeters;
            candidates.forEach((candidate) => {
                if (candidate.distanceMeters === closestDistance) {
                    candidate.isExactStop = true;
                }
            });
        }

        return candidates;
    }

    function renderStopInfoRouteButtonsLocal(routeInfos) {
        if (!routeInfos.length) {
            return '<p class="stop-info-modal-empty">目前沒有可顯示的車號資料</p>';
        }

        return `
            <div class="stop-info-route-list">
                ${routeInfos.map((routeInfo) => {
                    const encodedCompanyValue = encodeURIComponent(JSON.stringify(routeInfo.companyHints || [routeInfo.company]));
                    const encodedRoute = encodeURIComponent(routeInfo.route);
                    const encodedStopId = encodeURIComponent(routeInfo.stopId || "");
                    const encodedDirection = encodeURIComponent(routeInfo.direction || "");
                    const encodedDestination = encodeURIComponent(routeInfo.destination || "");
                    const encodedServiceType = encodeURIComponent(routeInfo.serviceType || "");
                    const destinationText = routeInfo.destination ? `前往 ${routeInfo.destination}` : "前往資料暫缺";

                    return `
                        <button
                            type="button"
                            class="stop-info-route-btn"
                            onclick="selectRouteFromStopInfo('${encodedCompanyValue}', '${encodedRoute}', '${encodedStopId}', '${encodedDirection}', '${encodedDestination}', '${encodedServiceType}')"
                        >
                            <span class="stop-info-route-main">
                                ${renderStopInfoCompanyBadges(routeInfo.companyDisplayCode || routeInfo.company)}
                                <span class="stop-info-route-code">${escapeHtml(routeInfo.route)}</span>
                            </span>
                            <span class="stop-info-route-destination">${escapeHtml(destinationText)}</span>
                        </button>
                    `;
                }).join("")}
            </div>
        `;
    }

    function getVariantMatchScoreLocal(variant, autoSelectTarget = {}) {
        const normalizedDirection = normalizeDirection(autoSelectTarget.direction);
        const normalizedDestination = normalizeTerminusLabel(autoSelectTarget.destination);
        const preferredServiceType = String(autoSelectTarget.serviceType || "").trim();
        const companyHints = [...new Set(
            (Array.isArray(autoSelectTarget.companyHints) ? autoSelectTarget.companyHints : [])
                .map((company) => getCompanyConfig(company).code)
                .filter(Boolean)
        )];

        let score = 0;
        const variantCompany = getItemCompany(variant);
        const companyIndex = companyHints.indexOf(variantCompany);
        if (companyIndex >= 0) {
            score += 100 - companyIndex * 10;
        }

        if (normalizedDirection && getItemDirection(variant) === normalizedDirection) {
            score += 40;
        }

        score += getRouteInfoDestinationMatchScore(
            { destination: getEntryDestinationLabel(variant) },
            normalizedDestination
        ) * 10;

        if (preferredServiceType && getServiceType(variant) === preferredServiceType) {
            score += 5;
        }

        return score;
    }

    async function getRouteSearchCompanyCandidatesLocal(route) {
        const fallbackCompanies = getSortedCompanyCodesLocal(Object.keys(COMPANY_CONFIGS));

        try {
            if (!officialRouteCompanyIndexPromise) {
                officialRouteCompanyIndexPromise = (async () => {
                    const officialStops = await getOfficialBusStopIndexLocal();
                    const routeCompanyIndex = new Map();

                    for (const stopEntry of officialStops) {
                        const routeEntries = Array.isArray(stopEntry?.routes) ? stopEntry.routes : [];

                        for (const routeEntry of routeEntries) {
                            const routeCode = normalizeRouteCode(routeEntry?.route);
                            if (!routeCode) {
                                continue;
                            }

                            if (!routeCompanyIndex.has(routeCode)) {
                                routeCompanyIndex.set(routeCode, new Set());
                            }

                            const companyHints = getOfficialStopCompanyHints(
                                routeEntry?.companyCode || stopEntry?.companyCode || ""
                            );
                            companyHints.forEach((company) => {
                                routeCompanyIndex.get(routeCode).add(company);
                            });
                        }
                    }

                    return routeCompanyIndex;
                })().catch((error) => {
                    officialRouteCompanyIndexPromise = null;
                    throw error;
                });
            }

            const routeCompanyIndex = await officialRouteCompanyIndexPromise;
            const companyHints = [...(routeCompanyIndex.get(normalizeRouteCode(route)) || new Set())];
            return companyHints.length > 0
                ? getSortedCompanyCodesLocal(companyHints)
                : fallbackCompanies;
        } catch (error) {
            console.warn("官方路線公司索引載入失敗，改用完整公司清單搜尋", error);
            return fallbackCompanies;
        }
    }

    function selectRouteFromStopInfo(encodedCompanyValue, encodedRoute, encodedStopId, encodedDirection, encodedDestination, encodedServiceType = "") {
        const routeInput = document.getElementById("routeInput");
        if (!routeInput) {
            return;
        }

        let companyHints = [];
        try {
            const parsedValue = JSON.parse(decodeActionValue(encodedCompanyValue));
            if (Array.isArray(parsedValue)) {
                companyHints = [...new Set(
                    parsedValue
                        .map((company) => getCompanyConfig(company).code)
                        .filter(Boolean)
                )];
            }
        } catch (error) {
            companyHints = getOfficialStopCompanyHints(decodeActionValue(encodedCompanyValue));
        }

        const route = normalizeRouteCode(decodeActionValue(encodedRoute));
        const stopId = normalizeStopId(decodeActionValue(encodedStopId));
        const direction = normalizeDirection(decodeActionValue(encodedDirection));
        const destination = String(decodeActionValue(encodedDestination) || "").trim();
        const serviceType = String(decodeActionValue(encodedServiceType) || "").trim();
        if (!route) {
            return;
        }

        closeStopInfoModal();
        routeInput.value = route;
        routeInput.focus();

        void searchETA({
            autoSelectTarget: {
                company: companyHints[0] || "",
                companyHints,
                route,
                direction,
                destination,
                serviceType,
                stopId
            }
        });
    }

    function findVariantForAutoSelect(variants, autoSelectTarget = {}) {
        const normalizedRoute = normalizeRouteCode(autoSelectTarget.route);
        const companyHints = [...new Set(
            (Array.isArray(autoSelectTarget.companyHints) ? autoSelectTarget.companyHints : [])
                .map((company) => getCompanyConfig(company).code)
                .filter(Boolean)
        )];
        const normalizedCompanyHints = companyHints.length > 0
            ? companyHints
            : (autoSelectTarget.company ? [getCompanyConfig(autoSelectTarget.company).code] : []);

        return variants
            .filter((variant) => {
                if (normalizeRouteCode(variant.route) !== normalizedRoute) {
                    return false;
                }

                if (normalizedCompanyHints.length > 0 && !normalizedCompanyHints.includes(getItemCompany(variant))) {
                    return false;
                }

                return true;
            })
            .sort((left, right) => {
                const scoreDiff = getVariantMatchScoreLocal(right, autoSelectTarget)
                    - getVariantMatchScoreLocal(left, autoSelectTarget);
                if (scoreDiff !== 0) {
                    return scoreDiff;
                }

                return compareVariantsBase(left, right);
            })[0] || null;
    }

    async function autoSelectVariantAfterSearch(autoSelectTarget = null) {
        if (!currentRenderState || !autoSelectTarget) {
            return false;
        }

        const matchedVariant = findVariantForAutoSelect(currentRenderState.variants, autoSelectTarget);
        if (!matchedVariant) {
            return false;
        }

        const matchedVariantKey = getVariantKey(matchedVariant);
        await loadSelectedVariantData(matchedVariantKey, {
            isAutoRefresh: false,
            requestFreshLocation: false
        });

        if (!currentRenderState || currentRenderState.selectedVariantKey !== matchedVariantKey) {
            return false;
        }

        if (autoSelectTarget.stopId) {
            openStopPanelByStopId(autoSelectTarget.stopId, matchedVariantKey);
        }

        return true;
    }

    async function showStopInfoModal(encodedStopKey) {
        const selectedContext = getSelectedVariantContext();
        if (!selectedContext) {
            return;
        }

        const stopKey = decodeActionValue(encodedStopKey);
        const stop = getSelectedVariantStopByKey(stopKey);
        if (!stop) {
            return;
        }

        const company = getItemCompany(selectedContext.variant);
        const stopName = getStopDisplayName(stop, company);
        const requestId = ++activeStopInfoModalRequestId;

        renderStopInfoModalState({
            title: "此站及附近停靠車號",
            subtitle: `${stopName} • 正在整理官方站位資料...`,
            bodyHtml: `<p class="stop-info-modal-empty is-loading">正在以本站座標為中心整理 ${NEARBY_STOP_THRESHOLD_METERS} 米內各公司站位與車號...</p>`
        });
        openStopInfoModal();

        try {
            const centerCoordinates = await getStopInfoModalCenterCoordinates(stop, company);
            if (requestId !== activeStopInfoModalRequestId) {
                return;
            }

            if (!centerCoordinates) {
                renderStopInfoModalState({
                    title: "此站及附近停靠車號",
                    subtitle: stopName,
                    bodyHtml: '<p class="stop-info-modal-empty">暫時無法取得本站座標，未能整理附近站點資料。</p>'
                });
                return;
            }

            const candidates = await getOfficialNearbyStopCandidatesLocal(centerCoordinates, stopName, selectedContext);
            if (requestId !== activeStopInfoModalRequestId) {
                return;
            }

            const preferredCompany = getItemCompany(selectedContext.variant);
            const sameStopRouteInfos = buildStopInfoRouteListFromOfficialLocal(
                [
                    ...candidates
                        .filter((candidate) => candidate.isExactStop)
                        .flatMap((candidate) => candidate.routes),
                    ...buildCurrentRouteFallbackLocal(selectedContext, stop)
                ],
                { preferredCompany }
            );

            const nearbyStopGroups = candidates
                .filter((candidate) => !candidate.isExactStop)
                .map((candidate) => ({
                    ...candidate,
                    routeInfos: buildStopInfoRouteListFromOfficialLocal(candidate.routes, { preferredCompany })
                }))
                .filter((candidate) => candidate.routeInfos.length > 0)
                .sort((left, right) => {
                    if (left.distanceMeters !== right.distanceMeters) {
                        return left.distanceMeters - right.distanceMeters;
                    }

                    return left.stopName.localeCompare(right.stopName, "zh-HK");
                });

            const nearbyStopsHtml = nearbyStopGroups.length > 0
                ? nearbyStopGroups.map((nearbyStop) => `
                    <div class="stop-info-nearby-stop-card">
                        <div class="stop-info-nearby-stop-header">
                            <div class="stop-info-nearby-stop-name">${escapeHtml(nearbyStop.stopName)}</div>
                            <div class="stop-info-nearby-stop-meta">${escapeHtml(formatDistanceInMetersLocal(nearbyStop.distanceMeters))}</div>
                        </div>
                        ${renderStopInfoRouteButtonsLocal(nearbyStop.routeInfos)}
                    </div>
                `).join("")
                : `<p class="stop-info-modal-empty">附近 ${NEARBY_STOP_THRESHOLD_METERS} 米內沒有其他可顯示的站點車號。</p>`;

            const bodyHtml = [
                renderStopInfoSectionLocal("本站停靠車號、前往的終點", renderStopInfoRouteButtonsLocal(sameStopRouteInfos)),
                renderStopInfoSectionLocal(`附近站（${NEARBY_STOP_THRESHOLD_METERS}米）停靠車號`, nearbyStopsHtml)
            ].join("");

            renderStopInfoModalState({
                title: "此站及附近停靠車號",
                subtitle: `${stopName} • 以本站座標為中心搜尋 ${NEARBY_STOP_THRESHOLD_METERS} 米`,
                bodyHtml
            });
        } catch (error) {
            if (requestId !== activeStopInfoModalRequestId) {
                return;
            }

            console.warn("載入站點資訊 Modal 失敗", error);
            renderStopInfoModalState({
                title: "此站及附近停靠車號",
                subtitle: stopName,
                bodyHtml: '<p class="stop-info-modal-empty">暫時無法載入本站及附近站點資料，請稍後再試。</p>'
            });
        }
    }

    async function searchETA(options = {}) {
        const { isAutoRefresh = false, autoSelectTarget = null } = options;

        if (isAutoRefresh) {
            if (currentRenderState) {
                await refreshVariantSummaries();
            }

            if (currentRenderState?.selectedVariantKey) {
                await loadSelectedVariantData(currentRenderState.selectedVariantKey, { isAutoRefresh: true });
            }
            return;
        }

        const routeInput = document.getElementById("routeInput");
        const resultDiv = document.getElementById("result");
        const statusDiv = document.getElementById("status");
        const searchBtn = document.getElementById("searchBtn");
        const route = String(routeInput?.value || "").trim().toUpperCase();
        const searchId = ++activeSearchId;

        if (!route) {
            statusDiv.innerHTML = '<span style="color:red">請輸入路線號，例如 1A、24、104。</span>';
            resultDiv.innerHTML = "";
            resetCurrentRouteState();
            return;
        }

        resetCurrentRouteState();
        statusDiv.innerHTML = `正在分析路線 <strong>${escapeHtml(route)}</strong>...`;
        resultDiv.innerHTML = '<div class="loading">正在整理方向與公司資料...</div>';
        searchBtn.disabled = true;
        searchBtn.textContent = "查詢中...";

        try {
            const companies = await getRouteSearchCompanyCandidatesLocal(route);
            const restrictedCompanies = companies.filter((company) => isCompanyRestrictedInLocalFileMode(company));

            const routeListResults = await Promise.allSettled(companies.map(async (company) => ({
                company,
                routeList: await getRouteList(company)
            })));

            if (searchId !== activeSearchId) {
                return;
            }

            const availableRouteLists = routeListResults
                .filter((result) => result.status === "fulfilled")
                .map((result) => result.value);

            if (availableRouteLists.length === 0) {
                throw routeListResults.find((result) => result.status === "rejected")?.reason || new Error("路線清單暫時無法載入");
            }

            const matchingRoutes = availableRouteLists.flatMap(({ routeList }) => {
                return routeList.filter((entry) => normalizeRouteCode(entry?.route) === route);
            });

            if (!matchingRoutes.length) {
                resetCurrentRouteState();
                const restrictedMessage = restrictedCompanies.length > 0
                    ? ` ${getLocalModeRestrictionNotice(restrictedCompanies)}`
                    : "";
                renderStandaloneError(
                    resultDiv,
                    `目前不支援路線 ${route}`,
                    `目前找不到這條路線，請確認路線號是否正確。${restrictedMessage}`
                );
                statusDiv.innerHTML = "目前不支援此路線";
                return;
            }

            const expandedMatchingRoutes = await expandRouteEntriesForSearch(matchingRoutes);
            if (searchId !== activeSearchId) {
                return;
            }

            const variants = chooseRouteVariants(expandedMatchingRoutes);
            if (!variants.length) {
                resetCurrentRouteState();
                renderStandaloneError(
                    resultDiv,
                    `路線 ${route} 暫時無法查詢`,
                    "目前找不到可用方向資料，請稍後再試。"
                );
                statusDiv.innerHTML = "找不到方向資料";
                return;
            }

            currentRenderState = createRenderState(route, variants);

            for (const variant of variants) {
                const bucket = ensureVariantDataBucket(getVariantKey(variant));
                bucket.isSummaryLoading = true;
            }

            renderCurrentState();

            statusDiv.innerHTML = `已找到 ${variants.length} 個可用方向，正在整理班次摘要...`;
            await refreshVariantSummaries();

            if (!currentRenderState || currentRenderState.route !== route || searchId !== activeSearchId) {
                return;
            }

            const autoSelectSucceeded = autoSelectTarget
                ? await autoSelectVariantAfterSearch(autoSelectTarget)
                : false;

            if (!currentRenderState || currentRenderState.route !== route || searchId !== activeSearchId) {
                return;
            }

            console.log(`[BUS ${APP_VERSION}] route search`, {
                route,
                companies: [...new Set(expandedMatchingRoutes.map((entry) => getItemCompany(entry)))],
                variantCount: variants.length
            });

            if (autoSelectTarget && autoSelectSucceeded) {
                return;
            }

            const localModeNotice = restrictedCompanies.length > 0
                ? `。${getLocalModeRestrictionNotice(restrictedCompanies)}`
                : "";
            statusDiv.innerHTML = `已找到 ${variants.length} 個可用方向，並已同步載入班次摘要${localModeNotice}`;
        } catch (error) {
            console.error("Bus route search failed", error);
            const friendlyErrorMessage = getFriendlyRouteErrorMessage(error);
            resetCurrentRouteState();
            renderStandaloneError(resultDiv, "查詢失敗", friendlyErrorMessage);
            statusDiv.innerHTML = "查詢失敗";
        } finally {
            if (searchId === activeSearchId) {
                searchBtn.disabled = false;
                searchBtn.textContent = "查詢";
            }
        }
    }

    globalThis.selectRouteFromStopInfo = selectRouteFromStopInfo;
    globalThis.findVariantForAutoSelect = findVariantForAutoSelect;
    globalThis.autoSelectVariantAfterSearch = autoSelectVariantAfterSearch;
    globalThis.showStopInfoModal = showStopInfoModal;
    globalThis.searchETA = searchETA;
})();
