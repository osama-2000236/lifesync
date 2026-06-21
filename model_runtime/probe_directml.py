"""Minimal DirectML execution probe; separates GPU/provider health from BERT graph support."""

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, numpy_helper


weight = np.arange(16, dtype=np.float32).reshape(4, 4) / 16
graph = helper.make_graph(
    [helper.make_node("MatMul", ["input", "weight"], ["output"])],
    "directml_probe",
    [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 4])],
    [helper.make_tensor_value_info("output", TensorProto.FLOAT, [1, 4])],
    [numpy_helper.from_array(weight, "weight")],
)
model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 18)])
model.ir_version = 10
path = "model_runtime/artifacts/directml_probe.onnx"
onnx.save(model, path)

options = ort.SessionOptions()
options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
options.enable_mem_pattern = False
session = ort.InferenceSession(
    path,
    sess_options=options,
    providers=[("DmlExecutionProvider", {"device_id": 0}), "CPUExecutionProvider"],
)
result = session.run(None, {"input": np.ones((1, 4), dtype=np.float32)})[0]
print({"providers": session.get_providers(), "result": result.tolist()})
