import streamlit as st
import matplotlib.pyplot as plt
import matplotlib as mpl

plt.rcParams['figure.dpi'] = 600 # seems to have no effect
import pandas as pd
import math
import numpy as np


st.header("Plot OpenFOAM Residuals")

min = 1
max_iter = 0



def orderOfMagnitude(number):
    return math.floor(math.log(number, 10))


def roundup(x):
    return int(math.ceil(x / 100.0)) * 100


def pre_parse(file):
    raw_data = pd.read_csv(file, skiprows=1, delimiter='\s+')
    iterations = raw_data['#']
    data = raw_data.iloc[:, 1:].shift(+1, axis=1).drop(["Time"], axis=1)
    data = data.set_index(iterations)

    return data, iterations


files = st.file_uploader("Upload 'residual.dat' files here", type=['dat'], accept_multiple_files=True, key=None, help="Files should be in the _postProcessing_ folder", on_change=None, args=None, kwargs=None)


width = st.text_input('Figure Width', '12')
height = st.text_input('Figure Height', '4')


for file in files:

    data, iterations = pre_parse(file)
    file.seek(0)

    min = math.pow(10, orderOfMagnitude(data.min().min()))

    max_iter =  data.index.max()

    plt.rcParams['figure.figsize'] = [int(width), int(height)]

    data = data.set_index(iterations)
    plot = data.plot(logy=True)
    fig = plot.get_figure()
    ax = plt.gca()
    ax.legend(loc='upper right')
    ax.set_xlabel("Iterations")
    ax.set_ylabel("Residuals")
    ax.set_ylim(min, 1)
    ax.set_xlim(0, max_iter)

    st.pyplot(fig)

