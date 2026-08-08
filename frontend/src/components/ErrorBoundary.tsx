import { Component, type ReactNode } from "react";
import { Button, Result } from "antd";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="warning"
          title="页面出现异常"
          subTitle={this.state.error?.message || "未知错误"}
          extra={[
            <Button key="reload" type="primary" onClick={() => window.location.reload()}>
              刷新页面
            </Button>,
            <Button key="home" onClick={() => { window.location.href = "/"; }}>
              返回首页
            </Button>,
          ]}
        />
      );
    }
    return this.props.children;
  }
}
