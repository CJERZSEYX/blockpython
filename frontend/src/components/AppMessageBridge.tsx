import { useEffect } from "react";
import { App } from "antd";
import { setAppMessageApi } from "../utils/appMessage";

export default function AppMessageBridge() {
  const { message } = App.useApp();
  useEffect(() => {
    setAppMessageApi(message);
    return () => setAppMessageApi(null);
  }, [message]);
  return null;
}
