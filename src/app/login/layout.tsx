import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "B2B통합 물류·주문관리-로그인",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
