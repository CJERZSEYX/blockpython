export const CURRICULUM_VERSION = "experiment-v2.8.1-student-flow-fixes";
export const PROMPT_VERSION = "icap-multilevel-profile-agent-v5";

const esc = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const field = (name: string, value: string | number) =>
  `<field name="${name}">${esc(String(value))}</field>`;
const value = (name: string, child: string) => `<value name="${name}">${child}</value>`;
const statement = (name: string, child: string) => `<statement name="${name}">${child}</statement>`;
const next = (child = "") => child ? `<next>${child}</next>` : "";
const block = (type: string, id: string, body = "", after = "") =>
  `<block type="${type}" id="${id}">${body}${next(after)}</block>`;
const xml = (root: string) => `<xml xmlns="https://developers.google.com/blockly/xml">${root}</xml>`;

const text = (id: string, content: string) => block("text", id, field("TEXT", content));
const number = (id: string, content: number) => block("math_number", id, field("NUM", content));
const variable = (id: string, name: string) => block("variables_get", id, field("VAR", name));
const arithmetic = (id: string, op: string, left: string, right: string) =>
  block("math_arithmetic", id, field("OP", op) + value("A", left) + value("B", right));
const compare = (id: string, op: string, left: string, right: string) =>
  block("logic_compare", id, field("OP", op) + value("A", left) + value("B", right));
const ask = (id: string, prompt: string) =>
  block("sensing_ask", id, value("PROMPT", text(`${id}-prompt`, prompt)));
const assign = (id: string, name: string, expression: string, after = "") =>
  block("variables_set", id, field("VAR", name) + value("VALUE", expression), after);
const print = (id: string, expression: string, after = "") =>
  block("text_print", id, value("TEXT", expression), after);
const repeat = (id: string, variableName: string, times: string, body: string, after = "") =>
  block(
    "controls_repeat_ext",
    id,
    field("VAR", variableName) + value("TIMES", times) + statement("DO", body),
    after
  );
const ifElse = (id: string, condition: string, yes: string, no: string, after = "") =>
  block(
    "controls_if",
    id,
    value("IF0", condition) + statement("DO0", yes) + statement("ELSE", no),
    after
  );

const TOOLBOX = [
  "controls_if",
  "controls_repeat_ext",
  "variables_set",
  "variables_get",
  "math_number",
  "math_arithmetic",
  "logic_compare",
  "sensing_ask",
  "text_print",
  "text",
  "text_join",
];

const support = {
  profile: "icap-variable-map",
  prompt_version: PROMPT_VERSION,
  P: "你是任务讲解者。围绕标准Python积木、变量和任务地图，用短段说明积木与Python的对应关系。P阶段只能解释概念、画面变化和局部中性示例，不得主动给出本题目标数值、目标文本、完整代码或完整积木组合。使用学生视角描述x、y变化与人物移动的对应关系，不讲解系统实现方式。",
  A: "你是搭建提示者。学生根据Python搭积木。只在主动求助或提交失败时给一个简短提示，指出积木类别、连接、嵌套或变量位置，不给出完整积木答案。",
  C: "你是编码教练。学生根据完整积木写同一个Python程序。可指出错误类型、行号、缩进、括号、引号和变量变化，但不得输出、补全或改写本题答案代码。",
  I: "你是学习伙伴。围绕固定拓展任务、学生实际代码、输入的水果名称、坐标路线和运行结果双向讨论。可以追问思路，不设置完成轮次，也不直接给出本题答案。",
};

const lesson = (
  block_id: string,
  block_type: string,
  drawer_category: "控制" | "数据" | "输入输出" | "文本",
  meaning: string,
  translation_rule: string,
  python_code: string,
  explanation: string,
  color: "blue" | "orange" | "green" | "purple"
) => ({
  block_id,
  block_type,
  drawer_category,
  meaning,
  translation_rule,
  python_code,
  explanation,
  color,
});

const map = (
  objects: Array<{ id: string; x: number; y: number; kind?: "apple" | "pear" }>,
  statePanel?: unknown,
  actor = { x: 0, y: 0, direction: "right" },
  help: {
    coordinate_help?: "hidden" | "full" | "compact";
    collection_help?: "none" | "single" | "stacked";
    collection_target?: number;
  } = {}
) => ({
  type: "variable_map",
  scene: "apple_map",
  coordinate_help: help.coordinate_help || (objects.length > 0 ? "compact" : "hidden"),
  collection_help: help.collection_help || (objects.length > 0 ? "single" : "none"),
  collection_target: help.collection_target,
  width: 5,
  height: 5,
  actor,
  objects: objects.map((item) => ({ ...item, kind: item.kind || "apple" })),
  coordinate_bounds: { min_x: -2, max_x: 2, min_y: -2, max_y: 2 },
  variable_bindings: { x: "x", y: "y", stdout: "speech" },
  state_panel: statePanel,
});

const task2StatePanel = {
  title: "变量变化",
  variables: ["x", "y", "steps"],
};
const task3StatePanel = {
  title: "输入与分支",
  variables: ["x", "y", "target"],
  input_label: "本次输入",
  condition: {
    variable: "target",
    operator: "==",
    value: "苹果",
    true_label: "选择苹果：修改 x",
    false_label: "选择梨：修改 y",
  },
};
const task4StatePanel = {
  title: "循环进度",
  variables: ["x", "y", "i", "distance"],
  loop_variable: "i",
};
const task5StatePanel = {
  title: "每轮判断",
  variables: ["x", "y", "i"],
  loop_variable: "i",
  condition: {
    variable: "x",
    operator: "<",
    value: 2,
    true_label: "x < 2 成立：向右",
    false_label: "x < 2 不成立：向下",
  },
  trace: {
    columns: ["轮次i", "判断时x", "条件结果", "到达位置"],
    rows: [
      ["0", "0", "成立，改变x", "(1,0)"],
      ["1", "1", "成立，改变x", "(2,0)"],
      ["2", "2", "不成立，改变y", "(2,1)"],
      ["3", "2", "不成立，改变y", "(2,2)"],
    ],
    active_variable: "i",
  },
};
const task6StatePanel = {
  title: "综合路线状态",
  variables: ["x", "y", "target", "i", "j", "k"],
  input_label: "水果选择",
  condition: {
    variable: "target",
    operator: "==",
    value: "苹果",
    true_label: "先拿苹果，再拿梨",
    false_label: "先拿梨，再拿苹果",
  },
};
const task5MirrorStatePanel = {
  title: "每轮判断",
  variables: ["x", "y", "i"],
  loop_variable: "i",
  condition: {
    variable: "x",
    operator: ">",
    value: -2,
    true_label: "x > -2 成立：向左",
    false_label: "x > -2 不成立：向下",
  },
  trace: {
    columns: ["轮次i", "判断时x", "条件结果", "到达位置"],
    rows: [
      ["0", "0", "成立，改变x", "(-1,0)"],
      ["1", "-1", "成立，改变x", "(-2,0)"],
      ["2", "-2", "不成立，改变y", "(-2,1)"],
      ["3", "-2", "不成立，改变y", "(-2,2)"],
    ],
    active_variable: "i",
  },
};
const task6ExtensionStatePanel = {
  title: "三份水果路线状态",
  variables: ["x", "y", "i", "j", "k"],
  loop_variable: "i",
};

const targetStage = (
  expected_state: Record<string, unknown>,
  expected_variables: Record<string, unknown> = {},
  required_features: string[] = []
) => ({ mode: "stage", expected_state, expected_variables, required_features });

const learningGuides: Record<number, unknown> = {
  1: {
    goal: "让小明按照程序顺序，依次说出三句自我介绍。",
    expected_effect: "小明的气泡会从第一句话开始，按照代码从上到下依次切换。",
    steps: [
      "先确认每句话都放在一条输出语句中。",
      "再检查三条语句的上下顺序是否与任务要求一致。",
      "运行后对照代码顺序和气泡出现顺序。",
    ],
    observe: "重点观察：上一句话结束后，程序才会执行下一条输出语句。",
    concepts: ["print()", "文本", "顺序执行"],
  },
  2: {
    goal: "用变量保存小明的位置和步数，让他走到右侧的苹果。",
    expected_effect: "x 从 0 变为 2 后，小明会从中心移动到右侧草格并收集苹果。",
    platform_principle: {
      title: "先理解：Python变量为什么会让小明移动",
      description: "Python只负责改变x、y的数值。本平台读取运行中的变量，再把小明显示到对应草格；普通Python不会自动出现小明。",
      rules: [
        "x控制左右：x增加向右，x减少向左。",
        "y控制上下：y增加向下，y减少向上。",
        "变量每变化1，对应地图上的1个草格。",
        "进入水果格后由平台显示自动收集，不需要编写收集指令。",
      ],
    },
    steps: [
      "把起点的横坐标x和纵坐标y都设为0。",
      "用steps保存本次要走的格数2。",
      "读取x原来的值，加上steps后再保存回x。",
    ],
    observe: "重点观察：这里的“=”表示把右边算出的新值保存到左边变量，不是数学中的相等关系。",
    concepts: ["变量", "赋值", "加法", "坐标"],
  },
  3: {
    goal: "让程序询问想拿苹果还是梨，再带小明走到对应的水果。",
    expected_effect: "输入“苹果”时小明走向右侧，输入“梨”时小明走向下方；一次只执行一条路线。",
    steps: [
      "用input()接收水果名称，并把输入保存到target。",
      "判断target是否等于“苹果”。",
      "在两个分支中分别修改x或y。",
      "选择“苹果”或“梨”运行，观察输入怎样决定小明走哪条路线。",
    ],
    observe: "重点观察：一次运行只会进入if或else中的一个分支。本任务只测试“苹果”和“梨”，但Python里的else实际表示所有不满足if条件的情况。",
    concepts: ["input()", "比较", "if-else", "分支"],
  },
  4: {
    goal: "用循环让小明重复两次“走到右侧，再返回中心”。",
    expected_effect: "小明会完成两次往返，每次到达右侧收集一个苹果，最后停在中心。",
    steps: [
      "先把起点设为(0,0)。",
      "把向右和返回中心两条赋值放进同一个循环。",
      "确认循环重复2次，并观察每轮结束时小明都回到中心。",
    ],
    observe: "重点观察：循环内部的两条语句都会重复；一次x变化决定移动距离，循环决定整组往返执行几次。每次重新进入右侧草格，平台只自动收集一个苹果。",
    concepts: ["for循环", "range()", "缩进", "重复执行"],
  },
  5: {
    goal: "在四轮循环中反复判断位置，让小明沿折线路线收集四个苹果。",
    expected_effect: "程序每轮都会重新判断 x，小明最终按“右、右、下、下”的顺序移动。",
    steps: [
      "每轮先读取x的最新值，再判断当前x是否小于2。",
      "循环变量i只记录当前是第几轮，不决定移动方向。",
      "条件成立时改变x向右移动，否则改变y向下移动。",
    ],
    observe: "重点观察：条件位于循环内部，所以每一轮都会根据最新的x重新判断方向。",
    concepts: ["循环变量", "大小比较", "条件嵌套", "坐标变化"],
    trace: {
      columns: ["轮次i", "判断时x", "条件结果", "到达位置"],
      rows: [
        ["0", "0", "成立，改变x", "(1,0)"],
        ["1", "1", "成立，改变x", "(2,0)"],
        ["2", "2", "不成立，改变y", "(2,1)"],
        ["3", "2", "不成立，改变y", "(2,2)"],
      ],
    },
  },
  6: {
    goal: "综合使用变量、输入、条件和循环，让小明按选择依次收集苹果和梨。",
    expected_effect: "无论先选择苹果还是梨，小明都会先拿所选水果，返回中心后再去拿另一个。",
    steps: [
      "先把小明的位置设为中心。",
      "读取水果名称，用if-else决定先拿哪一种。",
      "把每条路线拆成：前往第一个水果、返回中心、前往第二个水果。",
      "i、j、k只是三段循环各自使用的计数变量，变量名本身不会决定移动方向。",
      "选择“苹果”或“梨”运行，观察程序怎样决定先拿哪种水果。",
    ],
    observe: "重点观察：两条分支的先后顺序不同，但都要回到中心再前往第二个目标。",
    concepts: ["变量", "input()", "if-else", "for循环", "二维坐标"],
    program_sections: [
      { label: "准备与选择（1–4、11行）", focus: "设置x、y，读取输入，再选择一条分支。" },
      { label: "第一段 前往（5–6或12–13行）", focus: "循环变量i只负责记录前往第一个水果的轮次。" },
      { label: "第二段 返回（7–8或14–15行）", focus: "循环变量j记录返回中心的轮次，坐标改为相反方向。" },
      { label: "第三段 再前往（9–10或16–17行）", focus: "循环变量k记录前往第二个水果的轮次。" },
    ],
  },
};

const task = (
  id: number,
  title: string,
  description: string,
  suggested_lessons: number,
  p_stage: unknown,
  python_code: string,
  blocks_xml: string,
  target: unknown,
  visualization: unknown,
  i_stage: unknown,
  input?: { placeholder: string; options?: string[] }
) => ({
  id,
  title,
  description,
  sort_order: id,
  version: CURRICULUM_VERSION,
  suggested_lessons,
  content_json: {
    content_version: CURRICULUM_VERSION,
    support,
    toolbox: TOOLBOX,
    learning_guide: learningGuides[id],
    p_stage,
    a_stage: {
      python_code,
      instruction: "先阅读下方目标程序和操作步骤，再在左侧从空白开始搭出含义与顺序完全相同的积木。",
      target,
      requires_input: Boolean(input),
      input_placeholder: input?.placeholder,
      input_options: input?.options,
    },
    c_stage: {
      title: "把完整积木转写为Python",
      description: "左侧展示的是与A阶段相同程序的完整只读积木。先按步骤观察连接、嵌套和变量，再从空白开始写Python代码。",
      code_skeleton: "",
      blocks_xml,
      target,
      requires_input: Boolean(input),
      input_placeholder: input?.placeholder,
      input_options: input?.options,
    },
    i_stage: {
      ...(i_stage as Record<string, unknown>),
      ui_copy: I_UI_COPY[id],
    },
    visualization,
  },
});

const t1Code = [
  'print("大家好，我是小明")',
  'print("我正在学习Python")',
  'print("程序会按顺序执行")',
].join("\n");
const t1Xml = xml(print("t1-p1", text("t1-t1", "大家好，我是小明"),
  print("t1-p2", text("t1-t2", "我正在学习Python"),
    print("t1-p3", text("t1-t3", "程序会按顺序执行")))));

const t2Code = ["x = 0", "y = 0", "steps = 2", "x = x + steps"].join("\n");
const t2Xml = xml(assign("t2-x", "x", number("t2-nx", 0),
  assign("t2-y", "y", number("t2-ny", 0),
    assign("t2-steps", "steps", number("t2-ns", 2),
      assign("t2-move", "x", arithmetic("t2-add", "ADD",
        variable("t2-gx", "x"), variable("t2-gs", "steps")))))));

const t3Code = [
  "x = 0",
  "y = 0",
  'target = input("你想拿苹果还是梨？")',
  'if target == "苹果":',
  "    x = x + 2",
  "else:",
  "    y = y + 2",
].join("\n");
const t3Xml = xml(assign("t3-x", "x", number("t3-nx", 0),
  assign("t3-y", "y", number("t3-ny", 0),
    assign("t3-target", "target", ask("t3-ask", "你想拿苹果还是梨？"),
      ifElse("t3-if",
        compare("t3-eq", "EQ", variable("t3-gt", "target"), text("t3-apple", "苹果")),
        assign("t3-right-set", "x", arithmetic("t3-right-add", "ADD", variable("t3-gx", "x"), number("t3-two-r", 2))),
        assign("t3-down-set", "y", arithmetic("t3-down-add", "ADD", variable("t3-gy", "y"), number("t3-two-d", 2))))))));

const t4Code = [
  "x = 0",
  "y = 0",
  "for i in range(2):",
  "    x = x + 2",
  "    x = x - 2",
].join("\n");
const t4Xml = xml(assign("t4-x", "x", number("t4-nx", 0),
  assign("t4-y", "y", number("t4-ny", 0),
    repeat("t4-loop", "i", number("t4-times", 2),
      assign("t4-out", "x", arithmetic("t4-add", "ADD", variable("t4-gx1", "x"), number("t4-two1", 2)),
        assign("t4-back", "x", arithmetic("t4-sub", "MINUS", variable("t4-gx2", "x"), number("t4-two2", 2))))))));

const t5Code = [
  "x = 0",
  "y = 0",
  "for i in range(4):",
  "    if x < 2:",
  "        x = x + 1",
  "    else:",
  "        y = y + 1",
].join("\n");
const t5Xml = xml(assign("t5-x", "x", number("t5-nx", 0),
  assign("t5-y", "y", number("t5-ny", 0),
    repeat("t5-loop", "i", number("t5-times", 4),
      ifElse("t5-if",
        compare("t5-lt", "LT", variable("t5-gx-condition", "x"), number("t5-two", 2)),
        assign("t5-right", "x", arithmetic("t5-addx", "ADD", variable("t5-gx", "x"), number("t5-one-x", 1))),
        assign("t5-down", "y", arithmetic("t5-addy", "ADD", variable("t5-gy", "y"), number("t5-one-y", 1))))))));

const plusOne = (prefix: string, name: "x" | "y") =>
  assign(`${prefix}-set`, name, arithmetic(`${prefix}-add`, "ADD", variable(`${prefix}-get`, name), number(`${prefix}-one`, 1)));
const minusOne = (prefix: string, name: "x" | "y") =>
  assign(`${prefix}-set`, name, arithmetic(`${prefix}-sub`, "MINUS", variable(`${prefix}-get`, name), number(`${prefix}-one`, 1)));
const route = (prefix: string, firstAxis: "x" | "y") => {
  const secondAxis = firstAxis === "x" ? "y" : "x";
  return repeat(`${prefix}-out`, "i", number(`${prefix}-out-n`, 2), plusOne(`${prefix}-out-step`, firstAxis),
    repeat(`${prefix}-back`, "j", number(`${prefix}-back-n`, 2), minusOne(`${prefix}-back-step`, firstAxis),
      repeat(`${prefix}-second`, "k", number(`${prefix}-second-n`, 2), plusOne(`${prefix}-second-step`, secondAxis))));
};
const t6Code = [
  "x = 0",
  "y = 0",
  'target = input("先拿苹果还是先拿梨？")',
  'if target == "苹果":',
  "    for i in range(2):",
  "        x = x + 1",
  "    for j in range(2):",
  "        x = x - 1",
  "    for k in range(2):",
  "        y = y + 1",
  "else:",
  "    for i in range(2):",
  "        y = y + 1",
  "    for j in range(2):",
  "        y = y - 1",
  "    for k in range(2):",
  "        x = x + 1",
].join("\n");
const t6Xml = xml(assign("t6-x", "x", number("t6-nx", 0),
  assign("t6-y", "y", number("t6-ny", 0),
    assign("t6-target", "target", ask("t6-ask", "先拿苹果还是先拿梨？"),
      ifElse("t6-if",
        compare("t6-eq", "EQ", variable("t6-gt", "target"), text("t6-apple", "苹果")),
        route("t6-r", "x"),
        route("t6-d", "y"))))));

const baseP = (subtasks: unknown[]) => ({ subtasks });
const iStage = (
  title: string,
  description: string,
  target: unknown,
  visualization_override: unknown,
  requires_input = false,
  input_placeholder = "",
  input_options: string[] = []
) => ({
  mode: "fixed_extension",
  title,
  description,
  code_skeleton: "",
  target,
  visualization_override,
  requires_input,
  input_placeholder,
  input_options,
});

const I_UI_COPY: Record<number, {
  planning: string;
  reference_step: string;
  discussion_step: string;
  editor_placeholder: string;
  empty_code_description: string;
}> = {
  1: {
    planning: "先说明四句话应该按什么顺序输出，再从空白编写并运行，最后结合真实输出讨论。",
    reference_step: "观察左侧C阶段的完整输出积木，先说清第四句话应该接在什么位置。",
    discussion_step: "运行后根据实际输出内容、先后顺序和错误继续交流。",
    editor_placeholder: "# 从空白开始编写四条按顺序输出的Python代码...",
    empty_code_description: "先写下四条输出语句，再点击运行代码。",
  },
  2: {
    planning: "先说明准备怎样用同一个steps变量完成三段位置变化，再编写和运行代码。",
    reference_step: "观察左侧C阶段完整积木，先说清x、y和steps分别负责什么。",
    discussion_step: "运行后根据真实变量变化、移动方向和剩余水果继续交流。",
    editor_placeholder: "# 根据三段位置变化，从空白开始编写Python代码...",
    empty_code_description: "先写下变量和位置变化程序，再点击运行代码。",
  },
  3: {
    planning: "先说明输入怎样决定分支，再编写包含steps和输出反馈的拓展程序。",
    reference_step: "观察左侧C阶段完整积木，先说清输入、比较和两个分支的关系。",
    discussion_step: "运行后根据本次输入、实际分支、位置和输出继续交流。",
    editor_placeholder: "# 根据输入与分支计划，从空白开始编写Python代码...",
    empty_code_description: "先写下输入和条件分支程序，再点击运行代码。",
  },
  4: {
    planning: "先说明一次往返包含哪些变量变化，再用distance和循环把它重复三次。",
    reference_step: "观察左侧C阶段完整积木，先说清循环次数和单次移动距离的区别。",
    discussion_step: "运行后根据循环轮次、往返次数和收集结果继续交流。",
    editor_placeholder: "# 根据三次往返计划，从空白开始编写Python代码...",
    empty_code_description: "先写下循环往返程序，再点击运行代码。",
  },
  5: {
    planning: "先逐轮说明x的值和判断结果，再设计向左、向下的镜像路线。",
    reference_step: "观察左侧C阶段完整积木，先说清每轮为什么要重新判断x。",
    discussion_step: "运行后根据每轮x、条件结果、实际位置和剩余苹果继续交流。",
    editor_placeholder: "# 根据逐轮判断表，从空白开始编写Python代码...",
    empty_code_description: "先写下循环中的条件程序，再点击运行代码。",
  },
  6: {
    planning: "先把三份水果路线拆成若干段，再决定条件和循环分别放在哪里。",
    reference_step: "观察左侧C阶段完整积木，先说清前往、返回、再前往三段路线。",
    discussion_step: "运行后根据输入、真实路线、循环轮次和剩余水果继续交流。",
    editor_placeholder: "# 根据三份水果路线计划，从空白开始编写Python代码...",
    empty_code_description: "先写下包含条件和循环的路线程序，再点击运行代码。",
  },
};

export const curriculumTasks = [
  task(1, "顺序执行与输出", "让小明依次说出三句自我介绍。运行后请观察气泡出现的先后顺序，确认程序会严格按照从上到下的顺序执行。", 1,
    baseP([
      {
        id: 1,
        title: "找到说话需要的两种积木",
        objective: "先在左侧抽屉中找到绿色输出积木和紫色文本积木，分清谁负责“输出”、谁负责“保存要说的话”。",
        concepts: ["print()", "文本"],
        blocks: [
          lesson("t1-print", "输出积木", "输入输出", "让程序把括号中的内容显示出来。", "输出 [内容] 对应 Python 的 print([内容])。", 'print("你好")', "文本积木要嵌入输出积木右侧的输入位置。", "green"),
          lesson("t1-text", "文本积木", "文本", "保存一段原样显示的文字。", "文本积木中的文字对应 Python 引号中的字符串。", '"你好"', "文字需要放在成对的引号中，再交给输出积木使用。", "purple"),
        ],
      },
      {
        id: 2,
        title: "把一句话放进输出积木",
        objective: "把紫色文本积木嵌入绿色输出积木，组成一条完整、可以运行的输出语句。",
        concepts: ["嵌入", "括号"],
        blocks: [
          lesson("t1-nested-print", "带文本的输出积木", "输入输出", "把一段文字交给 print() 输出。", "外层输出积木变成 print()，内层文本积木变成引号中的文字。", 'print("今天开始学习")', "内层文本必须完整嵌入，不能单独悬空在工作区。", "green"),
        ],
      },
      {
        id: 3,
        title: "按顺序连接多条输出",
        objective: "把多条输出积木从上到下纵向连接。上面的积木先执行，下面的积木后执行。",
        concepts: ["纵向连接", "顺序执行"],
        blocks: [
          lesson("t1-order", "纵向连接输出积木", "输入输出", "让多条输出语句按照连接顺序依次运行。", "每一块纵向连接的输出积木对应一行 print()，Python 从第一行向下执行。", 'print("第一句")\nprint("第二句")', "检查积木之间是否真正卡接；上下位置就是最终执行顺序。", "green"),
        ],
      },
    ]),
    t1Code, t1Xml, { mode: "exact", expected: `${t1Code.match(/"([^"]+)"/g)?.map((v) => v.slice(1, -1)).join("\n")}\n` },
    map([]),
    iStage("增加第四句介绍", "从空白开始写四条输出，在原三句话后增加“这是我的第一个程序”。",
      { mode: "exact", expected: "大家好，我是小明\n我正在学习Python\n程序会按顺序执行\n这是我的第一个程序\n" },
      map([]))),

  task(2, "变量与坐标", "用变量记录小明的位置和要走的步数，让他从中心走到右侧的苹果。运行后观察数字变化怎样带动小明移动。", 1,
    baseP([
      {
        id: 1,
        title: "用变量保存一个数",
        objective: "使用橙色变量赋值积木和数字积木，把一个数保存起来，之后可以继续读取和修改。",
        concepts: ["变量", "赋值", "数字"],
        blocks: [
          lesson("t2-set", "变量赋值积木", "数据", "把右侧的值保存到指定变量中。", "将 [变量] 设为 [数值] 对应 Python 的 [变量] = [数值]。", "score = 10", "数字积木放在赋值积木右侧，变量名从下拉菜单中选择。", "orange"),
          lesson("t2-number", "数字积木", "数据", "提供一个可以参与保存或计算的数字。", "数字积木中的值会原样出现在 Python 表达式中。", "10", "数字积木要嵌入赋值或运算积木的输入位置。", "orange"),
        ],
      },
      {
        id: 2,
        title: "读取变量并进行加法",
        objective: "读取变量原来的值，再使用加法积木计算一个新值。",
        concepts: ["变量读取", "加法"],
        blocks: [
          lesson("t2-get", "变量读取积木", "数据", "取出变量当前保存的值，交给其他积木使用。", "读取 [变量] 对应在 Python 表达式中直接写变量名。", "score", "读取积木通常放进运算积木，不能代替左侧负责保存结果的变量。", "orange"),
          lesson("t2-add", "算术积木", "数据", "把左右两个值相加，得到一个计算结果。", "[左值] + [右值] 对应 Python 的加法表达式。", "score + 2", "左右两侧都必须放入数字或变量读取积木。", "orange"),
        ],
      },
      {
        id: 3,
        title: "把计算结果保存回变量",
        objective: "把“读取旧值、完成加法、保存新值”组合成一条更新变量的语句。",
        concepts: ["更新变量", "先算右边"],
        blocks: [
          lesson("t2-update", "更新变量的组合", "数据", "先计算右侧表达式，再把结果保存回左侧变量。", "Python 会先计算等号右边，再更新等号左边的变量。", "score = score + 2", "同名变量在左侧负责保存，在右侧负责读取；两处作用不同。", "orange"),
        ],
      },
    ]),
    t2Code, t2Xml, targetStage({ collected: ["right"] }, { x: 2, y: 0 }),
    map(
      [{ id: "right", x: 2, y: 0 }],
      task2StatePanel,
      { x: 0, y: 0, direction: "right" },
      { coordinate_help: "full", collection_help: "single" }
    ),
    iStage("同一个步长走两段", "使用同一个steps变量，从中心到右侧、返回中心，再到下方，收集两个苹果。",
      targetStage({ collected: ["right", "down"] }, { x: 0, y: 2 }),
      map(
        [{ id: "right", x: 2, y: 0 }, { id: "down", x: 0, y: 2 }],
        task2StatePanel,
        { x: 0, y: 0, direction: "right" },
        { coordinate_help: "full", collection_help: "single" }
      ))),

  task(3, "输入与条件判断", "小明面前有一个苹果和一个梨。让程序询问想拿哪种水果，再根据这一次输入选择对应路线，让小明走到所选水果的位置。", 2,
    baseP([
      {
        id: 1,
        title: "询问并保存回答",
        objective: "用询问积木提出一个问题，再用变量赋值积木把回答保存起来，供后面的判断使用。",
        concepts: ["input()", "保存输入"],
        blocks: [
          lesson("t3-input", "询问积木", "输入输出", "暂停程序并等待使用者输入一行文字。", "询问 [问题] 对应 Python 的 input([问题])。", 'input("请选择A或B：")', "问题文字放在 input() 中；input() 得到的结果需要交给变量保存。", "green"),
          lesson("t3-save-input", "保存输入的变量赋值", "数据", "把 input() 得到的文字保存到变量。", "将 [变量] 设为 [询问积木] 对应 [变量] = input([问题])。", 'answer = input("请选择A或B：")', "询问积木要完整嵌入赋值积木右侧。", "orange"),
        ],
      },
      {
        id: 2,
        title: "比较输入的文字",
        objective: "读取刚才保存的回答，与一段指定文字比较，得到“成立”或“不成立”。",
        concepts: ["比较", "字符串"],
        blocks: [
          lesson("t3-compare", "相等比较积木", "数据", "检查左右两边的内容是否相同。", "[变量] 等于 [文本] 对应 Python 的 [变量] == [文本]。", 'answer == "A"', "左侧放变量读取积木，右侧放文本积木；判断相等要使用两个等号。", "orange"),
        ],
      },
      {
        id: 3,
        title: "选择一个分支执行",
        objective: "把比较积木放进如果/否则积木。条件成立执行上半部分，否则执行下半部分。本任务只允许输入“苹果”或“梨”，但Python中的else实际会接住所有不满足if条件的情况。",
        concepts: ["if-else", "分支"],
        blocks: [
          lesson("t3-if", "如果/否则积木", "控制", "根据条件只执行两个分支中的一个；else不是只代表某个固定答案，而是代表其他所有不满足if条件的情况。", "如果 [条件] 那么 [语句] 否则 [语句] 对应 Python 的 if-else 结构。", 'if answer == "A":\n    score = score + 1\nelse:\n    score = score - 1', "比较积木放在条件位置，两组赋值积木分别嵌入“那么”和“否则”区域。", "blue"),
        ],
      },
      {
        id: 4,
        title: "在分支中更新位置",
        objective: "在两个分支中分别更新一个坐标变量，让不同输入产生不同的位置结果。",
        concepts: ["坐标变量", "分支结果"],
        blocks: [
          lesson("t3-branch-update", "分支中的变量更新", "数据", "在选中的分支中读取旧值、完成计算并保存新值。", "分支里的变量更新仍使用 [变量] = [变量] + [数值]。", "position = position + 1", "更新积木必须放进对应分支内部；放在分支外会在两种输入下都执行。", "orange"),
        ],
      },
    ]),
    t3Code, t3Xml, {
      mode: "stage",
      state_cases: {
        "苹果": { collected: ["apple-right"] },
        "梨": { collected: ["pear-down"] },
      },
      required_features: ["has_if", "has_input"],
    },
    map([
      { id: "apple-right", kind: "apple", x: 2, y: 0 },
      { id: "pear-down", kind: "pear", x: 0, y: 2 },
    ], task3StatePanel, undefined, { collection_target: 1 }),
    iStage("用步长完成分支并说明结果", "从空白开始，增加steps变量；两个分支分别移动并输出找到的是苹果还是梨。",
      {
        mode: "stage",
        state_cases: { "苹果": { collected: ["apple-right"] }, "梨": { collected: ["pear-down"] } },
        stdout_cases: {
          "苹果": "找到苹果\n",
          "梨": "找到梨\n",
        },
        required_features: ["has_if", "has_input"],
      },
      map([
        { id: "apple-right", kind: "apple", x: 2, y: 0 },
        { id: "pear-down", kind: "pear", x: 0, y: 2 },
      ], task3StatePanel, undefined, { collection_target: 1 }),
      true,
      "输入“苹果”或“梨”",
      ["苹果", "梨"]),
    { placeholder: "输入“苹果”或“梨”", options: ["苹果", "梨"] }),

  task(4, "循环与重复执行", "右侧同一草格叠放了两个苹果。让小明从中心出发到右侧、返回中心，并把这组往返动作重复两次，最终收集两个苹果并停回(0,0)。", 1,
    baseP([
      {
        id: 1,
        title: "设置循环次数",
        objective: "使用重复积木指定一组语句要执行几次，并认识循环变量会记录当前轮次。",
        concepts: ["for循环", "range()", "循环变量"],
        blocks: [
          lesson("t4-repeat", "重复积木", "控制", "把内部积木按照指定次数重复执行。", "使用变量 [i] 重复 [次数] 次对应 Python 的 for i in range([次数]):。", "for i in range(3):\n    print(i)", "次数积木放在循环顶部，需要重复的语句嵌入循环内部。", "blue"),
        ],
      },
      {
        id: 2,
        title: "写出一次往返变化",
        objective: "用两条变量更新先增加再减少同一个值，表示一次“离开再返回”。",
        concepts: ["加法", "减法", "更新变量"],
        blocks: [
          lesson("t4-increase", "变量增加组合", "数据", "读取旧值，加上一个数，再保存回原变量。", "[变量] 增加 [数值] 对应 [变量] = [变量] + [数值]。", "level = level + 1", "变量读取和数字积木放进加法积木，再把结果嵌入赋值积木。", "orange"),
          lesson("t4-decrease", "变量减少组合", "数据", "读取旧值，减去一个数，再保存回原变量。", "[变量] 减少 [数值] 对应 [变量] = [变量] - [数值]。", "level = level - 1", "减法左右顺序不能颠倒；左侧应是变量原来的值。", "orange"),
        ],
      },
      {
        id: 3,
        title: "把往返动作放进循环",
        objective: "将增加和减少两条语句都嵌入循环，保证每一轮都会完整执行一次往返。",
        concepts: ["循环体", "缩进", "重复执行"],
        blocks: [
          lesson("t4-loop-body", "包含两条语句的循环", "控制", "让循环中的两条变量更新在每一轮都依次执行。", "循环内部的积木会变成 Python 中同一级缩进的多行语句。", "for i in range(3):\n    level = level + 1\n    level = level - 1", "两条更新积木都要卡进循环内部，并保持先增加、后减少。", "blue"),
        ],
      },
    ]),
    t4Code, t4Xml, targetStage({ collected: ["right-1", "right-2"] }, { x: 0, y: 0 }, ["has_for"]),
    map(
      [{ id: "right-1", x: 2, y: 0 }, { id: "right-2", x: 2, y: 0 }],
      task4StatePanel,
      { x: 0, y: 0, direction: "right" },
      { coordinate_help: "compact", collection_help: "stacked" }
    ),
    iStage("往返三次", "从空白开始，使用distance变量和循环往返三次，收集三个苹果并回到中心。",
      targetStage({ collected: ["right-1", "right-2", "right-3"] }, { x: 0, y: 0 }, ["has_for"]),
      map(
        [{ id: "right-1", x: 2, y: 0 }, { id: "right-2", x: 2, y: 0 }, { id: "right-3", x: 2, y: 0 }],
        task4StatePanel,
        { x: 0, y: 0, direction: "right" },
        { coordinate_help: "compact", collection_help: "stacked" }
      ))),

  task(5, "循环中的条件", "让小明连续移动四次并收集折线路线上的四个苹果。每一轮都判断x是否小于2：条件成立就向右，否则向下。", 1,
    baseP([
      {
        id: 1,
        title: "让循环重复检查",
        objective: "建立一个多轮循环。循环每开始一轮，都会读取变量当时保存的最新值。",
        concepts: ["for循环", "最新变量值"],
        blocks: [
          lesson("t5-loop", "重复积木", "控制", "让内部的判断和更新重复执行指定轮数。", "使用变量 [i] 重复 [次数] 次对应 for i in range([次数]):。", "for i in range(3):\n    print(i)", "后面的条件积木必须嵌入循环，才能在每一轮重新判断。", "blue"),
          lesson("t5-read", "变量读取积木", "数据", "读取变量在当前轮次开始时的值。", "读取 [变量] 对应在表达式中直接使用变量名。", "level", "循环执行后变量可能改变，下一轮读取到的是新值。", "orange"),
        ],
      },
      {
        id: 2,
        title: "比较当前变量",
        objective: "将变量读取积木与数字积木放进比较积木，判断当前值是否小于指定数字。",
        concepts: ["小于比较", "布尔条件"],
        blocks: [
          lesson("t5-less-than", "小于比较积木", "数据", "检查左边的值是否小于右边的值。", "[变量] 小于 [数值] 对应 Python 的 [变量] < [数值]。", "level < 5", "比较积木应放在如果/否则积木的条件位置。", "orange"),
        ],
      },
      {
        id: 3,
        title: "把条件放进循环",
        objective: "让循环每一轮都执行一次判断：条件成立更新一个变量，否则更新另一个变量。",
        concepts: ["条件嵌套", "每轮重新判断"],
        blocks: [
          lesson("t5-nested-if", "循环中的如果/否则", "控制", "在每一轮循环中根据最新条件选择一个分支。", "if-else 比循环体再多一级缩进，两个分支中的语句继续缩进。", "for i in range(3):\n    if level < 5:\n        score = score + 1\n    else:\n        score = score - 1", "如果/否则积木完整嵌入循环，两个变量更新分别放入对应分支。", "blue"),
        ],
      },
    ]),
    t5Code, t5Xml,
    targetStage({ collected: ["a1", "a2", "a3", "a4"] }, { x: 2, y: 2 }, ["has_for", "has_if"]),
    map([{ id: "a1", x: 1, y: 0 }, { id: "a2", x: 2, y: 0 }, { id: "a3", x: 2, y: 1 }, { id: "a4", x: 2, y: 2 }], task5StatePanel),
    iStage("完成镜像路线", "从空白开始，每轮判断x是否大于-2：成立时向左，否则向下，收集镜像路线上的四个苹果。",
      targetStage({ collected: ["a1", "a2", "a3", "a4"] }, { x: -2, y: 2 }, ["has_for", "has_if"]),
      map(
        [{ id: "a1", x: -1, y: 0 }, { id: "a2", x: -2, y: 0 }, { id: "a3", x: -2, y: 1 }, { id: "a4", x: -2, y: 2 }],
        task5MirrorStatePanel
      ))),

  task(6, "二维综合任务", "设计一个能够收集右侧苹果和下方梨的完整程序。程序先询问要拿哪一种水果，再用条件选择先后路线，并通过循环逐格移动、返回中心后收集另一种水果。", 2,
    baseP([
      {
        id: 1,
        title: "准备两个坐标变量",
        objective: "用两条变量赋值把横向位置和纵向位置都设为中心值，为后续路线计算做好准备。",
        concepts: ["变量", "二维坐标"],
        blocks: [
          lesson("t6-coordinate", "坐标变量赋值", "数据", "分别保存横向位置和纵向位置。", "每个坐标都用一条独立赋值语句保存。", "column = 0\nrow = 0", "两条赋值积木纵向连接；每条右侧都放入数字积木。", "orange"),
        ],
      },
      {
        id: 2,
        title: "询问先拿哪种水果",
        objective: "使用input()接收水果名称，并把回答保存到变量，作为路线选择的依据。",
        concepts: ["input()", "保存输入"],
        blocks: [
          lesson("t6-input", "询问并保存积木组合", "输入输出", "提出问题并保存使用者输入的文字。", "[变量] = input([问题]) 会等待输入，再把结果保存到变量。", 'choice = input("请选择A或B：")', "询问积木嵌入赋值积木右侧，问题由文本积木提供。", "green"),
        ],
      },
      {
        id: 3,
        title: "根据输入选择先后路线",
        objective: "比较输入内容，并使用如果/否则积木进入对应分支。一次运行只会执行其中一个分支。",
        concepts: ["比较", "if-else"],
        blocks: [
          lesson("t6-branch", "输入比较与如果/否则", "控制", "根据保存的文字选择一组语句。", "比较结果作为 if 条件，另一个方案放在 else 分支。", 'if choice == "A":\n    score = score + 1\nelse:\n    score = score - 1', "比较积木放在条件位置，两条路线分别嵌入“那么”和“否则”。", "blue"),
        ],
      },
      {
        id: 4,
        title: "用循环逐格前往目标",
        objective: "把一次坐标增减放进循环，让小明每轮只移动一格，直到到达第一个目标。",
        concepts: ["for循环", "逐格移动"],
        blocks: [
          lesson("t6-move-loop", "循环中的变量更新", "控制", "重复更新同一个变量，形成连续多步变化。", "循环每执行一轮，内部的变量更新就运行一次。", "for i in range(3):\n    position = position + 1", "变量更新积木完整嵌入重复积木，循环次数决定移动步数。", "blue"),
        ],
      },
      {
        id: 5,
        title: "返回中心再去第二个目标",
        objective: "把完整路线拆成三段：前往第一个水果、反向返回中心、改变另一个坐标前往第二个水果。",
        concepts: ["路线分段", "加减方向"],
        blocks: [
          lesson("t6-route-segments", "连续三个循环", "控制", "依次执行前往、返回和再次前往三段变化。", "三个纵向连接的 for 循环会按从上到下的顺序依次执行。", "for i in range(3):\n    position = position + 1\nfor j in range(3):\n    position = position - 1", "先确认每段循环内部修改哪个变量，再按路线顺序纵向连接。", "blue"),
        ],
      },
    ]),
    t6Code, t6Xml, {
      mode: "stage",
      state_cases: {
        "苹果": { collected: ["apple-right", "pear-down"] },
        "梨": { collected: ["pear-down", "apple-right"] },
      },
      required_features: ["has_for", "has_if", "has_input"],
    },
    map([
      { id: "apple-right", kind: "apple", x: 2, y: 0 },
      { id: "pear-down", kind: "pear", x: 0, y: 2 },
    ], task6StatePanel),
    iStage("设计三份水果路线", "从空白开始设计路线，收集右侧苹果、下方梨和左侧苹果；程序至少实际使用一个循环和一个条件。",
      targetStage({ collected: ["apple-right", "pear-down", "apple-left"] }, {}, ["has_for", "has_if"]),
      map(
        [
          { id: "apple-right", kind: "apple", x: 2, y: 0 },
          { id: "pear-down", kind: "pear", x: 0, y: 2 },
          { id: "apple-left", kind: "apple", x: -2, y: 0 },
        ],
        task6ExtensionStatePanel
      )),
    { placeholder: "输入“苹果”或“梨”", options: ["苹果", "梨"] }),
];
