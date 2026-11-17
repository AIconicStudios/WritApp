import { WorkspaceLayout } from "@/components/ws/WorkspaceLayout";

// The Android app is built as static files: one copy of each workspace page, with the manuscript id in the query string.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
}
