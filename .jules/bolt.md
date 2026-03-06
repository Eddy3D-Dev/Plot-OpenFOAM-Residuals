## 2024-02-28 - Fast string and number operations
**Learning:** In loops processing thousands or millions of elements (like parsing large physics simulation files), avoiding small allocations and using internal operations is incredibly beneficial. `.toString()` involves a function call which is slower than string coercion `"" + x`. Creating new string allocations for every string by using `.toUpperCase()` should be avoided if we only have a few hardcoded comparison values, just check them explicitly. Using `+value` is faster than `Number(value)` as it drops the wrapper constructor/call. Also `.trim().split(/\s+/)` avoids a full `.filter()` pass and intermediate empty strings when splitting padded values.
**Action:** Always prefer `"" + val` over `.toString()`, `+val` over `Number(val)`, explicit equality checks over `.toUpperCase()` when possible, and avoid unnecessary array iterations like `.filter(Boolean)` after `.split()` by trimming first.

## 2024-03-01 - Avoid eager rendering of hidden heavy UI components
**Learning:** Found an architectural bottleneck where all three complex visual tabs (Altair/Plotly, Matplotlib/Plotly-static, and a large Dataframe HTML table) were eagerly re-rendering simultaneously on any state change, even when they were hidden. This caused significant lag for large simulation files because heavy DOM manipulation and Plotly graph generation were executed unnecessarily.
**Action:** Only render the active tab when dealing with heavy UI elements. Use a lazy rendering approach where hidden panels aren't unnecessarily populated or recalculated on state changes.

## 2026-03-01 - Optimize JavaScript array mapping/filtering for large arrays
**Learning:** In operations that process huge arrays (like files with 500k lines), chaining `.slice(1).map().filter()` is disastrous for performance. It iterates over the massive array multiple times and creates several intermediate arrays that max out memory and trigger garbage collection pauses. Pre-allocating the final array to its max expected size and using a single `for` loop to filter and mutate is significantly faster (over 50% speedup).
**Action:** For loops exceeding ~10k elements, avoid chained declarative array methods. Instead, initialize a pre-allocated array (e.g., `new Array(size)`) and use a single standard `for` loop to manually populate it. Then manually truncate the array to the valid length.

## 2026-03-03 - HTML Table DOM Rendering Bottleneck
**Learning:** Rendering massive HTML tables directly in the DOM via `document.createElement` for every cell freezes the main thread. A 20k-row table takes ~2000ms+ to render and blocks all UI interaction. String concatenation vs. DOM nodes matters less than the sheer volume of elements being appended to the live document.
**Action:** Always implement a simple row limit (virtualization/pagination) when rendering raw tabular data containing potentially thousands of rows. Displaying the first ~500 rows is instant (~5ms) and provides the same utility for raw data inspection without freezing the browser.

## 2026-03-03 - Optimize object property lookups in hot loops
**Learning:** Accessing properties by string key (`columnValues[columnName]`) inside a loop executing millions of times (e.g., parsing columns for 500k rows) is noticeably slower than array index access. Pre-allocating the column arrays and caching their references in an array indexed by column index (`columnArrays[columnIndex]`) yielded a significant ~20% speedup.
**Action:** When parsing large CSV/DAT files, pre-allocate destination arrays to their expected maximum size based on row count, and cache property lookups into indexed arrays before entering the hot loop.

## 2026-03-05 - Avoid Global String Operations on Massive Text
**Learning:** Calling `.replaceAll("#", "")` on the entire 100MB+ raw text string of a residual file before splitting it into lines creates massive intermediate string copies, significantly inflating memory usage and processing time in the browser. Furthermore, naively extracting regex to precompiled constants like `/\s+/` provides no measurable performance benefit in modern V8 engines because they already compile and cache regex literals automatically.
**Action:** When parsing huge files, split the raw text into an array of lines first, and then apply string replacement operations (like removing `#`) strictly on a line-by-line basis within the parsing loop. Avoid micro-optimizing regex literals unless profiling proves an issue.

## 2026-03-05 - Avoid iterator and callback overhead in massive arrays
**Learning:** Using `for...of` loops, or array methods that take callbacks like `.some()`, introduces noticeable overhead when iterating over extremely large arrays (e.g., millions of elements in residual data). The iterator protocol allocation in `for...of` and the callback creation/execution in `.some()` make these operations 2x to 4x slower compared to standard `for` loops in hot paths.
**Action:** When performing critical data iterations over arrays expected to contain hundreds of thousands or millions of elements (like finding max/min values), default to standard `for (let i = 0; i < length; i++)` loops instead of declarative methods or `for...of` to avoid iterator and function call overhead.
