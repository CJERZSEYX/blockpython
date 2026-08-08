import ast
import json
import sys


def operator_name(node):
    names = {
        ast.Add: "add", ast.Sub: "sub", ast.Mult: "mul", ast.Div: "div",
        ast.Mod: "mod", ast.Eq: "eq", ast.NotEq: "neq", ast.Lt: "lt",
        ast.LtE: "lte", ast.Gt: "gt", ast.GtE: "gte",
    }
    return names.get(type(node), type(node).__name__.lower())


def expression_shape(node):
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        return {"kind": "call", "name": node.func.id}
    if isinstance(node, ast.BinOp):
        return {"kind": "binary", "operator": operator_name(node.op)}
    if isinstance(node, ast.Compare) and node.ops:
        return {"kind": "compare", "operator": operator_name(node.ops[0])}
    if isinstance(node, ast.Name):
        return {"kind": "variable", "name": node.id}
    if isinstance(node, ast.Constant):
        return {"kind": "literal", "literal_type": type(node.value).__name__}
    return {"kind": type(node).__name__.lower()}


def collect_statements(body, depth=0, parent="module"):
    result = []
    for node in body:
        item = {
            "type": type(node).__name__.lower(),
            "line": getattr(node, "lineno", None),
            "depth": depth,
            "parent": parent,
        }
        if isinstance(node, (ast.Assign, ast.AugAssign)):
            target = node.targets[0] if isinstance(node, ast.Assign) else node.target
            item["target"] = target.id if isinstance(target, ast.Name) else ""
            item["expression"] = expression_shape(node.value)
        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            item["call"] = node.value.func.id if isinstance(node.value.func, ast.Name) else ""
        elif isinstance(node, ast.If):
            item["condition"] = expression_shape(node.test)
        elif isinstance(node, ast.For):
            item["target"] = node.target.id if isinstance(node.target, ast.Name) else ""
            item["iterator"] = expression_shape(node.iter)
        result.append(item)
        if isinstance(node, ast.If):
            result.extend(collect_statements(node.body, depth + 1, "if"))
            result.extend(collect_statements(node.orelse, depth + 1, "else"))
        elif isinstance(node, ast.For):
            result.extend(collect_statements(node.body, depth + 1, "for"))
    return result


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    code = str(payload.get("code", ""))
    try:
        tree = ast.parse(code, mode="exec")
        print(json.dumps({
            "valid": True,
            "error": None,
            "statements": collect_statements(tree.body),
        }, ensure_ascii=False))
    except SyntaxError as error:
        print(json.dumps({
            "valid": False,
            "error": {"message": error.msg, "line": error.lineno},
            "statements": [],
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
