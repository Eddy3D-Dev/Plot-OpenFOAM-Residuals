const FEATURE_COLUMNS = ["Ux", "Uy", "Uz", "p", "epsilon", "k"];
const TAB_NAMES = ["altair", "matplotlib", "dataframe"];

const state = {
    activeTab: "altair",
    figureWidth: 10,
    figureHeight: 4,
    showFilenames: false,
    showGrid: true,
    files: [],
};

const elements = {
    width: document.getElementById("figure-width"),
    height: document.getElementById("figure-height"),
    showFilenames: document.getElementById("show-filenames"),
    showGrid: document.getElementById("show-grid"),
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

    elements.width.addEventListener("blur", () => {
        elements.width.value = state.figureWidth;
    });

    elements.height.addEventListener("input", () => {
        state.figureHeight = sanitizeWholeNumber(elements.height.value, 4);
        render();
    });

    elements.height.addEventListener("blur", () => {
        elements.height.value = state.figureHeight;
    });

    elements.showFilenames.addEventListener("change", () => {
        state.showFilenames = elements.showFilenames.checked;
        render();
    });

    if (elements.showGrid) {
        elements.showGrid.addEventListener("change", () => {
            state.showGrid = elements.showGrid.checked;
            render();
        });
    }

    let clearConfirmTimeout;
    elements.clearFiles.addEventListener("click", () => {
        const isConfirming = elements.clearFiles.classList.contains("is-confirming");
        const span = elements.clearFiles.querySelector("span");

        if (isConfirming) {
            clearTimeout(clearConfirmTimeout);
            elements.clearFiles.classList.remove("is-confirming");
            span.textContent = "Clear";
            elements.clearFiles.setAttribute("aria-label", "Clear all files");
            state.files = [];
            elements.fileInput.value = "";
            render();
            elements.fileInput.focus();
        } else {
            elements.clearFiles.classList.add("is-confirming");
            span.textContent = "Are you sure?";
            elements.clearFiles.setAttribute("aria-label", "Confirm clearing all files");
            clearConfirmTimeout = setTimeout(() => {
                elements.clearFiles.classList.remove("is-confirming");
                span.textContent = "Clear";
                elements.clearFiles.setAttribute("aria-label", "Clear all files");
            }, 3000);
        }
    });

    elements.clearFiles.addEventListener("blur", () => {
        const isConfirming = elements.clearFiles.classList.contains("is-confirming");
        if (isConfirming) {
            clearTimeout(clearConfirmTimeout);
            const span = elements.clearFiles.querySelector("span");
            elements.clearFiles.classList.remove("is-confirming");
            span.textContent = "Clear";
            elements.clearFiles.setAttribute("aria-label", "Clear all files");
        }
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

    // Allow dropping files anywhere on the window
    window.addEventListener("dragover", (event) => {
        event.preventDefault();
        elements.dropzone.classList.add("is-dragover");
    });

    window.addEventListener("dragleave", (event) => {
        event.preventDefault();
        // Remove highlight only when the cursor leaves the browser window
        if (event.relatedTarget === null) {
            elements.dropzone.classList.remove("is-dragover");
        }
    });

    window.addEventListener("drop", async (event) => {
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

    elements.tabButtons.forEach((button, index) => {
        button.addEventListener("keydown", (e) => {
            let newIndex = index;
            if (e.key === "ArrowRight") {
                newIndex = (index + 1) % elements.tabButtons.length;
            } else if (e.key === "ArrowLeft") {
                newIndex = (index - 1 + elements.tabButtons.length) % elements.tabButtons.length;
            } else if (e.key === "Home") {
                newIndex = 0;
            } else if (e.key === "End") {
                newIndex = elements.tabButtons.length - 1;
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
                const parsed = parseResidualData(content, file.name);
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

function parseResidualData(rawText, fileName = "") {
    const likelyFormat = detectLikelyFormat(rawText, fileName);
    const primaryParser = likelyFormat === "dat" ? parseResidualDat : parseOpenFoamLog;
    const fallbackParser = likelyFormat === "dat" ? parseOpenFoamLog : parseResidualDat;

    try {
        return buildParsedOutput(primaryParser(rawText));
    } catch (primaryError) {
        try {
            return buildParsedOutput(fallbackParser(rawText));
        } catch {
            throw primaryError;
        }
    }
}

function detectLikelyFormat(rawText, fileName = "") {
    const lowerName = fileName.toLowerCase();
    const preferDatByName = lowerName.endsWith(".dat");
    const preferLogByName = lowerName.endsWith(".log") || lowerName.endsWith(".out") || lowerName.endsWith(".txt");
    const hasDatHeader = /^\s*#\s*Time(?:\s|$)/m.test(rawText);
    const hasLogTime = /(?:^|\n)\s*Time\s*=\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/m.test(rawText);
    const hasSolveMarker = /Solving for\s+[^,]+,\s*Initial residual\s*=/m.test(rawText);
    const looksLikeLog = hasLogTime || hasSolveMarker;

    if (looksLikeLog && !hasDatHeader) {
        return "log";
    }
    if (hasDatHeader && !looksLikeLog) {
        return "dat";
    }
    if (preferDatByName) {
        return "dat";
    }
    if (preferLogByName) {
        return "log";
    }
    return "log";
}

function buildParsedOutput(parsed) {
    const { timeValues, columnValues } = parsed;
    const candidateColumns = Object.keys(columnValues);
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

function parseResidualDat(rawText) {
    const rawRows = rawText.split(/\r?\n/);
    let header = null;

    for (let index = 0; index < rawRows.length; index += 1) {
        const line = rawRows[index];
        if (/^\s*#\s*Time(?:\s|$)/.test(line)) {
            header = splitColumns(line.replaceAll("#", " "));
            break;
        }
    }

    if (!header || header.length === 0) {
        throw new Error('Expected a "# Time" header row in the file.');
    }

    const timeIndex = header.indexOf("Time");
    if (timeIndex === -1) {
        throw new Error('Expected a "Time" column in the file.');
    }

    const timeValues = [];
    const columnValues = {};
    for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
        if (columnIndex === timeIndex) {
            continue;
        }
        columnValues[header[columnIndex]] = [];
    }

    for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
        const trimmed = rawRows[rowIndex].trim();
        if (trimmed.length === 0 || trimmed.startsWith("#")) {
            continue;
        }

        const fields = splitColumns(trimmed);
        if (fields.length > header.length) {
            throw new Error(`Data row ${rowIndex + 1} has more values than header columns.`);
        }

        timeValues.push(parseNumericValue(fields[timeIndex] || ""));

        for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
            if (columnIndex === timeIndex) {
                continue;
            }
            const columnName = header[columnIndex];
            columnValues[columnName].push(parseNumericValue(fields[columnIndex] || ""));
        }
    }

    if (timeValues.length === 0) {
        throw new Error("No data rows found in this .dat file.");
    }

    return { timeValues, columnValues };
}

function parseOpenFoamLog(rawText) {
    const timePattern = /^\s*Time\s*=\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*$/;
    const solvePattern = /Solving for\s+([^,]+),\s*Initial residual\s*=\s*([^,]+),/;
    const hasExplicitTimeMarkers = /(?:^|\n)\s*Time\s*=\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*(?:\n|$)/m.test(rawText);
    const rows = [];
    const indices = [];
    let currentRow = null;
    let currentIndex = null;
    let fallbackIndex = 0;

    const flushCurrentRow = () => {
        if (!currentRow || Object.keys(currentRow).length === 0) {
            return;
        }
        rows.push(currentRow);
        if (Number.isFinite(currentIndex)) {
            indices.push(currentIndex);
        } else {
            indices.push(fallbackIndex);
            fallbackIndex += 1;
        }
    };

    const lines = rawText.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const timeMatch = line.match(timePattern);
        if (timeMatch) {
            flushCurrentRow();
            currentRow = {};
            const parsedTime = Number.parseFloat(timeMatch[1]);
            currentIndex = Number.isFinite(parsedTime) ? parsedTime : null;
            continue;
        }

        const solveMatch = line.match(solvePattern);
        if (!solveMatch) {
            continue;
        }

        if (currentRow === null) {
            currentRow = {};
            currentIndex = null;
        }

        const field = solveMatch[1].trim();
        const residual = Number.parseFloat(solveMatch[2].trim());
        if (!Number.isFinite(residual)) {
            continue;
        }

        if (Object.prototype.hasOwnProperty.call(currentRow, field)) {
            if (hasExplicitTimeMarkers) {
                // In explicit-time logs, keep a single row per time and ignore duplicate
                // solves for the same field within that step.
                continue;
            }
            // In logs without explicit time lines, treat repeated fields as row boundaries.
            flushCurrentRow();
            currentRow = {};
            currentIndex = null;
        }

        currentRow[field] = residual;
    }

    flushCurrentRow();

    if (rows.length === 0) {
        throw new Error("No OpenFOAM residual entries were found in this log file.");
    }

    const fieldNames = [];
    const fieldSet = new Set();
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        for (const field of Object.keys(row)) {
            if (!fieldSet.has(field)) {
                fieldSet.add(field);
                fieldNames.push(field);
            }
        }
    }

    const columnValues = Object.fromEntries(
        fieldNames.map((field) => [field, new Array(rows.length).fill(Number.NaN)]),
    );

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        for (const [field, value] of Object.entries(row)) {
            columnValues[field][rowIndex] = value;
        }
    }

    return { timeValues: indices, columnValues };
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

        if (elements.showGrid) {
            elements.showGrid.checked = state.showGrid;
        }
    }
}

function renderSummary() {
    const baseTitle = "Plot OpenFOAM Residuals";

    if (state.files.length === 0) {
        elements.fileSummary.textContent = "No files selected.";
        elements.clearFiles.hidden = true;
        document.title = baseTitle;
        return;
    }

    elements.clearFiles.hidden = false;
    const okCount = state.files.filter((file) => file.status === "ok").length;
    const errorCount = state.files.length - okCount;

    const fileWord = state.files.length === 1 ? "file" : "files";
    let newTitle = baseTitle;

    if (errorCount > 0) {
        elements.fileSummary.textContent = `${state.files.length} ${fileWord} selected: ${okCount} parsed, ${errorCount} failed.`;
        newTitle = `⚠️ Error - ${newTitle}`;
    } else if (state.files.length === 1) {
        elements.fileSummary.textContent = `1 file selected: ${state.files[0].name}`;
        newTitle = `${state.files[0].name} - ${newTitle}`;
    } else {
        elements.fileSummary.textContent = `${state.files.length} ${fileWord} selected and parsed.`;
        newTitle = `(${state.files.length}) Files - ${newTitle}`;
    }

    elements.fileSummary.title = state.files.map(f => f.name).join('\n');
    document.title = newTitle;
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
                showgrid: state.showGrid,
                gridcolor: state.showGrid ? "#e4eaed" : undefined,
            },
            yaxis: {
                title: "Residuals",
                type: "log",
                exponentformat: "e",
                range: [yRangeMin, 0],
                showgrid: state.showGrid,
                gridcolor: state.showGrid ? "#e4eaed" : undefined,
            },
        };

        Plotly.newPlot(plotHost, traces, layout, {
            staticPlot: true,
            displayModeBar: false,
            displaylogo: false,
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
    const empty = document.createElement("div");
    empty.className = "empty-state";

    const icon = document.createElement("span");
    icon.className = "empty-state-icon";
    icon.innerHTML = '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>';

    const text = document.createElement("p");
    text.textContent = message;

    empty.appendChild(icon);
    empty.appendChild(text);
    return empty;
}

function buildError(message) {
    const error = document.createElement("p");
    error.className = "error-message";
    error.setAttribute("role", "alert");

    const icon = document.createElement("span");
    icon.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';

    const textNode = document.createTextNode(message);

    error.appendChild(icon);
    error.appendChild(textNode);
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
