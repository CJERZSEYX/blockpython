import ast
import io
import json
import sys
import traceback

MAX_EVENTS = 2000
MAX_OUTPUT = 1024 * 1024

ALLOWED_NODES = {
    ast.Module, ast.Assign, ast.AugAssign, ast.Expr, ast.Call, ast.Name,
    ast.Constant, ast.BinOp, ast.UnaryOp, ast.If, ast.Compare, ast.For,
    ast.Load, ast.Store, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod,
    ast.USub, ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
}
ALLOWED_CALLS = {"print", "input", "range", "str"}


def safe_value(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return repr(value)[:120]


def snapshot(frame):
    return {
        key: safe_value(value)
        for key, value in frame.f_locals.items()
        if not key.startswith("__")
    }


def validate_tree(tree):
    for node in ast.walk(tree):
        if type(node) not in ALLOWED_NODES:
            raise ValueError(f"当前课程不支持语法：{type(node).__name__}")
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in ALLOWED_CALLS:
                raise ValueError("只能使用课程允许的 Python 基础函数")
        if isinstance(node, ast.Name) and node.id.startswith("__"):
            raise ValueError("变量名不能以下划线开头")


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    code = str(payload.get("code") or "")
    input_lines = str(payload.get("input") or "").splitlines()
    input_index = 0
    current_line = None
    latest_variables = {}
    events = []
    stdout_buffer = io.StringIO()

    def push(event):
        if len(events) >= MAX_EVENTS:
            raise RuntimeError("运行事件超过2000条，程序可能包含过多重复")
        event["seq"] = len(events) + 1
        events.append(event)

    def safe_print(*args, sep=" ", end="\n"):
        text = sep.join(str(item) for item in args) + end
        if stdout_buffer.tell() + len(text.encode("utf-8")) > MAX_OUTPUT:
            raise RuntimeError("程序输出超过1MB限制")
        stdout_buffer.write(text)
        push({"type": "print", "text": text.rstrip("\n"), "line": current_line})

    def safe_input(prompt=""):
        nonlocal input_index
        value = input_lines[input_index] if input_index < len(input_lines) else ""
        input_index += 1
        push({
            "type": "input",
            "value": value,
            "prompt": str(prompt),
            "line": current_line,
        })
        return value

    def tracer(frame, event, _arg):
        nonlocal current_line, latest_variables
        if frame.f_code.co_filename != "<student>":
            return tracer
        if event == "line":
            next_variables = snapshot(frame)
            if current_line is not None:
                latest_variables = next_variables
                push({
                    "type": "variables",
                    "line": current_line,
                    "variables": latest_variables,
                })
            current_line = frame.f_lineno
            latest_variables = next_variables
            push({
                "type": "line",
                "line": frame.f_lineno,
                "variables": latest_variables,
            })
        elif event == "return":
            latest_variables = snapshot(frame)
            push({
                "type": "variables",
                "line": current_line,
                "variables": latest_variables,
                "final": True,
            })
        return tracer

    try:
        tree = ast.parse(code, mode="exec")
        validate_tree(tree)
    except SyntaxError as error:
        print(json.dumps({
            "status": "syntax_error",
            "started": False,
            "stdout": "",
            "stderr": error.msg,
            "line": error.lineno,
            "events": [],
            "variables": {},
            "ast_features": {},
        }, ensure_ascii=False))
        return
    except ValueError as error:
        print(json.dumps({
            "status": "syntax_error",
            "started": False,
            "stdout": "",
            "stderr": str(error),
            "line": None,
            "events": [],
            "variables": {},
            "ast_features": {},
        }, ensure_ascii=False))
        return

    ast_features = {
        "has_for": any(isinstance(node, ast.For) for node in ast.walk(tree)),
        "has_if": any(isinstance(node, ast.If) for node in ast.walk(tree)),
        "has_input": any(
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "input"
            for node in ast.walk(tree)
        ),
    }
    globals_dict = {
        "__builtins__": {
            "print": safe_print,
            "input": safe_input,
            "range": range,
            "str": str,
        }
    }

    try:
        compiled = compile(tree, "<student>", "exec")
        sys.settrace(tracer)
        exec(compiled, globals_dict, globals_dict)
        sys.settrace(None)
        print(json.dumps({
            "status": "executed",
            "started": True,
            "stdout": stdout_buffer.getvalue(),
            "stderr": "",
            "line": None,
            "events": events,
            "variables": latest_variables,
            "ast_features": ast_features,
        }, ensure_ascii=False))
    except Exception as error:
        sys.settrace(None)
        student_line = current_line
        for frame in traceback.extract_tb(error.__traceback__):
            if frame.filename == "<student>":
                student_line = frame.lineno
        print(json.dumps({
            "status": "runtime_error",
            "started": True,
            "stdout": stdout_buffer.getvalue(),
            "stderr": f"{type(error).__name__}: {error}",
            "line": student_line,
            "events": events,
            "variables": latest_variables,
            "ast_features": ast_features,
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
