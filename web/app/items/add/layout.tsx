import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Add item",
};

export default function AddItemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
