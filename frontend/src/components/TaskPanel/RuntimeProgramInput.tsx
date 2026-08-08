import { useRef, useState } from "react";
import { Input, Modal, Typography } from "antd";
import { CodeOutlined, EnterOutlined } from "@ant-design/icons";
import type { InputRef } from "antd";

const { Text } = Typography;

interface RuntimeProgramInputProps {
  open: boolean;
  prompt?: string;
  allowedValues?: string[];
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}

export default function RuntimeProgramInput({
  open,
  prompt,
  allowedValues = [],
  loading = false,
  onCancel,
  onSubmit,
}: RuntimeProgramInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<InputRef>(null);

  const submit = () => {
    const normalized = value.trim();
    if (!normalized) {
      setError("请先输入一行文字。");
      return;
    }
    if (allowedValues.length > 0 && !allowedValues.includes(normalized)) {
      setError(`本次任务请输入${allowedValues.map((item) => `“${item}”`).join("或")}。`);
      return;
    }
    setError("");
    setValue("");
    onSubmit(normalized);
  };

  return (
    <Modal
      open={open}
      title={(
        <span className="runtime-input-title">
          <CodeOutlined />
          程序正在等待输入
        </span>
      )}
      okText="输入并继续运行"
      cancelText="取消运行"
      confirmLoading={loading}
      onOk={submit}
      onCancel={onCancel}
      afterClose={() => {
        setValue("");
        setError("");
      }}
      afterOpenChange={(visible) => {
        if (visible) window.setTimeout(() => inputRef.current?.focus(), 80);
      }}
      destroyOnHidden
      centered
    >
      <div className="runtime-input-console">
        <Text className="runtime-input-prompt">
          {prompt || "Python 的 input() 正在等待你的回答。"}
        </Text>
        {allowedValues.length > 0 && (
          <div className="runtime-input-allowed">
            可以输入：
            {allowedValues.map((item) => <code key={item}>{item}</code>)}
          </div>
        )}
        <Input
          ref={inputRef}
          value={value}
          status={error ? "error" : undefined}
          prefix={<span className="runtime-input-prefix">&gt;</span>}
          suffix={<EnterOutlined />}
          placeholder="在这里输入，再按 Enter"
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError("");
          }}
          onPressEnter={submit}
          disabled={loading}
          aria-label="输入交给Python input函数的文字"
        />
        {error && <p className="runtime-input-error">{error}</p>}
        <p className="runtime-input-note">
          这段文字会交给 Python 的 input()。程序会根据变量和条件判断决定小明的位置。
        </p>
      </div>
    </Modal>
  );
}
