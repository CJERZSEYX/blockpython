import { useEffect, useRef } from "react";
import type * as BlocklyTypes from "blockly";
import { registerCustomBlocks } from "../BlocklyEditor/customBlocks";

interface BlocklySnapshotPreviewProps {
  xml: string;
  highlightedBlockId?: string | null;
}

export default function BlocklySnapshotPreview({
  xml,
  highlightedBlockId,
}: BlocklySnapshotPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<BlocklyTypes.WorkspaceSvg | null>(null);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const render = async () => {
      if (!hostRef.current || !xml) return;
      const Blockly = await import("blockly");
      if (disposed || !hostRef.current) return;
      registerCustomBlocks();

      const workspace = Blockly.inject(hostRef.current, {
        readOnly: true,
        scrollbars: true,
        sounds: false,
        zoom: { controls: true, wheel: false, startScale: 0.85 },
      });
      workspaceRef.current = workspace;

      try {
        const dom = Blockly.utils.xml.textToDom(xml);
        Blockly.Xml.domToWorkspace(dom, workspace);
        workspace.zoomToFit();
        workspace.scrollCenter();
        if (highlightedBlockId && workspace.getBlockById(highlightedBlockId)) {
          workspace.highlightBlock(highlightedBlockId);
        }
      } catch {
        workspace.dispose();
        workspaceRef.current = null;
        if (hostRef.current) hostRef.current.dataset.invalid = "true";
        return;
      }

      resizeObserver = new ResizeObserver(() => Blockly.svgResize(workspace));
      resizeObserver.observe(hostRef.current);
    };

    void render();
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      workspaceRef.current?.dispose();
      workspaceRef.current = null;
    };
  }, [highlightedBlockId, xml]);

  if (!xml) return <div className="teacher-empty-artifact">本次没有保存积木作品</div>;

  return (
    <div className="teacher-blockly-preview-shell">
      <div ref={hostRef} className="teacher-blockly-preview" aria-label="学生积木作品" />
    </div>
  );
}
