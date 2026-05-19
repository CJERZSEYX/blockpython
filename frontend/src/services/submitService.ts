import api from "./api";

export const submitBlocks = async (
  blocklyXml: string,
  expectedBlocks: string,
  taskId?: number
): Promise<{
  passed: boolean;
  block_check: {
    expected: Record<string, number>;
    got: Record<string, number>;
    missing: string[];
    valueErrors: string[];
    connected: boolean;
  };
}> => {
  const { data } = await api.post("/submit/run", {
    check_type: "code_to_block",
    blockly_xml: blocklyXml,
    expected_blocks: expectedBlocks,
    task_id: taskId,
  });
  return data;
};

export const runCode = async (
  code: string,
  expectedOutput?: string
): Promise<{
  passed: boolean;
  stdout: string;
  stderr: string;
}> => {
  const { data } = await api.post("/submit/run", {
    check_type: "code_run",
    code,
    expected_output: expectedOutput,
  });
  return data;
};
