(() => {
    const bubbleField = document.getElementById("bubbleField");
    if (!(bubbleField instanceof HTMLElement)) {
        return;
    }

    const icons = {
        clothing: `
            <svg class="bubble-icon" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M28 16.5c0-2.8 1.8-5 4-5s4 2.2 4 5"></path>
                <path d="M24 20c2 3 4.8 4.5 8 4.5s6-1.5 8-4.5l8 6.5-5.7 8.1-4.3-3.2V49H25.9V31.4l-4.2 3.2-5.7-8.1L24 20Z"></path>
            </svg>
        `,
        food: `
            <svg class="bubble-icon" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M18 34h28"></path>
                <path d="M20 34c1.4 8 6.6 12.5 12 12.5S42.6 42 44 34"></path>
                <path d="M24 18c-2 3-2 6.1 0 9.2"></path>
                <path d="M32 16c-2 3.2-2 6.4 0 9.6"></path>
                <path d="M40 18c-2 3-2 6.1 0 9.2"></path>
            </svg>
        `,
        home: `
            <svg class="bubble-icon" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M18 28.5 32 17l14 11.5V47a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V28.5Z"></path>
                <path d="M27 49V35.5h10V49"></path>
            </svg>
        `,
        travel: `
            <svg class="bubble-icon" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="20" cy="44" r="3.5"></circle>
                <circle cx="45" cy="20" r="3.5"></circle>
                <path d="M20 40v-8c0-6.6 5.4-12 12-12h9"></path>
                <path d="M28 36h12a4 4 0 0 0 0-8H28a4 4 0 0 0 0 8Z"></path>
            </svg>
        `,
        bus: `
            <svg class="bubble-icon" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M18 22c0-4.2 3.9-7.5 14-7.5S46 17.8 46 22v15a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V22Z"></path>
                <path d="M22 29h20"></path>
                <path d="M25 45v4"></path>
                <path d="M39 45v4"></path>
            </svg>
        `,
        mtr: `
            <svg class="bubble-icon" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M22 20a6 6 0 0 1 6-6h8a6 6 0 0 1 6 6v15a5 5 0 0 1-5 5H27a5 5 0 0 1-5-5V20Z"></path>
                <path d="M25 27h14"></path>
                <path d="M27 46l5-5 5 5"></path>
            </svg>
        `
    };

    const rootItems = [
        { id: "clothing", label: "衣", tone: "clothing", icon: icons.clothing, interactive: false, meta: "整理中" },
        { id: "food", label: "食", tone: "food", icon: icons.food, interactive: false, meta: "整理中" },
        { id: "home", label: "住", tone: "home", icon: icons.home, interactive: false, meta: "整理中" },
        { id: "travel", label: "行", tone: "travel", icon: icons.travel, interactive: true, meta: "已開放" }
    ];

    const subviews = {
        travel: {
            title: "行",
            subtitle: "選擇下一級功能",
            items: [
                { id: "bus", label: "巴士", meta: "即時到站", tone: "travel", icon: icons.bus, interactive: true, href: "bus.html" },
                { id: "mtr", label: "地鐵", meta: "Rail beta", tone: "travel", icon: icons.mtr, interactive: true, href: "rail.html" }
            ]
        }
    };

    const homeState = {
        level: "root",
        category: null
    };

    function emitBubbleStateChange() {
        window.dispatchEvent(new CustomEvent("home:bubble-change", {
            detail: {
                level: homeState.level,
                category: homeState.category,
                subview: homeState.category ? subviews[homeState.category] || null : null
            }
        }));
    }

    function getCurrentItems() {
        if (homeState.level === "root") {
            return rootItems;
        }

        return subviews[homeState.category]?.items || [];
    }

    function buildBubbleCardMarkup(item, { nested = false } = {}) {
        const classes = [
            "bubble-card",
            `bubble-${item.tone || "neutral"}`
        ];

        if (nested) {
            classes.push("bubble-card-sublevel");
        }

        if (!item.interactive) {
            classes.push("is-muted");
        }

        return `
            <button
                type="button"
                class="${classes.join(" ")}"
                data-item-id="${item.id}"
                data-interactive="${item.interactive ? "true" : "false"}"
                ${item.href ? `data-href="${item.href}"` : ""}
                aria-disabled="${item.interactive ? "false" : "true"}"
            >
                <span class="bubble-orb" aria-hidden="true">
                    <span class="bubble-core">
                        ${item.icon}
                    </span>
                </span>
                <span class="bubble-copy">
                    <span class="bubble-nameplate">${item.label}</span>
                    ${item.meta ? `<span class="bubble-meta">${item.meta}</span>` : ""}
                </span>
            </button>
        `;
    }

    function renderRootLevel() {
        bubbleField.innerHTML = `
            <div class="bubble-grid bubble-grid-root">
                ${rootItems.map((item) => buildBubbleCardMarkup(item)).join("")}
            </div>
        `;
    }

    function renderSublevel() {
        const subview = subviews[homeState.category];
        if (!subview) {
            renderRootLevel();
            return;
        }

        bubbleField.innerHTML = `
            <div class="bubble-drilldown">
                <div class="bubble-drilldown-header">
                    <button type="button" class="bubble-back-btn" data-action="back">
                        <span aria-hidden="true">←</span>
                        <span>返回上一級</span>
                    </button>
                    <div class="bubble-drilldown-copy">
                        <p class="bubble-drilldown-title">${subview.title}</p>
                        <p class="bubble-drilldown-subtitle">${subview.subtitle}</p>
                    </div>
                </div>
                <div class="bubble-grid bubble-grid-sublevel">
                    ${subview.items.map((item) => buildBubbleCardMarkup(item, { nested: true })).join("")}
                </div>
            </div>
        `;
    }

    function renderBubbleField() {
        if (homeState.level === "sublevel") {
            renderSublevel();
        } else {
            renderRootLevel();
        }

        bubbleField.setAttribute("data-level", homeState.level);
        emitBubbleStateChange();
    }

    function enterSublevel(category) {
        if (!subviews[category]) {
            return;
        }

        homeState.level = "sublevel";
        homeState.category = category;
        renderBubbleField();
    }

    function returnToRoot() {
        homeState.level = "root";
        homeState.category = null;
        renderBubbleField();
    }

    bubbleField.addEventListener("click", (event) => {
        const backButton = event.target.closest("[data-action='back']");
        if (backButton instanceof HTMLElement) {
            returnToRoot();
            return;
        }

        const bubbleButton = event.target.closest(".bubble-card[data-item-id]");
        if (!(bubbleButton instanceof HTMLElement)) {
            return;
        }

        const isInteractive = bubbleButton.dataset.interactive === "true";
        if (!isInteractive) {
            return;
        }

        const itemId = bubbleButton.dataset.itemId || "";
        const href = bubbleButton.dataset.href || "";

        if (homeState.level === "root") {
            enterSublevel(itemId);
            return;
        }

        if (href) {
            window.location.href = href;
        }
    });

    window.homeBubbleController = {
        getLevel() {
            return homeState.level;
        },
        getCategory() {
            return homeState.category;
        },
        enterSublevel,
        returnToRoot
    };

    renderBubbleField();
})();
