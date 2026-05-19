import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useAppStore } from "../../store/useAppStore";
import { registerCustomBlocks, toolboxCategories } from "./customBlocks";

export interface BlocklyEditorHandle {
  getXml: () => string;
  clearWorkspace: () => void;
  loadXml: (xml: string) => void;
}

const BlocklyEditor = forwardRef<BlocklyEditorHandle>((_props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<any>(null);
  const blocklyModuleRef = useRef<any>(null);
  const isReadOnly = useAppStore((s) => s.isBlocklyReadOnly);

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
      if (workspace) workspace.clear();
    },
    loadXml: (xml: string) => {
      const Blockly = blocklyModuleRef.current;
      const workspace = workspaceRef.current;
      if (!Blockly || !workspace || !xml) return;
      workspace.clear();
      const dom = Blockly.utils.xml.textToDom(xml);
      Blockly.Xml.domToWorkspace(dom, workspace);
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const initBlockly = async () => {
      const Blockly = await import("blockly");
      blocklyModuleRef.current = Blockly;

      registerCustomBlocks();

      Blockly.setLocale({
        ...(Blockly as any).Msg,
        VARIABLES_DEFAULT_NAME: "variable",
        NEW_VARIABLE_TITLE: "New Variable Name",
        RENAME_VARIABLE_TITLE: "Rename Variable",
        DELETE_VARIABLE: "Delete '%1' variable",
      });

      const workspace = Blockly.inject(containerRef.current!, {
        toolbox: { kind: "categoryToolbox", contents: toolboxCategories },
        scrollbars: true,
        trashcan: false,
        readOnly: false,
        sounds: false,
        grid: { spacing: 20, length: 3, colour: "#ccc", snap: true },
        zoom: { controls: true, wheel: true },
      });

      workspaceRef.current = workspace;
    };

    initBlockly().catch(console.error);

    return () => {
      if (workspaceRef.current) workspaceRef.current.dispose();
    };
  }, []);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    workspace.options.readOnly = isReadOnly;
    const toolbox = workspace.getToolbox();
    if (toolbox) toolbox.setVisible(!isReadOnly);

    const container = containerRef.current;
    if (container) {
      const canvas = container.querySelector(".blocklyBlockCanvas") as HTMLElement;
      if (canvas) canvas.style.pointerEvents = isReadOnly ? "none" : "";
    }
  }, [isReadOnly]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        ...(isReadOnly ? {} : {}),
      }}
    />
  );
});

export default BlocklyEditor;
