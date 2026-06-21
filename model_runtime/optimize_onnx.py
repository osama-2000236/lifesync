"""Create an ONNX Runtime optimized BERT graph."""

from pathlib import Path

from onnxruntime.transformers.optimizer import optimize_model


source = Path("model_runtime/artifacts/bert_intent.onnx").resolve()
output = Path("model_runtime/artifacts/bert_intent_optimized.onnx").resolve()
optimized = optimize_model(
    str(source),
    model_type="bert",
    num_heads=12,
    hidden_size=768,
    optimization_options=None,
    opt_level=0,
    use_gpu=False,
    only_onnxruntime=False,
)
optimized.save_model_to_file(str(output), use_external_data_format=True)
print(output)
