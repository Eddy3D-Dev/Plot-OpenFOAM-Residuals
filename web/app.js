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
    fileSummary: document.getElementById("file-summary"),
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

    elements.fileInput.addEventListener("change", async () => {
        await parseSelectedFiles();
        render();
    });

    for (const button of elements.tabButtons) {
        button.addEventListener("click", () => {
            const selectedTab = button.dataset.tab;
            if (!TAB_NAMES.includes(selectedTab)) {
                return;
            }
            state.activeTab = selectedTab;
            render();
        });
    }
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
    const cleanedRows = rawText.replaceAll("#", "").split(/\r?\n/);
    const parsedRows = cleanedRows
        .slice(1) // matches pandas skiprows=[0]
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

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
    const columnValues = Object.fromEntries(candidateColumns.map((name) => [name, []]));
    const timeValues = [];

    for (let rowIndex = 1; rowIndex < parsedRows.length; rowIndex += 1) {
        const fields = splitColumns(parsedRows[rowIndex]);
        if (fields.length === 0) {
            continue;
        }
        if (fields.length > header.length) {
            throw new Error(`Row ${rowIndex + 2} has more values than header columns.`);
        }

        const parsedTime = parseNumericValue(fields[timeIndex] || "");
        timeValues.push(parsedTime);

        for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
            if (columnIndex === timeIndex) {
                continue;
            }
            const columnName = header[columnIndex];
            const parsedValue = parseNumericValue(fields[columnIndex] || "");
            columnValues[columnName].push(parsedValue);
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
    renderAltairPanel();
    renderMatplotlibPanel();
    renderDataframePanel();
}

function renderTabs() {
    for (const button of elements.tabButtons) {
        button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
    }

    for (const [tabName, panel] of Object.entries(elements.tabPanels)) {
        panel.classList.toggle("is-active", tabName === state.activeTab);
    }
}

function renderSummary() {
    if (state.files.length === 0) {
        elements.fileSummary.textContent = "No files selected.";
        return;
    }

    const okCount = state.files.filter((file) => file.status === "ok").length;
    const errorCount = state.files.length - okCount;
    if (errorCount > 0) {
        elements.fileSummary.textContent = `${state.files.length} files selected: ${okCount} parsed, ${errorCount} failed.`;
    } else {
        elements.fileSummary.textContent = `${state.files.length} files selected and parsed.`;
    }
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
                gridcolor: "#e4eaed",
            },
        };

        Plotly.newPlot(plotHost, traces, layout, {
            responsive: true,
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
                range: [yRangeMin, 0],
                gridcolor: "#e4eaed",
            },
        };

        Plotly.newPlot(plotHost, traces, layout, {
            staticPlot: true,
            displayModeBar: false,
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
        const table = document.createElement("table");

        const headerRow = document.createElement("tr");
        const headers = ["Time", ...file.columns];
        for (const title of headers) {
            const th = document.createElement("th");
            th.textContent = title;
            headerRow.appendChild(th);
        }
        const thead = document.createElement("thead");
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        for (let index = 0; index < file.timeValues.length; index += 1) {
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

        table.appendChild(tbody);
        tableWrapper.appendChild(table);
        card.appendChild(tableWrapper);
        panel.appendChild(card);
    }
}

function buildCard(file) {
    const card = document.createElement("article");
    card.className = "result-card";

    if (state.showFilenames) {
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
    return line.split(/\s+/).filter((value) => value.length > 0);
}

function parseNumericValue(value) {
    if (!value) {
        return Number.NaN;
    }
    if (value.toUpperCase() === "N/A") {
        return Number.NaN;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function hasFiniteValue(values) {
    return values.some((value) => Number.isFinite(value));
}

function computeMinResidual(dataColumns) {
    let minValue = Number.POSITIVE_INFINITY;
    for (const values of Object.values(dataColumns)) {
        for (const value of values) {
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
    for (const value of timeValues) {
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
    return value.toString();
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
