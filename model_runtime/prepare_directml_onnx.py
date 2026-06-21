"""Patch static ONNX graph attributes unsupported by DirectML on RX 570."""

from pathlib import Path

import onnx
from onnx import helper


source = Path("model_runtime/artifacts/bert_intent.onnx").resolve()
output = Path("model_runtime/artifacts/bert_intent_directml.onnx").resolve()
model = onnx.load(str(source), load_external_data=False)
patched = 0
for node in model.graph.node:
    if node.op_type != "Reshape":
        continue
    for index, attribute in enumerate(node.attribute):
        if attribute.name == "allowzero" and helper.get_attribute_value(attribute) != 0:
            node.attribute[index].CopyFrom(helper.make_attribute("allowzero", 0))
            patched += 1
onnx.save(model, str(output))
print(f"Patched {patched} Reshape nodes: {output}")
