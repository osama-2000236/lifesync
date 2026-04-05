FROM python:3.11

WORKDIR /app

# Minimal CPU-only build (no BLAS, CUDA, Metal)
ENV CMAKE_ARGS="-DGGML_BLAS=OFF -DGGML_METAL=OFF -DGGML_CUDA=OFF"
ENV FORCE_CMAKE=1

RUN pip install --no-cache-dir llama-cpp-python==0.2.90

RUN pip install --no-cache-dir \
    gradio>=4.0.0 \
    huggingface_hub>=0.20.0

COPY app.py .

EXPOSE 7860

CMD ["python", "app.py"]
