"use client";

import { App } from "antd";

export default function AntdProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <App>{children}</App>;
}
