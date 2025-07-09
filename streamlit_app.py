import streamlit as st
import matplotlib.pyplot as plt
import pandas as pd
import math
import altair as alt
import openfoam_residuals.filesystem as fs
import openfoam_residuals.plot as orp
import tempfile
from pathlib import Path


# Page configuration
st.set_page_config(layout="wide")
st.header("Plot OpenFOAM Residuals")



def create_altair_plot(data):
    """Create Altair visualization"""
    # reset_index() will create a 'Time' column from the index
    data_melted = data.reset_index().melt(
        id_vars=['Time'], # Use 'Time' as the identifier variable
        value_vars=['Ux', 'Uy', 'Uz', 'p', 'epsilon', 'k'],
        var_name='Residual',
        value_name='Value'
    )

    chart = alt.Chart(data_melted).mark_line(point=False).encode(
        x=alt.X('Time:Q', title='Iteration'), # Use the 'Time' column for the x-axis
        y=alt.Y('Value:Q', scale=alt.Scale(type='log'), title='Residuals'),
        color=alt.Color('Residual:N', title='Variable'),
        tooltip=['Time', 'Residual', 'Value'] # Update tooltip to use 'Time'
    ).properties(
        width=800,
        height=400
    )

    return chart

def create_matplotlib_plot(data, width, height, min_residual, max_iter):
    """Create Matplotlib visualization"""
    plt.rcParams['figure.figsize'] = [int(width), int(height)]
    plt.rcParams['figure.dpi'] = 600

    plot = data.plot(logy=True)
    fig = plot.get_figure()
    ax = plt.gca()
    ax.legend(loc='upper right')
    ax.set_xlabel("Iterations")
    ax.set_ylabel("Residuals")
    ax.set_ylim(min_residual, 1)
    ax.set_xlim(0, max_iter)

    return fig

# Sidebar controls
with st.sidebar:
    st.subheader("Plot Settings")
    width = st.number_input('Figure Width', min_value=1, value=10)
    height = st.number_input('Figure Height', min_value=1, value=4)
    show_filenames = st.checkbox('Show Filenames', value=False)

# File uploader
files = st.file_uploader(
    "Upload 'residual.dat' files here",
    type=['dat'],
    accept_multiple_files=True,
    help="Files should be located in the _postProcessing_ folder of the OpenFOAM case."
)

if files:
    # Create tabs
    tab1, tab2, tab3 = st.tabs([
        "Altair",
        "Matplotlib",
        "Dataframe"
    ])

    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a list to hold information about the temporary files
        processed_files = []
        for file in files:
            temp_file_path = Path(temp_dir) / file.name
            with open(temp_file_path, "wb") as f:
                f.write(file.getvalue())
            processed_files.append({'name': file.name, 'path': temp_file_path})

        # Altair plots
        with tab1:
            for item in processed_files:
                if show_filenames:
                    st.subheader(f"File: {item['name']}")
                data, iterations = fs.pre_parse(item['path'])
                chart = create_altair_plot(data)
                st.altair_chart(chart)

        # Matplotlib plots
        with tab2:
            for item in processed_files:
                if show_filenames:
                    st.subheader(f"File: {item['name']}")
                data, iterations = fs.pre_parse(item['path'])
                min_residual = math.pow(10, orp.order_of_magnitude(data.min().min()))
                max_iter = data.index.max()
                fig = create_matplotlib_plot(data, width, height, min_residual, max_iter)
                st.pyplot(fig)
                plt.close()

        # Raw data
        with tab3:
            for item in processed_files:
                if show_filenames:
                    st.subheader(f"File: {item['name']}")
                data, iterations = fs.pre_parse(item['path'])
                st.dataframe(data)