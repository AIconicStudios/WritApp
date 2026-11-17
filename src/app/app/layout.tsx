import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_MOBILE === "1") return <Shell user={{ name: "This phone", email: "Private, on-device library" }}>{children}</Shell>;
  const user = await currentUser();
  if (!user) redirect("/login");
  return <Shell user={{ name: user.name, email: user.email }}>{children}</Shell>;
}
