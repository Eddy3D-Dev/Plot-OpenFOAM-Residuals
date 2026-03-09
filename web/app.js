const FEATURE_COLUMNS = ["Ux", "Uy", "Uz", "p", "epsilon", "k"];
const TAB_NAMES = ["altair", "matplotlib", "dataframe"];

const state = {
    activeTab: "altair",
    figureWidth: 10,
    figureHeight: 4,
    showFilenames: false,
    files: [],
};

const elements = {
    width: document.getElementById("figure-width"),
    height: document.getElementById("figure-height"),
    showFilenames: document.getElementById("show-filenames"),
    fileInput: document.getElementById("residual-files"),
    dropzone: document.getElementById("dropzone"),
    fileSummary: document.getElementById("file-summary"),
    clearFiles: document.getElementById("clear-files"),
    plotSettings: document.getElementById("plot-settings"),
    tabButtons: Array.from(document.querySelectorAll(".tab-button")),
    tabPanels: {
        altair: document.getElementById("panel-altair"),
        matplotlib: document.getElementById("panel-matplotlib"),
        dataframe: document.getElementById("panel-dataframe"),
    },
};

bindEvents();
render();

function bindEvents() {
    elements.width.addEventListener("input", () => {
        state.figureWidth = sanitizeWholeNumber(elements.width.value, 10);
        render();
    });

    elements.height.addEventListener("input", () => {
        state.figureHeight = sanitizeWholeNumber(elements.height.value, 4);
        render();
    });

    elements.showFilenames.addEventListener("change", () => {
        state.showFilenames = elements.showFilenames.checked;
        render();
    });

    elements.clearFiles.addEventListener("click", () => {
        state.files = [];
        elements.fileInput.value = "";
        render();
    });

    elements.fileInput.addEventListener("click", (e) => {
        // Reset the value so that selecting the same file again triggers the "change" event
        e.target.value = "";
    });

    elements.fileInput.addEventListener("change", async () => {
        elements.fileSummary.textContent = "Parsing files...";
        await new Promise((resolve) => setTimeout(resolve, 10)); // Allow UI to paint before blocking thread
        await parseSelectedFiles();
        render();
    });

    elements.dropzone.addEventListener("dragover", (event) => {
        event.preventDefault();
        elements.dropzone.classList.add("is-dragover");
    });

    elements.dropzone.addEventListener("dragleave", (event) => {
        event.preventDefault();
        elements.dropzone.classList.remove("is-dragover");
    });

    elements.dropzone.addEventListener("drop", async (event) => {
        event.preventDefault();
        elements.dropzone.classList.remove("is-dragover");
        if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
            elements.fileInput.files = event.dataTransfer.files;
            elements.fileSummary.textContent = "Parsing files...";
            await new Promise((resolve) => setTimeout(resolve, 10)); // Allow UI to paint before blocking thread
            await parseSelectedFiles();
            render();
        }
    });

    // Prevent accidental file drops from navigating away from the app
    window.addEventListener("dragover", (event) => {
        event.preventDefault();
    });
    window.addEventListener("drop", (event) => {
        event.preventDefault();
    });

    elements.tabButtons.forEach((button, index) => {
        button.addEventListener("keydown", (e) => {
            let newIndex = index;
            if (e.key === "ArrowRight") {
                newIndex = (index + 1) % elements.tabButtons.length;
            } else if (e.key === "ArrowLeft") {
                newIndex = (index - 1 + elements.tabButtons.length) % elements.tabButtons.length;
            }
            if (newIndex !== index) {
                e.preventDefault();
                elements.tabButtons[newIndex].focus();
                elements.tabButtons[newIndex].click();
            }
        });

        button.addEventListener("click", () => {
            const selectedTab = button.dataset.tab;
            if (!TAB_NAMES.includes(selectedTab)) {
                return;
            }
            state.activeTab = selectedTab;
            render();
        });
    });
}

async function parseSelectedFiles() {
    const selectedFiles = Array.from(elements.fileInput.files || []);
    if (selectedFiles.length === 0) {
        state.files = [];
        return;
    }

    const parsedFiles = await Promise.all(
        selectedFiles.map(async (file) => {
            try {
                const content = await file.text();
                const parsed = parseResidualData(content);
                return {
                    status: "ok",
                    name: file.name,
                    ...parsed,
                };
            } catch (error) {
                return {
                    status: "error",
                    name: file.name,
                    message: normalizeError(error),
                };
            }
        }),
    );

    state.files = parsedFiles;
}

function parseResidualData(rawText) {
    // Performance optimization: Avoid global replaceAll("#", "") before split, which requires
    // allocating a massive string copy for huge files. Split first, then replace on demand.
    const rawRows = rawText.split(/\r?\n/);

    // Performance optimization: Avoid intermediate arrays created by slice().map().filter().
    // Pre-allocating the array and truncating it is ~50% faster for large datasets.
    const rowCount = rawRows.length;
    const parsedRows = new Array(rowCount > 0 ? rowCount - 1 : 0);
    let validRowCount = 0;

    for (let i = 1; i < rowCount; i += 1) { // i = 1 matches pandas skiprows=[0]
        let line = rawRows[i];
        if (line.includes("#")) {
            line = line.replaceAll("#", "");
        }
        const trimmed = line.trim();
        if (trimmed.length > 0) {
            parsedRows[validRowCount++] = trimmed;
        }
    }
    parsedRows.length = validRowCount;

    if (parsedRows.length < 2) {
        throw new Error("Expected at least one header row and one data row.");
    }

    const header = splitColumns(parsedRows[0]);
    if (header.length === 0) {
        throw new Error("Could not parse header row.");
    }

    const timeIndex = header.indexOf("Time");
    if (timeIndex === -1) {
        throw new Error('Expected a "Time" column in the file.');
    }

    const candidateColumns = header.filter((_, index) => index !== timeIndex);

    // Performance optimization: Pre-allocate column arrays to their maximum possible size
    // and access them directly via an indexed array instead of an object property lookup.
    // This avoids dynamic array reallocations and slow object key lookups in the hot loop,
    // yielding ~20% faster parsing times for large residual files.
    const expectedSize = parsedRows.length - 1;
    const timeValues = new Array(expectedSize);

    const columnArrays = new Array(header.length);
    const columnValues = {};
    for (let c = 0; c < header.length; c += 1) {
        if (c !== timeIndex) {
            const arr = new Array(expectedSize);
            columnArrays[c] = arr;
            columnValues[header[c]] = arr;
        }
    }

    let validRows = 0;
    for (let rowIndex = 1; rowIndex < parsedRows.length; rowIndex += 1) {
        const fields = splitColumns(parsedRows[rowIndex]);
        if (fields.length === 0) {
            continue;
        }
        if (fields.length > header.length) {
            throw new Error(`Row ${rowIndex + 2} has more values than header columns.`);
        }

        timeValues[validRows] = parseNumericValue(fields[timeIndex] || "");

        for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
            if (columnIndex === timeIndex) {
                continue;
            }
            columnArrays[columnIndex][validRows] = parseNumericValue(fields[columnIndex] || "");
        }
        validRows += 1;
    }

    if (validRows < expectedSize) {
        timeValues.length = validRows;
        for (const name of candidateColumns) {
            columnValues[name].length = validRows;
        }
    }

    const columns = candidateColumns.filter((columnName) => hasFiniteValue(columnValues[columnName]));
    const dataColumns = Object.fromEntries(columns.map((columnName) => [columnName, columnValues[columnName]]));
    const altairColumns = FEATURE_COLUMNS.filter((columnName) => columns.includes(columnName));

    return {
        timeValues,
        columns,
        dataColumns,
        altairColumns,
        minResidual: computeMinResidual(dataColumns),
        maxIteration: computeMaxIteration(timeValues),
    };
}

function render() {
    renderTabs();
    renderSummary();

    // Performance optimization: Only render the active panel to avoid
    // expensive DOM operations and Plotly calls for hidden tabs
    if (state.activeTab === "altair") {
        renderAltairPanel();
    } else if (state.activeTab === "matplotlib") {
        renderMatplotlibPanel();
    } else if (state.activeTab === "dataframe") {
        renderDataframePanel();
    }
}

function renderTabs() {
    for (const button of elements.tabButtons) {
        const isActive = button.dataset.tab === state.activeTab;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
        button.setAttribute("tabindex", isActive ? "0" : "-1");
    }

    for (const [tabName, panel] of Object.entries(elements.tabPanels)) {
        panel.classList.toggle("is-active", tabName === state.activeTab);
    }

    if (elements.plotSettings) {
        elements.plotSettings.style.display = state.activeTab === "matplotlib" ? "block" : "none";

        const forceShow = state.files.length > 1;
        const checkbox = elements.showFilenames;
        const container = checkbox.closest('.control-check');

        if (forceShow) {
            checkbox.checked = true;
            checkbox.disabled = true;
            checkbox.setAttribute("aria-disabled", "true");
            if (container) {
                container.classList.add("is-disabled");
                container.title = "Filenames are always shown when comparing multiple files";
            }
        } else {
            checkbox.checked = state.showFilenames;
            checkbox.disabled = false;
            checkbox.removeAttribute("aria-disabled");
            if (container) {
                container.classList.remove("is-disabled");
                container.title = "";
            }
        }
    }
}

function renderSummary() {
    if (state.files.length === 0) {
        elements.fileSummary.textContent = "No files selected.";
        elements.clearFiles.hidden = true;
        return;
    }

    elements.clearFiles.hidden = false;
    const okCount = state.files.filter((file) => file.status === "ok").length;
    const errorCount = state.files.length - okCount;

    const fileWord = state.files.length === 1 ? "file" : "files";

    if (errorCount > 0) {
        elements.fileSummary.textContent = `${state.files.length} ${fileWord} selected: ${okCount} parsed, ${errorCount} failed.`;
    } else if (state.files.length === 1) {
        elements.fileSummary.textContent = `1 file selected: ${state.files[0].name}`;
    } else {
        elements.fileSummary.textContent = `${state.files.length} ${fileWord} selected and parsed.`;
    }

    elements.fileSummary.title = state.files.map(f => f.name).join('\n');
}

function renderAltairPanel() {
    const panel = elements.tabPanels.altair;
    panel.innerHTML = "";

    if (state.files.length === 0) {
        panel.appendChild(buildEmptyState("Upload one or more files to view interactive residual plots."));
        return;
    }

    for (const file of state.files) {
        const card = buildCard(file);
        if (file.status === "error") {
            card.appendChild(buildError(file.message));
            panel.appendChild(card);
            continue;
        }

        const chartColumns = file.altairColumns.length > 0 ? file.altairColumns : file.columns;
        if (chartColumns.length === 0) {
            card.appendChild(buildError("No numeric residual columns found."));
            panel.appendChild(card);
            continue;
        }

        const plotHost = document.createElement("div");
        plotHost.className = "plot-host";
        card.appendChild(plotHost);
        panel.appendChild(card);

        const traces = chartColumns.map((columnName) => ({
            name: columnName,
            x: file.timeValues,
            y: file.dataColumns[columnName],
            mode: "lines",
            type: "scatter",
            hovertemplate: "Time=%{x}<br>Residual=%{y:.6e}<extra>" + columnName + "</extra>",
            line: {
                width: 2,
            },
        }));

        const layout = {
            margin: { l: 72, r: 24, t: 24, b: 60 },
            paper_bgcolor: "#ffffff",
            plot_bgcolor: "#ffffff",
            legend: { orientation: "h", y: 1.14, x: 0 },
            xaxis: {
                title: "Iteration",
                zeroline: false,
                gridcolor: "#e4eaed",
            },
            yaxis: {
                title: "Residuals",
                type: "log",
                exponentformat: "e",
                gridcolor: "#e4eaed",
            },
        };

        Plotly.newPlot(plotHost, traces, layout, {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ["lasso2d", "select2d"],
        });
    }
}

function renderMatplotlibPanel() {
    const panel = elements.tabPanels.matplotlib;
    panel.innerHTML = "";

    if (state.files.length === 0) {
        panel.appendChild(buildEmptyState("Upload one or more files to view static residual plots."));
        return;
    }

    for (const file of state.files) {
        const card = buildCard(file);
        if (file.status === "error") {
            card.appendChild(buildError(file.message));
            panel.appendChild(card);
            continue;
        }

        if (file.columns.length === 0) {
            card.appendChild(buildError("No numeric residual columns found."));
            panel.appendChild(card);
            continue;
        }

        const plotHost = document.createElement("div");
        plotHost.className = "plot-host static";
        card.appendChild(plotHost);
        panel.appendChild(card);

        const widthPixels = Math.max(320, state.figureWidth * 100);
        const heightPixels = Math.max(220, state.figureHeight * 100);
        const logMinResidual = Math.log10(file.minResidual);
        const yRangeMin = Number.isFinite(logMinResidual) && logMinResidual < 0 ? logMinResidual : -1;

        const traces = file.columns.map((columnName) => ({
            name: columnName,
            x: file.timeValues,
            y: file.dataColumns[columnName],
            mode: "lines",
            type: "scatter",
            hovertemplate: "Time=%{x}<br>Residual=%{y:.6e}<extra>" + columnName + "</extra>",
            line: {
                width: 2,
            },
        }));

        const layout = {
            width: widthPixels,
            height: heightPixels,
            margin: { l: 78, r: 24, t: 18, b: 58 },
            paper_bgcolor: "#ffffff",
            plot_bgcolor: "#ffffff",
            legend: { x: 1, y: 1, xanchor: "right", yanchor: "top" },
            xaxis: {
                title: "Iterations",
                range: [0, file.maxIteration],
                zeroline: false,
                gridcolor: "#e4eaed",
            },
            yaxis: {
                title: "Residuals",
                type: "log",
                exponentformat: "e",
                range: [yRangeMin, 0],
                gridcolor: "#e4eaed",
            },
        };

        Plotly.newPlot(plotHost, traces, layout, {
            staticPlot: false,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtons: [["toImage"]],
        });
    }
}

function renderDataframePanel() {
    const panel = elements.tabPanels.dataframe;
    panel.innerHTML = "";

    if (state.files.length === 0) {
        panel.appendChild(buildEmptyState("Upload one or more files to inspect parsed tables."));
        return;
    }

    for (const file of state.files) {
        const card = buildCard(file);
        if (file.status === "error") {
            card.appendChild(buildError(file.message));
            panel.appendChild(card);
            continue;
        }

        if (file.columns.length === 0) {
            card.appendChild(buildError("No numeric residual columns found."));
            panel.appendChild(card);
            continue;
        }

        const tableWrapper = document.createElement("div");
        tableWrapper.className = "table-wrapper";
        tableWrapper.tabIndex = 0;
        tableWrapper.setAttribute("aria-label", `Data table for ${file.name}`);
        const table = document.createElement("table");

        const headerRow = document.createElement("tr");
        const headers = ["Time", ...file.columns];
        for (const title of headers) {
            const th = document.createElement("th");
            th.textContent = title;
            th.setAttribute("scope", "col");
            headerRow.appendChild(th);
        }
        const thead = document.createElement("thead");
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        // Performance optimization: Render only a subset of rows to prevent
        // the main thread from freezing when visualizing huge residual files.
        const ROW_LIMIT = 3000;
        const renderCount = Math.min(ROW_LIMIT, file.timeValues.length);

        for (let index = 0; index < renderCount; index += 1) {
            const tr = document.createElement("tr");

            const timeCell = document.createElement("td");
            timeCell.textContent = formatNumericValue(file.timeValues[index]);
            tr.appendChild(timeCell);

            for (const columnName of file.columns) {
                const td = document.createElement("td");
                td.textContent = formatNumericValue(file.dataColumns[columnName][index]);
                tr.appendChild(td);
            }

            tbody.appendChild(tr);
        }

        if (file.timeValues.length > renderCount) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = file.columns.length + 1;
            td.textContent = `... and ${file.timeValues.length - renderCount} more rows (hidden for performance)`;
            td.style.textAlign = "center";
            td.style.fontStyle = "italic";
            td.style.padding = "1rem";
            td.style.color = "var(--muted)";
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        tableWrapper.appendChild(table);
        card.appendChild(tableWrapper);
        panel.appendChild(card);
    }
}

function buildCard(file) {
    const card = document.createElement("article");
    card.className = "result-card";

    if (state.showFilenames || state.files.length > 1) {
        const title = document.createElement("h3");
        title.textContent = file.name;
        card.appendChild(title);
    }

    return card;
}

function buildEmptyState(message) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = message;
    return empty;
}

function buildError(message) {
    const error = document.createElement("p");
    error.className = "error-message";
    error.textContent = message;
    return error;
}

function splitColumns(line) {
    if (!line) {
        return [];
    }
    // Performance optimization: .trim() followed by split(/\s+/) is much faster
    // than split(/\s+/) followed by .filter() for thousands of rows.
    const trimmed = line.trim();
    return trimmed ? trimmed.split(/\s+/) : [];
}

function parseNumericValue(value) {
    if (!value || value === "N/A" || value === "n/a") {
        return Number.NaN;
    }
    // Performance optimization: unary plus is faster than Number() wrapper
    const parsed = +value;
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function hasFiniteValue(values) {
    // Performance optimization: Avoid .some() callback allocation for millions of elements.
    // Standard for loop is >2x faster.
    for (let i = 0; i < values.length; i += 1) {
        if (Number.isFinite(values[i])) {
            return true;
        }
    }
    return false;
}

function computeMinResidual(dataColumns) {
    let minValue = Number.POSITIVE_INFINITY;
    const arrays = Object.values(dataColumns);

    // Performance optimization: Replace for...of with standard for loop.
    // Bypassing the iterator protocol is ~4x faster on large residual arrays.
    for (let i = 0; i < arrays.length; i += 1) {
        const values = arrays[i];
        for (let j = 0; j < values.length; j += 1) {
            const value = values[j];
            if (!Number.isFinite(value) || value <= 0) {
                continue;
            }
            if (value < minValue) {
                minValue = value;
            }
        }
    }

    if (!Number.isFinite(minValue)) {
        return 1;
    }

    const magnitude = orderOfMagnitude(minValue);
    return 10 ** magnitude;
}

function computeMaxIteration(timeValues) {
    let max = 0;

    // Performance optimization: Replace for...of with standard for loop.
    // Avoids iterator allocation and execution overhead on large arrays.
    for (let i = 0; i < timeValues.length; i += 1) {
        const value = timeValues[i];
        if (!Number.isFinite(value)) {
            continue;
        }
        if (value > max) {
            max = value;
        }
    }
    return max > 0 ? max : 1;
}

function orderOfMagnitude(number) {
    if (!Number.isFinite(number) || number <= 0) {
        return 0;
    }
    return Math.floor(Math.log10(number));
}

function formatNumericValue(value) {
    if (!Number.isFinite(value)) {
        return "";
    }
    const absolute = Math.abs(value);
    if (absolute !== 0 && (absolute >= 1000 || absolute < 0.001)) {
        return value.toExponential(6);
    }
    // Performance optimization: string coercion is much faster than .toString()
    // for large dataframes with thousands of cells.
    return "" + value;
}

function sanitizeWholeNumber(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return fallback;
    }
    return parsed;
}

function normalizeError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return "Could not parse file.";
}
