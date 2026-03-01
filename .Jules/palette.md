## 2024-05-15 - Add ARIA Roles and properties for custom tabs
**Learning:** When building custom tab components using buttons, standard ARIA roles (`role="tablist"`, `role="tab"`, `role="tabpanel"`) and properties (`aria-selected`, `aria-controls`, `aria-labelledby`) are necessary so screen readers can properly identify the UI structure and its current state. Visual indicators like `is-active` alone are insufficient for accessibility.
**Action:** Always verify custom interactive components (like tabs) with keyboard navigation and ensure ARIA properties sync with visual states dynamically in JavaScript. Include `:focus-visible` styles so keyboard users can navigate confidently.

## 2024-05-16 - Accessible Custom File Upload Inputs
**Learning:** Replacing default `<input type="file">` elements with custom styled `<label>` triggers is a common pattern, but hiding the input with `display: none` or `visibility: hidden` removes it from the keyboard focus order and screen reader accessibility tree, completely breaking accessibility.
**Action:** To create accessible custom file inputs, visually hide the input using an `.sr-only` utility class (clipping). Ensure the input comes *before* the label in the DOM, so that keyboard focus styles can be applied to the custom label using the adjacent sibling selector (`input:focus-visible + label`).## 2026-03-01 - Add download buttons and format yaxis
**Learning:** Plotly log axes use SI prefixes by default (like \mu) which are not standard in CFD residual plots.
**Action:** Use exponentformat: 'e' to enforce standard scientific notation. Also, to show the download button on a 'static' plot, set staticPlot: false, displayModeBar: true, and limit modeBarButtons to [['toImage']].

## 2024-10-24 - Conditional UI Elements
**Learning:** Showing settings or configuration options that do not apply to the currently active view or state can cause user confusion and clutter the interface.
**Action:** Always conditionally hide UI elements (like plot settings) when they are not relevant to the user's current context (e.g., hiding static plot settings when viewing an interactive plot tab).
