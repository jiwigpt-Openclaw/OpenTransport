(() => {
    const bubbleCards = Array.from(document.querySelectorAll(".bubble-card[data-category]"));
    const secondaryStage = document.getElementById("secondaryBubbleStage");
    if (bubbleCards.length === 0) {
        return;
    }

    const secondaryBubbleConfig = {
        travel: {
            title: "行的細分類",
            items: [
                { id: "bus", label: "巴士", icon: "🚌", interactive: true, href: "bus.html" },
                { id: "mtr", label: "地鐵", icon: "🚇", interactive: false },
                { id: "flight", label: "飛機", icon: "✈️", interactive: false },
                { id: "ferry", label: "渡輪", icon: "⛴️", interactive: false },
                { id: "other", label: "其他", icon: "🧭", interactive: false }
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

        secondaryStage.innerHTML = `
            <div class="secondary-shell">
                <p class="secondary-title">${secondaryConfig.title}</p>
                <div class="secondary-cluster">
                    ${secondaryConfig.items.map((item) => `
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
                            <span class="secondary-bubble-label">${item.label}</span>
                        </button>
                    `).join("")}
                </div>
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
