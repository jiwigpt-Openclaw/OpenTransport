(() => {
    const bubbleCards = Array.from(document.querySelectorAll(".bubble-card[data-category]"));
    const secondaryStage = document.getElementById("secondaryBubbleStage");
    if (bubbleCards.length === 0) {
        return;
    }

    const secondaryIcons = {
        bus: `
            <svg viewBox="0 0 32 32" aria-hidden="true">
                <path d="M9 10.5c0-2.5 2.3-4.5 7-4.5s7 2 7 4.5V19a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2v-8.5Z"></path>
                <path d="M11 14h10"></path>
                <path d="M12.5 23v2"></path>
                <path d="M19.5 23v2"></path>
            </svg>
        `,
        mtr: `
            <svg viewBox="0 0 32 32" aria-hidden="true">
                <path d="M10 10a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v9a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3v-9Z"></path>
                <path d="M12 14h8"></path>
                <path d="M13 25l3-3 3 3"></path>
            </svg>
        `,
        flight: `
            <svg viewBox="0 0 32 32" aria-hidden="true">
                <path d="m5 17 20-7-5 6 5 6L5 17Z"></path>
                <path d="M14 13 9 8"></path>
                <path d="M14 21l-5 3"></path>
            </svg>
        `,
        ferry: `
            <svg viewBox="0 0 32 32" aria-hidden="true">
                <path d="M10 18h12l-2 5H12l-2-5Z"></path>
                <path d="M13 18v-5h6v5"></path>
                <path d="M7 24c1.5 1.3 3 2 4.5 2s3-.7 4.5-2c1.5 1.3 3 2 4.5 2s3-.7 4.5-2"></path>
            </svg>
        `,
        other: `
            <svg viewBox="0 0 32 32" aria-hidden="true">
                <circle cx="16" cy="16" r="7"></circle>
                <path d="M16 6v3"></path>
                <path d="M16 23v3"></path>
                <path d="M6 16h3"></path>
                <path d="M23 16h3"></path>
            </svg>
        `
    };

    const secondaryBubbleConfig = {
        travel: {
            title: "行的入口",
            subtitle: "已開放功能可直接進入",
            items: [
                { id: "bus", label: "巴士", meta: "即時到站", icon: secondaryIcons.bus, interactive: true, href: "bus.html" },
                { id: "mtr", label: "地鐵", meta: "Rail beta", icon: secondaryIcons.mtr, interactive: true, href: "rail.html" },
                { id: "flight", label: "飛機", meta: "稍後開放", icon: secondaryIcons.flight, interactive: false },
                { id: "ferry", label: "渡輪", meta: "稍後開放", icon: secondaryIcons.ferry, interactive: false },
                { id: "other", label: "其他", meta: "整理中", icon: secondaryIcons.other, interactive: false }
            ]
        }
    };

    const homeState = {
        selectedCategory: null
    };

    function emitBubbleStateChange() {
        window.dispatchEvent(new CustomEvent("home:bubble-change", {
            detail: {
                selectedCategory: homeState.selectedCategory,
                secondaryConfig: secondaryBubbleConfig[homeState.selectedCategory] || null
            }
        }));
    }

    function getSecondaryConfig(category = homeState.selectedCategory) {
        return secondaryBubbleConfig[category] || null;
    }

    function getSecondaryItem(category, itemId) {
        const secondaryConfig = getSecondaryConfig(category);
        return secondaryConfig?.items?.find((item) => item.id === itemId) || null;
    }

    function renderSecondaryBubbles() {
        if (!secondaryStage) {
            return;
        }

        const secondaryConfig = getSecondaryConfig();
        secondaryStage.classList.remove("is-visible");

        if (!secondaryConfig) {
            secondaryStage.innerHTML = "";
            secondaryStage.setAttribute("aria-hidden", "true");
            return;
        }

        const interactiveItems = secondaryConfig.items.filter((item) => item.interactive);
        const pendingItems = secondaryConfig.items.filter((item) => !item.interactive);

        secondaryStage.innerHTML = `
            <div class="secondary-shell">
                <div class="secondary-header">
                    <p class="secondary-title">${secondaryConfig.title}</p>
                    <p class="secondary-subtitle">${secondaryConfig.subtitle || ""}</p>
                </div>
                <div class="secondary-cluster">
                    ${interactiveItems.map((item) => `
                        <button
                            type="button"
                            class="secondary-bubble-card ${item.interactive ? "is-actionable" : ""}"
                            data-category="${homeState.selectedCategory}"
                            data-secondary-id="${item.id}"
                            data-interactive="${item.interactive ? "true" : "false"}"
                            aria-disabled="${item.interactive ? "false" : "true"}"
                        >
                            <span class="secondary-bubble-orb" aria-hidden="true">
                                <span class="secondary-bubble-icon">${item.icon}</span>
                            </span>
                            <span class="secondary-bubble-copy">
                                <span class="secondary-bubble-label">${item.label}</span>
                                <span class="secondary-bubble-meta">${item.meta || ""}</span>
                            </span>
                        </button>
                    `).join("")}
                </div>
                ${pendingItems.length ? `
                    <div class="secondary-pending" aria-label="稍後開放">
                        <span class="secondary-pending-label">稍後開放</span>
                        ${pendingItems.map((item) => `
                            <span class="secondary-pending-chip">${item.label}</span>
                        `).join("")}
                    </div>
                ` : ""}
            </div>
        `;

        secondaryStage.setAttribute("aria-hidden", "false");
        window.requestAnimationFrame(() => {
            secondaryStage.classList.add("is-visible");
        });
    }

    function applyBubbleState() {
        for (const card of bubbleCards) {
            const category = card.dataset.category || "";
            const isSelected = Boolean(homeState.selectedCategory) && homeState.selectedCategory === category;
            const isDimmed = Boolean(homeState.selectedCategory) && homeState.selectedCategory !== category;

            card.classList.toggle("is-selected", isSelected);
            card.classList.toggle("is-dimmed", isDimmed);
            card.setAttribute("aria-pressed", String(isSelected));
        }
    }

    function setSelectedCategory(nextCategory) {
        homeState.selectedCategory = nextCategory || null;
        applyBubbleState();
        renderSecondaryBubbles();
        emitBubbleStateChange();
    }

    for (const card of bubbleCards) {
        card.addEventListener("click", () => {
            const category = card.dataset.category || "";
            const nextCategory = homeState.selectedCategory === category ? null : category;
            setSelectedCategory(nextCategory);
        });
    }

    if (secondaryStage) {
        secondaryStage.addEventListener("click", (event) => {
            const bubbleButton = event.target.closest(".secondary-bubble-card[data-secondary-id]");
            if (!(bubbleButton instanceof HTMLElement)) {
                return;
            }

            const isInteractive = bubbleButton.dataset.interactive === "true";
            if (!isInteractive) {
                return;
            }

            const category = bubbleButton.dataset.category || "";
            const itemId = bubbleButton.dataset.secondaryId || "";
            const itemConfig = getSecondaryItem(category, itemId);
            if (!itemConfig) {
                return;
            }

            window.dispatchEvent(new CustomEvent("home:secondary-bubble-click", {
                detail: {
                    category,
                    itemId,
                    itemConfig
                }
            }));

            if (itemConfig.href) {
                window.location.href = itemConfig.href;
            }
        });
    }

    window.homeBubbleController = {
        getSelectedCategory() {
            return homeState.selectedCategory;
        },
        setSelectedCategory,
        getSecondaryConfig
    };

    applyBubbleState();
    renderSecondaryBubbles();
})();
