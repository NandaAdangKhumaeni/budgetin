// Shared colour theme for the web app and the Android WebView bundle.
// The preference is local to the device and works without a network connection.
(function () {
    const storageKey = "budgetin_theme";
    const root = document.documentElement;

    function getTheme() {
        const savedTheme = localStorage.getItem(storageKey);

        if (savedTheme === "light" || savedTheme === "dark") {
            return savedTheme;
        }

        return window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    }

    function applyTheme(theme) {
        root.dataset.theme = theme;
        localStorage.setItem(storageKey, theme);

        // Present only inside the Android app. It keeps the native status and
        // navigation bars aligned with the web interface.
        if (window.BudgetinNative && window.BudgetinNative.setDark) {
            window.BudgetinNative.setDark(theme === "dark");
        }

        const toggle = document.querySelector(".theme-toggle");
        if (toggle) {
            const dark = theme === "dark";
            toggle.textContent = dark ? "☀" : "☾";
            toggle.setAttribute("aria-label", dark ? "Gunakan tema terang" : "Gunakan tema gelap");
            toggle.setAttribute("title", dark ? "Tema terang" : "Tema gelap");
            toggle.setAttribute("aria-pressed", String(dark));
        }

        syncCharts(theme);
    }

    function syncCharts(theme) {
        if (!window.Chart) return;

        const textColor = theme === "dark" ? "#cbd5e1" : "#475569";
        const gridColor = theme === "dark" ? "#2a3a54" : "#e8edf4";
        window.Chart.defaults.color = textColor;

        Object.values(window.Chart.instances || {}).forEach(function (chart) {
            const options = chart.options || {};
            if (options.plugins && options.plugins.legend && options.plugins.legend.labels) {
                options.plugins.legend.labels.color = textColor;
            }
            if (options.scales) {
                Object.values(options.scales).forEach(function (scale) {
                    if (scale.ticks) scale.ticks.color = textColor;
                    if (scale.grid) scale.grid.color = gridColor;
                });
            }
            chart.update();
        });
    }

    // Applied immediately to avoid a white flash while the page loads.
    applyTheme(getTheme());

    function mountToggle() {
        if (document.querySelector(".theme-toggle")) return;

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "theme-toggle";
        toggle.addEventListener("click", function () {
            applyTheme(root.dataset.theme === "dark" ? "light" : "dark");
        });

        const header = document.querySelector("header");
        if (header) {
            const profile = header.querySelector(".profile");
            header.insertBefore(toggle, profile || null);
        } else {
            toggle.classList.add("theme-toggle-login");
            document.body.appendChild(toggle);
        }

        applyTheme(root.dataset.theme);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mountToggle);
    } else {
        mountToggle();
    }
})();
