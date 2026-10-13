from __future__ import annotations

from typing import Any


_UNSUPPORTED_KEYS = {
    "$schema",
    "additionalProperties",
    "default",
    "examples",
    "minLength",
    "maxLength",
    "pattern",
    "title",
}


def to_gemini_schema(model: Any) -> dict[str, Any]:
    """Convert a Pydantic JSON schema into Gemini-compatible JSON schema."""
    if hasattr(model, "model_json_schema"):
        schema = model.model_json_schema()
    else:
        schema = model

    defs = schema.get("$defs", {})

    def resolve(value: Any) -> Any:
        if isinstance(value, list):
            return [resolve(item) for item in value]

        if not isinstance(value, dict):
            return value

        if "$ref" in value:
            ref = value["$ref"]
            if ref.startswith("#/$defs/"):
                name = ref.split("/")[-1]
                return resolve(defs.get(name, {}))
            return {}

        result = {}

        for key, item in value.items():
            if key in _UNSUPPORTED_KEYS or key == "$defs":
                continue

            if key == "anyOf":
                options = [resolve(item) for item in item]
                non_null = [
                    option
                    for option in options
                    if option.get("type") != "null"
                ]
                if len(non_null) == 1:
                    result.update(non_null[0])
                else:
                    result[key] = options
                continue

            if key == "propertyOrdering":
                result["property_ordering"] = item
                continue

            result[key] = resolve(item)

        if "properties" in result:
            properties = result["properties"]
            if isinstance(properties, dict):
                result["properties"] = {
                    name: resolve(prop)
                    for name, prop in properties.items()
                }

        if "required" in result and "properties" in result:
            result["required"] = [
                name
                for name in result["required"]
                if name in result["properties"]
            ]

        return result

    return resolve(schema)
