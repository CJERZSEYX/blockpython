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
          title="Something went wrong"
          subTitle={this.state.error?.message || "Unknown error"}
          extra={[
            <Button key="reload" type="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>,
            <Button key="home" onClick={() => { window.location.href = "/"; }}>
              Go Home
            </Button>,
          ]}
        />
      );
    }
    return this.props.children;
  }
}
