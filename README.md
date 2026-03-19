# Plot OpenFOAM Residuals

A modern single-page web app for visualizing OpenFOAM residual `.dat` and `.log` files, deployable directly on GitHub Pages.

## Features

- Interactive residual view (`Altair` tab equivalent)
- Static residual view (`Matplotlib` tab equivalent)
- Raw table inspection (`Dataframe` tab equivalent)
- Multi-file upload and side-by-side comparison
- Figure width/height controls for static plots
- Optional filename display
- Log-scale residual plotting
- Fully client-side parsing (files never leave the browser)

## Project Structure

- `web/index.html`: App shell
- `web/styles.css`: UI styling
- `web/app.js`: File parsing and plotting logic
- `.github/workflows/deploy-pages.yml`: GitHub Pages deployment workflow

## Local Preview

Serve the `web` directory with any static server.

```bash
python3 -m http.server 8000 --directory web
```

Then open `http://localhost:8000`.
