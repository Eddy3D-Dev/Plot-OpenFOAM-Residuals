import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Navigate to the app
        await page.goto("http://localhost:8000")

        # Verify initial state (Altair tab active, settings hidden)
        settings = page.locator("#plot-settings")
        is_visible = await settings.is_visible()
        print(f"Initially, plot-settings is visible: {is_visible}")
        assert not is_visible, "Plot settings should be hidden initially."

        # Click Matplotlib tab
        await page.click("#tab-matplotlib")

        # Wait a moment for the DOM update
        await page.wait_for_timeout(100)

        # Verify state after clicking Matplotlib tab (settings visible)
        is_visible = await settings.is_visible()
        print(f"After clicking Matplotlib, plot-settings is visible: {is_visible}")
        assert is_visible, "Plot settings should be visible after clicking Matplotlib."

        # Verify DOM order
        # Evaluate JavaScript to get the elements' document positions
        order_correct = await page.evaluate('''() => {
            const tabControls = document.querySelector(".tab-controls");
            const settings = document.querySelector("#plot-settings");
            const panelAltair = document.querySelector("#panel-altair");

            const position1 = tabControls.compareDocumentPosition(settings);
            const position2 = settings.compareDocumentPosition(panelAltair);

            // 4 means Node.DOCUMENT_POSITION_FOLLOWING
            return (position1 & Node.DOCUMENT_POSITION_FOLLOWING) &&
                   (position2 & Node.DOCUMENT_POSITION_FOLLOWING);
        }''')

        print(f"DOM order is correct: {order_correct}")
        assert order_correct, "DOM order is incorrect. Expected: .tab-controls -> #plot-settings -> #panel-altair"

        print("All tests passed successfully.")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
