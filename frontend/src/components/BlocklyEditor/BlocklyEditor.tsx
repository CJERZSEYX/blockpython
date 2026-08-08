import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Input, Modal, type InputRef } from "antd";
import type * as BlocklyTypes from "blockly";
import { useAppStore } from "../../store/useAppStore";
import { buildToolbox, registerCustomBlocks } from "./customBlocks";
import { trackAction } from "../../services/trackService";

let isolatedVariableRenameInstalled = false;

function assignVariableToBlock(
  workspace: BlocklyTypes.Workspace,
  block: BlocklyTypes.Block,
  name: string
) {
  const normalizedName = name.trim();
  if (!normalizedName) return;
  const variableMap = workspace.getVariableMap();
  const variable = variableMap.getVariable(normalizedName)
    ?? variableMap.createVariable(normalizedName);
  block.setFieldValue(variable.getId(), "VAR");
}

export interface BlocklyEditorHandle {
  getXml: () => string;
  clearWorkspace: () => void;
  loadXml: (xml: string) => void;
  resetView: () => void;
  getActivitySummary: () => Record<string, number>;
  highlightBlock: (id: string | null) => void;
}

const BlocklyEditor = forwardRef<BlocklyEditorHandle, object>((_, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const variableInputRef = useRef<InputRef>(null);
  const workspaceRef = useRef<BlocklyTypes.WorkspaceSvg | null>(null);
  const blocklyModuleRef = useRef<typeof import("blockly") | null>(null);
  const activityRef = useRef({ create: 0, delete: 0, move: 0, change: 0 });
  const loadingXmlRef = useRef(false);
  const stableSnapshotTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const variablePromptCallbackRef = useRef<((result: string | null) => void) | null>(null);
  const [variablePrompt, setVariablePrompt] = useState({
    open: false,
    title: "",
    value: "",
  });
  const isReadOnly = useAppStore((s) => s.isBlocklyReadOnly);
  const agentAnchor = useAppStore((s) => s.agentAnchor);
  const setCurrentBlocklyXml = useAppStore((s) => s.setCurrentBlocklyXml);

  const publishWorkspace = useCallback((
    Blockly: typeof import("blockly"),
    workspace: BlocklyTypes.WorkspaceSvg
  ) => {
    const dom = Blockly.Xml.workspaceToDom(workspace);
    const xml = Blockly.Xml.domToText(dom);
    setCurrentBlocklyXml(xml);
    const state = useAppStore.getState();
    if (state.currentStage === "A") state.setSavedAWorkspace(xml);
    if (stableSnapshotTimerRef.current) window.clearTimeout(stableSnapshotTimerRef.current);
    if (
      state.currentStage === "A"
      && state.user
      && state.selectedTask
      && xml.includes("<block")
    ) {
      stableSnapshotTimerRef.current = window.setTimeout(() => {
        const latest = useAppStore.getState();
        if (latest.currentStage !== "A" || latest.currentBlocklyXml !== xml) return;
        trackAction({
          user_id: latest.user!.id,
          session_id: latest.sessionId,
          task_id: latest.selectedTask!.id,
          stage: "A",
          action_type: "a_workspace_snapshot",
          action_detail: { blockly_xml: xml, artifact_revision: latest.artifactRevision },
        });
      }, 1500);
    }
  }, [setCurrentBlocklyXml]);

  useImperativeHandle(ref, () => ({
    getXml: () => {
      const Blockly = blocklyModuleRef.current;
      const workspace = workspaceRef.current;
      if (!Blockly || !workspace) return "";
      const dom = Blockly.Xml.workspaceToDom(workspace);
      return Blockly.Xml.domToText(dom);
    },
    clearWorkspace: () => {
      const workspace = workspaceRef.current;
      if (workspace) {
        workspace.clear();
        setCurrentBlocklyXml("");
        const state = useAppStore.getState();
        if (state.currentStage === "A") state.setSavedAWorkspace("");
      }
    },
    loadXml: (xml: string) => {
      const Blockly = blocklyModuleRef.current;
      const workspace = workspaceRef.current;
      if (!Blockly || !workspace || !xml) return;
      loadingXmlRef.current = true;
      workspace.clear();
      const dom = Blockly.utils.xml.textToDom(xml);
      Blockly.Xml.domToWorkspace(dom, workspace);
      publishWorkspace(Blockly, workspace);
      setTimeout(() => {
        loadingXmlRef.current = false;
        activityRef.current = { create: 0, delete: 0, move: 0, change: 0 };
      }, 0);
    },
    resetView: () => {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      workspace.highlightBlock(null);
      workspace.getAllBlocks(false).forEach((block) => block.unselect());
      workspace.zoomToFit();
      workspace.scrollCenter();
    },
    getActivitySummary: () => ({ ...activityRef.current }),
    highlightBlock: (id) => {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      workspace.highlightBlock(id || null);
      if (id) workspace.getBlockById(id)?.select();
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const initBlockly = async () => {
      const Blockly = await import("blockly");
      blocklyModuleRef.current = Blockly;

      registerCustomBlocks();

      Blockly.setLocale({
        ...Blockly.Msg,
        VARIABLES_DEFAULT_NAME: "变量",
        NEW_VARIABLE: "新建变量...",
        NEW_VARIABLE_TITLE: "新建变量名",
        RENAME_VARIABLE: "修改当前积木变量...",
        RENAME_VARIABLE_TITLE: "修改当前积木变量",
        DELETE_VARIABLE: "删除变量 %1",
      });

      Blockly.dialog.setPrompt((title, defaultValue, callback) => {
        variablePromptCallbackRef.current = callback;
        setVariablePrompt({ open: true, title, value: defaultValue });
      });

      if (!isolatedVariableRenameInstalled) {
        type VariableFieldMenu = {
          onItemSelected_: (menu: BlocklyTypes.Menu, menuItem: BlocklyTypes.MenuItem) => void;
        };
        const fieldPrototype = Blockly.FieldVariable.prototype as unknown as VariableFieldMenu;
        const defaultItemSelected = fieldPrototype.onItemSelected_;
        fieldPrototype.onItemSelected_ = function (menu, menuItem) {
          if (menuItem.getValue() !== Blockly.RENAME_VARIABLE_ID) {
            defaultItemSelected.call(this, menu, menuItem);
            return;
          }
          const field = this as unknown as BlocklyTypes.FieldVariable;
          const sourceBlock = field.getSourceBlock();
          if (!sourceBlock || sourceBlock.isDeadOrDying()) return;
          Blockly.dialog.prompt(
            Blockly.Msg.RENAME_VARIABLE_TITLE,
            field.getText(),
            (name) => {
              if (!name || name.trim() === field.getText()) return;
              assignVariableToBlock(sourceBlock.workspace, sourceBlock, name);
            }
          );
        };
        isolatedVariableRenameInstalled = true;
      }

      const workspace = Blockly.inject(containerRef.current!, {
        toolbox: { kind: "categoryToolbox", contents: buildToolbox() },
        scrollbars: true,
        trashcan: false,
        readOnly: false,
        sounds: false,
        grid: { spacing: 20, length: 3, colour: "#ccc", snap: true },
        zoom: { controls: true, wheel: true },
      });

      // The flyout is a separate Blockly workspace. Keep it at a fixed scale so
      // wheel zoom only changes blocks that have already been placed.
      const keepFlyoutScaleFixed = () => {
        const flyout = workspace.getToolbox()?.getFlyout();
        if (!flyout) return;
        const flyoutWorkspace = flyout.getWorkspace();
        if (flyoutWorkspace.scale !== 1) {
          flyoutWorkspace.setScale(1);
          flyout.reflow();
        }
      };
      const viewportListener = (event: BlocklyTypes.Events.Abstract) => {
        if (event.type !== Blockly.Events.VIEWPORT_CHANGE) return;
        window.requestAnimationFrame(keepFlyoutScaleFixed);
      };
      workspace.addChangeListener(viewportListener);
      containerRef.current?.addEventListener("wheel", (event) => {
        const target = event.target as Element | null;
        if (target?.closest(".blocklyFlyout")) event.stopPropagation();
      }, { capture: true });
      workspace.registerButtonCallback("CREATE_VARIABLE_FOR_BLOCK", () => {
        const selected = Blockly.getSelected();
        const selectedBlock = selected instanceof Blockly.Block
          && selected.workspace === workspace
          && selected.getField("VAR")
          ? selected
          : null;
        Blockly.Variables.createVariableButtonHandler(workspace, (name) => {
          if (!name || !selectedBlock) return;
          assignVariableToBlock(workspace, selectedBlock, name);
        });
      });

      workspaceRef.current = workspace;
      workspace.addChangeListener((event: BlocklyTypes.Events.Abstract) => {
        if (loadingXmlRef.current || event.isUiEvent) return;
        if (event.type === Blockly.Events.BLOCK_CREATE) activityRef.current.create += 1;
        if (event.type === Blockly.Events.BLOCK_DELETE) activityRef.current.delete += 1;
        if (event.type === Blockly.Events.BLOCK_MOVE) activityRef.current.move += 1;
        if (event.type === Blockly.Events.BLOCK_CHANGE) activityRef.current.change += 1;
        publishWorkspace(Blockly, workspace);
      });
      window.requestAnimationFrame(keepFlyoutScaleFixed);
    };

    initBlockly().catch(console.error);

    return () => {
      if (stableSnapshotTimerRef.current) window.clearTimeout(stableSnapshotTimerRef.current);
      blocklyModuleRef.current?.dialog.setPrompt();
      if (workspaceRef.current) workspaceRef.current.dispose();
    };
  }, [publishWorkspace]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    workspace.options.readOnly = isReadOnly;
    const toolbox = workspace.getToolbox();
    if (toolbox) toolbox.setVisible(true);

    const container = containerRef.current;
    if (container) {
      const canvas = container.querySelector(".blocklyBlockCanvas") as HTMLElement;
      if (canvas) canvas.style.pointerEvents = isReadOnly ? "none" : "";
    }
  }, [isReadOnly]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const blockId = agentAnchor?.stage === "A" ? agentAnchor.block_id : undefined;
    workspace.highlightBlock(blockId || null);
    if (blockId) workspace.getBlockById(blockId)?.select();
  }, [agentAnchor]);

  const closeVariablePrompt = (result: string | null) => {
    const callback = variablePromptCallbackRef.current;
    variablePromptCallbackRef.current = null;
    setVariablePrompt((current) => ({ ...current, open: false }));
    callback?.(result);
  };

  const confirmVariablePrompt = () => {
    const nextName = variablePrompt.value.replace(/\s+/g, " ").trim();
    if (!nextName) {
      variableInputRef.current?.focus();
      return;
    }
    closeVariablePrompt(nextName);
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`blockly-host ${isReadOnly ? "readonly" : ""}`}
        style={{ width: "100%", height: "100%" }}
      />
      <Modal
        className="blockly-variable-modal"
        open={variablePrompt.open}
        title={variablePrompt.title || "设置变量名"}
        okText="确认"
        cancelText="取消"
        width={420}
        centered
        onOk={confirmVariablePrompt}
        onCancel={() => closeVariablePrompt(null)}
        afterOpenChange={(open) => {
          if (open) {
            window.setTimeout(() => {
              variableInputRef.current?.focus({ cursor: "all" });
            }, 0);
          }
        }}
      >
        <label className="variable-name-field">
          <span>变量名称</span>
          <Input
            ref={variableInputRef}
            value={variablePrompt.value}
            maxLength={24}
            placeholder="例如：target、steps、x"
            onChange={(event) => {
              const value = event.target.value;
              setVariablePrompt((current) => ({ ...current, value }));
            }}
            onPressEnter={confirmVariablePrompt}
          />
          <small>建议使用容易看懂的英文单词或字母，名称中不要留空格。</small>
        </label>
      </Modal>
    </>
  );
});

export default BlocklyEditor;
