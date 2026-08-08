import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Alert, Button, Tag, Typography } from "antd";
import { FastForwardOutlined, ReloadOutlined } from "@ant-design/icons";
import type {
  ExecutionEvent,
  ExecutionResult,
  StageState,
  VisualizationConfig,
} from "../../types";
import { getFriendlyFeedback } from "../../utils/executionFeedback";
import { useAppStore } from "../../store/useAppStore";
import { useOperationGate } from "../../utils/operationGate";
import {
  buildExecutionSummary,
  movementFeedback,
  playbackProgress,
} from "../../utils/stageFeedback";

const { Text } = Typography;

const MOVE_TO_NEXT_TILE_MS = 600;
const TILE_ARRIVAL_PAUSE_MS = 1000;

interface DirectProgramStageProps {
  visualization: VisualizationConfig;
  result: ExecutionResult | null;
  input?: string;
  onPlaybackComplete?: () => void;
  idleMessage?: string;
}

interface DirectProgramStagePlaybackProps extends DirectProgramStageProps {
  onReplay: () => void;
}

const statusText: Record<ExecutionResult["status"], string> = {
  invalid_structure: "积木结构还不能生成程序",
  syntax_error: "代码存在语法问题，地图没有运行",
  runtime_error: "程序执行到这里发生错误",
  target_mismatch: "程序已经运行，但路线或结果与任务目标不同",
  target_met: "本次程序达到了任务目标",
  timeout: "程序运行超时",
};

function initialState(config: VisualizationConfig): StageState {
  return {
    scene: config.scene || "apple_map",
    width: config.width || 5,
    height: config.height || 5,
    actor: config.actor || { x: 0, y: 0, direction: "right" },
    speech: "",
    equipment: "",
    paid: 0,
    left_items: [],
    right_items: [],
    collected: [],
    objects: (config.objects || []).map((item) => ({ ...item, collected: false })),
    out_of_bounds: false,
    coordinate_bounds: {
      min_x: config.coordinate_bounds?.min_x ?? -2,
      max_x: config.coordinate_bounds?.max_x ?? 2,
      min_y: config.coordinate_bounds?.min_y ?? -2,
      max_y: config.coordinate_bounds?.max_y ?? 2,
    },
  };
}

function visualEvents(result: ExecutionResult | null) {
  const events = (result?.events || []).filter(
    (event): event is ExecutionEvent & { stage_state: StageState } =>
      event.type === "stage" && Boolean(event.stage_state),
  );
  return events.flatMap((event, index) => {
    const previousEvent = events[index - 1];
    const nextEvent = events[index + 1];
    const sameTile = (left: typeof event | undefined, right: typeof event | undefined) =>
      Boolean(
        left
        && right
        && left.stage_state.actor.x === right.stage_state.actor.x
        && left.stage_state.actor.y === right.stage_state.actor.y
      );
    if (event.action === "move") {
      if (nextEvent?.action === "collect" && sameTile(event, nextEvent)) {
        return [event];
      }
      return [
        event,
        {
          ...event,
          action: "tile_pause",
          payload: { ...event.payload, tile_pause: true },
        },
      ];
    }
    if (event.action !== "collect" || typeof event.payload?.item_id !== "string") {
      return [event];
    }
    const collectedId = event.payload.item_id;
    const arrivalState: StageState = {
      ...event.stage_state,
      collected: event.stage_state.collected.filter((id) => id !== collectedId),
      objects: event.stage_state.objects.map((item) =>
        item.id === collectedId ? { ...item, collected: false } : item
      ),
    };
    if (previousEvent?.action === "move" && sameTile(previousEvent, event)) {
      return [
        {
          ...event,
          action: "tile_pause",
          payload: { ...event.payload, tile_pause: true },
          stage_state: arrivalState,
        },
        event,
      ];
    }
    return [
      { ...event, action: "arrive", stage_state: arrivalState },
      {
        ...event,
        action: "tile_pause",
        payload: { ...event.payload, tile_pause: true },
        stage_state: arrivalState,
      },
      event,
    ];
  });
}

function eventDisplayDuration(event: ExecutionEvent): number {
  if (event.action === "speak") {
    const textLength = String(event.payload?.text || event.stage_state?.speech || "").length;
    return Math.min(3200, Math.max(1800, 1400 + textLength * 70));
  }
  if (event.action === "move" || event.action === "arrive") return MOVE_TO_NEXT_TILE_MS;
  if (event.action === "tile_pause") return TILE_ARRIVAL_PAUSE_MS;
  if (event.action === "collect") return 1250;
  if (event.action === "observe") return 850;
  return 700;
}

function conditionMatches(
  actual: string | number | boolean | null | undefined,
  operator: "==" | "<" | ">",
  expected: string | number,
) {
  if (actual === undefined || actual === null) return null;
  if (operator === "==") return String(actual) === String(expected);
  const left = Number(actual);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return operator === "<" ? left < right : left > right;
}

function runtimeCondition(
  configured: NonNullable<NonNullable<VisualizationConfig["state_panel"]>["condition"]> | undefined,
  code: string,
) {
  if (!configured) return undefined;
  const escapedVariable = configured.variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = code.match(new RegExp(`\\bif\\s+${escapedVariable}\\s*(==|<|>)\\s*(-?\\d+)\\s*:`));
  if (!match) return configured;
  const configuredExpression = `${configured.variable} ${configured.operator} ${configured.value}`;
  const runtimeExpression = `${configured.variable} ${match[1]} ${match[2]}`;
  return {
    ...configured,
    operator: match[1] as "==" | "<" | ">",
    value: Number(match[2]),
    true_label: configured.true_label.replace(configuredExpression, runtimeExpression),
    false_label: configured.false_label.replace(configuredExpression, runtimeExpression),
  };
}

function actualTraceRows(
  result: ExecutionResult | null,
  statePanel: VisualizationConfig["state_panel"],
) {
  if (!result || !statePanel?.trace) return [];
  const condition = runtimeCondition(statePanel.condition, result.code);
  const rows = new Map<number, string[]>();
  for (const event of result.events) {
    if (event.type !== "stage" || !event.stage_state) continue;
    const iteration = Number(event.variables?.[statePanel.trace.active_variable]);
    if (!Number.isInteger(iteration) || iteration < 0) continue;
    const actor = event.stage_state.actor;
    const existing = rows.get(iteration);
    if (!existing) {
      const comparedValue = condition ? event.variables?.[condition.variable] : undefined;
      const matched = condition
        ? conditionMatches(comparedValue, condition.operator, condition.value)
        : null;
      rows.set(iteration, [
        String(iteration),
        comparedValue == null ? "—" : String(comparedValue),
        matched == null ? "—" : matched ? condition!.true_label : condition!.false_label,
        `(${actor.x},${actor.y})`,
      ]);
    } else {
      existing[3] = `(${actor.x},${actor.y})`;
    }
  }
  return [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, row]) => row);
}

function CoordinateGuide({ mode }: { mode: "hidden" | "full" | "compact" }) {
  if (mode === "hidden") return null;
  if (mode === "compact") {
    return (
      <div className="coordinate-guide coordinate-guide-compact" aria-label="坐标方向提示">
        <span>x-1 ←</span><b>1 = 1草格</b><span>→ x+1</span>
        <span>y-1 ↑</span><b>(0,0)为中心</b><span>↓ y+1</span>
      </div>
    );
  }
  return (
    <div className="coordinate-guide coordinate-guide-full" aria-label="地图与变量规则">
      <div className="coordinate-guide-rules">
        <span><b>x + 1</b> 向右一格</span>
        <span><b>x - 1</b> 向左一格</span>
        <span><b>y + 1</b> 向下一格</span>
        <span><b>y - 1</b> 向上一格</span>
      </div>
    </div>
  );
}

function MapScene({
  state,
  coordinateHelp,
  motion,
  motionDuration,
  collectedKind,
  collectionTarget,
  idleMessage,
}: {
  state: StageState;
  coordinateHelp: "hidden" | "full" | "compact";
  motion: "idle" | "walking" | "collecting";
  motionDuration: number;
  collectedKind?: string;
  collectionTarget?: number;
  idleMessage?: string;
}) {
  const displayX = state.actor.display_x ?? state.actor.x;
  const displayY = state.actor.display_y ?? state.actor.y;
  const minX = state.coordinate_bounds?.min_x ?? -2;
  const minY = state.coordinate_bounds?.min_y ?? -2;
  const actorLeft = 15 + (((displayX - minX) + 0.5) / state.width) * 70;
  const actorTop = 14 + (((displayY - minY) + 0.5) / state.height) * 74;
  const bubbleOnLeft = displayX > 0;
  const visibleAt = new Map<string, number>();
  const visibleObjects = state.objects.filter((item) => !item.collected);
  const objectLabel = state.objects.every((item) => item.kind === "apple") ? "苹果" : "水果";
  const targetCount = Math.max(1, Math.min(
    state.objects.length,
    Number(collectionTarget || state.objects.length),
  ));
  const assetByKind: Record<string, string> = {
    apple: "/pixel-stage/task6/apple.png",
    pear: "/pixel-stage/task6/pear.png",
  };
  const actorAsset = motion === "walking"
    ? "/pixel-stage/task1/xiaoming-walk-strip-v2.png"
    : motion === "collecting"
      ? "/pixel-stage/task1/xiaoming-collect-strip-v2.png"
      : "/pixel-stage/task1/xiaoming-strip.png";
  const actorStyle: CSSProperties = {
    left: `${actorLeft}%`,
    top: `${actorTop}%`,
    ...(motion === "walking"
      ? {
          transition: `left ${motionDuration}ms linear, top ${motionDuration}ms linear`,
        }
      : {}),
  };

  return (
    <>
      {state.objects.map((item) => {
        if (item.collected || !assetByKind[item.kind]) return null;
        const key = `${item.x}-${item.y}`;
        const stackIndex = visibleAt.get(key) || 0;
        visibleAt.set(key, stackIndex + 1);
        return (
          <div
            className={`direct-grid-apple-wrap kind-${item.kind}`}
            style={{
              left: `${15 + ((((item.x - minX) + 0.5) / state.width) * 70)}%`,
              top: `${14 + ((((item.y - minY) + 0.5) / state.height) * 74)}%`,
              transform: "translate(-50%, -50%)",
            }}
            key={item.id}
          >
            <img src={assetByKind[item.kind]} alt={item.kind === "pear" ? "梨" : "苹果"} draggable={false} />
            {stackIndex === 0 && visibleObjects.filter(
              (other) => other.x === item.x && other.y === item.y
            ).length > 1 && (
              <b>×{visibleObjects.filter(
                (other) => other.x === item.x && other.y === item.y
              ).length}</b>
            )}
          </div>
        );
      })}
      <div
        className={`direct-xiaoming grid-xiaoming direction-${state.actor.direction} is-${motion}`}
        style={actorStyle}
        aria-label={coordinateHelp === "hidden"
          ? "小明"
          : `小明位于坐标 ${state.actor.x}, ${state.actor.y}`}
      >
        <img src={actorAsset} alt="" draggable={false} />
      </div>
      {motion === "collecting" && collectedKind && assetByKind[collectedKind] && (
        <div
          className="direct-collect-effect"
          style={{ left: `${actorLeft}%`, top: `${actorTop}%` }}
          aria-label={`小明拾取${collectedKind === "pear" ? "梨" : "苹果"}`}
        >
          <img
            src={assetByKind[collectedKind]}
            alt=""
            draggable={false}
          />
          <i />
          <b />
        </div>
      )}
      <div
        className={`direct-speech map-speech ${bubbleOnLeft ? "is-left" : "is-right"} ${state.speech ? "has-text" : ""}`}
        style={{
          left: `${actorLeft + (bubbleOnLeft ? -3 : 3)}%`,
          top: `${actorTop - 2}%`,
          transform: `translate(${bubbleOnLeft ? "-100%" : "0"}, -100%)`,
        }}
      >
        <span>小明</span>
        <strong>{state.speech || idleMessage || "运行后，观察我的变化。"}</strong>
      </div>
      <CoordinateGuide mode={coordinateHelp === "compact" ? "compact" : "hidden"} />
      {(coordinateHelp !== "hidden" || state.objects.length > 0) && <div className="direct-map-status">
        {coordinateHelp !== "hidden" && <span>坐标 ({state.actor.x}, {state.actor.y})</span>}
        {state.objects.length > 0 && (
          <strong>{objectLabel} {Math.min(state.collected.length, targetCount)}/{targetCount}</strong>
        )}
      </div>}
      {state.out_of_bounds && <div className="direct-boundary-warning">坐标已越界，小明停在地图边缘</div>}
    </>
  );
}

let resultSequence = 0;
const resultKeys = new WeakMap<object, number>();

function resultKey(result: ExecutionResult | null) {
  if (!result) return 0;
  const existing = resultKeys.get(result);
  if (existing) return existing;
  resultSequence += 1;
  resultKeys.set(result, resultSequence);
  return resultSequence;
}

function DirectProgramStagePlayback({
  visualization,
  result,
  input,
  onReplay,
  onPlaybackComplete,
  idleMessage,
}: DirectProgramStagePlaybackProps) {
  const [cursor, setCursor] = useState(-1);
  const [playbackDone, setPlaybackDone] = useState(false);
  const [resetting, setResetting] = useState(true);
  const startTimerRef = useRef<number | undefined>(undefined);
  const stepTimerRef = useRef<number | undefined>(undefined);
  const skipLockedRef = useRef(false);
  const events = useMemo(() => visualEvents(result), [result]);
  const initial = useMemo(() => initialState(visualization), [visualization]);
  const setLearningActivity = useAppStore((state) => state.setLearningActivity);

  useEffect(() => {
    const active = Boolean(result?.started && events.length > 0 && (resetting || !playbackDone));
    setLearningActivity({ playbackActive: active });
    return () => setLearningActivity({ playbackActive: false });
  }, [events.length, playbackDone, resetting, result?.started, setLearningActivity]);

  useEffect(() => {
    if (playbackDone) onPlaybackComplete?.();
  }, [onPlaybackComplete, playbackDone]);

  useEffect(() => {
    startTimerRef.current = window.setTimeout(() => {
      setResetting(false);
      if (!result?.started || events.length === 0) {
        setPlaybackDone(Boolean(result));
        return;
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setCursor(events.length - 1);
        setPlaybackDone(true);
        return;
      }

      const showEvent = (index: number) => {
        setCursor(index);
        const duration = eventDisplayDuration(events[index]);
        if (index >= events.length - 1) {
          stepTimerRef.current = window.setTimeout(() => setPlaybackDone(true), duration);
          return;
        }
        stepTimerRef.current = window.setTimeout(() => showEvent(index + 1), duration);
      };

      showEvent(0);
    }, 80);
    return () => {
      if (startTimerRef.current) window.clearTimeout(startTimerRef.current);
      if (stepTimerRef.current) window.clearTimeout(stepTimerRef.current);
    };
  }, [events, result]);

  const skipToResult = () => {
    if (skipLockedRef.current) return;
    skipLockedRef.current = true;
    if (startTimerRef.current) window.clearTimeout(startTimerRef.current);
    if (stepTimerRef.current) window.clearTimeout(stepTimerRef.current);
    setResetting(false);
    setCursor(Math.max(0, events.length - 1));
    setPlaybackDone(true);
  };

  const activeEvent = cursor >= 0 ? events[cursor] : undefined;
  const state = activeEvent?.stage_state || initial;
  const showConclusion = Boolean(result && (!result.started || playbackDone));
  const statePanel = visualization.state_panel;
  const coordinateHelp = visualization.coordinate_help || (initial.objects.length > 0 ? "compact" : "hidden");
  const hasObjects = initial.objects.length > 0;
  const hasMixedFruit = new Set(initial.objects.map((item) => item.kind)).size > 1;
  const activeVariables = activeEvent?.variables || (playbackDone ? result?.variables : undefined) || {};
  const effectiveCondition = runtimeCondition(statePanel?.condition, result?.code || "");
  const conditionResult = effectiveCondition
    ? conditionMatches(
      activeVariables[effectiveCondition.variable],
      effectiveCondition.operator,
      effectiveCondition.value,
    )
    : null;
  const loopValue = statePanel?.loop_variable
    ? activeVariables[statePanel.loop_variable]
    : undefined;
  const activeTraceRow = statePanel?.trace
    ? Number(activeVariables[statePanel.trace.active_variable])
    : -1;
  const runtimeRows = useMemo(() => actualTraceRows(result, statePanel), [result, statePanel]);
  const progress = useMemo(() => playbackProgress(events, cursor), [cursor, events]);
  const completionSummary = useMemo(() => buildExecutionSummary({
    events,
    result,
    initial,
    collectionTarget: visualization.collection_target,
  }), [events, initial, result, visualization.collection_target]);
  const activeMovementFeedback = playbackDone && completionSummary?.kind === "map"
    ? completionSummary.lastMovement
    : movementFeedback(activeEvent);
  const actorMotion = activeEvent?.action === "arrive" || activeEvent?.action === "move"
    ? "walking"
    : activeEvent?.action === "collect"
      ? "collecting"
      : "idle";
  const motionDuration = activeEvent ? eventDisplayDuration(activeEvent) : 700;
  const collectedKind = activeEvent?.action === "collect"
    ? String(activeEvent.payload?.item_kind || "")
    : undefined;

  return (
    <section className={`direct-program-stage scene-apple_map ${resetting ? "is-resetting" : ""}`}>
      <header className="pixel-stage-header">
        <div>
          <span className="pixel-stage-led" />
          <Text strong>{hasObjects ? (hasMixedFruit ? "小明的果园地图" : "小明的苹果地图") : "小明的程序场景"}</Text>
        </div>
        <div className="pixel-stage-actions">
          {result?.started && !playbackDone && events.length > 0 && (
            <Tag color="processing">
              {cursor < 0
                ? "准备运行"
                : progress.total > 0
                  ? `正在执行 · 第 ${Math.max(1, progress.current)} 步 / 共 ${progress.total} 步`
                  : "正在执行"}
            </Tag>
          )}
          {activeEvent?.line && <Tag color="cyan">第 {activeEvent.line} 行</Tag>}
          {result?.started && !playbackDone && events.length > 0 && (
            <Button type="text" size="small" icon={<FastForwardOutlined />} onClick={skipToResult}>
              跳到结果
            </Button>
          )}
          {result?.started && playbackDone && events.length > 0 && (
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onReplay}>
              重播路线
            </Button>
          )}
        </div>
      </header>
      <div className="direct-stage-scene">
        <img
          className="pixel-state-background"
          src="/pixel-stage/task6/grid-v2.png"
          alt=""
          draggable={false}
        />
        <MapScene
          state={state}
          coordinateHelp={coordinateHelp}
          motion={actorMotion}
          motionDuration={motionDuration}
          collectedKind={collectedKind}
          collectionTarget={visualization.collection_target}
          idleMessage={idleMessage}
        />
      </div>
      <CoordinateGuide mode={coordinateHelp === "full" ? "full" : "hidden"} />
      {statePanel && (
        <div className="direct-program-state" aria-label={statePanel.title}>
          <div className="direct-program-state-heading">
            <strong>{statePanel.title}</strong>
            {activeEvent?.line && <span>第 {activeEvent.line} 行执行后的状态</span>}
          </div>
          <div className={`movement-feedback action-${activeEvent?.action || "idle"}`}>
            {activeMovementFeedback}
          </div>
          <div className="direct-program-state-values">
            {statePanel.input_label && (
              <span className="is-input">
                <small>{statePanel.input_label}</small>
                <b>{input || "等待选择"}</b>
              </span>
            )}
            {statePanel.variables.map((name) => (
              <span key={name}>
                <small>{name}</small>
                <b>{Object.prototype.hasOwnProperty.call(activeVariables, name)
                  ? String(activeVariables[name])
                  : "—"}</b>
              </span>
            ))}
            {typeof loopValue === "number" && (
              <span className="is-loop">
                <small>循环进度</small>
                <b>第 {loopValue + 1} 轮</b>
              </span>
            )}
          </div>
          {conditionResult !== null && effectiveCondition && (
            <div className={`direct-condition-result ${conditionResult ? "is-true" : "is-false"}`}>
              {conditionResult
                ? effectiveCondition.true_label
                : effectiveCondition.false_label}
            </div>
          )}
          {statePanel.trace && activeTraceRow >= 0 && (
            <div className="runtime-trace-wrap">
              <span className="learning-guide-label">当前轮次与判断</span>
              <table className="runtime-trace-table">
                <thead>
                  <tr>{statePanel.trace.columns.map((column) => <th key={column}>{column}</th>)}</tr>
                </thead>
                <tbody>
                  {(runtimeRows.length > 0 ? runtimeRows : statePanel.trace.rows).map((row, rowIndex) => (
                    <tr
                      key={`${rowIndex}-${row.join("-")}`}
                      className={rowIndex === activeTraceRow ? "is-active" : ""}
                    >
                      {row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {playbackDone && completionSummary && (
        <div className={`execution-key-summary is-${completionSummary.kind}`} aria-label="本次运行摘要">
          <strong>本次运行摘要</strong>
          {completionSummary.kind === "output" ? (
            <div className="execution-output-order">
              {completionSummary.outputLines.map((line, index) => (
                <span key={`${index}-${line}`}><b>{index + 1}</b>{line}</span>
              ))}
            </div>
          ) : (
            <div className="execution-map-summary">
              <span>{completionSummary.lastMovement}</span>
              <span>最终位置：({completionSummary.finalPosition?.x}, {completionSummary.finalPosition?.y})</span>
              <span>已收集 {completionSummary.collectedCount}/{completionSummary.targetCount}，剩余 {completionSummary.remainingCount}</span>
              {completionSummary.lastCollection && <span>最后收集：{completionSummary.lastCollection}</span>}
            </div>
          )}
        </div>
      )}
      {showConclusion && result && (
        <Alert
          className="pixel-stage-result"
          type={result.status === "target_met" ? "success" : result.status === "target_mismatch" ? "warning" : "error"}
          title={getFriendlyFeedback(result).title || statusText[result.status]}
          description={getFriendlyFeedback(result).description}
          showIcon
        />
      )}
    </section>
  );
}

export default function DirectProgramStage(props: DirectProgramStageProps) {
  const [replayKey, setReplayKey] = useState(0);
  const acquireOperation = useOperationGate();
  const handleReplay = () => {
    const lease = acquireOperation("visual_replay");
    if (!lease) return;
    setReplayKey((value) => value + 1);
    lease.release();
  };
  return (
    <DirectProgramStagePlayback
      key={`${resultKey(props.result)}-${replayKey}`}
      {...props}
      onReplay={handleReplay}
    />
  );
}
