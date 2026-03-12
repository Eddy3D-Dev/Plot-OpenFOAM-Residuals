## 2024-05-15 - Add ARIA Roles and properties for custom tabs
**Learning:** When building custom tab components using buttons, standard ARIA roles (`role="tablist"`, `role="tab"`, `role="tabpanel"`) and properties (`aria-selected`, `aria-controls`, `aria-labelledby`) are necessary so screen readers can properly identify the UI structure and its current state. Visual indicators like `is-active` alone are insufficient for accessibility.
**Action:** Always verify custom interactive components (like tabs) with keyboard navigation and ensure ARIA properties sync with visual states dynamically in JavaScript. Include `:focus-visible` styles so keyboard users can navigate confidently.

## 2024-05-16 - Accessible Custom File Upload Inputs
**Learning:** Replacing default `<input type="file">` elements with custom styled `<label>` triggers is a common pattern, but hiding the input with `display: none` or `visibility: hidden` removes it from the keyboard focus order and screen reader accessibility tree, completely breaking accessibility.
**Action:** To create accessible custom file inputs, visually hide the input using an `.sr-only` utility class (clipping). Ensure the input comes *before* the label in the DOM, so that keyboard focus styles can be applied to the custom label using the adjacent sibling selector (`input:focus-visible + label`).## 2026-03-01 - Add download buttons and format yaxis
**Learning:** Plotly log axes use SI prefixes by default (like \mu) which are not standard in CFD residual plots.
**Action:** Use exponentformat: 'e' to enforce standard scientific notation. Also, to show the download button on a 'static' plot, set staticPlot: false, displayModeBar: true, and limit modeBarButtons to [['toImage']].

## 2026-03-01 - Native drag and drop on file inputs
**Learning:** When implementing a custom drag and drop area for a file upload, users expect visual feedback. Moreover, the easiest and most robust way to process dropped files and keep the `<input type="file">` synchronized is to directly assign `event.dataTransfer.files` to the `files` property of the input element, which triggers native behaviour properly and respects modern API standards.
**Action:** Add `dragover`, `dragleave`, and `drop` event listeners on the dropzone element to manage an `.is-dragover` state, and directly assign `dataTransfer.files` to the underlying `input.files` property upon drop.

## 2024-10-24 - Conditional UI Elements
**Learning:** Showing settings or configuration options that do not apply to the currently active view or state can cause user confusion and clutter the interface.
**Action:** Always conditionally hide UI elements (like plot settings) when they are not relevant to the user's current context (e.g., hiding static plot settings when viewing an interactive plot tab).

## 2024-06-15 - Announcing dynamic text updates with aria-live
**Learning:** Screen readers won't automatically announce text that updates dynamically after a user interaction (like file parsing results or error states).
**Action:** Always add `aria-live="polite"` to status elements (e.g. `#file-summary`) that update asynchronously, so screen reader users receive important feedback without needing to navigate manually to the changed content.

## 2026-03-04 - Dataframe Keyboard Scroll Accessibility
**Learning:** Tables nested in scrollable containers (`overflow: auto`) are inaccessible to keyboard users because they cannot be focused to scroll unless they contain focusable elements or the container itself is focusable. This pattern is common for responsive tables but often misses keyboard accessibility.
**Action:** Always add `tabindex="0"`, a visible focus state, and an appropriate `aria-label` to scrollable wrapper elements containing tables so keyboard users can scroll through the data.

## 2026-03-05 - File Parsing UI Feedback Blocked by Main Thread
**Learning:** Browsers defer UI updates when the main thread is blocked by synchronous data processing (like parsing large residual files in a vanilla JS hot loop). Even if the file selection is in an async event handler, the synchronous parsing freezes the UI, causing any updated text (like "Loading...") to not render if the thread isn't yielded first.
**Action:** Always insert a small async yield (like `await new Promise(r => setTimeout(r, 10))`) after setting a loading message and before kicking off heavy synchronous processing to ensure the user gets immediate feedback.

## 2026-03-05 - Contextual defaults across UI tabs and App state protection from accidental file drops
**Learning:** For apps with hidden settings panels, contextual defaults (like showing filenames when multiple files are uploaded) provide necessary context when toggles aren't visible. Furthermore, in SPAs handling file uploads, failing to protect the whole window against drag-and-drop actions can result in the browser navigating away from the app when a user misses the dropzone, destroying their current state.
**Action:** Automatically apply necessary context (e.g., showing filenames) based on the current state (e.g., number of files) rather than relying solely on user toggles, especially when those toggles are hidden. Always add global `dragover` and `drop` event listeners with `event.preventDefault()` to prevent accidental navigation when dropping files.

## 2026-03-06 - Fixing the "Dead Click" File Re-upload Bug
**Learning:** When using `<input type="file">`, if a user uploads a file, modifies it locally, and attempts to re-upload the same file, the native `change` event will not fire because the file path string hasn't changed. This creates a frustrating "dead click" experience where the user interaction is silently ignored.
**Action:** Always add a `click` event listener to file inputs that resets the input's value (`e.target.value = ""`). This ensures that subsequent selections of the exact same file will correctly trigger the `change` event and process the updated file contents.

## 2026-03-06 - Dynamic and Descriptive ARIA Labels for Iterated Components
**Learning:** When rendering multiple similar components (like tables) from a list of items (like uploaded files), using a static `aria-label` (e.g., "Data table") results in poor accessibility because screen reader users cannot distinguish between them.
**Action:** Always inject contextual information into the `aria-label` of dynamically iterated components. For example, include the associated file name (`aria-label="Data table for ${file.name}"`) to provide critical context for users relying on assistive technologies.
## 2026-03-07 - Clarifying UI state when contextual defaults override user toggles
**Learning:** When contextual defaults force a specific state for a UI toggle (like forcing filenames to display when comparing multiple files), leaving the toggle interactive but non-functional is confusing for users. They might attempt to change the setting and assume the app is broken when it doesn't respond.
**Action:** Always visually disable (`opacity: 0.5`, `cursor: not-allowed`), functionally disable (`disabled=true`, `aria-disabled="true"`), and explain (`title="..."`) the disabled state of UI toggles that are overridden by contextual defaults. This ensures users understand why they cannot interact with the control.

## 2024-05-24 - File Upload Context
**Learning:** Generic success messages ("1 file selected") lack confidence. Users need exact filename confirmation to ensure they uploaded the correct file, especially when dealing with similar-looking scientific data files.
**Action:** Always include the specific filename in single-file upload summaries, and provide a comprehensive list (e.g., via tooltip) for multi-file uploads.

## 2026-03-09 - Missing Destructive Actions for File Inputs
**Learning:** In Single Page Applications (SPAs) handling file uploads, failing to provide a way to clear the uploaded files forces users to hard-refresh the page to reset the state, which unnecessarily wipes out their other UI configurations (like plot settings).
**Action:** Always provide a clear/reset button alongside file upload summaries to allow users to gracefully clear their selection without losing the entire application state.

## 2026-03-10 - Inline Two-Step Confirmation for Destructive Actions
**Learning:** For clear/delete actions, native `window.confirm()` browser alerts provide safety but are jarring, visually disjointed from the app, and poor for UX.
**Action:** Always prefer inline two-step confirmation (e.g., first click changes button to "Are you sure?" with `.is-confirming` class, second click executes action). Include a short timeout (e.g., 3000ms) to automatically revert the button to its initial state if the user reconsiders, and ensure ARIA labels are updated to keep screen readers informed of the current step.

## 2026-03-11 - Canceling Destructive Confirmations on Blur
**Learning:** While inline two-step confirmations (like clicking a button twice to "Clear") are great for UX, leaving the button in the "Are you sure?" dangerous state until a timer expires creates user anxiety if they tab away or click elsewhere to abort the action.
**Action:** Always add a `blur` event listener to inline confirmation buttons that immediately reverts the button to its safe, default state (clearing the timeout, removing danger classes, and resetting `aria-label`) the moment it loses focus.

## 2026-03-12 - Dynamic Document Titles for Contextual Awareness
**Learning:** In a Single Page Application (SPA), the `document.title` often remains static because there are no full page reloads. When users open multiple browser tabs for different sessions or datasets, a static title makes it impossible to distinguish between them, leading to a frustrating experience of "tab hunting".
**Action:** Always dynamically update the `document.title` to reflect the current state of the application. For file-based apps, prepend the uploaded filename or the number of files selected to the base title. Use visual cues like "⚠️" to indicate error states, allowing users to monitor status even when the tab is inactive.
